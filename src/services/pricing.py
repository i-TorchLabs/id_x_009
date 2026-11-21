"""Versioned model pricing used for real evaluation cost accounting."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
import json
from pathlib import Path


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


def calculate_cost(model_key: str, prompt_tokens: int, completion_tokens: int) -> float:
    price = load_model_prices().get(model_key)
    if price is None:
        raise KeyError(f"模型缺少价格配置: {model_key}")
    cost = (
        Decimal(prompt_tokens) / Decimal(1_000_000) * price.input_price_per_1m
        + Decimal(completion_tokens) / Decimal(1_000_000) * price.output_price_per_1m
    )
    return float(cost.quantize(Decimal("0.000001")))
