"""OpenAI-compatible asynchronous LLM client for id_x_009.

The adapter deliberately keeps provider credentials outside the database and
source tree. It targets the OpenAI Chat Completions protocol exposed by the
ChinaRouter gateway; model-level feature support must still be checked against
GET /v1/models and by a controlled smoke test.
"""
from __future__ import annotations

import os
import re
import time
from dataclasses import dataclass
from typing import Any, Mapping, Optional, Sequence
from urllib.parse import urlparse


class LLMConfigurationError(ValueError):
    """Raised when the LLM adapter is not configured safely."""


class LLMProviderError(RuntimeError):
    """A sanitized upstream error; never includes request credentials."""

    def __init__(self, message: str, *, status_code: Optional[int] = None) -> None:
        super().__init__(message)
        self.status_code = status_code


def _redact(value: str) -> str:
    value = re.sub(r"(?i)(authorization\s*[:=]\s*bearer\s+)[^\s,;]+", r"\1[REDACTED]", value)
    value = re.sub(r"\bsk-[A-Za-z0-9_-]{8,}\b", "[REDACTED_API_KEY]", value)
    return value[:600]


@dataclass(frozen=True)
class LLMConfig:
    base_url: str
    api_key: str
    timeout_seconds: float = 120.0
    max_retries: int = 0
    token_parameter: str = "max_tokens"

    def __post_init__(self) -> None:
        parsed = urlparse(self.base_url)
        if parsed.scheme != "https" and parsed.hostname not in {"localhost", "127.0.0.1"}:
            raise LLMConfigurationError("LLM_BASE_URL 必须使用 HTTPS（本地开发地址除外）")
        if not parsed.netloc:
            raise LLMConfigurationError("LLM_BASE_URL 不是有效 URL")
        if not self.api_key or not self.api_key.strip():
            raise LLMConfigurationError("未配置 ID009_LLM_API_KEY")
        if self.timeout_seconds <= 0:
            raise LLMConfigurationError("timeout_seconds 必须大于 0")
        if self.max_retries < 0:
            raise LLMConfigurationError("max_retries 不能小于 0")
        if self.token_parameter not in {"max_tokens", "max_completion_tokens"}:
            raise LLMConfigurationError(
                "ID009_LLM_TOKEN_PARAMETER 仅支持 max_tokens 或 max_completion_tokens"
            )

    @classmethod
    def from_env(cls) -> "LLMConfig":
        base_url = os.getenv(
            "ID009_LLM_BASE_URL", "https://apihk.chinarouter.net/v1"
        ).strip().rstrip("/")
        api_key = os.getenv("ID009_LLM_API_KEY", "").strip()
        try:
            timeout_seconds = float(os.getenv("ID009_LLM_TIMEOUT_SECONDS", "120"))
            max_retries = int(os.getenv("ID009_LLM_MAX_RETRIES", "0"))
        except ValueError as exc:
            raise LLMConfigurationError("LLM timeout/retry 环境变量格式不正确") from exc
        token_parameter = os.getenv("ID009_LLM_TOKEN_PARAMETER", "max_tokens").strip()
        return cls(
            base_url=base_url,
            api_key=api_key,
            timeout_seconds=timeout_seconds,
            max_retries=max_retries,
            token_parameter=token_parameter,
        )


@dataclass(frozen=True)
class LLMChatResult:
    answer: str
    requested_model: str
    returned_model: Optional[str]
    response_id: Optional[str]
    finish_reason: Optional[str]
    prompt_tokens: Optional[int]
    completion_tokens: Optional[int]
    total_tokens: Optional[int]
    latency_ms: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "answer": self.answer,
            "requested_model": self.requested_model,
            "returned_model": self.returned_model,
            "response_id": self.response_id,
            "finish_reason": self.finish_reason,
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
            "total_tokens": self.total_tokens,
            "latency_ms": self.latency_ms,
        }


