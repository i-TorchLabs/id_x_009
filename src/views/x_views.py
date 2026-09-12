"""业务视图层（business logic）—— id_x_009 AI 模型评测平台 Demo。

本模块承载 id_x_009 插件全部业务逻辑，控制器层
（``x_controllers.py``）仅作为 GraphQL 请求入口与流量转发，不做任何业务
处理，统一委托到本模块的视图函数。

Demo 定位说明：
- 评测执行为「模拟执行」：创建任务后由守护线程推进状态机
  （Pending -> Running -> Done），按模型画像生成六能力域得分与成本；
- 任务状态全程落库（eval_tasks.status/progress），Granian 多 worker
  下任意进程都能读到一致的进度（与 id_x_013 落盘 JSON 同一思路）；
- 种子模型预置画像（``_MODEL_PROFILES``），新注册模型按厂商推断画像，
  保证评分图谱开箱即有数据、增量任务风格一致。
"""
import asyncio
import hashlib
import json
import os
import random
import secrets
import threading
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple
from urllib.parse import quote_plus

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import selectinload

from utils.log_util import get_request_id, logger
from x_models.id_x_009.src.models.x_models import (
    Dataset,
    EvalResult,
    EvalTask,
    Model,
    PasswordResetToken,
    User,
    UserToken,
    get_session,
)
from x_models.id_x_009.src.schemas.x_schemas import (
    AuthResponseType,
    CreateTaskInput,
    CreateTaskResultType,
    DatasetType,
    DomainScoreType,
    EvalTaskType,
    ForgotPasswordInput,
    ForgotPasswordResponseType,
    FrontierPointType,
    HealthType,
    LoginInput,
    ModelType,
    RegisterInput,
    RegisterModelInput,
    RegisterModelResultType,
    ScoreGraphFilterInput,
    ScoreGraphType,
    ScorePointType,
    TaskActionResultType,
    TaskReportType,
    UserInfoType,
)


# ==========================================
# 常量：能力域与聚合权重
# ==========================================

# (字段后缀, 展示名, 聚合权重)
DOMAIN_SPECS: List[Tuple[str, str, float]] = [
    ("reasoning", "客观知识与推理", 0.30),
    ("language", "语言与生成", 0.20),
    ("alignment", "对齐与安全", 0.15),
    ("longctx", "长上下文", 0.15),
    ("multimodal", "多模态", 0.10),
    ("business", "业务专项", 0.10),
]

# 模拟执行的步进间隔（秒）：每 tick 推进一次进度
_TICK_SECONDS = 1.0

# 模型画像：(基础能力分, 每任务成本 USD)
# 新任务按画像 + 指纹种子抖动生成结果，保证可复现风格。
_MODEL_PROFILES: Dict[str, Tuple[float, float]] = {
    "gpt-5.2": (92.0, 5.50),
    "gpt-5-mini": (84.0, 0.55),
    "claude-opus-4.6": (91.0, 8.00),
    "claude-sonnet-4.6": (88.0, 1.80),
    "gemini-3.1-pro": (90.0, 2.60),
    "deepseek-v3.2": (85.0, 0.14),
    "deepseek-r1": (87.0, 0.42),
    "qwen3-max": (86.0, 0.90),
    "qwen3-235b-a22b": (83.0, 0.35),
    "qwen3-32b": (76.0, 0.08),
    "llama-4-405b": (80.0, 0.60),
    "llama-4-70b": (74.0, 0.12),
    "kimi-k2.5": (84.0, 0.45),
    "glm-5": (82.0, 0.30),
    "minimax-m2.5": (78.0, 0.10),
    "mistral-large-3": (77.0, 0.50),
}

# 新注册模型的厂商默认画像
_VENDOR_DEFAULT_PROFILE: Dict[str, Tuple[float, float]] = {
    "OpenAI": (86.0, 2.00),
    "Anthropic": (88.0, 3.00),
    "Google": (85.0, 1.50),
    "DeepSeek": (83.0, 0.25),
    "Alibaba": (80.0, 0.40),
    "Meta": (76.0, 0.30),
    "Moonshot": (82.0, 0.50),
    "Zhipu": (80.0, 0.35),
    "MiniMax": (76.0, 0.15),
    "Mistral": (75.0, 0.45),
}


