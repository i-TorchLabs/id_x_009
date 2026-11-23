"""FinanceBench sample loading and numeric scoring primitives.

The source record keeps gold answers and rubrics separate from the model
payload. Only ``model_input.prompt`` and its evidence excerpts are rendered for
the model. This module is deliberately offline and provider-agnostic.
"""
from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Sequence

from .eval_retry import (
    chat_with_sample_retries,
    classify_sample_error_status,
    continue_on_sample_error,
    error_chat_placeholder,
    is_transient_llm_error,
)
from .llm_client import LLMChatResult

logger = logging.getLogger("uvicorn.error")


_NUMBER_RE = re.compile(
    r"(?<![A-Za-z0-9,])[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:%|x)?(?![\d]|[A-Za-z]|,\d)"
)
_MARKED_NUMBER_RE = re.compile(
    r"(?:=|≈|\bresult\b|\banswer\b|\bratio\b|\bapproximately\b|\bapprox\.?\b)"
    r"\s*[:=]?\s*[$€£]?\s*"
    r"([-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:%|x)?)(?![\d]|[A-Za-z]|,\d)",
    re.IGNORECASE,
)
_BOLD_NUMBER_RE = re.compile(
    r"\*\*\s*([-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:%|x)?)\s*\*\*"
)
_SCALED_NUMBER_RE = re.compile(
    r"([-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*"
    r"(thousand|million|billion|trillion|千|百万|十亿)",
    re.IGNORECASE,
)
_SCALE_FACTORS = {
    "thousand": 1_000.0,
    "million": 1_000_000.0,
    "billion": 1_000_000_000.0,
    "trillion": 1_000_000_000_000.0,
    "千": 1_000.0,
    "百万": 1_000_000.0,
    "十亿": 1_000_000_000.0,
}


@dataclass(frozen=True)
class FinanceBenchSample:
    sample_id: str
    prompt: str
    context: tuple[Mapping[str, Any], ...]
    expected_answer: str
    expected_value: float
    absolute_tolerance: float
    unit: str
    business_module: str
    calculation_rule: str = ""

    def model_prompt(self) -> str:
        """Render only the question and evidence excerpts for the model."""
        evidence = []
        for item in self.context:
            text = str(item.get("text", "")).strip()
            if text:
                evidence.append(
                    f"Evidence {item.get('evidence_id', 'unknown')}:\n{text}"
                )
        suffix = "\n\n".join(evidence)
        rule = self.calculation_rule.strip()
        guidance = f"\n\nCalculation definition: {rule}" if rule else ""
        return f"{self.prompt.strip()}{guidance}\n\n{suffix}" if suffix else f"{self.prompt.strip()}{guidance}"


@dataclass(frozen=True)
class FinanceBenchPrompt:
    sample_id: str
    prompt: str
    context: tuple[Mapping[str, Any], ...]
    business_module: str
    calculation_rule: str = ""

    def model_prompt(self) -> str:
        evidence = []
        for item in self.context:
            text = str(item.get("text", "")).strip()
            if text:
                evidence.append(f"Evidence {item.get('evidence_id', 'unknown')}:\n{text}")
        guidance = (
            f"\n\nCalculation definition: {self.calculation_rule.strip()}"
            if self.calculation_rule.strip()
            else ""
        )
        suffix = "\n\n".join(evidence)
        return f"{self.prompt.strip()}{guidance}\n\n{suffix}" if suffix else f"{self.prompt.strip()}{guidance}"


def _as_float(value: Any, field: str) -> float:
    try:
        return float(str(value).replace(",", "").replace("%", "").strip())
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field} 必须是数值") from exc


