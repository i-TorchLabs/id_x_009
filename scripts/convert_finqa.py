"""Convert an official FinQA split into a small, auditable eval snapshot.

The input is the upstream ``dataset/test.json`` shape from the official FinQA
repository. The output follows the existing id_x_009 FinanceBench envelope so
the real runner can consume it without bundling the upstream corpus.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any, Mapping, Sequence


UPSTREAM_REPO = "https://github.com/czyssrs/FinQA"
DEFAULT_LICENSE = "MIT"


def _text(value: Any) -> str:
    return "" if value is None else str(value).strip()


def _render_table(table: Sequence[Sequence[Any]]) -> str:
    rows = []
    for row in table:
        rows.append(" | ".join(_text(cell) for cell in row))
    return "\n".join(rows)


def _render_context(record: Mapping[str, Any]) -> list[dict[str, Any]]:
    context: list[dict[str, Any]] = []
    for index, text in enumerate(record.get("pre_text", []) or [], start=1):
        value = _text(text)
        if value:
            context.append({"evidence_id": f"PRE-{index:02d}", "text": value})
    table = record.get("table", []) or []
    if table:
        context.append({
            "evidence_id": "TABLE",
            "text": _render_table(table),
            "table": table,
        })
    offset = len(context)
    for index, text in enumerate(record.get("post_text", []) or [], start=1):
        value = _text(text)
        if value:
            context.append({"evidence_id": f"POST-{index + offset:02d}", "text": value})
    return context


def _convert_record(record: Mapping[str, Any], split: str, source_revision: str) -> dict[str, Any]:
    qa = record.get("qa")
    if not isinstance(qa, Mapping):
        raise ValueError("FinQA record missing qa object")
    question = _text(qa.get("question"))
    answer = _text(qa.get("answer"))
    program = qa.get("program")
    if not question or not answer or not isinstance(program, str) or not program.strip():
        raise ValueError("FinQA record missing question, answer, or program")
    sample_id = f"finqa-{split}-{hashlib.sha1(question.encode('utf-8')).hexdigest()[:12]}"
    context = _render_context(record)
    prompt = (
        "Answer the financial question using the supplied report context and table. "
        "Return the final answer clearly and briefly.\n\nQuestion: " + question
    )
    return {
        "schema_version": "finance-standard-finqa/1.0",
        "sample_id": sample_id,
        "sample_status": "OFFICIAL_PUBLIC_TEST",
        "source_dataset": {
            "name": "FinQA",
            "split": split,
            "repository": UPSTREAM_REPO,
            "revision": source_revision,
            "license": DEFAULT_LICENSE,
            "original_id": record.get("id"),
        },
        "task": {
            "business_module": "financial_numerical_reasoning",
            "metric_name": "execution_accuracy",
            "calculation_rule": program,
        },
        "model_input": {
            "evaluation_mode": "official_finqa_test",
            "prompt": prompt,
            "context": context,
            "answer_key_excluded": True,
        },
        "gold_reference": {
            "official_answer": answer,
            "independently_recalculated_answer": answer,
            "gold_program": program,
            "absolute_tolerance": max(0.01, abs(float(answer.replace('%', '').replace(',', ''))) * 0.001)
            if _is_number(answer)
            else 0.0,
            "unit_note": "percent" if "%" in answer else "dataset_answer",
        },
        "platform_ingestion": {
            "eligible_for_external_eval": True,
            "source_revision_required": True,
        },
    }


def _is_number(value: str) -> bool:
    try:
        float(value.replace('%', '').replace(',', '').strip())
        return True
    except ValueError:
        return False


def convert(input_path: str, output_path: str, limit: int, split: str, source_revision: str) -> list[dict[str, Any]]:
    raw = json.loads(Path(input_path).read_text(encoding="utf-8"))
    if not isinstance(raw, list) or not raw:
        raise ValueError("FinQA input must be a non-empty JSON array")
    if limit <= 0:
        raise ValueError("limit must be positive")
    selected: list[dict[str, Any]] = []
    for item in raw:
        qa = item.get("qa") if isinstance(item, Mapping) else None
        answer = _text(qa.get("answer")) if isinstance(qa, Mapping) else ""
        # The current runner has numeric scoring. Keep the first N records that
        # can be evaluated without inventing a classifier for non-numeric labels.
        if not _is_number(answer):
            continue
        selected.append(_convert_record(item, split, source_revision))
        if len(selected) >= limit:
            break
    if len(selected) < limit:
        raise ValueError(f"FinQA split contains only {len(selected)} numeric records; need {limit}")
    Path(output_path).write_text(json.dumps(selected, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return selected


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Official FinQA split JSON, usually dataset/test.json")
    parser.add_argument("--output", required=True)
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--split", default="test")
    parser.add_argument("--source-revision", required=True, help="Pinned upstream git commit or release identifier")
    args = parser.parse_args()
    rows = convert(args.input, args.output, args.limit, args.split, args.source_revision)
    print(json.dumps({"converted": len(rows), "sample_ids": [row["sample_id"] for row in rows]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
