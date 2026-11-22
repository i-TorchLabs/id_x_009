"""每日定时全量评测调度：默认 Asia/Hong_Kong 00:00 重跑全部测评任务。

行为：
- 从历史 ``eval_tasks`` 去重取出 (model_id, dataset_ids, backend) 模板；
  若尚无任务，则回退为「每模型一条任务 × 全部数据集」（一次跑齐六域）；
- 为每个模板新建一条 Pending 任务并**串行**真实评测（避免午夜并发打满网关）；
- 多 Granian worker 下用 PostgreSQL 会话级咨询锁防重。

开关（环境变量）：
- ``ID009_DAILY_EVAL_ENABLED``  默认 true
- ``ID009_DAILY_EVAL_HOUR``     默认 0
- ``ID009_DAILY_EVAL_MINUTE``   默认 0
- ``ID009_DAILY_EVAL_TZ``       默认 Asia/Hong_Kong
"""
from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime, timedelta
from typing import Any, Optional
from urllib.parse import quote_plus
from zoneinfo import ZoneInfo

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from utils.log_util import logger

# 本模块专用咨询锁（与 id_x_007 的 775200721 错开）
SCHEDULER_LOCK_ID = 9009009

_task: asyncio.Task | None = None


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or not str(raw).strip():
        return default
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _tz() -> ZoneInfo:
    name = os.getenv("ID009_DAILY_EVAL_TZ", "Asia/Hong_Kong").strip() or "Asia/Hong_Kong"
    try:
        return ZoneInfo(name)
    except Exception:
        return ZoneInfo("Asia/Hong_Kong")


def _seconds_until_next_run() -> float:
    """距下一个本地执行时刻的秒数（恒为正）。"""
    hour = max(0, min(23, _env_int("ID009_DAILY_EVAL_HOUR", 0)))
    minute = max(0, min(59, _env_int("ID009_DAILY_EVAL_MINUTE", 0)))
    now = datetime.now(_tz())
    next_run = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if next_run <= now:
        next_run += timedelta(days=1)
    return max((next_run - now).total_seconds(), 1.0)


def _runner_dsn() -> str:
    return (
        "postgresql+asyncpg://"
        f"{quote_plus(os.getenv('DB_USERNAME', 'postgres'))}:"
        f"{quote_plus(os.getenv('DB_PASSWORD', ''))}@"
        f"{os.getenv('DB_HOST', '127.0.0.1')}:"
        f"{os.getenv('DB_PORT', '5432')}/"
        f"{os.getenv('DB_NAME', 'id_x_009')}"
    )


def _parse_hyper(fingerprint: Optional[str]) -> tuple[float, int]:
    temperature = 0.0
    max_tokens = 2048
    if not fingerprint:
        return temperature, max_tokens
    try:
        payload = json.loads(fingerprint)
        hyper = payload.get("hyper") or {}
        if isinstance(hyper, dict):
            if hyper.get("temperature") is not None:
                temperature = float(hyper["temperature"])
            if hyper.get("max_tokens") is not None:
                max_tokens = int(hyper["max_tokens"])
    except (TypeError, ValueError, json.JSONDecodeError):
        pass
    return temperature, max_tokens


def _parse_dataset_ids(raw: str) -> list[int]:
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError, json.JSONDecodeError):
        return []
    if not isinstance(parsed, list):
        return []
    out: list[int] = []
    for item in parsed:
        try:
            out.append(int(item))
        except (TypeError, ValueError):
            continue
    return out


async def _collect_plans(maker: async_sessionmaker) -> list[dict[str, Any]]:
    """去重后的全量评测计划。"""
    from x_models.id_x_009.src.models.x_models import Dataset, EvalTask, Model

    plans: list[dict[str, Any]] = []
    seen: set[tuple[int, str, str]] = set()

    async with maker() as session:
        rows = (
            await session.execute(
                select(EvalTask).order_by(EvalTask.id.desc())
            )
        ).scalars().all()

        for task in rows:
            dataset_ids = _parse_dataset_ids(task.dataset_ids)
            if not dataset_ids:
                continue
            key = (task.model_id, json.dumps(dataset_ids), task.backend or "vllm")
            if key in seen:
                continue
            seen.add(key)
            temperature, max_tokens = _parse_hyper(task.fingerprint)
            plans.append(
                {
                    "model_id": task.model_id,
                    "dataset_ids": dataset_ids,
                    "backend": task.backend or "vllm",
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                    "base_name": task.name,
                }
            )

        if plans:
            return plans

        models = list((await session.execute(select(Model).order_by(Model.id))).scalars().all())
        datasets = list(
            (await session.execute(select(Dataset).order_by(Dataset.id))).scalars().all()
        )
        all_dataset_ids = [dataset.id for dataset in datasets]
        unavailable = {
            item.strip()
            for item in os.getenv("ID009_DAILY_EVAL_SKIP_MODELS", "").split(",")
            if item.strip()
        }
        # 每模型一条全量任务：挂齐全部数据集，一次跑出六域分数
        for model in models:
            if model.name in unavailable or model.name == "local-smoke-model":
                continue
            if not all_dataset_ids:
                continue
            plans.append(
                {
                    "model_id": model.id,
                    "dataset_ids": list(all_dataset_ids),
                    "backend": model.backend or "api",
                    "temperature": 0.0,
                    "max_tokens": 2048,
                    "base_name": f"daily-six-domain - {model.name}",
                }
            )
    return plans