def _parse_record(record: Mapping[str, Any]) -> FinanceBenchSample:
    model_input = record.get("model_input")
    gold = record.get("gold_reference")
    task = record.get("task")
    if not isinstance(model_input, Mapping) or not isinstance(gold, Mapping):
        raise ValueError("FinanceBench 样本缺少 model_input 或 gold_reference")
    if not isinstance(task, Mapping):
        raise ValueError("FinanceBench 样本缺少 task")
    prompt = str(model_input.get("prompt", "")).strip()
    sample_id = str(record.get("sample_id", "")).strip()
    answer = str(gold.get("independently_recalculated_answer", "")).strip()
    if not sample_id or not prompt or not answer:
        raise ValueError("FinanceBench 样本必须包含 sample_id、model_input.prompt 和复算答案")
    context = model_input.get("context", [])
    if not isinstance(context, list) or any(not isinstance(item, Mapping) for item in context):
        raise ValueError("model_input.context 必须是对象数组")
    return FinanceBenchSample(
        sample_id=sample_id,
        prompt=prompt,
        context=tuple(context),
        expected_answer=answer,
        expected_value=_as_float(answer, "independently_recalculated_answer"),
        absolute_tolerance=_as_float(gold.get("absolute_tolerance"), "absolute_tolerance"),
        unit=str(gold.get("unit_note", "")).strip() or "unspecified",
        business_module=str(task.get("business_module", "")).strip(),
        calculation_rule=str(task.get("calculation_rule", "")).strip(),
    )


def load_financebench_samples(path: str | Path) -> list[FinanceBenchSample]:
    """Load the proposed nested JSON artifact without exposing gold to callers."""
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(raw, list) or not raw:
        raise ValueError("FinanceBench 文件必须是非空 JSON 数组")
    return [_parse_record(item) for item in raw if isinstance(item, Mapping)]


def load_financebench_prompts(path: str | Path) -> list[FinanceBenchPrompt]:
    """Load candidate prompts for exploratory runs without reading gold fields."""
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(raw, list) or not raw:
        raise ValueError("FinanceBench 文件必须是非空 JSON 数组")
    prompts: list[FinanceBenchPrompt] = []
    for item in raw:
        model_input = item.get("model_input", {})
        task = item.get("task", {})
        if not isinstance(model_input, Mapping) or not isinstance(task, Mapping):
            raise ValueError("候选样本缺少 model_input 或 task")
        prompts.append(
            FinanceBenchPrompt(
                sample_id=str(item.get("sample_id", "")).strip(),
                prompt=str(model_input.get("prompt", "")).strip(),
                context=tuple(model_input.get("context", [])),
                business_module=str(task.get("business_module", "")).strip(),
                calculation_rule=str(task.get("calculation_rule", "")).strip(),
            )
        )
    return prompts


def extract_numeric_answers(answer: str) -> list[float]:
    """Extract numeric candidates while preserving order of appearance."""
    values: list[float] = []
    for token in _NUMBER_RE.findall(answer):
        try:
            values.append(float(token.replace(",", "").replace("%", "").replace("x", "")))
        except ValueError:
            continue
    return values


def score_financebench_numeric(answer: str, sample: FinanceBenchSample) -> dict[str, Any]:
    """Score the final numeric candidate against the audited tolerance."""
    candidates = extract_numeric_answers(answer)
    if not candidates:
        return {"score": 0.0, "status": "unparseable", "candidates": []}
    marked = _MARKED_NUMBER_RE.findall(answer)
    bold = _BOLD_NUMBER_RE.findall(answer)
    if bold:
        marked = [*marked, *bold]
    if marked:
        value = float(marked[-1].replace(",", "").replace("%", "").replace("x", ""))
    elif all(float(value).is_integer() and 1900 <= value <= 2100 for value in candidates):
        return {"score": 0.0, "status": "unparseable", "candidates": candidates}
    else:
        value = candidates[0]
    rounding_tolerance = _rounding_tolerance(sample.expected_answer)
    effective_tolerance = max(sample.absolute_tolerance, rounding_tolerance)
    error = abs(value - sample.expected_value)
    if error > effective_tolerance:
        for scaled_value in _scaled_equivalents(answer, value):
            scaled_error = abs(scaled_value - sample.expected_value)
            if scaled_error <= effective_tolerance:
                value = scaled_value
                error = scaled_error
                break
    passed = error <= effective_tolerance
    return {
        "score": 100.0 if passed else 0.0,
        "status": "pass" if passed else "fail",
        "answer_value": value,
        "expected_value": sample.expected_value,
        "absolute_error": error,
        "absolute_tolerance": effective_tolerance,
        "candidates": candidates,
    }


