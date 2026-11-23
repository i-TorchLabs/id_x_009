"""Sample-level evaluation primitives for id_x_009.

The pipeline is provider-agnostic. It can run against the OpenAI-compatible
adapter or a fake client in tests without making network requests itself.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any, Mapping, Optional, Sequence

from .eval_retry import (
    chat_with_sample_retries,
    classify_sample_error_status,
    continue_on_sample_error,
    error_chat_placeholder,
    is_transient_llm_error,
)
from .llm_client import LLMChatResult

logger = logging.getLogger("uvicorn.error")


@dataclass(frozen=True)
class EvalSample:
    sample_id: str
    domain: str
    prompt: str
    expected_answer: Optional[str] = None


@dataclass(frozen=True)
class SampleEvaluation:
    sample_id: str
    domain: str
    answer: str
    score: Optional[float]
    requested_model: str
    returned_model: Optional[str]
    response_id: Optional[str]
    finish_reason: Optional[str]
    prompt_tokens: Optional[int]
    completion_tokens: Optional[int]
    total_tokens: Optional[int]
    latency_ms: float
    score_status: Optional[str] = None
    error: Optional[str] = None


def _normalize_answer(value: str) -> str:
    return " ".join(value.strip().casefold().split())


def _strip_edge_punct(value: str) -> str:
    return value.strip(" \t\r\n.,;:!?\"'`）】》〉")


def score_exact_match(answer: str, expected_answer: Optional[str]) -> Optional[float]:
    """Exact-match with light normalization; allows short gold as a phrase in the answer."""
    if expected_answer is None:
        return None
    expected = _normalize_answer(expected_answer)
    got = _normalize_answer(answer)
    if not expected:
        return None
    if got == expected or _strip_edge_punct(got) == expected:
        return 100.0
    # Models often wrap short answers ("Paris" → "The capital is Paris.")
    # Strip edge punctuation so "paris." still matches gold "paris".
    soft = _strip_edge_punct(got)
    padded = f" {soft} "
    if (
        f" {expected} " in padded
        or soft.endswith(expected)
        or soft.startswith(expected)
        or got.endswith(expected)
        or got.startswith(expected)
    ):
        return 100.0
    # Numeric / percent gold: accept if the expected token appears among extracted numbers
    if expected.replace("%", "").replace(".", "", 1).replace("-", "", 1).isdigit() or "%" in expected:
        from .financebench import extract_numeric_answers

        try:
            target = float(expected.replace("%", "").replace(",", ""))
        except ValueError:
            return 0.0
        for candidate in extract_numeric_answers(answer):
            if abs(candidate - target) <= max(1e-6, abs(target) * 1e-4):
                return 100.0
            # percent-style gold "14%" vs model "14"
            if "%" in expected and abs(candidate - target) <= 0.05:
                return 100.0
    return 0.0


def _sample_messages(sample: EvalSample) -> list[Mapping[str, Any]]:
    return [{"role": "user", "content": sample.prompt}]


async def evaluate_samples(
    client: Any,
    *,
    model: str,
    samples: Sequence[EvalSample],
    temperature: float = 0.0,
    max_tokens: int = 2048,
    on_sample_done: Any = None,
) -> list[SampleEvaluation]:
    """Evaluate samples sequentially.

    Transient upstream failures (timeout / connection / 429 / 5xx) are retried
    per sample. When ``ID009_EVAL_CONTINUE_ON_SAMPLE_ERROR`` is enabled (default),
    exhausted retries become ``score_status=timeout|error`` rows instead of
    aborting the whole task.

    ``on_sample_done`` 可选：``async (index, total, evaluation) -> None``。
    """
    evaluations: list[SampleEvaluation] = []
    total = len(samples)
    for index, sample in enumerate(samples, start=1):
        if not sample.sample_id.strip():
            raise ValueError("sample_id 不能为空")
        if not sample.domain.strip():
            raise ValueError("domain 不能为空")
        if not sample.prompt.strip():
            raise ValueError("prompt 不能为空")

        started = time.perf_counter()
        sample_error: Optional[str] = None
        score_status: Optional[str] = None
        try:
            result: LLMChatResult = await chat_with_sample_retries(
                client,
                model=model,
                messages=_sample_messages(sample),
                temperature=temperature,
                max_tokens=max_tokens,
                sample_id=sample.sample_id,
            )
            score = score_exact_match(result.answer, sample.expected_answer)
        except Exception as exc:
            if not (continue_on_sample_error() and is_transient_llm_error(exc)):
                raise
            score_status = classify_sample_error_status(exc)
            sample_error = str(exc).splitlines()[0] if str(exc) else type(exc).__name__
            logger.error(
                "[eval] 样本上游失败已跳过 | sample_id=%s status=%s error=%s",
                sample.sample_id,
                score_status,
                sample_error,
            )
            result = error_chat_placeholder(
                model=model,
                exc=exc,
                latency_ms=(time.perf_counter() - started) * 1000.0,
            )
            score = None

        evaluation = SampleEvaluation(
            sample_id=sample.sample_id,
            domain=sample.domain,
            answer=result.answer,
            score=score,
            requested_model=result.requested_model,
            returned_model=result.returned_model,
            response_id=result.response_id,
            finish_reason=result.finish_reason,
            prompt_tokens=result.prompt_tokens,
            completion_tokens=result.completion_tokens,
            total_tokens=result.total_tokens,
            latency_ms=result.latency_ms,
            score_status=score_status,
            error=sample_error,
        )
        evaluations.append(evaluation)
        if on_sample_done is not None:
            await on_sample_done(index, total, evaluation)
    return evaluations


def aggregate_scores(
    evaluations: Sequence[SampleEvaluation],
    domain_weights: Mapping[str, float],
) -> dict[str, Any]:
    by_domain: dict[str, list[float]] = {}
    for evaluation in evaluations:
        if evaluation.score is not None:
            by_domain.setdefault(evaluation.domain, []).append(evaluation.score)

    domain_scores = {
        domain: round(sum(scores) / len(scores), 2)
        for domain, scores in by_domain.items()
        if scores
    }
    weighted = [
        domain_scores[domain] * weight
        for domain, weight in domain_weights.items()
        if domain in domain_scores
    ]
    return {
        "domain_scores": domain_scores,
        "composite_score": round(sum(weighted), 2) if weighted else None,
    }
