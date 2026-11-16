"""Run an approved FinanceBench JSON array in bounded, resumable batches."""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from x_models.id_x_009.src.services.financebench import (
    FinanceBenchSample,
    load_financebench_samples,
    score_financebench_numeric,
)
from x_models.id_x_009.src.services.llm_client import OpenAICompatibleLLMClient


async def _run_one(client: Any, sample: FinanceBenchSample, model: str) -> dict[str, Any]:
    try:
        result = await client.chat(
            model=model,
            messages=[{"role": "user", "content": sample.model_prompt()}],
            temperature=0.0,
            max_tokens=2048,
        )
        score = score_financebench_numeric(result.answer, sample)
        return {
            "sample_id": sample.sample_id,
            "business_module": sample.business_module,
            "status": "completed",
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
    except Exception as exc:
        return {
            "sample_id": sample.sample_id,
            "business_module": sample.business_module,
            "status": "failed",
            "error_type": type(exc).__name__,
            "error": str(exc)[:500],
        }


async def run_batch(
    samples: list[FinanceBenchSample],
    *,
    model: str,
    concurrency: int,
    output: Path,
    dry_run: bool,
) -> int:
    existing: dict[str, dict[str, Any]] = {}
    if output.exists():
        for line in output.read_text(encoding="utf-8").splitlines():
            if line.strip():
                item = json.loads(line)
                if item.get("sample_id"):
                    existing[str(item["sample_id"])] = item
    pending = [sample for sample in samples if sample.sample_id not in existing]
    if dry_run:
        print(json.dumps({"total": len(samples), "pending": len(pending), "resumed": len(existing)}, ensure_ascii=False))
        return 0
    if not pending:
        print("No pending samples.")
        return 0

    semaphore = asyncio.Semaphore(max(1, concurrency))

    async with OpenAICompatibleLLMClient() as client:
        async def bounded(sample: FinanceBenchSample) -> dict[str, Any]:
            async with semaphore:
                return await _run_one(client, sample, model)

        results = await asyncio.gather(*(bounded(sample) for sample in pending))

    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("a", encoding="utf-8") as handle:
        for item in results:
            handle.write(json.dumps(item, ensure_ascii=False) + "\n")
    completed = sum(item["status"] == "completed" for item in results)
    failed = len(results) - completed
    print(json.dumps({"processed": len(results), "completed": completed, "failed": failed}, ensure_ascii=False))
    return 0 if failed == 0 else 2


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--samples", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model", default="deepseek-v4-flash-0731")
    parser.add_argument("--concurrency", type=int, default=1)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    samples = load_financebench_samples(args.samples)
    return asyncio.run(
        run_batch(
            samples,
            model=args.model,
            concurrency=args.concurrency,
            output=Path(args.output),
            dry_run=args.dry_run,
        )
    )


if __name__ == "__main__":
    raise SystemExit(main())
