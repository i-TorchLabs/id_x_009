from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession, async_sessionmaker

from x_models._contracts import PluginInterface


class _Idx009Plugin:

    name = "id_x_009"

    def __init__(self) -> None:
        self._base: Any = None

    @property
    def base(self) -> Any:
        if self._base is None:
            from x_models.id_x_009.src.models.x_models import Base
            self._base = Base
        return self._base

    @property
    def required_extensions(self) -> tuple[str, ...]:
        return ()

    def set_session_maker(self, maker: async_sessionmaker[AsyncSession]) -> None:
        from x_models.id_x_009.src.models.x_models import set_session_maker
        set_session_maker(maker)

    async def build_tables(self, conn: AsyncConnection) -> None:
        await conn.run_sync(self.base.metadata.create_all)
        await conn.execute(text("ALTER TABLE models ADD COLUMN IF NOT EXISTS input_price_per_1m DOUBLE PRECISION"))
        await conn.execute(text("ALTER TABLE models ADD COLUMN IF NOT EXISTS output_price_per_1m DOUBLE PRECISION"))
        await conn.execute(text("ALTER TABLE eval_tasks ADD COLUMN IF NOT EXISTS error_type VARCHAR(32)"))
        from x_models.id_x_009.src.services.pricing import load_model_prices

        for model_key, price in load_model_prices().items():
            await conn.execute(
                text(
                    "UPDATE models SET input_price_per_1m = :input_price, "
                    "output_price_per_1m = :output_price "
                    "WHERE name = :model_key"
                ),
                {
                    "input_price": float(price.input_price_per_1m),
                    "output_price": float(price.output_price_per_1m),
                    "model_key": model_key,
                },
            )


def load_plugin() -> PluginInterface:
    return _Idx009Plugin()
