"""Create one local evaluation task per registered model."""
from __future__ import annotations

import argparse
import json
import os
import urllib.request
from typing import Any

UNAVAILABLE_MODELS = {"gpt-5.4", "kimi-k3", "kimi-k3.1-pro"}


def call(api: str, token: str, query: str) -> dict[str, Any]:
    request = urllib.request.Request(
        api,
        data=json.dumps({"query": query}).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default=os.getenv("ID009_GRAPHQL_API", "http://127.0.0.1:7001/b/id_x_009/graphql"))
    parser.add_argument("--token-env", default="TOKEN")
    parser.add_argument("--dataset-id", type=int, required=True)
    parser.add_argument("--name-prefix", default="FinQA official test 100")
    parser.add_argument("--only-model-ids", help="逗号分隔的模型 ID，仅为指定模型创建任务")
    args = parser.parse_args()
    token = os.getenv(args.token_env, "").strip()
    if not token:
        raise SystemExit(f"Missing GraphQL token environment variable: {args.token_env}")
    models = (
        call(
            args.api,
            token,
            "{ models(page: 1, pageSize: 500) { items { id name vendor backend inputPricePer1m outputPricePer1m } total } }",
        )
        .get("data", {})
        .get("models", {})
        .get("items", [])
    )
    selected_ids = None
    if args.only_model_ids:
        selected_ids = {int(value.strip()) for value in args.only_model_ids.split(",") if value.strip()}
    for model in models:
        if model.get("name") == "local-smoke-model":
            continue
        if model.get("name") in UNAVAILABLE_MODELS:
            print(json.dumps({"model": model["name"], "skipped": True, "reason": "暂不可用或缺少价格"}, ensure_ascii=False))
            continue
        if model.get("inputPricePer1m") is None or model.get("outputPricePer1m") is None:
            print(json.dumps({"model": model["name"], "skipped": True, "reason": "缺少输入或输出价格"}, ensure_ascii=False))
            continue
        if selected_ids is not None and model.get("id") not in selected_ids:
            continue
        name = f"{args.name_prefix} - {model['name']}"
        query = "mutation { createTask(input: { name: %s, modelId: %s, datasetIds: [%s], backend: \"api\", temperature: 0, maxTokens: 2048 }) { success message task { taskUid status } } }" % (
            json.dumps(name), model["id"], args.dataset_id
        )
        payload = call(args.api, token, query).get("data", {}).get("createTask", {})
        task = payload.get("task") or {}
        print(json.dumps({"model_id": model["id"], "model": model["name"], "success": payload.get("success"), "task_uid": task.get("taskUid"), "status": task.get("status"), "message": payload.get("message", "")}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
