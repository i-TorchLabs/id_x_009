"""Register text-capable gateway models through the local GraphQL API.

The access token is read from an environment variable and is never printed.
Image-only catalog entries are skipped because Finance QA uses text prompts.
"""
from __future__ import annotations

import argparse
import json
import os
import urllib.request
from pathlib import Path
from typing import Any

UNAVAILABLE_MODELS = {"gpt-5.4", "kimi-k3", "kimi-k3.1-pro"}


def graphql(api: str, token: str, query: str) -> dict[str, Any]:
    body = json.dumps({"query": query}).encode("utf-8")
    request = urllib.request.Request(
        api,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def gateway_models(base_url: str, api_key: str) -> list[str]:
    request = urllib.request.Request(
        base_url.rstrip("/") + "/models",
        headers={"Authorization": f"Bearer {api_key}"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8"))
    return sorted(str(item["id"]) for item in payload.get("data", []) if item.get("id"))


def register(
    api: str,
    token: str,
    catalog_path: Path,
    available: list[str],
    *,
    base_url: str,
    api_key: str,
) -> list[dict[str, Any]]:
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    metadata = {str(item["id"]): item for item in catalog.get("models", [])}
    results: list[dict[str, Any]] = []
    for model_id in available:
        item = metadata.get(model_id, {})
        if model_id in UNAVAILABLE_MODELS:
            print(json.dumps({"name": model_id, "skipped": True, "reason": "暂不可用或缺少价格"}, ensure_ascii=False))
            continue
        if item.get("modality", "text") in {"image_generation", "image_generation_or_multimodal"} or "image" in model_id:
            continue
        vendor = str(item.get("vendor", "Unknown"))
        series = str(item.get("series", model_id))
        price = item.get("price") or {}
        input_price = price.get("input_price_per_1m")
        output_price = price.get("output_price_per_1m")
        query = """mutation { registerModel(input: {
          name: %s, vendor: %s, series: %s,
          baseUrl: %s, apiKey: %s, modelName: %s,
          inputPricePer1m: %s, outputPricePer1m: %s,
          accessType: "api", backend: "api", contextLength: 131072
        }) { success message model { id name modelName } } }""" % (
            json.dumps(model_id),
            json.dumps(vendor),
            json.dumps(series),
            json.dumps(base_url),
            json.dumps(api_key),
            json.dumps(model_id),
            "null" if input_price is None else input_price,
            "null" if output_price is None else output_price,
        )
        result = graphql(api, token, query)
        payload = result.get("data", {}).get("registerModel", {})
        model = payload.get("model") or {}
        row = {
            "name": model_id,
            "success": bool(payload.get("success")),
            "message": payload.get("message", ""),
            "id": model.get("id"),
        }
        results.append(row)
        print(json.dumps(row, ensure_ascii=False))
    return results


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default=os.getenv("ID009_GRAPHQL_API", "http://127.0.0.1:7001/b/id_x_009/graphql"))
    parser.add_argument("--token-env", default="TOKEN")
    parser.add_argument("--llm-key-env", default="ID009_LLM_API_KEY")
    parser.add_argument("--llm-base-url", default=os.getenv("ID009_LLM_BASE_URL", "https://apihk.chinarouter.net/v1"))
    parser.add_argument("--catalog", default=str(Path(__file__).parents[1] / "model_catalog.json"))
    args = parser.parse_args()
    token = os.getenv(args.token_env, "").strip()
    if not token:
        raise SystemExit(f"Missing GraphQL token environment variable: {args.token_env}")
    llm_key = os.getenv(args.llm_key_env, "").strip()
    if not llm_key:
        raise SystemExit(f"Missing gateway key environment variable: {args.llm_key_env}")
    available = gateway_models(args.llm_base_url, llm_key)
    print(json.dumps({"accessible_model_count": len(available)}, ensure_ascii=False))
    register(
        args.api,
        token,
        Path(args.catalog),
        available,
        base_url=args.llm_base_url,
        api_key=llm_key,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
