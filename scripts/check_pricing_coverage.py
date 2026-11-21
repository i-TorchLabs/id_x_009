"""Report models in the catalog that do not have a maintained price."""
from __future__ import annotations

import asyncio
import os
import urllib.request
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from x_models.id_x_009.src.services.pricing import load_model_prices

UNPRICED_FILE = REPO_ROOT / "x_models/id_x_009/data/pricing/unpriced_models_2026-11.json"


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
    unavailable_payload = json.loads(UNPRICED_FILE.read_text(encoding="utf-8"))
    unavailable = {item["model_key"] for item in unavailable_payload.get("models", [])}
    exempt = sorted({item["name"] for item in models if item["name"] == "local-smoke-model"})
    missing = sorted(
        {
            item["name"]
            for item in models
            if item["name"] not in prices and item["name"] not in exempt and item["name"] not in unavailable
        }
    )
    unavailable_found = sorted({item["name"] for item in models if item["name"] in unavailable})
    priced_count = len(models) - len(missing) - len(exempt) - len(unavailable_found)
    print(json.dumps({"model_count": len(models), "priced_count": priced_count, "missing": missing, "unavailable": unavailable_found, "exempt": exempt}, ensure_ascii=False))
    return 0 if not missing else 2


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