# ==========================================
# 认证辅助函数
# ==========================================


async def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


async def generate_token() -> str:
    return secrets.token_urlsafe(32)


async def verify_token(token: str) -> Optional[User]:
    if not token:
        return None

    try:
        async with get_session()() as session:
            result = await session.execute(
                select(UserToken).where(UserToken.token == token)
            )
            user_token = result.scalar_one_or_none()

            if user_token is None:
                logger.warning(f"{get_request_id()}令牌不存在: {token[:8]}...")
                return None

            if not user_token.is_valid():
                logger.warning(f"{get_request_id()}令牌已过期: {token[:8]}...")
                return None

            user_result = await session.execute(
                select(User).where(User.id == user_token.user_id)
            )
            return user_result.scalar_one_or_none()

    except Exception as e:
        logger.error(f"{get_request_id()}验证令牌失败: {e}", exc_info=True)
        return None


# ==========================================
# 类型转换辅助
# ==========================================


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt is not None else None


def _model_to_type(m: Model) -> ModelType:
    return ModelType(
        id=m.id,
        name=m.name,
        vendor=m.vendor,
        series=m.series,
        version=m.version,
        access_type=m.access_type,
        backend=m.backend,
        params_b=m.params_b,
        context_length=m.context_length,
        created_at=_iso(m.created_at),
    )


def _dataset_to_type(d: Dataset) -> DatasetType:
    return DatasetType(
        id=d.id,
        name=d.name,
        version=d.version,
        snapshot=d.snapshot,
        domain=d.domain,
        sample_count=d.sample_count,
        description=d.description,
    )


def _task_to_type(t: EvalTask) -> EvalTaskType:
    try:
        dataset_ids = [int(x) for x in json.loads(t.dataset_ids or "[]")]
    except (ValueError, TypeError):
        dataset_ids = []
    model_name = ""
    model_vendor = ""
    if t.__dict__.get("model") is not None:
        model_name = t.model.name
        model_vendor = t.model.vendor
    return EvalTaskType(
        id=t.id,
        task_uid=t.task_uid,
        name=t.name,
        model_id=t.model_id,
        model_name=model_name,
        model_vendor=model_vendor,
        dataset_ids=dataset_ids,
        backend=t.backend,
        status=t.status,
        progress=t.progress or 0,
        fingerprint=t.fingerprint,
        error=t.error,
        created_at=_iso(t.created_at),
        updated_at=_iso(t.updated_at),
    )


def _result_domain_scores(r: EvalResult) -> List[DomainScoreType]:
    return [
        DomainScoreType(
            domain=label,
            score=round(getattr(r, f"score_{key}") or 0.0, 2),
            weight=weight,
        )
        for key, label, weight in DOMAIN_SPECS
    ]


# ==========================================
# Query 视图 —— 基础
# ==========================================


async def view_health() -> HealthType:
    return HealthType(status="ok", service="id_x_009")


async def view_models(
    vendor: Optional[str] = None, access_type: Optional[str] = None
) -> List[ModelType]:
    try:
        async with get_session()() as session:
            stmt = select(Model).order_by(Model.vendor, Model.series, Model.id)
            if vendor:
                stmt = stmt.where(Model.vendor == vendor)
            if access_type:
                stmt = stmt.where(Model.access_type == access_type)
            result = await session.execute(stmt)
            return [_model_to_type(m) for m in result.scalars().all()]
    except Exception as e:
        logger.error(f"{get_request_id()}获取模型列表失败: {e}", exc_info=True)
        return []


async def view_datasets() -> List[DatasetType]:
    try:
        async with get_session()() as session:
            result = await session.execute(
                select(Dataset).order_by(Dataset.domain, Dataset.id)
            )
            return [_dataset_to_type(d) for d in result.scalars().all()]
    except Exception as e:
        logger.error(f"{get_request_id()}获取数据集列表失败: {e}", exc_info=True)
        return []


# ==========================================
# Mutation 视图 —— 认证
# ==========================================


