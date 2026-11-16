"""Prepare candidate prompts from the public FinanceBench JSONL and audit workbook."""
from __future__ import annotations

import argparse
import json
import urllib.request
from pathlib import Path

from openpyxl import load_workbook


RAW_URL = "https://raw.githubusercontent.com/patronus-ai/financebench/main/data/financebench_open_source.jsonl"


def _text(value) -> str:
    return "" if value is None else str(value).strip()


def prepare(audit_path: str, output_path: str, limit: int, exclude: set[str]) -> list[dict]:
    with urllib.request.urlopen(RAW_URL, timeout=30) as response:
        raw_rows = [json.loads(line) for line in response.read().decode("utf-8").splitlines() if line.strip()]
    raw_by_id = {row["financebench_id"]: row for row in raw_rows}

    workbook = load_workbook(audit_path, read_only=True, data_only=True)
    sheet = workbook["150条原始题目映射"]
    rows = list(sheet.iter_rows(values_only=True))
    headers = [_text(value) for value in rows[0]]
    index = {header: position for position, header in enumerate(headers)}
    selected: list[dict] = []
    for row in rows[1:]:
        sample_id = _text(row[index["原始样本ID"]])
        if sample_id in exclude or sample_id not in raw_by_id:
            continue
        if "明确金额/比率/数值计算" not in _text(row[index["指标属性"]]):
            continue
        source = raw_by_id[sample_id]
        context = []
        for position, evidence in enumerate(source.get("evidence", []), start=1):
            context.append({
                "evidence_id": f"PUBLIC-{sample_id}-E{position:02d}",
                "document_section": evidence.get("doc_name"),
                "page": evidence.get("evidence_page_num"),
                "text": evidence.get("evidence_text", ""),
                "source_url": source.get("doc_name"),
            })
        selected.append({
            "schema_version": "finance-standard-candidate/0.2",
            "sample_id": sample_id,
            "sample_status": "EXPLORATION_PUBLIC_EVIDENCE",
            "source_dataset": {"name": "FinanceBench", "source_record_id": sample_id},
            "source_record": {
                "company": source.get("company"),
                "doc_name": source.get("doc_name"),
                "original_question": source.get("question"),
                "official_gold_answer": source.get("answer"),
                "audit_status": _text(row[index["审核状态"]]),
            },
            "task": {
                "business_module": _text(row[index["业务模块"]]),
                "metric_name": _text(row[index["归一化指标/任务"]]),
                "calculation_rule": _text(row[index["计算口径或规则"]]),
            },
            "model_input": {
                "evaluation_mode": "oracle_evidence_excerpt",
                "prompt": source.get("question", ""),
                "context": context,
                "answer_key_excluded": True,
            },
            "gold_reference": {
                "official_financebench_answer": source.get("answer"),
                "independently_recalculated_answer": None,
                "absolute_tolerance": None,
            },
            "platform_ingestion": {
                "eligible_for_external_eval": False,
                "eligibility_reason": "Exploration only; independent recalculation and tolerance pending.",
            },
        })
        if len(selected) >= limit:
            break
    Path(output_path).write_text(json.dumps(selected, ensure_ascii=False, indent=2), encoding="utf-8")
    return selected


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audit-xlsx", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--exclude", nargs="*", default=[])
    args = parser.parse_args()
    rows = prepare(args.audit_xlsx, args.output, args.limit, set(args.exclude))
    print(json.dumps({"prepared": len(rows), "sample_ids": [row["sample_id"] for row in rows]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