def _rounding_tolerance(expected_answer: str) -> float:
    """Allow the precision used by the published answer representation."""
    normalized = expected_answer.strip().replace(",", "")
    numeric = normalized.rstrip("%xX")
    if "." not in numeric:
        return 0.5
    decimals = len(numeric.split(".", 1)[1])
    return 0.5 * (10 ** -decimals)


def _scaled_equivalents(answer: str, value: float) -> list[float]:
    """Return conservative unit-converted variants for explicit scale words."""
    matches = _SCALED_NUMBER_RE.findall(answer)
    equivalents: list[float] = []
    for number, scale in matches:
        factor = _SCALE_FACTORS[scale.lower()]
        scaled = float(number.replace(",", ""))
        if abs(scaled - value) < 1e-9:
            equivalents.extend((scaled * factor, scaled / factor, scaled * 1_000, scaled / 1_000))
    return equivalents


async def evaluate_financebench_samples(
    client: Any,
    *,
    model: str,
    samples: Sequence[FinanceBenchSample],
    temperature: float = 0.0,
    max_tokens: int = 2048,
    on_sample_done: Any = None,
) -> list[dict[str, Any]]:
    """Run FinanceBench samples and return auditable sample-level records.

    Transient upstream failures are retried per sample. Exhausted retries become
    ``score.status=timeout|error`` rows when continue-on-error is enabled.

    ``on_sample_done`` 可选：``async (index, total, record) -> None``，
    在每条样本完成后回调，供运维进度日志 / DB progress 更新。
    """
    results: list[dict[str, Any]] = []
    total = len(samples)
    for index, sample in enumerate(samples, start=1):
        started = time.perf_counter()
        try:
            result: LLMChatResult = await chat_with_sample_retries(
                client,
                model=model,
                messages=[{"role": "user", "content": sample.model_prompt()}],
                temperature=temperature,
                max_tokens=max_tokens,
                sample_id=sample.sample_id,
            )
            score = score_financebench_numeric(result.answer, sample)
        except Exception as exc:
            if not (continue_on_sample_error() and is_transient_llm_error(exc)):
                raise
            status = classify_sample_error_status(exc)
            detail = str(exc).splitlines()[0] if str(exc) else type(exc).__name__
            logger.error(
                "[eval] FinanceBench 样本上游失败已跳过 | sample_id=%s status=%s error=%s",
                sample.sample_id,
                status,
                detail,
            )
            result = error_chat_placeholder(
                model=model,
                exc=exc,
                latency_ms=(time.perf_counter() - started) * 1000.0,
            )
            score = {
                "score": 0.0,
                "status": status,
                "answer_value": None,
                "expected_value": sample.expected_value,
                "absolute_error": None,
                "absolute_tolerance": sample.absolute_tolerance,
                "candidates": [],
                "error": detail,
            }
        record = {
            "sample_id": sample.sample_id,
            "business_module": sample.business_module,
            "requested_model": result.requested_model,
            "returned_model": result.returned_model,
            "response_id": result.response_id,
            "answer": result.answer,
            "score": score,
            "prompt_tokens": result.prompt_tokens,
            "completion_tokens": result.completion_tokens,
            "total_tokens": result.total_tokens,
            "latency_ms": result.latency_ms,
        }
        results.append(record)
        if on_sample_done is not None:
            await on_sample_done(index, total, record)
    return results