async def view_login(input: LoginInput) -> AuthResponseType:
    try:
        async with get_session()() as session:
            result = await session.execute(
                select(User).where(User.email == input.email)
            )
            user = result.scalar_one_or_none()

            if user is None:
                return AuthResponseType(success=False, message="用户不存在")

            password_hash = await hash_password(input.password)
            if user.password_hash != password_hash:
                return AuthResponseType(success=False, message="密码错误")

            if user.is_active is False:
                return AuthResponseType(success=False, message="用户尚未激活")

            token = await generate_token()
            expires_at = datetime.now(timezone.utc) + timedelta(hours=24)

            session.add(UserToken(user_id=user.id, token=token, expires_at=expires_at))
            await session.commit()

            return AuthResponseType(
                success=True,
                message="登录成功",
                token=token,
                expires_at=expires_at.isoformat(),
                user=UserInfoType(
                    id=user.id,
                    email=user.email,
                    phone=user.phone,
                    created_at=_iso(user.created_at),
                ),
            )

    except Exception as e:
        logger.error(f"{get_request_id()}登录失败: {e}", exc_info=True)
        return AuthResponseType(success=False, message=f"登录失败: {str(e)}")


async def view_register(input: RegisterInput) -> AuthResponseType:
    try:
        if input.password != input.confirm_password:
            return AuthResponseType(success=False, message="两次密码输入不一致")

        if len(input.password) < 6:
            return AuthResponseType(success=False, message="密码长度至少6位")

        async with get_session()() as session:
            result = await session.execute(
                select(User).where(User.email == input.email)
            )
            existing_user = result.scalar_one_or_none()

            if existing_user:
                return AuthResponseType(success=False, message="邮箱已被注册")

            password_hash = await hash_password(input.password)
            new_user = User(
                email=input.email,
                password_hash=password_hash,
                phone=input.phone,
                # demo 直接激活，注册即可登录体验
                is_active=True,
            )
            session.add(new_user)
            await session.commit()
            await session.refresh(new_user)

            return AuthResponseType(
                success=True,
                message="注册成功，可直接登录",
                token=None,
                user=UserInfoType(
                    id=new_user.id,
                    email=new_user.email,
                    phone=new_user.phone,
                    created_at=_iso(new_user.created_at),
                ),
            )

    except Exception as e:
        logger.error(f"{get_request_id()}注册失败: {e}", exc_info=True)
        return AuthResponseType(success=False, message=f"注册失败: {str(e)}")


async def view_forgot_password(input: ForgotPasswordInput) -> ForgotPasswordResponseType:
    try:
        async with get_session()() as session:
            result = await session.execute(
                select(User).where(User.email == input.email)
            )
            user = result.scalar_one_or_none()

            if user is None:
                return ForgotPasswordResponseType(
                    success=True,
                    message="如果邮箱存在，重置链接已发送",
                )

            old_tokens_result = await session.execute(
                select(PasswordResetToken).where(
                    PasswordResetToken.user_id == user.id,
                    PasswordResetToken.used.is_(False),
                )
            )
            for old_token in old_tokens_result.scalars().all():
                old_token.used = True

            reset_token = secrets.token_urlsafe(32)
            session.add(
                PasswordResetToken(
                    user_id=user.id,
                    token=reset_token,
                    expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
                )
            )
            await session.commit()

            return ForgotPasswordResponseType(
                success=True,
                message="重置令牌已生成，生产环境应发送邮件",
                reset_token=reset_token,
            )

    except Exception as e:
        logger.error(f"{get_request_id()}忘记密码处理失败: {e}", exc_info=True)
        return ForgotPasswordResponseType(success=False, message=f"处理失败: {str(e)}")


async def view_logout() -> AuthResponseType:
    try:
        return AuthResponseType(success=True, message="登出成功", token=None, user=None)
    except Exception as e:
        logger.error(f"{get_request_id()}登出失败: {e}", exc_info=True)
        return AuthResponseType(success=False, message=f"登出失败: {str(e)}")


# ==========================================
# Mutation 视图 —— 模型注册
# ==========================================