async def _create_pending_task(
    maker: async_sessionmaker,
    *,
    plan: dict[str, Any],
    batch_tag: str,
) -> Optional[int]:
    from x_models.id_x_009.src.models.x_models import Dataset, EvalTask, Model
    from x_models.id_x_009.src.views.x_views import _build_fingerprint

    async with maker() as session:
        model = (
            await session.execute(select(Model).where(Model.id == int(plan["model_id"])))
        ).scalar_one_or_none()
        if model is None:
            logger.warning(
                f"[eval][daily] 跳过：模型不存在 model_id={plan['model_id']}"
            )
            return None

        ds_result = await session.execute(
            select(Dataset).where(Dataset.id.in_(list(plan["dataset_ids"])))
        )
        datasets = list(ds_result.scalars().all())
        if not datasets:
            logger.warning(
                f"[eval][daily] 跳过：数据集不存在 dataset_ids={plan['dataset_ids']}"
            )
            return None

        backend = str(plan.get("backend") or "vllm")
        temperature = float(plan.get("temperature") or 0.0)
        max_tokens = int(plan.get("max_tokens") or 2048)
        fingerprint = _build_fingerprint(
            model, datasets, backend, temperature, max_tokens
        )
        from x_models.id_x_009.src.views.x_views import _alloc_task_uid

        task_uid = await _alloc_task_uid(session)
        name = f"[daily {batch_tag}] {plan.get('base_name') or model.name}"
        task = EvalTask(
            task_uid=task_uid,
            name=name[:256],
            model_id=model.id,
            dataset_ids=json.dumps([d.id for d in datasets]),
            backend=backend,
            status="Pending",
            progress=0,
            fingerprint=fingerprint,
        )
        session.add(task)
        await session.commit()
        logger.info(
            f"[eval][daily] 已创建任务 uid={task_uid} id={task.id} "
            f"model={model.name} datasets={[d.id for d in datasets]}"
        )
        return task.id


async def run_daily_full_eval(*, force: bool = False) -> dict[str, Any]:
    """执行一轮全量评测。``force=True`` 时忽略 enabled 开关（供手工触发）。"""
    if not force and not _env_bool("ID009_DAILY_EVAL_ENABLED", True):
        logger.info("[eval][daily] 已禁用（ID009_DAILY_EVAL_ENABLED=false），跳过")
        return {"skipped": True, "reason": "disabled"}

    engine = create_async_engine(_runner_dsn(), pool_size=2, max_overflow=0)
    lock_conn = None
    created = 0
    ran = 0
    failed = 0
    try:
        lock_conn = await engine.connect()
        got = (
            await lock_conn.execute(
                text("SELECT pg_try_advisory_lock(:lid)"),
                {"lid": SCHEDULER_LOCK_ID},
            )
        ).scalar()
        if not got:
            logger.info("[eval][daily] 未取得咨询锁（其他 worker 正在执行），跳过")
            return {"skipped": True, "reason": "lock_busy"}

        maker = async_sessionmaker(engine, expire_on_commit=False)
        plans = await _collect_plans(maker)
        batch_tag = datetime.now(_tz()).strftime("%Y%m%d")
        logger.info(f"[eval][daily] 开始全量评测 | plans={len(plans)} batch={batch_tag}")

        # 延迟导入，避免与 views 循环依赖在模块加载期爆炸
        from x_models.id_x_009.src.views.x_views import _run_task_with_own_engine

        for plan in plans:
            task_id = await _create_pending_task(maker, plan=plan, batch_tag=batch_tag)
            if task_id is None:
                continue
            created += 1
            try:
                await _run_task_with_own_engine(task_id)
                ran += 1
            except Exception as exc:
                failed += 1
                logger.error(
                    f"[eval][daily] 任务执行失败 task_id={task_id}: {exc}",
                    exc_info=True,
                )

        summary = {
            "skipped": False,
            "batch": batch_tag,
            "plans": len(plans),
            "created": created,
            "ran": ran,
            "failed": failed,
        }
        logger.info(f"[eval][daily] 全量评测结束 | {summary}")
        return summary
    finally:
        if lock_conn is not None:
            try:
                await lock_conn.execute(
                    text("SELECT pg_advisory_unlock(:lid)"),
                    {"lid": SCHEDULER_LOCK_ID},
                )
                await lock_conn.commit()
            except Exception:
                pass
            await lock_conn.close()
        await engine.dispose()


async def _scheduler_loop() -> None:
    hour = _env_int("ID009_DAILY_EVAL_HOUR", 0)
    minute = _env_int("ID009_DAILY_EVAL_MINUTE", 0)
    logger.info(
        f"[eval][daily] 调度器已启动（每日 {hour:02d}:{minute:02d} {_tz().key} 全量评测；"
        f"enabled={_env_bool('ID009_DAILY_EVAL_ENABLED', True)}）"
    )
    while True:
        try:
            wait_s = _seconds_until_next_run()
            logger.info(f"[eval][daily] 下次执行约 {wait_s:.0f}s 后")
            await asyncio.sleep(wait_s)
            await run_daily_full_eval(force=False)
        except asyncio.CancelledError:
            logger.info("[eval][daily] 调度器已停止")
            raise
        except Exception as exc:
            logger.error(f"[eval][daily] 调度循环异常: {exc}", exc_info=True)
            await asyncio.sleep(60)


def start_daily_eval_scheduler() -> None:
    """幂等启动后台调度（需已有运行中的 asyncio 事件循环）。"""
    global _task
    if not _env_bool("ID009_DAILY_EVAL_ENABLED", True):
        logger.info("[eval][daily] 调度器未启动（ID009_DAILY_EVAL_ENABLED=false）")
        return
    if _task is not None and not _task.done():
        return
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        logger.info("[eval][daily] 当前无运行中事件循环，跳过调度器启动")
        return
    _task = loop.create_task(_scheduler_loop(), name="id009-daily-eval")
