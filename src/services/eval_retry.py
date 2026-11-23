"""Transient upstream retry helpers for sample-level evaluation."""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Any, Mapping, Optional, Sequence

from .llm_client import LLMChatResult, LLMProviderError

logger = logging.getLogger("uvicorn.error")

_TRANSIENT_MARKERS = (
    "timeout",
    "timed out",
    "apitimeouterror",
    "connection error",
    "apiconnectionerror",
    "connecterror",
    "temporarily unavailable",
    "service unavailable",
    "overloaded",
    "rate limit",
    "429",
    "502",
    "503",
    "504",
)


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise ValueError(f"{name} 必须是整数") from exc


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError as exc:
        raise ValueError(f"{name} 必须是数字") from exc


def _env_flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def sample_max_retries() -> int:
    """Application-level retries per sample (SDK max_retries stays separate)."""
    return max(0, _env_int("ID009_EVAL_SAMPLE_MAX_RETRIES", 2))


def sample_retry_backoff_seconds() -> float:
    return max(0.0, _env_float("ID009_EVAL_SAMPLE_RETRY_BACKOFF_SECONDS", 2.0))


def continue_on_sample_error() -> bool:
    """When true, exhausted transient failures become scored error rows instead of failing the task."""
    return _env_flag("ID009_EVAL_CONTINUE_ON_SAMPLE_ERROR", True)


def is_transient_llm_error(exc: BaseException) -> bool:
    message = str(exc).lower()
    name = type(exc).__name__.lower()
    haystack = f"{name} {message}"
    return any(marker in haystack for marker in _TRANSIENT_MARKERS)


def classify_sample_error_status(exc: BaseException) -> str:
    message = str(exc).lower()
    if "timeout" in message or "timed out" in message or "apitimeouterror" in type(exc).__name().lower():
        return "timeout"
    if "429" in message or "rate limit" in message:
        return "rate_limited"
    if "connection" in message:
        return "connection_error"
    return "error"


async def chat_with_sample_retries(
    client: Any,
    *,
    model: str,
    messages: Sequence[Mapping[str, Any]],
    temperature: Optional[float] = 0.0,
    max_tokens: int = 2048,
    sample_id: str = "",
    max_retries: Optional[int] = None,
    backoff_seconds: Optional[float] = None,
) -> LLMChatResult:
    """Call ``client.chat`` with bounded retries on transient upstream failures."""
    attempts = 1 + (sample_max_retries() if max_retries is None else max(0, max_retries))
    backoff = (
        sample_retry_backoff_seconds()
        if backoff_seconds is None
        else max(0.0, backoff_seconds)
    )
    last_exc: Optional[BaseException] = None
    for attempt in range(1, attempts + 1):
        try:
            return await client.chat(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
        except Exception as exc:  # noqa: BLE001 — classify then re-raise or retry
            last_exc = exc
            if not is_transient_llm_error(exc) or attempt >= attempts:
                raise
            sleep_for = backoff * attempt
            logger.warning(
                "[eval] 样本上游瞬时失败将重试 | sample_id=%s attempt=%s/%s "
                "sleep=%.1fs error=%s",
                sample_id or "?",
                attempt,
                attempts,
                sleep_for,
                exc,
            )
            if sleep_for > 0:
                await asyncio.sleep(sleep_for)
    assert last_exc is not None
    raise last_exc


def error_chat_placeholder(
    *,
    model: str,
    exc: BaseException,
    latency_ms: float = 0.0,
) -> LLMChatResult:
    """Synthetic result used when continuing after exhausted retries."""
    detail = str(exc).splitlines()[0] if str(exc) else type(exc).__name__
    return LLMChatResult(
        answer=f"[upstream_error] {detail[:400]}",
        requested_model=model,
        returned_model=None,
        response_id=None,
        finish_reason=classify_sample_error_status(exc),
        prompt_tokens=None,
        completion_tokens=None,
        total_tokens=None,
        latency_ms=round(latency_ms, 3),
    )


# Re-export for callers that already handle LLMProviderError.
__all__ = [
    "LLMProviderError",
    "chat_with_sample_retries",
    "classify_sample_error_status",
    "continue_on_sample_error",
    "error_chat_placeholder",
    "is_transient_llm_error",
    "sample_max_retries",
    "sample_retry_backoff_seconds",
]