async def view_register_model(input: RegisterModelInput) -> RegisterModelResultType:
    try:
        async with get_session()() as session:
            dup = await session.execute(
                select(Model).where(
                    Model.name == input.name, Model.version == input.version
                )
            )
            if dup.scalar_one_or_none() is not None:
                return RegisterModelResultType(
                    success=False, message="同名同版本模型已注册"
                )

            model = Model(
                name=input.name,
                vendor=input.vendor,
                series=input.series,
                version=input.version,
                access_type=input.access_type or "api",
                backend=input.backend or "vllm",
                params_b=input.params_b,
                context_length=input.context_length,
            )
            session.add(model)
            await session.commit()
            await session.refresh(model)

            logger.info(f"{get_request_id()}注册模型成功: {model.name}@{model.version}")
            return RegisterModelResultType(
                success=True,
                message="模型注册成功",
                model=_model_to_type(model),
            )

    except Exception as e:
        logger.error(f"{get_request_id()}注册模型失败: {e}", exc_info=True)
        return RegisterModelResultType(success=False, message=f"注册失败: {str(e)}")


# ==========================================
# 评测任务 —— 创建与模拟执行
# ==========================================


def _build_fingerprint(
    model: Model,
    datasets: List[Dataset],
    backend: str,
    temperature: float,
    max_tokens: int,
) -> str:
    """可复现指纹：数据集快照 + 模型版本 + 推理引擎 + 超参四要素。"""
    payload = {
        "dataset": [d.snapshot for d in datasets],
        "model": f"{model.name}@{model.version}",
        "engine": f"{backend}@0.6",
        "hyper": {"temperature": temperature, "max_tokens": max_tokens},
    }
    return json.dumps(payload, ensure_ascii=False)


async def view_create_task(input: CreateTaskInput) -> CreateTaskResultType:
    try:
        async with get_session()() as session:
            model_result = await session.execute(
                select(Model).where(Model.id == input.model_id)
            )
            model = model_result.scalar_one_or_none()
            if model is None:
                return CreateTaskResultType(success=False, message="模型不存在")

            ds_result = await session.execute(
                select(Dataset).where(Dataset.id.in_(input.dataset_ids))
            )
            datasets = list(ds_result.scalars().all())
            if not datasets:
                return CreateTaskResultType(success=False, message="数据集不存在")

            fingerprint = _build_fingerprint(
                model, datasets, input.backend, input.temperature, input.max_tokens
            )
            task_uid = f"t-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{secrets.token_hex(2)}"

            task = EvalTask(
                task_uid=task_uid,
                name=input.name,
                model_id=model.id,
                dataset_ids=json.dumps(input.dataset_ids),
                backend=input.backend or "vllm",
                # 直接置 Pending，由守护线程接管推进（Draft -> Pending 即时完成）
                status="Pending",
                progress=0,
                fingerprint=fingerprint,
            )
            session.add(task)
            await session.commit()
            task_id = task.id

        _start_runner(task_id)
        logger.info(f"{get_request_id()}创建评测任务: {task_uid} (id={task_id})")

        return CreateTaskResultType(
            success=True,
            message="任务已创建并进入调度队列",
            task=EvalTaskType(
                id=task_id,
                task_uid=task_uid,
                name=input.name,
                model_id=model.id,
                model_name=model.name,
                model_vendor=model.vendor,
                dataset_ids=list(input.dataset_ids),
                backend=input.backend or "vllm",
                status="Pending",
                progress=0,
                fingerprint=fingerprint,
                created_at=None,
                updated_at=None,
            ),
        )

    except Exception as e:
        logger.error(f"{get_request_id()}创建评测任务失败: {e}", exc_info=True)
        return CreateTaskResultType(success=False, message=f"创建任务失败: {str(e)}")


def _start_runner(task_id: int) -> None:
    """守护线程模拟执行：与请求生命周期解耦，进度全程落库。

    Granian 多 worker 下虽然注册线程的进程随机，但状态在 DB 中，
    任意进程轮询任务状态均可见一致进度。

    线程内使用「专属引擎 + 独立事件循环」：共享会话工厂的 asyncpg
    连接池绑定主请求循环，跨循环复用会报 attached to a different
    loop，因此执行线程必须自建连接（用完即 dispose）。
    """
    thread = threading.Thread(
        target=lambda: asyncio.run(_run_task_with_own_engine(task_id)),
        daemon=True,
        name=f"eval-runner-{task_id}",
    )
    thread.start()


