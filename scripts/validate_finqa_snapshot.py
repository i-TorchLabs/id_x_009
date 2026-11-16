"""Validate the checked-in FinQA evaluation snapshot and its manifest."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


DEFAULT_DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "finqa"


def _load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError(f"无法读取 JSON 文件: {path}") from exc


def validate(data_dir: Path) -> dict[str, Any]:
    manifest_path = data_dir / "manifest.json"
    manifest = _load_json(manifest_path)
    if not isinstance(manifest, dict):
        raise ValueError("manifest.json 必须是 JSON 对象")

    sample_path = data_dir / str(manifest.get("sample_file", ""))
    if not sample_path.is_file():
        raise ValueError(f"样本文件不存在: {sample_path}")

    samples = _load_json(sample_path)
    if not isinstance(samples, list) or not samples:
        raise ValueError("样本文件必须是非空 JSON 数组")

    expected_count = int(manifest.get("sample_count", 0))
    if len(samples) != expected_count:
        raise ValueError(f"样本数量不匹配: expected={expected_count}, actual={len(samples)}")

    sample_ids: set[str] = set()
    for index, sample in enumerate(samples, start=1):
        if not isinstance(sample, dict):
            raise ValueError(f"第 {index} 条样本必须是 JSON 对象")
        sample_id = str(sample.get("sample_id", "")).strip()
        if not sample_id:
            raise ValueError(f"第 {index} 条样本缺少 sample_id")
        if sample_id in sample_ids:
            raise ValueError(f"sample_id 重复: {sample_id}")
        sample_ids.add(sample_id)

        model_input = sample.get("model_input")
        gold_reference = sample.get("gold_reference")
        if not isinstance(model_input, dict) or not model_input.get("prompt"):
            raise ValueError(f"样本缺少 model_input.prompt: {sample_id}")
        if model_input.get("answer_key_excluded") is not True:
            raise ValueError(f"样本未声明排除答案: {sample_id}")
        if not isinstance(gold_reference, dict):
            raise ValueError(f"样本缺少 gold_reference: {sample_id}")
        if str(gold_reference.get("independently_recalculated_answer", "")).strip() == "":
            raise ValueError(f"样本缺少独立复算答案: {sample_id}")

    digest = hashlib.sha256(sample_path.read_bytes()).hexdigest()
    expected_digest = str(manifest.get("sha256", "")).lower()
    if digest != expected_digest:
        raise ValueError(f"SHA256 不匹配: expected={expected_digest}, actual={digest}")

    return {
        "sample_file": str(sample_path),
        "sample_count": len(samples),
        "sha256": digest,
        "source_revision": manifest.get("source_revision"),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    args = parser.parse_args()
    result = validate(args.data_dir)
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
