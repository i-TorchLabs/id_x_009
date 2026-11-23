import asyncio
import hashlib
import json
import os
import secrets
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Deque, Dict, List, Optional, Tuple
from urllib.parse import quote_plus

import bcrypt

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import selectinload

from utils.log_util import get_request_id, logger
from x_models.id_x_009.src.models.x_models import (
    Dataset,
    DatasetSample,
    EvalResult,
    EvalSampleResult,
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
    DatasetsPageType,
    DomainScoreType,
    EvalTaskType,
    ForgotPasswordInput,
    ForgotPasswordResponseType,
    FrontierPointType,
    HealthType,
    LoginInput,
    ModelType,
    ModelsPageType,
    RegisterInput,
    RegisterModelInput,
    RegisterModelResultType,
    ScoreGraphFilterInput,
    ScoreGraphType,
    SampleResultType,
    ScorePointType,
    TaskActionResultType,
    TaskReportType,
    TasksPageType,
    UpdateModelInput,
    UserInfoType,
)
from x_models.id_x_009.src.services.evaluation_pipeline import (
    EvalSample,
    aggregate_scores,
    evaluate_samples,
)
from x_models.id_x_009.src.services.llm_client import (
    LLMConfig,
    OpenAICompatibleLLMClient,
)
from x_models.id_x_009.src.services.financebench import (
    evaluate_financebench_samples,
    load_financebench_samples,
)
from x_models.id_x_009.src.services.pricing import (
    calculate_cost_db,
    cost_from_rates,
    get_model_price_db,
)



DOMAIN_SPECS: List[Tuple[str, str, float]] = [
    ("reasoning", "客观知识与推理", 0.30),
    ("language", "语言与生成", 0.20),
    ("alignment", "对齐与安全", 0.15),
    ("longctx", "长上下文", 0.15),
    ("multimodal", "多模态", 0.10),
    ("business", "业务专项", 0.10),
]

_REAL_EVAL_DOMAINS = {key for key, _label, _weight in DOMAIN_SPECS}


def _eval_tag(task_uid: Optional[str] = None, task_id: Optional[int] = None) -> str:
    """统一评测日志前缀，便于 `grep '[eval]'` / `tail -f info.log`。"""
    parts = ["[eval]"]
    if task_uid:
        parts.append(f"uid={task_uid}")
    if task_id is not None:
        parts.append(f"id={task_id}")
    return " ".join(parts)


def _gen_task_uid() -> str:
    """任务外部标识：``t-<6位随机数>``（含前导零）。"""
    return f"t-{secrets.randbelow(1_000_000):06d}"


async def _alloc_task_uid(session) -> str:
    """生成库内唯一的任务标识，碰撞时重试。"""
    for _ in range(32):
        candidate = _gen_task_uid()
        exists = await session.execute(
            select(EvalTask.id).where(EvalTask.task_uid == candidate).limit(1)
        )
        if exists.scalar_one_or_none() is None:
            return candidate
    raise RuntimeError("无法分配唯一任务标识 t-<6位随机数>")


def _progress_pct(index: int, total: int) -> int:
    if total <= 0:
        return 1
    return max(1, min(99, int(index * 100 / total)))


def _classify_eval_error(exc: Exception) -> str:
    message = str(exc).lower()
    if "timeout" in message or "timed out" in message:
        return "UPSTREAM_TIMEOUT"
    if "connection error" in message or "apiconnectionerror" in message:
        return "UPSTREAM_CONNECTION"
    if "401" in message or "authenticationerror" in message or "invalid token" in message:
        return "AUTHENTICATION_FAILED"
    if "quota" in message or "pre_consume_token_quota_failed" in message:
        return "QUOTA_EXCEEDED"
    if "no available channel" in message or "无可用渠道" in message:
        return "UPSTREAM_NO_CHANNEL"
    if "429" in message or "rate limit" in message:
        return "RATE_LIMITED"
    if "model" in message and ("not found" in message or "unavailable" in message):
        return "MODEL_NOT_FOUND"
    if "invalid model identifier" in message or "does not offer model" in message:
        return "MODEL_NOT_FOUND"
    if "400" in message or "badrequesterror" in message:
        return "INVALID_PARAMETER"
    if "token" in message and "usage" in message:
        return "MISSING_USAGE"
    if "score" in message or "answer" in message:
        return "SCORING_ERROR"
    return "UNKNOWN"


def _median(values: list[float]) -> float:
    ordered = sorted(values)
    middle = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[middle]
    return (ordered[middle - 1] + ordered[middle]) / 2


def _sample_completion_tokens(item: object) -> Optional[int]:
    if isinstance(item, dict):
        raw = item.get("completion_tokens")
    else:
        raw = getattr(item, "completion_tokens", None)
    if raw is None:
        return None
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


def _sample_latency_ms(item: object) -> Optional[float]:
    if isinstance(item, dict):
        raw = item.get("latency_ms")
    else:
        raw = getattr(item, "latency_ms", None)
    if raw is None:
        return None
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


def _estimate_throughput(samples: list) -> Optional[float]:
    """生成吞吐（tokens/s）：优先取样本级 completion_tokens/latency 的中位数。"""
    rates: list[float] = []
    total_tokens = 0
    total_ms = 0.0
    for item in samples:
        tokens = _sample_completion_tokens(item)
        latency_ms = _sample_latency_ms(item)
        if tokens is None or latency_ms is None:
            continue
        rates.append(tokens / (latency_ms / 1000.0))
        total_tokens += tokens
        total_ms += latency_ms
    if rates:
        return round(_median(rates), 3)
    if total_tokens > 0 and total_ms > 0:
        return round(total_tokens / (total_ms / 1000.0), 3)
    return None

_MODULE_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_FINQA_SAMPLES = _MODULE_ROOT / "data" / "finqa" / "finqa_test_100.json"


_AUTH_WINDOW_SECONDS = 60
_AUTH_MAX_ATTEMPTS = 10
_auth_attempts: Dict[str, Deque[float]] = defaultdict(deque)
_auth_lock = threading.Lock()