def _runner_dsn() -> str:
    return (
        "postgresql+asyncpg://"
        f"{quote_plus(os.getenv('DB_USERNAME', 'postgres'))}:"
        f"{quote_plus(os.getenv('DB_PASSWORD', ''))}@"
        f"{os.getenv('DB_HOST', '127.0.0.1')}:"
        f"{os.getenv('DB_PORT', '5432')}/"
        f"{os.getenv('DB_NAME', 'id_x_009')}"
    )


async def _run_task_with_own_engine(task_id: int) -> None:
    engine = create_async_engine(_runner_dsn(), pool_size=2, max_overflow=0)
    try:
        maker = async_sessionmaker(engine, expire_on_commit=False)
        await _run_task(maker, task_id)
    finally:
        await engine.dispose()


def _profile_for(model: Model) -> Tuple[float, float]:
    if model.name in _MODEL_PROFILES:
        return _MODEL_PROFILES[model.name]
    return _VENDOR_DEFAULT_PROFILE.get(model.vendor, (72.0, 0.80))


async def _run_task(maker: async_sessionmaker, task_id: int) -> None:
    """状态机推进：Pending -> Running ->（可 Paused）-> Done，并生成结果。"""
    rng: Optional[random.Random] = None
    model: Optional[Model] = None

    while True:
        await asyncio.sleep(_TICK_SECONDS)
        try:
            async with maker() as session:
                result = await session.execute(
                    select(EvalTask)
                    .options(selectinload(EvalTask.model))
                    .where(EvalTask.id == task_id)
                )
                task = result.scalar_one_or_none()
                if task is None:
                    return

                if task.status == "Failed" or task.status == "Done":
                    return

                if task.status == "Paused":
                    # 断点保持：等待 resume（视图将状态改回 Running）
                    continue

                if task.status == "Pending":
                    task.status = "Running"
                    task.progress = max(task.progress or 0, 1)
                    await session.commit()
                    continue

                # Running：推进进度
                if rng is None:
                    rng = random.Random(f"{task.task_uid}:{task.fingerprint}")
                    model = task.model

                step = rng.randint(6, 14)
                task.progress = min(100, (task.progress or 0) + step)

                if task.progress >= 100:
                    task.status = "Done"
                    eval_result = _generate_result(task, model, rng)
                    session.add(eval_result)

                await session.commit()

                if task.status == "Done":
                    logger.info(f"评测任务完成: {task.task_uid}")
                    return

        except Exception as e:  # noqa: BLE001 - 保证线程不静默死亡
            logger.error(f"评测任务 {task_id} 执行异常: {e}", exc_info=True)
            try:
                async with maker() as session:
                    result = await session.execute(
                        select(EvalTask).where(EvalTask.id == task_id)
                    )
                    task = result.scalar_one_or_none()
                    if task is not None:
                        task.status = "Failed"
                        task.error = str(e)
                        await session.commit()
            except Exception:  # noqa: BLE001
                pass
            return


def _generate_result(task: EvalTask, model: Optional[Model], rng: random.Random) -> EvalResult:
    """按模型画像 + 指纹种子抖动生成六能力域得分与成本（可复现风格）。"""
    base_score, base_cost = _profile_for(model) if model is not None else (72.0, 0.80)

    domain_scores: Dict[str, float] = {}
    for key, _label, _weight in DOMAIN_SPECS:
        jitter = rng.uniform(-4.0, 4.0)
        score = max(20.0, min(99.0, base_score + jitter))
        domain_scores[key] = round(score, 2)

    composite = round(
        sum(domain_scores[key] * weight for key, _label, weight in DOMAIN_SPECS), 2
    )
    cost = round(max(0.01, base_cost * rng.uniform(0.9, 1.1)), 4)
    latency = round(rng.uniform(200.0, 1200.0), 1)
    throughput = round(rng.uniform(30.0, 180.0), 1)

    return EvalResult(
        task_id=task.id,
        model_id=task.model_id,
        score_reasoning=domain_scores["reasoning"],
        score_language=domain_scores["language"],
        score_alignment=domain_scores["alignment"],
        score_longctx=domain_scores["longctx"],
        score_multimodal=domain_scores["multimodal"],
        score_business=domain_scores["business"],
        composite_score=composite,
        cost_per_task=cost,
        latency_p50=latency,
        throughput=throughput,
    )


