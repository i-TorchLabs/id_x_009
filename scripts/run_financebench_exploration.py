"""Run candidate FinanceBench prompts without automated gold scoring."""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from x_models.id_x_009.src.services.financebench import load_financebench_prompts
from x_models.id_x_009.src.services.llm_client import OpenAICompatibleLLMClient


async def main_async(samples_path: str, output_path: str, model: str, limit: int) -> int:
    samples = load_financebench_prompts(samples_path)[:limit]
    async with OpenAICompatibleLLMClient() as client:
        rows = []
        for sample in samples:
            try:
                result = await client.chat(
                    model=model,
                    messages=[{"role": "user", "content": sample.model_prompt()}],
                    temperature=0.0,
                    max_tokens=2048,
                )
                rows.append({
                    "sample_id": sample.sample_id,
                    "business_module": sample.business_module,
                    "status": "completed_unscored",
                    "requested_model": result.requested_model,
                    "returned_model": result.returned_model,
                    "response_id": result.response_id,
                    "answer": result.answer,
                    "prompt_tokens": result.prompt_tokens,
                    "completion_tokens": result.completion_tokens,
                    "total_tokens": result.total_tokens,
                    "latency_ms": result.latency_ms,
                })
            except Exception as exc:
                rows.append({
                    "sample_id": sample.sample_id,
                    "status": "failed",
                    "error_type": type(exc).__name__,
                    "error": str(exc)[:500],
                })
    Path(output_path).write_text(
        "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows),
        encoding="utf-8",
    )
    print(json.dumps({"processed": len(rows), "completed": sum(r["status"] == "completed_unscored" for r in rows), "failed": sum(r["status"] == "failed" for r in rows)}, ensure_ascii=False))
    return 0 if all(row["status"] == "completed_unscored" for row in rows) else 2


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--samples", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model", default="deepseek-v4-flash-0731")
    parser.add_argument("--limit", type=int, default=5)
    args = parser.parse_args()
    return asyncio.run(main_async(args.samples, args.output, args.model, args.limit))


if __name__ == "__main__":
    raise SystemExit(main())
