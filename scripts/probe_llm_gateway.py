"""Probe ChinaRouter model access without printing or accepting an API key."""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

# When invoked as ``python scripts/probe_llm_gateway.py``, Python puts the
# scripts directory on sys.path rather than the repository root.
REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from x_models.id_x_009.src.services.llm_client import (
    LLMConfig,
    OpenAICompatibleLLMClient,
)


async def main() -> int:
    parser = argparse.ArgumentParser(description="检查 id_x_009 的 OpenAI-compatible 模型网关")
    parser.add_argument("--model", help="可选：指定一个 model ID 进行轻量聊天测试")
    parser.add_argument("--chat", action="store_true", help="明确指定后才发送一条可能计费的测试请求")
    args = parser.parse_args()

    try:
        async with OpenAICompatibleLLMClient(LLMConfig.from_env()) as llm:
            models = await llm.list_models()
            print(f"Gateway reachable; accessible model count: {len(models)}")
            for model_id in models:
                print(model_id)

            if args.model:
                print(f"Selected model available: {args.model in models}")
                if args.chat:
                    result = await llm.chat(
                        model=args.model,
                        messages=[{"role": "user", "content": "请只回复：连接测试成功。"}],
                        temperature=0,
                        max_tokens=64,
                    )
                    print("Chat test: SUCCESS")
                    print(f"Returned model: {result.returned_model or '(not reported)'}")
                    print(f"Latency: {result.latency_ms:.1f} ms")
                    print(f"Token usage: {result.total_tokens}")
                    print(f"Answer: {result.answer[:200]}")
                elif args.model not in models:
                    print("注意：该 ID 未出现在当前 API Key 可见的模型目录中。")
    except Exception as exc:
        print(f"Gateway probe failed: {type(exc).__name__}: {exc}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