# ==========================================
# Query 视图 —— 任务
# ==========================================


async def view_tasks(status: Optional[str] = None) -> List[EvalTaskType]:
    try:
        async with get_session()() as session:
            stmt = (
                select(EvalTask)
                .options(selectinload(EvalTask.model))
                .order_by(EvalTask.id.desc())
            )
            if status:
                stmt = stmt.where(EvalTask.status == status)
            result = await session.execute(stmt)
            return [_task_to_type(t) for t in result.scalars().all()]
    except Exception as e:
        logger.error(f"{get_request_id()}获取任务列表失败: {e}", exc_info=True)
        return []


async def view_task_detail(task_uid: str) -> Optional[EvalTaskType]:
    try:
        async with get_session()() as session:
            result = await session.execute(
                select(EvalTask)
                .options(selectinload(EvalTask.model))
                .where(EvalTask.task_uid == task_uid)
            )
            task = result.scalar_one_or_none()
            return _task_to_type(task) if task is not None else None
    except Exception as e:
        logger.error(f"{get_request_id()}获取任务详情失败: {e}", exc_info=True)
        return None


# ==========================================
# Mutation 视图 —— 任务动作（断点续跑）
# ==========================================


async def view_pause_task(task_uid: str) -> TaskActionResultType:
    try:
        async with get_session()() as session:
            result = await session.execute(
                select(EvalTask).where(EvalTask.task_uid == task_uid)
            )
            task = result.scalar_one_or_none()
            if task is None:
                return TaskActionResultType(success=False, message="任务不存在")
            if task.status != "Running":
                return TaskActionResultType(
                    success=False,
                    message=f"仅运行中任务可暂停，当前状态: {task.status}",
                    status=task.status,
                )

            task.status = "Paused"
            await session.commit()
            return TaskActionResultType(
                success=True, message="任务已暂停，可断点续跑", status="Paused"
            )
    except Exception as e:
        logger.error(f"{get_request_id()}暂停任务失败: {e}", exc_info=True)
        return TaskActionResultType(success=False, message=f"暂停失败: {str(e)}")


async def view_resume_task(task_uid: str) -> TaskActionResultType:
    try:
        async with get_session()() as session:
            result = await session.execute(
                select(EvalTask).where(EvalTask.task_uid == task_uid)
            )
            task = result.scalar_one_or_none()
            if task is None:
                return TaskActionResultType(success=False, message="任务不存在")
            if task.status == "Paused":
                task.status = "Running"
                await session.commit()
                return TaskActionResultType(
                    success=True, message="任务已从断点恢复", status="Running"
                )
            if task.status == "Failed":
                # 失败重跑：从头再来，由新守护线程接管
                task.status = "Pending"
                task.progress = 0
                task.error = None
                await session.commit()
                _start_runner(task.id)
                return TaskActionResultType(
                    success=True, message="任务已重新排队", status="Pending"
                )
            if task.status == "Pending":
                # 服务重启后遗留在 Pending 的任务（旧执行线程已消亡），重新接管
                _start_runner(task.id)
                return TaskActionResultType(
                    success=True, message="任务执行器已接管", status="Pending"
                )
            return TaskActionResultType(
                success=False,
                message=f"当前状态不支持恢复: {task.status}",
                status=task.status,
            )
    except Exception as e:
        logger.error(f"{get_request_id()}恢复任务失败: {e}", exc_info=True)
        return TaskActionResultType(success=False, message=f"恢复失败: {str(e)}")


# ==========================================
# Query 视图 —— 评测报告
# ==========================================


