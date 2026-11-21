"""Compare failed task answers with the checked-in FinQA gold answers."""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


def request_report(api: str, token: str, task_uid: str) -> dict:
    query = {
        "query": "{ taskReport(taskUid: %s) { modelName status compositeScore sampleResults { sampleId answer score scoreStatus } } }"
        % json.dumps(task_uid)
    }
    request = urllib.request.Request(
        api,
        data=json.dumps(query).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        payload = json.loads(response.read().decode("utf-8"))
    return payload["data"]["taskReport"]


def load_gold(path: Path) -> dict[str, str]:
    rows = json.loads(path.read_text(encoding="utf-8"))
    return {
        row["sample_id"]: str(row["gold_reference"]["independently_recalculated_answer"])
        for row in rows
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--task-uid", action="append", required=True)
    parser.add_argument("--token-env", default="TOKEN")
    parser.add_argument("--api", default=os.getenv("ID009_GRAPHQL_API", "http://127.0.0.1:7001/b/id_x_009/graphql"))
    parser.add_argument("--samples", default=str(REPO_ROOT / "x_models/id_x_009/data/finqa/finqa_test_100.json"))
    parser.add_argument("--limit", type=int, default=20)
    args = parser.parse_args()
    token = os.getenv(args.token_env, "").strip()
    if not token:
        raise SystemExit(f"Missing GraphQL token environment variable: {args.token_env}")
    gold = load_gold(Path(args.samples))
    for task_uid in args.task_uid:
        report = request_report(args.api, token, task_uid)
        failures = [row for row in report.get("sampleResults", []) if row.get("scoreStatus") == "fail"]
        print(json.dumps({"task_uid": task_uid, "model": report.get("modelName"), "failed": len(failures), "total": len(report.get("sampleResults", []))}, ensure_ascii=False))
        for row in failures[: args.limit]:
            print(json.dumps({"sample_id": row.get("sampleId"), "model_answer": row.get("answer"), "gold_answer": gold.get(row.get("sampleId"), "<missing>")}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
