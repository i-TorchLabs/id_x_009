"""Summarize completed FinQA tasks from the local GraphQL API."""
from __future__ import annotations

import argparse
import json
import os
import urllib.request
from collections import Counter
from typing import Any


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
    parser.add_argument("--name-contains", default="FinQA official test 100")
    args = parser.parse_args()
    token = os.getenv(args.token_env, "").strip()
    if not token:
        raise SystemExit(f"Missing GraphQL token environment variable: {args.token_env}")
    query = "{ tasks { taskUid name modelId modelName status error } }"
    tasks = call(args.api, token, query).get("data", {}).get("tasks", [])
    selected = [task for task in tasks if args.name_contains in task.get("name", "")]
    print(json.dumps({
        "task_count": len(selected),
        "status_counts": dict(Counter(task.get("status") for task in selected)),
        "tasks": selected,
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