class OpenAICompatibleLLMClient:
    """Async adapter for gateways implementing POST /v1/chat/completions."""

    def __init__(self, config: Optional[LLMConfig] = None, *, client: Any = None) -> None:
        self.config = config or LLMConfig.from_env()
        if client is not None:
            self._client = client
        else:
            try:
                from openai import AsyncOpenAI
            except ImportError as exc:  # pragma: no cover - depends on deployment env
                raise LLMConfigurationError(
                    "缺少 openai SDK，请安装 requirements-llm-adapter.txt 中的依赖"
                ) from exc
            self._client = AsyncOpenAI(
                api_key=self.config.api_key,
                base_url=self.config.base_url,
                timeout=self.config.timeout_seconds,
                # Avoid hidden duplicate billable requests on timeout by default.
                max_retries=self.config.max_retries,
            )

    async def list_models(self) -> list[str]:
        """Return model IDs visible to this API key via GET /v1/models."""
        try:
            response = await self._client.models.list()
            return sorted(
                str(item.id)
                for item in getattr(response, "data", [])
                if getattr(item, "id", None)
            )
        except Exception as exc:
            status = getattr(exc, "status_code", None)
            raise LLMProviderError(
                f"模型目录查询失败（{type(exc).__name__}, HTTP {status or 'unknown'}）",
                status_code=status,
            ) from exc

    async def check_model_available(self, model_id: str) -> bool:
        if not model_id or not model_id.strip():
            raise ValueError("model_id 不能为空")
        return model_id in await self.list_models()

    async def chat(
        self,
        *,
        model: str,
        messages: Sequence[Mapping[str, Any]],
        temperature: Optional[float] = 0.0,
        max_tokens: int = 2048,
        top_p: Optional[float] = None,
        response_format: Optional[Mapping[str, Any]] = None,
        extra_body: Optional[Mapping[str, Any]] = None,
    ) -> LLMChatResult:
        """Create one non-streaming chat completion and normalize its telemetry."""
        if not model or not model.strip():
            raise ValueError("model 不能为空")
        if not messages:
            raise ValueError("messages 不能为空")
        if max_tokens <= 0:
            raise ValueError("max_tokens 必须大于 0")

        payload: dict[str, Any] = {
            "model": model,
            "messages": [dict(message) for message in messages],
            self.config.token_parameter: max_tokens,
            "stream": False,
        }
        if temperature is not None:
            payload["temperature"] = temperature
        if top_p is not None:
            payload["top_p"] = top_p
        if response_format is not None:
            payload["response_format"] = dict(response_format)
        if extra_body is not None:
            payload["extra_body"] = dict(extra_body)

        started = time.perf_counter()
        try:
            response = await self._client.chat.completions.create(**payload)
        except Exception as exc:
            status = getattr(exc, "status_code", None)
            # Do not echo headers, request bodies, or credentials in logs/errors.
            detail = _redact(str(exc).splitlines()[0] if str(exc) else type(exc).__name__)
            raise LLMProviderError(
                f"模型请求失败（{type(exc).__name__}, HTTP {status or 'unknown'}）：{detail}",
                status_code=status,
            ) from exc

        latency_ms = (time.perf_counter() - started) * 1000.0
        choices = getattr(response, "choices", None) or []
        if not choices:
            raise LLMProviderError("模型返回中没有 choices")
        choice = choices[0]
        message = getattr(choice, "message", None)
        content = getattr(message, "content", None) if message is not None else None
        if isinstance(content, list):
            # Some gateways return typed text content blocks.
            content = "".join(
                str(getattr(part, "text", "") or (part.get("text", "") if isinstance(part, dict) else ""))
                for part in content
            )
        if (not isinstance(content, str) or not content.strip()) and message is not None:
            # Some reasoning models expose the generated text as
            # ``reasoning_content`` while leaving ``content`` empty.
            reasoning_content = getattr(message, "reasoning_content", None)
            if isinstance(reasoning_content, str) and reasoning_content.strip():
                content = reasoning_content
        if not isinstance(content, str) or not content.strip():
            raise LLMProviderError(
                "模型未返回可评分的文本内容（可能返回了工具调用、拒答空内容或非文本模态）"
            )

        usage = getattr(response, "usage", None)
        return LLMChatResult(
            answer=content,
            requested_model=model,
            returned_model=getattr(response, "model", None),
            response_id=getattr(response, "id", None),
            finish_reason=getattr(choice, "finish_reason", None),
            prompt_tokens=getattr(usage, "prompt_tokens", None) if usage else None,
            completion_tokens=getattr(usage, "completion_tokens", None) if usage else None,
            total_tokens=getattr(usage, "total_tokens", None) if usage else None,
            latency_ms=round(latency_ms, 3),
        )

    async def close(self) -> None:
        close = getattr(self._client, "close", None)
        if close is not None:
            await close()

    async def __aenter__(self) -> "OpenAICompatibleLLMClient":
        return self

    async def __aexit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        await self.close()