async def view_task_report(task_uid: str) -> TaskReportType:
    try:
        async with get_session()() as session:
            result = await session.execute(
                select(EvalTask)
                .options(
                    selectinload(EvalTask.model), selectinload(EvalTask.result)
                )
                .where(EvalTask.task_uid == task_uid)
            )
            task = result.scalar_one_or_none()
            if task is None:
                return TaskReportType(success=False, message="任务不存在")

            r = task.result
            if r is None:
                return TaskReportType(
                    success=False,
                    message=f"任务尚未产出结果，当前状态: {task.status}",
                    task_uid=task.task_uid,
                    task_name=task.name,
                    model_name=task.model.name if task.model else "",
                    status=task.status,
                    fingerprint=task.fingerprint,
                )

            return TaskReportType(
                success=True,
                message="ok",
                task_uid=task.task_uid,
                task_name=task.name,
                model_name=task.model.name if task.model else "",
                status=task.status,
                composite_score=r.composite_score,
                cost_per_task=r.cost_per_task,
                latency_p50=r.latency_p50,
                throughput=r.throughput,
                domain_scores=_result_domain_scores(r),
                fingerprint=task.fingerprint,
            )
    except Exception as e:
        logger.error(f"{get_request_id()}获取评测报告失败: {e}", exc_info=True)
        return TaskReportType(success=False, message=f"获取报告失败: {str(e)}")


# ==========================================
# Query 视图 —— 模型评分图谱
# ==========================================


async def view_score_cost_graph(
    filter: Optional[ScoreGraphFilterInput] = None,
) -> ScoreGraphType:
    """评分 × 成本散点图谱：每个模型取最新一条评测结果，服务端计算 Pareto 前沿。"""
    try:
        async with get_session()() as session:
            result = await session.execute(
                select(EvalResult)
                .options(selectinload(EvalResult.model), selectinload(EvalResult.task))
                .order_by(EvalResult.model_id, EvalResult.id.desc())
            )
            rows = result.scalars().all()

            # 每个模型取最新一条结果
            latest: Dict[int, EvalResult] = {}
            for r in rows:
                if r.model_id not in latest:
                    latest[r.model_id] = r

            points: List[ScorePointType] = []
            for r in latest.values():
                m = r.model
                if m is None:
                    continue
                if filter is not None:
                    if filter.vendors and m.vendor not in filter.vendors:
                        continue
                    if filter.access_type and m.access_type != filter.access_type:
                        continue
                    if filter.backend and m.backend != filter.backend:
                        continue
                    if (
                        filter.min_score is not None
                        and r.composite_score < filter.min_score
                    ):
                        continue
                    if filter.max_cost is not None and r.cost_per_task > filter.max_cost:
                        continue

                points.append(
                    ScorePointType(
                        model_id=m.id,
                        name=m.name,
                        vendor=m.vendor,
                        series=m.series,
                        version=m.version,
                        access_type=m.access_type,
                        backend=m.backend,
                        composite_score=r.composite_score,
                        cost_per_task=r.cost_per_task,
                        latency_p50=r.latency_p50,
                        throughput=r.throughput,
                        domain_scores=_result_domain_scores(r),
                        task_uid=r.task.task_uid if r.task else "",
                    )
                )

        # 性价比排名：评分 / 成本 降序
        ranked = sorted(
            points,
            key=lambda p: (p.composite_score / max(p.cost_per_task, 1e-6)),
            reverse=True,
        )
        for idx, p in enumerate(ranked, start=1):
            p.value_rank = idx

        # Pareto 前沿：按成本升序扫描，综合评分持续刷新的点构成前沿
        # （「同成本最优评分」的包络，越靠左上越优）
        ordered = sorted(points, key=lambda p: (p.cost_per_task, -p.composite_score))
        frontier: List[FrontierPointType] = []
        best_y = float("-inf")
        frontier_model_ids: set[int] = set()
        for p in ordered:
            if p.composite_score > best_y:
                best_y = p.composite_score
                frontier.append(
                    FrontierPointType(x=p.cost_per_task, y=p.composite_score)
                )
                frontier_model_ids.add(p.model_id)
        for p in points:
            p.on_frontier = p.model_id in frontier_model_ids

        vendors = sorted({p.vendor for p in points})
        points.sort(key=lambda p: (p.vendor, p.series, p.model_id))

        return ScoreGraphType(points=points, frontier=frontier, vendors=vendors)

    except Exception as e:
        logger.error(f"{get_request_id()}获取评分图谱失败: {e}", exc_info=True)
        return ScoreGraphType(points=[], frontier=[], vendors=[])
