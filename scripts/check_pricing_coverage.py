"""Report models in the catalog that do not have a maintained price."""
from __future__ import annotations

import asyncio
import os
import urllib.request
import json

from x_models.id_x_009.src.services.pricing import load_model_prices


async def main() -> int:
    api = os.getenv("ID009_GRAPHQL_API", "http://127.0.0.1:7001/b/id_x_009/graphql")
    token = os.getenv("TOKEN", "").strip()
    if not token:
        raise SystemExit("Missing TOKEN environment variable")
    request = urllib.request.Request(
        api,
        data=json.dumps({"query": "{ models { name inputPricePer1m outputPricePer1m } }"}).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.loads(response.read().decode())
    models = payload.get("data", {}).get("models", [])
    prices = load_model_prices()
    missing = sorted({item["name"] for item in models if item["name"] not in prices})
    print(json.dumps({"model_count": len(models), "priced_count": len(models) - len(missing), "missing": missing}, ensure_ascii=False))
    return 0 if not missing else 2


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
