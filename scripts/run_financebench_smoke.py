"""Run one FinanceBench sample against the configured OpenAI-compatible gateway."""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from x_models.id_x_009.src.services.financebench import (
    evaluate_financebench_samples,
    load_financebench_samples,
)
from x_models.id_x_009.src.services.llm_client import OpenAICompatibleLLMClient


async def run(sample_file: str, model: str) -> int:
    samples = load_financebench_samples(sample_file)
    if len(samples) != 1:
        raise ValueError("smoke test 要求样本文件恰好包含 1 条样本")
    async with OpenAICompatibleLLMClient() as client:
        rows = await evaluate_financebench_samples(client, model=model, samples=samples)
    row = rows[0]
    score = row["score"]
    print(f"sample_id={row['sample_id']}")
    print(f"requested_model={row['requested_model']}")
    print(f"returned_model={row['returned_model'] or '(not reported)'}")
    print(f"score_status={score['status']}")
    print(f"score={score['score']}")
    print(f"response_id={row['response_id'] or '(not reported)'}")
    print(f"total_tokens={row['total_tokens']}")
    print(f"latency_ms={row['latency_ms']}")
    return 0 if score["status"] == "pass" else 2


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--samples",
        default="/Users/gaoshengkai/Desktop/proposed_samples.json",
    )
    parser.add_argument("--model", default="deepseek-v4-flash-0731")
    args = parser.parse_args()
    return asyncio.run(run(args.samples, args.model))


if __name__ == "__main__":
    raise SystemExit(main())
