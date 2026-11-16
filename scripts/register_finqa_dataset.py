"""Register a local FinQA snapshot as dataset metadata.

The sample JSON remains a local file and is selected through
``ID009_EVAL_SAMPLES_FILE`` at runtime. This script only creates or updates the
metadata row and never copies sample answers into the database.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

from sqlalchemy import URL, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_SNAPSHOT = (
    Path(__file__).resolve().parents[1]
    / "data"
    / "finqa"
    / "finqa_test_100.json"
)
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from x_models.id_x_009.src.models.x_models import Base, Dataset


def database_url() -> URL:
    required = ("DB_HOST", "DB_PORT", "DB_NAME", "DB_USERNAME", "DB_PASSWORD")
    missing = [key for key in required if not os.getenv(key)]
    if missing:
        raise RuntimeError("Missing database environment variables: " + ", ".join(missing))
    if os.getenv("DB_HOST") not in {"127.0.0.1", "localhost", "::1"}:
        raise RuntimeError("Refusing non-local DB_HOST")
    return URL.create(
        "postgresql+asyncpg",
        username=os.environ["DB_USERNAME"],
        password=os.environ["DB_PASSWORD"],
        host=os.environ["DB_HOST"],
        port=int(os.environ["DB_PORT"]),
        database=os.environ["DB_NAME"],
    )


def sample_count(path: Path) -> int:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list) or not payload:
        raise ValueError("FinQA snapshot must be a non-empty JSON array")
    return len(payload)


async def register(args: argparse.Namespace) -> None:
    path = Path(args.snapshot).expanduser().resolve()
    if not path.is_file():
        raise FileNotFoundError(path)
    count = sample_count(path)
    engine = create_async_engine(database_url())
    try:
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        maker = async_sessionmaker(engine, expire_on_commit=False)
        async with maker() as session:
            row = (
                await session.execute(select(Dataset).where(Dataset.name == args.name))
            ).scalar_one_or_none()
            if row is None:
                row = Dataset(name=args.name, version=args.version, snapshot=args.snapshot_id,
                              domain="financial_numerical_reasoning", sample_count=count,
                              description="Official FinQA public test snapshot; samples stay on local disk.")
                session.add(row)
            else:
                row.version = args.version
                row.snapshot = args.snapshot_id
                row.sample_count = count
                row.description = "Official FinQA public test snapshot; samples stay on local disk."
            await session.commit()
            print(f"dataset_id={row.id}")
            print(f"sample_count={row.sample_count}")
    finally:
        await engine.dispose()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--snapshot", default=str(DEFAULT_SNAPSHOT))
    parser.add_argument("--name", default="finqa-official-test-100")
    parser.add_argument("--version", default="2021-test-100")
    parser.add_argument(
        "--snapshot-id",
        default="finqa@test:0f16e2867befa6840783e58be38c9efb9229d742-100",
    )
    args = parser.parse_args()
    asyncio.run(register(args))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
