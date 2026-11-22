"""Create disposable local model/dataset rows for the id_x_009 API smoke test."""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from x_models.id_x_009.src.models.x_models import Base, Dataset, ModelsInfo as Model


def dsn() -> str:
    required = ("DB_HOST", "DB_PORT", "DB_NAME", "DB_USERNAME", "DB_PASSWORD")
    missing = [key for key in required if not os.getenv(key)]
    if missing:
        raise RuntimeError("Missing database environment variables: " + ", ".join(missing))
    return (
        "postgresql+asyncpg://"
        f"{os.environ['DB_USERNAME']}:{os.environ['DB_PASSWORD']}@"
        f"{os.environ['DB_HOST']}:{os.environ['DB_PORT']}/{os.environ['DB_NAME']}"
    )


async def main() -> None:
    engine = create_async_engine(dsn())
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as session:
        model = (
            await session.execute(select(Model).where(Model.name == "local-smoke-model"))
        ).scalar_one_or_none()
        if model is None:
            model = Model(
                name="local-smoke-model",
                vendor="local",
                series="smoke",
                version="dev",
                base_url=os.getenv("ID009_LLM_BASE_URL", "https://apihk.chinarouter.net/v1"),
                api_key=os.getenv("ID009_LLM_API_KEY", ""),
                model_name="local-smoke-model",
                access_type="api",
                backend="api",
                context_length=32768,
                input_price_per_1m=0.0,
                output_price_per_1m=0.0,
            )
            session.add(model)
        dataset = (
            await session.execute(select(Dataset).where(Dataset.name == "financebench-local-smoke"))
        ).scalar_one_or_none()
        if dataset is None:
            dataset = Dataset(
                name="financebench-local-smoke",
                version="0.1",
                snapshot="financebench-local-smoke@0.1",
                domain="business",
                sample_count=1,
                description="Disposable local API smoke dataset",
            )
            session.add(dataset)
        await session.commit()
        print(f"model_id={model.id}")
        print(f"dataset_id={dataset.id}")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
