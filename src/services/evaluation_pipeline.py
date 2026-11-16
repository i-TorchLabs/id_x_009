"""Sample-level evaluation primitives for id_x_009.

The pipeline is provider-agnostic. It can run against the OpenAI-compatible
adapter or a fake client in tests without making network requests itself.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping, Optional, Sequence

from .llm_client import LLMChatResult


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


def _normalize_answer(value: str) -> str:
    return " ".join(value.strip().casefold().split())


def score_exact_match(answer: str, expected_answer: Optional[str]) -> Optional[float]:
    if expected_answer is None:
        return None
    return 100.0 if _normalize_answer(answer) == _normalize_answer(expected_answer) else 0.0


def _sample_messages(sample: EvalSample) -> list[Mapping[str, Any]]:
    return [{"role": "user", "content": sample.prompt}]


async def evaluate_samples(
    client: Any,
    *,
    model: str,
    samples: Sequence[EvalSample],
    temperature: float = 0.0,
    max_tokens: int = 2048,
) -> list[SampleEvaluation]:
    evaluations: list[SampleEvaluation] = []
    for sample in samples:
        if not sample.sample_id.strip():
            raise ValueError("sample_id 不能为空")
        if not sample.domain.strip():
            raise ValueError("domain 不能为空")
        if not sample.prompt.strip():
            raise ValueError("prompt 不能为空")

        result: LLMChatResult = await client.chat(
            model=model,
            messages=_sample_messages(sample),
            temperature=temperature,
            max_tokens=max_tokens,
        )
        evaluations.append(
            SampleEvaluation(
                sample_id=sample.sample_id,
                domain=sample.domain,
                answer=result.answer,
                score=score_exact_match(result.answer, sample.expected_answer),
                requested_model=result.requested_model,
                returned_model=result.returned_model,
                response_id=result.response_id,
                finish_reason=result.finish_reason,
                prompt_tokens=result.prompt_tokens,
                completion_tokens=result.completion_tokens,
                total_tokens=result.total_tokens,
                latency_ms=result.latency_ms,
            )
        )
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
