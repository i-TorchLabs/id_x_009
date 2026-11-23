"""Model pricing for real evaluation cost accounting.

Primary source of truth: database table ``models_info``
(名称/厂商/系列/Base-Url/API-Key/Model-Name/输入价/输出价).
JSON under ``data/pricing/`` remains an offline fallback for scripts without DB.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
import json
from pathlib import Path
from typing import Optional

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass(frozen=True)
class ModelPrice:
    model_key: str
    input_price_per_1m: Decimal
    output_price_per_1m: Decimal
    currency: str
    source: str
    effective_at: date


_PRICE_FILE = Path(__file__).resolve().parents[2] / "data" / "pricing" / "chinarouter_2026-11.json"


def load_model_prices(path: Path = _PRICE_FILE) -> dict[str, ModelPrice]:
    """Offline JSON fallback (scripts / tests). Runtime eval should use DB."""
    payload = json.loads(path.read_text(encoding="utf-8"))
    prices: dict[str, ModelPrice] = {}
    for item in payload["models"]:
        price = ModelPrice(
            model_key=str(item["model_key"]),
            input_price_per_1m=Decimal(str(item["input_price_per_1m"])),
            output_price_per_1m=Decimal(str(item["output_price_per_1m"])),
            currency=str(item.get("currency", payload.get("currency", "USD"))),
            source=str(item.get("source", payload.get("source", "unknown"))),
            effective_at=date.fromisoformat(
                str(item.get("effective_at", payload["effective_at"]))
            ),
        )
        prices[price.model_key] = price
    return prices


def cost_from_rates(
    input_price_per_1m: Decimal | float,
    output_price_per_1m: Decimal | float,
    prompt_tokens: int,
    completion_tokens: int,
) -> float:
    cost = (
        Decimal(prompt_tokens) / Decimal(1_000_000) * Decimal(str(input_price_per_1m))
        + Decimal(completion_tokens)
        / Decimal(1_000_000)
        * Decimal(str(output_price_per_1m))
    )
    return float(cost.quantize(Decimal("0.000001")))


def calculate_cost(model_key: str, prompt_tokens: int, completion_tokens: int) -> float:
    """JSON fallback calculator (no DB session). Prefer ``calculate_cost_db``."""
    price = load_model_prices().get(model_key)
    if price is None:
        raise KeyError(f"模型缺少价格配置: {model_key}")
    return cost_from_rates(
        price.input_price_per_1m,
        price.output_price_per_1m,
        prompt_tokens,
        completion_tokens,
    )


async def get_model_info_db(session: AsyncSession, key: str):
    """按名称或 Model-Name 查找 models_info 行。"""
    from x_models.id_x_009.src.models.x_models import ModelsInfo

    key = (key or "").strip()
    if not key:
        return None
    result = await session.execute(
        select(ModelsInfo).where(
            or_(ModelsInfo.name == key, ModelsInfo.model_name == key)
        ).order_by(ModelsInfo.id)
    )
    return result.scalars().first()


async def get_model_price_db(
    session: AsyncSession, model_key: str
) -> Optional[ModelPrice]:
    """从 models_info 读取单价。"""
    row = await get_model_info_db(session, model_key)
    if row is None:
        return None
    return ModelPrice(
        model_key=row.model_name or row.name,
        input_price_per_1m=Decimal(str(row.input_price_per_1m or 0)),
        output_price_per_1m=Decimal(str(row.output_price_per_1m or 0)),
        currency="USD",
        source="models_info",
        effective_at=date.today(),
    )


async def calculate_cost_db(
    session: AsyncSession,
    model_key: str,
    prompt_tokens: int,
    completion_tokens: int,
) -> float:
    price = await get_model_price_db(session, model_key)
    if price is None:
        raise KeyError(f"models_info 缺少价格配置: {model_key}")
    return cost_from_rates(
        price.input_price_per_1m,
        price.output_price_per_1m,
        prompt_tokens,
        completion_tokens,
    )