def _hash_password_sync(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode(
        "utf-8"
    )


async def hash_password(password: str) -> str:
    return await asyncio.to_thread(_hash_password_sync, password)


def _verify_password_sync(password: str, stored: str) -> bool:
    raw = (stored or "").strip()
    if not raw:
        return False
    # 兼容存量 SHA256（无盐）哈希，登录成功后会升级为 bcrypt
    if len(raw) == 64 and all(c in "0123456789abcdef" for c in raw.lower()):
        return hashlib.sha256(password.encode("utf-8")).hexdigest() == raw.lower()
    try:
        return bcrypt.checkpw(password.encode("utf-8"), raw.encode("utf-8"))
    except (ValueError, TypeError):
        return False


async def verify_password(password: str, stored: str) -> bool:
    return await asyncio.to_thread(_verify_password_sync, password, stored)


def _is_legacy_sha256_hash(stored: str) -> bool:
    raw = (stored or "").strip()
    return len(raw) == 64 and all(c in "0123456789abcdef" for c in raw.lower())


async def generate_token() -> str:
    return secrets.token_urlsafe(32)


def _request_from_info(info) -> Optional[object]:
    ctx = getattr(info, "context", None)
    if isinstance(ctx, dict):
        return ctx.get("request")
    return getattr(ctx, "request", None)


def _bearer_from_request(request) -> Optional[str]:
    if request is None:
        return None
    headers = getattr(request, "headers", None) or {}
    header = ""
    try:
        header = headers.get("authorization", "") or headers.get("Authorization", "")
    except Exception:
        header = ""
    if isinstance(header, str) and header.lower().startswith("bearer "):
        return header[7:].strip()
    return None


def _client_ip(request) -> str:
    if request is None:
        return "unknown"
    headers = getattr(request, "headers", None) or {}
    try:
        forwarded = headers.get("x-forwarded-for") or headers.get("X-Forwarded-For") or ""
    except Exception:
        forwarded = ""
    if forwarded:
        return forwarded.split(",")[0].strip() or "unknown"
    client = getattr(request, "client", None)
    host = getattr(client, "host", None) if client is not None else None
    return str(host or "unknown")


def _auth_rate_limited(action: str, request, email: str = "") -> Optional[str]:
    """简单进程内限速：同一 IP+邮箱 每分钟最多 N 次。"""
    key = f"{action}:{_client_ip(request)}:{(email or '').strip().lower()}"
    now = time.monotonic()
    with _auth_lock:
        bucket = _auth_attempts[key]
        while bucket and now - bucket[0] > _AUTH_WINDOW_SECONDS:
            bucket.popleft()
        if len(bucket) >= _AUTH_MAX_ATTEMPTS:
            return "尝试过于频繁，请稍后再试"
        bucket.append(now)
    return None


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


async def require_auth(info) -> User:
    """GraphQL resolver 鉴权：要求有效 Bearer token。"""
    token = _bearer_from_request(_request_from_info(info))
    user = await verify_token(token or "")
    if user is None or user.is_active is False:
        raise Exception("未授权：请先登录")
    return user




def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt is not None else None


def _mask_api_key(api_key: Optional[str]) -> str:
    raw = (api_key or "").strip()
    if not raw:
        return "（未设置，回退环境变量）"
    if len(raw) <= 8:
        return "*" * len(raw)
    return f"{raw[:3]}••••{raw[-4:]}"


def _api_model_name(model: Optional[Model]) -> str:
    if model is None:
        return ""
    return (model.model_name or "").strip() or (model.name or "").strip()


def _llm_config_for_model(model: Optional[Model]) -> LLMConfig:
    if model is None:
        return LLMConfig.from_env()
    return LLMConfig.from_endpoint(
        base_url=model.base_url,
        api_key=model.api_key,
        fallback_env=True,
    )


def _model_to_type(m: Model) -> ModelType:
    return ModelType(
        id=m.id,
        name=m.name,
        vendor=m.vendor,
        series=m.series,
        base_url=(m.base_url or "").strip() or "https://apihk.chinarouter.net/v1",
        api_key_masked=_mask_api_key(m.api_key),
        model_name=_api_model_name(m),
        access_type=m.access_type,
        backend=m.backend,
        params_b=m.params_b,
        context_length=m.context_length,
        input_price_per_1m=m.input_price_per_1m,
        output_price_per_1m=m.output_price_per_1m,
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
        error_type=t.error_type,
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




async def view_health() -> HealthType:
    return HealthType(status="ok", service="id_x_009")


def _ilike_pattern(value: str) -> str:
    """Escape LIKE wildcards then wrap with % for fuzzy match."""
    escaped = (
        value.replace("\\", "\\\\")
        .replace("%", "\\%")
        .replace("_", "\\_")
    )
    return f"%{escaped}%"


_DEFAULT_PAGE_SIZE = 16
_MAX_PAGE_SIZE = 500


def _normalize_page(page: Optional[int], page_size: Optional[int]) -> Tuple[int, int]:
    p = max(1, int(page or 1))
    ps = int(page_size if page_size is not None else _DEFAULT_PAGE_SIZE)
    ps = min(max(1, ps), _MAX_PAGE_SIZE)
    return p, ps


async def _paginate(session, stmt, page: int, page_size: int):
    """对已带 where/order 的 select 做 count + offset/limit。"""
    count_stmt = select(func.count()).select_from(stmt.order_by(None).subquery())
    total = int((await session.execute(count_stmt)).scalar_one() or 0)
    result = await session.execute(
        stmt.offset((page - 1) * page_size).limit(page_size)
    )
    return list(result.scalars().all()), total


async def view_models(
    vendor: Optional[str] = None,
    access_type: Optional[str] = None,
    name: Optional[str] = None,
    series: Optional[str] = None,
    model_name: Optional[str] = None,
    page: Optional[int] = 1,
    page_size: Optional[int] = _DEFAULT_PAGE_SIZE,
) -> ModelsPageType:
    """模型列表；模型名称/厂商/系列/Model-Name 模糊筛选，多条件 AND 组合。"""
    page, page_size = _normalize_page(page, page_size)
    try:
        async with get_session()() as session:
            stmt = select(Model).order_by(Model.vendor, Model.series, Model.id)
            if access_type:
                stmt = stmt.where(Model.access_type == access_type)
            name_q = (name or "").strip()
            vendor_q = (vendor or "").strip()
            series_q = (series or "").strip()
            model_name_q = (model_name or "").strip()
            if name_q:
                stmt = stmt.where(Model.name.ilike(_ilike_pattern(name_q)))
            if vendor_q:
                stmt = stmt.where(Model.vendor.ilike(_ilike_pattern(vendor_q)))
            if series_q:
                stmt = stmt.where(Model.series.ilike(_ilike_pattern(series_q)))
            if model_name_q:
                stmt = stmt.where(Model.model_name.ilike(_ilike_pattern(model_name_q)))
            rows, total = await _paginate(session, stmt, page, page_size)
            return ModelsPageType(
                items=[_model_to_type(m) for m in rows],
                total=total,
                page=page,
                page_size=page_size,
            )
    except Exception as e:
        logger.error(f"{get_request_id()}获取模型列表失败: {e}", exc_info=True)
        return ModelsPageType(items=[], total=0, page=page, page_size=page_size)


async def view_datasets(
    page: Optional[int] = 1,
    page_size: Optional[int] = _DEFAULT_PAGE_SIZE,
) -> DatasetsPageType:
    page, page_size = _normalize_page(page, page_size)
    try:
        async with get_session()() as session:
            stmt = select(Dataset).order_by(Dataset.domain, Dataset.id)
            rows, total = await _paginate(session, stmt, page, page_size)
            return DatasetsPageType(
                items=[_dataset_to_type(d) for d in rows],
                total=total,
                page=page,
                page_size=page_size,
            )
    except Exception as e:
        logger.error(f"{get_request_id()}获取数据集列表失败: {e}", exc_info=True)
        return DatasetsPageType(items=[], total=0, page=page, page_size=page_size)




async def view_login(input: LoginInput, info=None) -> AuthResponseType:
    request = _request_from_info(info) if info is not None else None
    rate_error = _auth_rate_limited("login", request, input.email or "")
    if rate_error:
        return AuthResponseType(success=False, message=rate_error)
    invalid_msg = "邮箱或密码错误"
    try:
        async with get_session()() as session:
            result = await session.execute(
                select(User).where(User.email == input.email)
            )
            user = result.scalar_one_or_none()

            if user is None:
                return AuthResponseType(success=False, message=invalid_msg)

            if not await verify_password(input.password, user.password_hash):
                return AuthResponseType(success=False, message=invalid_msg)

            if not user.is_active:
                return AuthResponseType(success=False, message="该用户尚未激活")

            # 存量 SHA256 哈希在成功登录后升级为 bcrypt
            if _is_legacy_sha256_hash(user.password_hash):
                user.password_hash = await hash_password(input.password)

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
        return AuthResponseType(success=False, message="登录失败，请稍后重试")


async def view_register(input: RegisterInput, info=None) -> AuthResponseType:
    request = _request_from_info(info) if info is not None else None
    rate_error = _auth_rate_limited("register", request, input.email or "")
    if rate_error:
        return AuthResponseType(success=False, message=rate_error)
    try:
        if input.password != input.confirm_password:
            return AuthResponseType(success=False, message="两次密码输入不一致")

        if len(input.password) < 8:
            return AuthResponseType(success=False, message="密码长度至少8位")

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
                is_active=False,
            )
            session.add(new_user)
            await session.commit()
            await session.refresh(new_user)

            return AuthResponseType(
                success=True,
                message="注册成功，请等待管理员激活后再登录",
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
        return AuthResponseType(success=False, message="注册失败，请稍后重试")


async def view_forgot_password(
    input: ForgotPasswordInput, info=None
) -> ForgotPasswordResponseType:
    request = _request_from_info(info) if info is not None else None
    rate_error = _auth_rate_limited("forgot", request, input.email or "")
    if rate_error:
        return ForgotPasswordResponseType(success=False, message=rate_error)
    # 统一文案，避免邮箱枚举；绝不把 reset_token 返回给客户端
    generic_msg = "如果邮箱存在，重置链接已发送"
    try:
        async with get_session()() as session:
            result = await session.execute(
                select(User).where(User.email == input.email)
            )
            user = result.scalar_one_or_none()

            if user is None:
                return ForgotPasswordResponseType(success=True, message=generic_msg)

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
            logger.info(
                f"{get_request_id()}已生成密码重置令牌 user_id={user.id}（仅服务端保留）"
            )

            return ForgotPasswordResponseType(
                success=True,
                message=generic_msg,
                reset_token=None,
            )

    except Exception as e:
        logger.error(f"{get_request_id()}忘记密码处理失败: {e}", exc_info=True)
        return ForgotPasswordResponseType(success=False, message="处理失败，请稍后重试")


async def view_logout(info=None) -> AuthResponseType:
    try:
        token = _bearer_from_request(_request_from_info(info) if info is not None else None)
        if token:
            async with get_session()() as session:
                result = await session.execute(
                    select(UserToken).where(UserToken.token == token)
                )
                user_token = result.scalar_one_or_none()
                if user_token is not None:
                    session.delete(user_token)
                    await session.commit()
        return AuthResponseType(success=True, message="登出成功", token=None, user=None)
    except Exception as e:
        logger.error(f"{get_request_id()}登出失败: {e}", exc_info=True)
        return AuthResponseType(success=False, message="登出失败，请稍后重试")




async def view_register_model(input: RegisterModelInput) -> RegisterModelResultType:
    try:
        name = (input.name or "").strip()
        vendor = (input.vendor or "").strip()
        series = (input.series or "").strip()
        base_url = (input.base_url or "").strip().rstrip("/")
        api_key = (input.api_key or "").strip()
        model_name = (input.model_name or "").strip() or name
        if not name or not vendor or not series:
            return RegisterModelResultType(
                success=False, message="请填写名称、厂商、系列"
            )
        if not base_url:
            return RegisterModelResultType(success=False, message="请填写 Base-Url")
        if not api_key:
            return RegisterModelResultType(success=False, message="请填写 API-Key")
        if not model_name:
            return RegisterModelResultType(success=False, message="请填写 Model-Name")
        # 提前校验端点，避免注册无效配置
        LLMConfig.from_endpoint(base_url=base_url, api_key=api_key, fallback_env=False)

        if input.input_price_per_1m is not None and input.input_price_per_1m < 0:
            return RegisterModelResultType(success=False, message="输入价不能为负")
        if input.output_price_per_1m is not None and input.output_price_per_1m < 0:
            return RegisterModelResultType(success=False, message="输出价不能为负")

        async with get_session()() as session:
            dup = await session.execute(select(Model).where(Model.name == name))
            if dup.scalar_one_or_none() is not None:
                return RegisterModelResultType(
                    success=False, message="同名模型已注册"
                )

            model = Model(
                name=name,
                vendor=vendor or "Unknown",
                series=series or name,
                base_url=base_url,
                api_key=api_key,
                model_name=model_name,
                access_type=input.access_type or "api",
                backend=input.backend or "api",
                params_b=input.params_b,
                context_length=input.context_length,
                input_price_per_1m=(
                    float(input.input_price_per_1m)
                    if input.input_price_per_1m is not None
                    else 0.0
                ),
                output_price_per_1m=(
                    float(input.output_price_per_1m)
                    if input.output_price_per_1m is not None
                    else 0.0
                ),
            )
            # 未填单价时，按同 Model-Name / 名称的已有行回填
            if model.input_price_per_1m == 0 or model.output_price_per_1m == 0:
                price = await get_model_price_db(session, model_name)
                if price is None:
                    price = await get_model_price_db(session, name)
                if price is not None:
                    if model.input_price_per_1m == 0:
                        model.input_price_per_1m = float(price.input_price_per_1m)
                    if model.output_price_per_1m == 0:
                        model.output_price_per_1m = float(price.output_price_per_1m)
            session.add(model)
            await session.commit()
            await session.refresh(model)

            logger.info(
                f"{get_request_id()}注册模型成功: {model.name} "
                f"model_name={model.model_name} base_url={model.base_url}"
            )
            return RegisterModelResultType(
                success=True,
                message="模型注册成功",
                model=_model_to_type(model),
            )

    except Exception as e:
        logger.error(f"{get_request_id()}注册模型失败: {e}", exc_info=True)
        return RegisterModelResultType(success=False, message=f"注册失败: {str(e)}")


async def view_update_model(input: UpdateModelInput) -> RegisterModelResultType:
    """更新已注册模型信息；api_key 为空时保留原密钥。"""
    try:
        name = (input.name or "").strip()
        vendor = (input.vendor or "").strip()
        series = (input.series or "").strip()
        base_url = (input.base_url or "").strip().rstrip("/")
        api_key_raw = (input.api_key or "").strip() if input.api_key is not None else ""
        model_name = (input.model_name or "").strip() or name
        if not name or not vendor or not series:
            return RegisterModelResultType(
                success=False, message="请填写名称、厂商、系列"
            )
        if not base_url:
            return RegisterModelResultType(success=False, message="请填写 Base-Url")
        if not model_name:
            return RegisterModelResultType(success=False, message="请填写 Model-Name")
        if input.input_price_per_1m is not None and input.input_price_per_1m < 0:
            return RegisterModelResultType(success=False, message="输入价不能为负")
        if input.output_price_per_1m is not None and input.output_price_per_1m < 0:
            return RegisterModelResultType(success=False, message="输出价不能为负")

        async with get_session()() as session:
            result = await session.execute(
                select(Model).where(Model.id == input.model_id)
            )
            model = result.scalar_one_or_none()
            if model is None:
                return RegisterModelResultType(success=False, message="模型不存在")

            dup = await session.execute(
                select(Model).where(
                    Model.name == name,
                    Model.id != input.model_id,
                )
            )
            if dup.scalar_one_or_none() is not None:
                return RegisterModelResultType(
                    success=False, message="同名模型已存在"
                )

            next_api_key = api_key_raw if api_key_raw else (model.api_key or "")
            # 有密钥则校验端点；无密钥时允许回退环境变量
            if next_api_key:
                LLMConfig.from_endpoint(
                    base_url=base_url, api_key=next_api_key, fallback_env=False
                )
            else:
                LLMConfig.from_endpoint(
                    base_url=base_url, api_key=None, fallback_env=True
                )

            model.name = name
            model.vendor = vendor
            model.series = series
            model.base_url = base_url
            model.api_key = next_api_key
            model.model_name = model_name
            model.access_type = input.access_type or model.access_type or "api"
            model.backend = input.backend or model.backend or "api"
            model.params_b = input.params_b
            model.context_length = input.context_length
            model.input_price_per_1m = input.input_price_per_1m
            model.output_price_per_1m = input.output_price_per_1m
            await session.commit()
            await session.refresh(model)

            logger.info(
                f"{get_request_id()}更新模型成功: id={model.id} "
                f"{model.name} model_name={model.model_name} "
                f"base_url={model.base_url} api_key_updated={bool(api_key_raw)}"
            )
            return RegisterModelResultType(
                success=True,
                message="模型已更新",
                model=_model_to_type(model),
            )
    except Exception as e:
        logger.error(f"{get_request_id()}更新模型失败: {e}", exc_info=True)
        return RegisterModelResultType(success=False, message=f"更新失败: {str(e)}")


async def view_delete_model(model_id: int) -> TaskActionResultType:
    """删除已注册模型，并级联清理其评测任务与结果。"""
    try:
        async with get_session()() as session:
            result = await session.execute(select(Model).where(Model.id == model_id))
            model = result.scalar_one_or_none()
            if model is None:
                return TaskActionResultType(success=False, message="模型不存在")

            name = model.name
            task_ids = list(
                (
                    await session.execute(
                        select(EvalTask.id).where(EvalTask.model_id == model_id)
                    )
                )
                .scalars()
                .all()
            )
            if task_ids:
                await session.execute(
                    delete(EvalSampleResult).where(
                        EvalSampleResult.task_id.in_(task_ids)
                    )
                )
                await session.execute(
                    delete(EvalResult).where(EvalResult.task_id.in_(task_ids))
                )
                await session.execute(
                    delete(EvalTask).where(EvalTask.id.in_(task_ids))
                )
            # 兜底：直接按 model_id 清残留明细
            await session.execute(
                delete(EvalSampleResult).where(EvalSampleResult.model_id == model_id)
            )
            await session.execute(
                delete(EvalResult).where(EvalResult.model_id == model_id)
            )
            await session.delete(model)
            await session.commit()
            logger.info(
                f"{get_request_id()}模型已删除: {name} id={model_id} "
                f"cascaded_tasks={len(task_ids)}"
            )
            return TaskActionResultType(
                success=True,
                message=f"模型已删除（含 {len(task_ids)} 个关联任务）",
                status="Deleted",
            )
    except Exception as e:
        logger.error(f"{get_request_id()}删除模型失败: {e}", exc_info=True)
        return TaskActionResultType(success=False, message=f"删除失败: {str(e)}")


def _build_fingerprint(
    model: Model,
    datasets: List[Dataset],
    backend: str,
    temperature: float,
    max_tokens: int,
) -> str:
    payload = {
        "dataset": [d.snapshot for d in datasets],
        "model": model.name,
        "model_name": _api_model_name(model),
        "base_url": (model.base_url or "").strip(),
        "engine": f"{backend or model.backend or 'api'}@0.6",
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
            task_uid = await _alloc_task_uid(session)

            task = EvalTask(
                task_uid=task_uid,
                name=input.name,
                model_id=model.id,
                dataset_ids=json.dumps(input.dataset_ids),
                backend=input.backend or "api",
                status="Pending",
                progress=0,
                fingerprint=fingerprint,
            )
            session.add(task)
            await session.commit()
            task_id = task.id

        logger.info(
            f"{get_request_id()}{_eval_tag(task_uid, task_id)} 任务已创建 | "
            f"name={input.name!r} model={model.name} "
            f"datasets={list(input.dataset_ids)} backend={input.backend or 'api'} "
            f"status=Pending → 启动执行线程"
        )
        _start_runner(task_id)

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
                backend=input.backend or "api",
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
    thread = threading.Thread(
        target=lambda: asyncio.run(_run_task_with_own_engine(task_id)),
        daemon=True,
        name=f"eval-runner-{task_id}",
    )
    logger.info(f"{_eval_tag(task_id=task_id)} 执行线程已启动 name=eval-runner-{task_id}")
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


async def _run_task(maker: async_sessionmaker, task_id: int) -> None:
    mode = os.getenv("ID009_EVAL_MODE", "real").strip().lower() or "real"
    tag = _eval_tag(task_id=task_id)
    logger.info(f"{tag} 调度开始 | ID009_EVAL_MODE={mode!r}")
    if mode != "real":
        async with maker() as session:
            result = await session.execute(
                select(EvalTask).where(EvalTask.id == task_id)
            )
            task = result.scalar_one_or_none()
            if task is not None:
                task.status = "Failed"
                task.error = (
                    f"虚拟/模拟评测已禁用（ID009_EVAL_MODE={mode!r}）。"
                    "请设置 ID009_EVAL_MODE=real 并配置网关与样本。"
                )
                task.error_type = "CONFIG_ERROR"
                await session.commit()
                logger.error(
                    f"{_eval_tag(task.task_uid, task_id)} 任务终止 | "
                    f"原因=CONFIG_ERROR mode={mode!r}（仅支持 real）"
                )
        return

    try:
        await _run_real_task(maker, task_id)
    except Exception as exc:
        error_type = _classify_eval_error(exc)
        logger.error(
            f"{tag} 执行异常 | error_type={error_type} error={exc}",
            exc_info=True,
        )
        async with maker() as session:
            result = await session.execute(
                select(EvalTask).where(EvalTask.id == task_id)
            )
            task = result.scalar_one_or_none()
            if task is not None:
                task.status = "Failed"
                task.error = str(exc)
                task.error_type = error_type
                await session.commit()
                logger.error(
                    f"{_eval_tag(task.task_uid, task_id)} 任务失败已落库 | "
                    f"status=Failed error_type={error_type} progress={task.progress}"
                )


def _resolve_eval_samples_file() -> Path:
    sample_path = os.getenv("ID009_EVAL_SAMPLES_FILE", "").strip()
    if sample_path:
        return Path(sample_path)
    evaluation_format = os.getenv("ID009_EVAL_FORMAT", "financebench").strip().lower()
    if evaluation_format == "financebench" and _DEFAULT_FINQA_SAMPLES.is_file():
        return _DEFAULT_FINQA_SAMPLES
    raise RuntimeError("真实评测需要配置 ID009_EVAL_SAMPLES_FILE")


def _load_real_eval_samples() -> list[EvalSample]:
    path = _resolve_eval_samples_file()
    if not path.is_file():
        raise RuntimeError(f"评测样本文件不存在: {path}")

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"评测样本文件无法读取: {type(exc).__name__}") from exc

    if not isinstance(payload, list) or not payload:
        raise RuntimeError("评测样本文件必须是非空 JSON 数组")

    samples: list[EvalSample] = []
    for item in payload:
        if not isinstance(item, dict):
            raise RuntimeError("每条评测样本必须是 JSON 对象")
        samples.append(
            EvalSample(
                sample_id=str(item.get("sample_id", "")),
                domain=str(item.get("domain", "")),
                prompt=str(item.get("prompt", "")),
                expected_answer=(
                    str(item["expected_answer"])
                    if item.get("expected_answer") is not None
                    else None
                ),
            )
        )
    return samples


_DOMAIN_LABEL_TO_KEY = {
    "客观知识与推理": "reasoning",
    "语言与生成": "language",
    "对齐与安全": "alignment",
    "长上下文": "longctx",
    "多模态": "multimodal",
    "业务专项": "business",
}


def _normalize_domain_key(raw: str) -> str:
    value = (raw or "").strip()
    if value in _REAL_EVAL_DOMAINS:
        return value
    return _DOMAIN_LABEL_TO_KEY.get(value, value)


def _parse_task_dataset_ids(raw: Optional[str]) -> list[int]:
    try:
        values = json.loads(raw or "[]")
    except (TypeError, json.JSONDecodeError):
        return []
    out: list[int] = []
    for item in values:
        try:
            out.append(int(item))
        except (TypeError, ValueError):
            continue
    return out


async def _load_task_dataset_samples(
    session, dataset_ids: list[int]
) -> list[EvalSample]:
    """从任务勾选的数据集加载样本（优先于全局 ID009_EVAL_FORMAT 文件）。"""
    if not dataset_ids:
        return []
    result = await session.execute(
        select(DatasetSample)
        .where(DatasetSample.dataset_id.in_(dataset_ids))
        .order_by(DatasetSample.dataset_id, DatasetSample.sort_order, DatasetSample.id)
    )
    rows = list(result.scalars().all())
    samples: list[EvalSample] = []
    for row in rows:
        domain = _normalize_domain_key(row.domain)
        if domain not in _REAL_EVAL_DOMAINS:
            continue
        samples.append(
            EvalSample(
                sample_id=str(row.sample_id),
                domain=domain,
                prompt=str(row.prompt or ""),
                expected_answer=(
                    str(row.expected_answer)
                    if row.expected_answer is not None
                    else None
                ),
            )
        )
    return samples


def _domain_weights_for(domains: set[str]) -> dict[str, float]:
    selected = {
        key: weight for key, _label, weight in DOMAIN_SPECS if key in domains
    }
    total = sum(selected.values())
    if total <= 0:
        return selected
    return {key: weight / total for key, weight in selected.items()}


def _load_financebench_eval_samples():
    path = _resolve_eval_samples_file()
    try:
        return load_financebench_samples(str(path))
    except (OSError, UnicodeDecodeError, ValueError, TypeError) as exc:
        raise RuntimeError(f"FinanceBench 样本文件无法读取: {type(exc).__name__}") from exc


def _financebench_temperature(model_name: str) -> float:
    """Return provider-compatible sampling temperature for a model."""
    if model_name.strip().lower() == "kimi-k3.1-pro":
        return 1.0
    return 0.0


async def _token_cost(
    session,
    model_key: str,
    prompt_tokens: int,
    completion_tokens: int,
    *,
    model: Optional[Model] = None,
) -> float:
    """Prefer models_info row prices; optional env per-1K overrides."""
    try:
        input_rate = float(os.getenv("ID009_LLM_INPUT_COST_PER_1K_TOKENS", "0") or "0")
        output_rate = float(os.getenv("ID009_LLM_OUTPUT_COST_PER_1K_TOKENS", "0") or "0")
    except ValueError as exc:
        raise RuntimeError("LLM token pricing environment variables格式不正确") from exc
    if input_rate < 0 or output_rate < 0:
        raise RuntimeError("LLM token pricing cannot be negative")
    if prompt_tokens == 0 and completion_tokens == 0:
        raise RuntimeError("真实评测缺少 token usage，无法计算成本")
    if input_rate == 0 and output_rate == 0:
        if (
            model is not None
            and model.input_price_per_1m is not None
            and model.output_price_per_1m is not None
        ):
            return cost_from_rates(
                model.input_price_per_1m,
                model.output_price_per_1m,
                prompt_tokens,
                completion_tokens,
            )
        try:
            return await calculate_cost_db(
                session, model_key, prompt_tokens, completion_tokens
            )
        except KeyError as exc:
            raise RuntimeError(str(exc)) from exc
    return round(
        prompt_tokens / 1000.0 * input_rate
        + completion_tokens / 1000.0 * output_rate,
        6,
    )


async def _real_eval_cost(
    session, evaluations, model_key: str, *, model: Optional[Model] = None
) -> float:
    prompt_tokens = sum(item.prompt_tokens or 0 for item in evaluations)
    completion_tokens = sum(item.completion_tokens or 0 for item in evaluations)
    if not evaluations:
        raise RuntimeError("真实评测缺少 token usage，无法计算成本")
    return await _token_cost(
        session, model_key, prompt_tokens, completion_tokens, model=model
    )


async def _real_eval_cost_from_records(
    session, records, model_key: str, *, model: Optional[Model] = None
) -> float:
    prompt_tokens = sum(item["prompt_tokens"] or 0 for item in records)
    completion_tokens = sum(item["completion_tokens"] or 0 for item in records)
    if not records:
        raise RuntimeError("FinanceBench 评测缺少 token usage，无法计算成本")
    return await _token_cost(
        session, model_key, prompt_tokens, completion_tokens, model=model
    )


def _score_status_for_domain(score: Optional[float]) -> str:
    if score is None:
        return "unscored"
    if score >= 100.0:
        return "pass"
    return "fail"


async def _run_domain_eval(
    *,
    session,
    task: EvalTask,
    tag: str,
    api_model: str,
    llm_config: LLMConfig,
    samples: list[EvalSample],
    source: str,
    bump_progress,
) -> None:
    """按能力域样本评测并写入 EvalResult / EvalSampleResult。"""
    present = {sample.domain for sample in samples}
    weights = _domain_weights_for(present)
    logger.info(
        f"{tag} 样本加载完成 | source={source} count={len(samples)} "
        f"domains={sorted(present)} weights={weights} → 开始逐条调用模型"
    )
    if not samples:
        raise RuntimeError("能力域评测样本列表不能为空")

    async def _on_domain_sample(index: int, total_n: int, evaluation) -> None:
        pct = await bump_progress(index, total_n)
        status = evaluation.score_status or _score_status_for_domain(evaluation.score)
        logger.info(
            f"{tag} 样本进度 {index}/{total_n} ({pct}%) | "
            f"sample_id={evaluation.sample_id} domain={evaluation.domain} "
            f"score_status={status} score={evaluation.score} "
            f"latency_ms={evaluation.latency_ms} tokens={evaluation.total_tokens}"
        )

    async with OpenAICompatibleLLMClient(llm_config) as client:
        logger.info(f"{tag} LLM 客户端已就绪 | 开始能力域评测循环")
        evaluations = await evaluate_samples(
            client,
            model=api_model,
            samples=samples,
            temperature=0.0,
            max_tokens=2048,
            on_sample_done=_on_domain_sample,
        )

    logger.info(f"{tag} 样本评测结束 | total={len(evaluations)} → 聚合域分与成本")
    skipped = 0
    for item in evaluations:
        status = item.score_status or _score_status_for_domain(item.score)
        if status in {"timeout", "error", "connection_error", "rate_limited"}:
            skipped += 1
        session.add(
            EvalSampleResult(
                task_id=task.id,
                model_id=task.model_id,
                sample_id=item.sample_id,
                business_module=item.domain,
                answer=item.answer,
                score=float(item.score) if item.score is not None else 0.0,
                score_status=status,
                response_id=item.response_id,
                returned_model=item.returned_model,
                prompt_tokens=item.prompt_tokens,
                completion_tokens=item.completion_tokens,
                total_tokens=item.total_tokens,
                latency_ms=item.latency_ms,
            )
        )

    aggregate = aggregate_scores(evaluations, weights)
    domain_scores = aggregate["domain_scores"]
    if not domain_scores:
        raise RuntimeError(
            "能力域评测没有可评分样本（缺少 expected_answer、全部未命中，"
            f"或上游失败过多 skipped={skipped}/{len(evaluations)}）"
        )
    composite = aggregate["composite_score"]
    if composite is None:
        raise RuntimeError("能力域评测无法计算综合分")

    billed = [
        item
        for item in evaluations
        if (item.prompt_tokens or 0) > 0 or (item.completion_tokens or 0) > 0
    ]
    if not billed:
        raise RuntimeError(
            f"真实评测缺少 token usage（上游失败 skipped={skipped}/{len(evaluations)}）"
        )
    cost_per_task = await _real_eval_cost(
        session, billed, api_model, model=task.model
    )
    scored_latency = [
        item.latency_ms
        for item in evaluations
        if (item.score_status or "")
        not in {"timeout", "error", "connection_error", "rate_limited"}
    ]
    latency_p50 = round(_median(scored_latency or [item.latency_ms for item in evaluations]), 3)
    throughput = _estimate_throughput(list(billed) or list(evaluations))

    task.progress = 100
    task.status = "Done"
    session.add(
        EvalResult(
            task_id=task.id,
            model_id=task.model_id,
            score_reasoning=float(domain_scores.get("reasoning", 0.0)),
            score_language=float(domain_scores.get("language", 0.0)),
            score_alignment=float(domain_scores.get("alignment", 0.0)),
            score_longctx=float(domain_scores.get("longctx", 0.0)),
            score_multimodal=float(domain_scores.get("multimodal", 0.0)),
            score_business=float(domain_scores.get("business", 0.0)),
            composite_score=float(composite),
            cost_per_task=cost_per_task,
            latency_p50=latency_p50,
            throughput=throughput,
        )
    )
    await session.commit()
    logger.info(
        f"{tag} 任务完成 Done | format=domain source={source} "
        f"composite={composite} domains={domain_scores} "
        f"cost_per_task={cost_per_task} latency_p50_ms={latency_p50} "
        f"throughput_tps={throughput} skipped_upstream={skipped}/{len(evaluations)}"
    )


async def _run_financebench_eval(
    *,
    session,
    task: EvalTask,
    tag: str,
    api_model: str,
    llm_config: LLMConfig,
    bump_progress,
) -> None:
    finance_samples = _load_financebench_eval_samples()
    total = len(finance_samples)
    temperature = _financebench_temperature(api_model)
    logger.info(
        f"{tag} 样本加载完成 | source=financebench_file count={total} "
        f"temperature={temperature} → 开始逐条调用模型"
    )
    if total == 0:
        raise RuntimeError("FinanceBench 样本列表不能为空")

    pass_count = 0
    fail_count = 0
    unparseable_count = 0
    upstream_error_count = 0
    _upstream_statuses = {"timeout", "error", "connection_error", "rate_limited"}

    async def _on_fb_sample(index: int, total_n: int, record: dict) -> None:
        nonlocal pass_count, fail_count, unparseable_count, upstream_error_count
        status = str(record["score"].get("status", ""))
        if status == "pass":
            pass_count += 1
        elif status == "unparseable":
            unparseable_count += 1
        elif status in _upstream_statuses:
            upstream_error_count += 1
        else:
            fail_count += 1
        pct = await bump_progress(index, total_n)
        logger.info(
            f"{tag} 样本进度 {index}/{total_n} ({pct}%) | "
            f"sample_id={record.get('sample_id')} "
            f"module={record.get('business_module') or '—'} "
            f"score_status={status} score={record['score'].get('score')} "
            f"latency_ms={record.get('latency_ms')} "
            f"tokens={record.get('total_tokens')} "
            f"pass={pass_count} fail={fail_count} unparseable={unparseable_count} "
            f"upstream_error={upstream_error_count}"
        )

    async with OpenAICompatibleLLMClient(llm_config) as client:
        logger.info(f"{tag} LLM 客户端已就绪 | 开始 FinanceBench 评测循环")
        sample_results = await evaluate_financebench_samples(
            client,
            model=api_model,
            samples=finance_samples,
            temperature=temperature,
            on_sample_done=_on_fb_sample,
        )

    logger.info(
        f"{tag} 样本评测结束 | total={len(sample_results)} "
        f"pass={pass_count} fail={fail_count} unparseable={unparseable_count} "
        f"upstream_error={upstream_error_count} → 写入样本明细与汇总"
    )
    for item in sample_results:
        score_info = item["score"]
        session.add(
            EvalSampleResult(
                task_id=task.id,
                model_id=task.model_id,
                sample_id=item["sample_id"],
                business_module=item["business_module"],
                answer=item["answer"],
                score=score_info["score"],
                score_status=score_info["status"],
                response_id=item["response_id"],
                returned_model=item["returned_model"],
                prompt_tokens=item["prompt_tokens"],
                completion_tokens=item["completion_tokens"],
                total_tokens=item["total_tokens"],
                latency_ms=item["latency_ms"],
            )
        )
    if not sample_results:
        raise RuntimeError("FinanceBench 样本列表不能为空")
    scored = [
        item
        for item in sample_results
        if str(item["score"].get("status", "")) not in _upstream_statuses
    ]
    if not scored:
        raise RuntimeError(
            f"FinanceBench 全部样本上游失败 "
            f"(upstream_error={upstream_error_count}/{len(sample_results)})"
        )
    scores = [item["score"]["score"] for item in scored]
    billed = [
        item
        for item in sample_results
        if (item.get("prompt_tokens") or 0) > 0 or (item.get("completion_tokens") or 0) > 0
    ]
    if not billed:
        raise RuntimeError(
            f"FinanceBench 评测缺少 token usage "
            f"(upstream_error={upstream_error_count}/{len(sample_results)})"
        )
    cost_per_task = await _real_eval_cost_from_records(
        session, billed, api_model, model=task.model
    )
    composite = round(sum(scores) / len(scores), 2)
    latency_p50 = round(_median([item["latency_ms"] for item in scored]), 3)
    throughput = _estimate_throughput(list(billed))
    task.progress = 100
    task.status = "Done"
    # FinanceBench 仅覆盖业务专项；其余五域无对应样本，记 0
    session.add(
        EvalResult(
            task_id=task.id,
            model_id=task.model_id,
            score_reasoning=0,
            score_language=0,
            score_alignment=0,
            score_longctx=0,
            score_multimodal=0,
            score_business=composite,
            composite_score=composite,
            cost_per_task=cost_per_task,
            latency_p50=latency_p50,
            throughput=throughput,
        )
    )
    await session.commit()
    logger.info(
        f"{tag} 任务完成 Done | format=financebench "
        f"composite={composite} cost_per_task={cost_per_task} "
        f"latency_p50_ms={latency_p50} throughput_tps={throughput} "
        f"pass={pass_count}/{len(scored)} scored={len(scored)}/{len(sample_results)} "
        f"fail={fail_count} unparseable={unparseable_count} "
        f"upstream_error={upstream_error_count}"
    )


async def _run_real_task(maker: async_sessionmaker, task_id: int) -> None:
    async with maker() as session:
        result = await session.execute(
            select(EvalTask)
            .options(selectinload(EvalTask.model))
            .where(EvalTask.id == task_id)
        )
        task = result.scalar_one_or_none()
        if task is None:
            logger.warning(f"{_eval_tag(task_id=task_id)} 任务不存在，跳过执行")
            return
        if task.status in {"Failed", "Done"}:
            logger.info(
                f"{_eval_tag(task.task_uid, task_id)} 跳过执行 | "
                f"当前状态={task.status}（已终态）"
            )
            return

        tag = _eval_tag(task.task_uid, task_id)
        display_name = task.model.name if task.model is not None else "?"
        api_model = _api_model_name(task.model) or display_name
        llm_config = _llm_config_for_model(task.model)
        evaluation_format = os.getenv("ID009_EVAL_FORMAT", "financebench").strip().lower()
        dataset_ids = _parse_task_dataset_ids(task.dataset_ids)

        task.status = "Running"
        task.progress = max(task.progress or 0, 1)
        await session.commit()
        logger.info(
            f"{tag} 进入 Running | model={display_name} api_model={api_model} "
            f"base_url={llm_config.base_url} format={evaluation_format} "
            f"dataset_ids={dataset_ids} progress=1%"
        )

        async def _bump_progress(index: int, total: int) -> int:
            # 用户可能在运行中删除任务；中止后续写入，避免 FK/幽灵更新
            alive = await session.execute(
                select(EvalTask.id).where(EvalTask.id == task_id)
            )
            if alive.scalar_one_or_none() is None:
                raise RuntimeError("任务已删除，评测已中止")
            pct = _progress_pct(index, total)
            task.progress = pct
            await session.commit()
            return pct

        # 1) 优先：任务勾选的数据集 → dataset_samples（六域真实评分）
        db_samples = await _load_task_dataset_samples(session, dataset_ids)
        if db_samples:
            await _run_domain_eval(
                session=session,
                task=task,
                tag=tag,
                api_model=api_model,
                llm_config=llm_config,
                samples=db_samples,
                source=f"dataset_samples:{dataset_ids}",
                bump_progress=_bump_progress,
            )
            return

        # 2) 回退：无库内样本时，按 ID009_EVAL_FORMAT
        if evaluation_format == "financebench":
            logger.warning(
                f"{tag} 任务 dataset_ids={dataset_ids} 无 dataset_samples，"
                f"回退 FinanceBench 文件评测（仅业务专项有分）"
            )
            await _run_financebench_eval(
                session=session,
                task=task,
                tag=tag,
                api_model=api_model,
                llm_config=llm_config,
                bump_progress=_bump_progress,
            )
            return

        samples = _load_real_eval_samples()
        if {sample.domain for sample in samples} != _REAL_EVAL_DOMAINS:
            raise RuntimeError(
                "真实评测样本必须覆盖六个能力域: "
                + ", ".join(sorted(_REAL_EVAL_DOMAINS))
            )
        await _run_domain_eval(
            session=session,
            task=task,
            tag=tag,
            api_model=api_model,
            llm_config=llm_config,
            samples=samples,
            source="eval_samples_file",
            bump_progress=_bump_progress,
        )



async def view_tasks(
    status: Optional[str] = None,
    page: Optional[int] = 1,
    page_size: Optional[int] = _DEFAULT_PAGE_SIZE,
) -> TasksPageType:
    page, page_size = _normalize_page(page, page_size)
    try:
        async with get_session()() as session:
            stmt = (
                select(EvalTask)
                .options(selectinload(EvalTask.model))
                .order_by(EvalTask.id.desc())
            )
            if status:
                stmt = stmt.where(EvalTask.status == status)
            rows, total = await _paginate(session, stmt, page, page_size)
            return TasksPageType(
                items=[_task_to_type(t) for t in rows],
                total=total,
                page=page,
                page_size=page_size,
            )
    except Exception as e:
        logger.error(f"{get_request_id()}获取任务列表失败: {e}", exc_info=True)
        return TasksPageType(items=[], total=0, page=page, page_size=page_size)


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
            logger.info(
                f"{get_request_id()}{_eval_tag(task.task_uid, task.id)} 任务已暂停 | "
                f"progress={task.progress}%"
            )
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
                logger.info(
                    f"{get_request_id()}{_eval_tag(task.task_uid, task.id)} "
                    f"从断点恢复 | progress={task.progress}%"
                )
                return TaskActionResultType(
                    success=True, message="任务已从断点恢复", status="Running"
                )
            if task.status == "Failed":
                task.status = "Pending"
                task.progress = 0
                task.error = None
                task.error_type = None
                await session.commit()
                logger.info(
                    f"{get_request_id()}{_eval_tag(task.task_uid, task.id)} "
                    f"失败任务重新排队 | status=Pending"
                )
                _start_runner(task.id)
                return TaskActionResultType(
                    success=True, message="任务已重新排队", status="Pending"
                )
            if task.status == "Pending":
                logger.info(
                    f"{get_request_id()}{_eval_tag(task.task_uid, task.id)} "
                    f"Pending 任务重新接管执行器"
                )
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


async def view_delete_task(task_uid: str) -> TaskActionResultType:
    """删除评测任务及其关联结果（eval_results / eval_sample_results）。"""
    try:
        async with get_session()() as session:
            result = await session.execute(
                select(EvalTask).where(EvalTask.task_uid == task_uid)
            )
            task = result.scalar_one_or_none()
            if task is None:
                return TaskActionResultType(success=False, message="任务不存在")

            task_id = task.id
            prev_status = task.status
            await session.execute(
                delete(EvalSampleResult).where(EvalSampleResult.task_id == task_id)
            )
            await session.execute(
                delete(EvalResult).where(EvalResult.task_id == task_id)
            )
            await session.delete(task)
            await session.commit()
            logger.info(
                f"{get_request_id()}{_eval_tag(task_uid, task_id)} 任务已删除 | "
                f"prev_status={prev_status}"
            )
            return TaskActionResultType(
                success=True, message="任务已删除", status="Deleted"
            )
    except Exception as e:
        logger.error(f"{get_request_id()}删除任务失败: {e}", exc_info=True)
        return TaskActionResultType(success=False, message=f"删除失败: {str(e)}")




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
            sample_query = await session.execute(
                select(EvalSampleResult)
                .where(EvalSampleResult.task_id == task.id)
                .order_by(EvalSampleResult.id)
            )
            sample_rows = list(sample_query.scalars().all())
            sample_results = [
                SampleResultType(
                    sample_id=item.sample_id,
                    business_module=item.business_module,
                    answer=item.answer,
                    score=item.score,
                    score_status=item.score_status,
                    response_id=item.response_id,
                    returned_model=item.returned_model,
                    prompt_tokens=item.prompt_tokens,
                    completion_tokens=item.completion_tokens,
                    total_tokens=item.total_tokens,
                    latency_ms=item.latency_ms,
                )
                for item in sample_rows
            ]
            if r is None:
                return TaskReportType(
                    success=False,
                    message=f"任务尚未产出结果，当前状态: {task.status}",
                    task_uid=task.task_uid,
                    task_name=task.name,
                    model_name=task.model.name if task.model else "",
                    status=task.status,
                    fingerprint=task.fingerprint,
                    sample_results=sample_results,
                )

            # 历史任务曾把 throughput 写死为 NULL；有样本明细时即时回填
            throughput = r.throughput
            if throughput is None and sample_rows:
                throughput = _estimate_throughput(sample_rows)
                if throughput is not None:
                    r.throughput = throughput
                    await session.commit()

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
                throughput=throughput,
                domain_scores=_result_domain_scores(r),
                fingerprint=task.fingerprint,
                sample_results=sample_results,
            )
    except Exception as e:
        logger.error(f"{get_request_id()}获取评测报告失败: {e}", exc_info=True)
        return TaskReportType(success=False, message=f"获取报告失败: {str(e)}")




async def view_score_cost_graph(
    filter: Optional[ScoreGraphFilterInput] = None,
) -> ScoreGraphType:
    try:
        async with get_session()() as session:
            result = await session.execute(
                select(EvalResult)
                .options(selectinload(EvalResult.model), selectinload(EvalResult.task))
                .order_by(EvalResult.model_id, EvalResult.id.desc())
            )
            rows = result.scalars().all()

            latest: Dict[int, EvalResult] = {}
            for r in rows:
                if r.model_id not in latest:
                    latest[r.model_id] = r

            # 回填历史 NULL 吞吐，避免看板一直显示 —
            missing = [r for r in latest.values() if r.throughput is None]
            if missing:
                sample_map: Dict[int, list] = defaultdict(list)
                sample_rows = (
                    await session.execute(
                        select(EvalSampleResult).where(
                            EvalSampleResult.task_id.in_([r.task_id for r in missing])
                        )
                    )
                ).scalars().all()
                for item in sample_rows:
                    sample_map[item.task_id].append(item)
                dirty = False
                for r in missing:
                    estimated = _estimate_throughput(sample_map.get(r.task_id, []))
                    if estimated is not None:
                        r.throughput = estimated
                        dirty = True
                if dirty:
                    await session.commit()

            points: List[ScorePointType] = []
            for r in latest.values():
                m = r.model
                if m is None:
                    continue
                if r.cost_per_task is None or r.cost_per_task <= 0:
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
                        access_type=m.access_type,
                        backend=m.backend,
                        composite_score=r.composite_score,
                        cost_per_task=r.cost_per_task,
                        input_price_per_1m=m.input_price_per_1m,
                        output_price_per_1m=m.output_price_per_1m,
                        latency_p50=r.latency_p50,
                        throughput=r.throughput,
                        domain_scores=_result_domain_scores(r),
                        task_uid=r.task.task_uid if r.task else "",
                    )
                )

        ranked = sorted(
            points,
            key=lambda p: (p.composite_score / max(p.cost_per_task, 1e-6)),
            reverse=True,
        )
        for idx, p in enumerate(ranked, start=1):
            p.value_rank = idx

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
