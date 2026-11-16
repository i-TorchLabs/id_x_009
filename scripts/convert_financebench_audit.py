"""Convert the FinanceBench audit workbook into reviewable candidate JSON.

The converter preserves audit status and never invents a tolerance or an
independent recalculation. Records without those fields remain candidates and
are rejected by the real numeric runner until reviewed.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from openpyxl import load_workbook


def _text(value: Any) -> str:
    return "" if value is None else str(value).strip()


def convert(input_path: str | Path) -> list[dict[str, Any]]:
    workbook = load_workbook(input_path, read_only=True, data_only=True)
    sheet = workbook["150条原始题目映射"]
    recalc_sheet = workbook["六条独立数值复算"]
    recalc_rows = list(recalc_sheet.iter_rows(values_only=True))
    recalc_headers = [_text(value) for value in recalc_rows[0]]
    recalculations = {
        _text(row[recalc_headers.index("原始样本ID")]): row
        for row in recalc_rows[1:]
        if _text(row[recalc_headers.index("原始样本ID")])
    }
    rows = list(sheet.iter_rows(values_only=True))
    headers = [_text(value) for value in rows[0]]
    records: list[dict[str, Any]] = []
    for row in rows[1:]:
        values = {headers[index]: row[index] if index < len(row) else None for index in range(len(headers))}
        sample_id = _text(values["原始样本ID"])
        question = _text(values["原始问题（英文）"])
        official_answer = _text(values["官方参考答案"])
        evidence = _text(values["证据片段（截取）"])
        audit_status = _text(values["审核状态"])
        recalc = recalculations.get(sample_id)
        recalc_values = {}
        if recalc is not None:
            recalc_values = {
                header: recalc[index] if index < len(recalc) else None
                for index, header in enumerate(recalc_headers)
            }
        independent_answer = _text(recalc_values.get("复算结果"))
        tolerance = recalc_values.get("许可容差")
        eligible = bool(independent_answer and tolerance is not None and _text(recalc_values.get("是否通过")) == "通过")
        records.append(
            {
                "schema_version": "finance-standard-candidate/0.1",
                "sample_id": sample_id,
                "sample_status": "CANDIDATE_AUDIT_STATUS_PRESERVED",
                "review_status": {
                    "source_evidence_verification": "pending" if "未执行" in audit_status else "review",
                    "expert_sample_quality_review": "pending",
                    "platform_import": "pending",
                },
                "source_dataset": {
                    "name": "FinanceBench",
                    "source_record_id": sample_id,
                    "dataset_subset_label": "OPEN_SOURCE",
                },
                "source_record": {
                    "company": _text(values["公司"]),
                    "doc_name": _text(values["文档ID"]),
                    "document_type": _text(values["文档类型"]),
                    "document_fiscal_year": values["文档年份"],
                    "question_type": _text(values["原始题型"]),
                    "question_reasoning": _text(values["原始推理类型"]),
                    "original_question": question,
                    "official_gold_answer": official_answer,
                    "audit_status": audit_status,
                },
                "task": {
                    "metric_name": _text(values["归一化指标/任务"]),
                    "metric_name_zh": _text(values["业务指标/任务（逐题标注）"]),
                    "business_module": _text(values["业务模块"]),
                    "capability_tags": [_text(values["建议被测能力"])],
                    "scoring_method": _text(values["建议评分方法"]),
                    "calculation_rule": _text(values["计算口径或规则"]),
                },
                "model_input": {
                    "evaluation_mode": "oracle_evidence_excerpt",
                    "prompt_profile": "benchmark_fidelity",
                    "prompt": question,
                    "context": [
                        {
                            "evidence_id": f"AUDIT-{sample_id}-E01",
                            "text": evidence,
                            "page": _text(values["证据页码（0起）"]),
                        }
                    ] if evidence else [],
                    "answer_key_excluded": True,
                    "scope_note": "Candidate converted from audit workbook; source and expert review remain pending.",
                },
                "gold_reference": {
                    "official_financebench_answer": official_answer,
                    "independently_recalculated_answer": independent_answer or None,
                    "absolute_tolerance": tolerance,
                    "recalculation_status": "PASS" if eligible else "PENDING_REVIEW",
                },
                "provenance": {
                    "source_pdf_url": _text(values["来源PDF链接"]),
                    "source_data_url": _text(values["原始数据链接"]),
                    "evidence_link_status": _text(values["证据关联核查"]),
                },
                "platform_ingestion": {
                    "target_plugin": "id_x_009",
                    "portable_artifact": "JSON",
                    "eligible_for_external_eval": eligible,
                    "eligibility_reason": (
                        "Independent recalculation and tolerance passed in the audit workbook."
                        if eligible
                        else "Independent recalculation and absolute tolerance are not present in the audit workbook."
                    ),
                },
            }
        )
    return records


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--eligible-output")
    args = parser.parse_args()
    records = convert(args.input)
    Path(args.output).write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    eligible = sum(bool(item["platform_ingestion"]["eligible_for_external_eval"]) for item in records)
    if args.eligible_output:
        eligible_records = [
            item for item in records if item["platform_ingestion"]["eligible_for_external_eval"]
        ]
        Path(args.eligible_output).write_text(
            json.dumps(eligible_records, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    print(json.dumps({"converted": len(records), "eligible_for_external_eval": eligible}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
