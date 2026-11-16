"""Small, auditable fact-match scorer for qualitative FinanceBench samples."""
from __future__ import annotations

import re
from typing import Sequence


def _normalize(text: str) -> str:
    return " ".join(re.sub(r"[^a-z0-9% ]+", " ", text.casefold()).split())


def score_fact_match(answer: str, required_phrases: Sequence[str]) -> dict[str, object]:
    """Pass only when every required fact phrase appears in the answer."""
    normalized = _normalize(answer)
    required = [_normalize(phrase) for phrase in required_phrases if _normalize(phrase)]
    matched = [phrase for phrase in required if phrase in normalized]
    passed = bool(required) and len(matched) == len(required)
    return {
        "score": 100.0 if passed else 0.0,
        "status": "pass" if passed else "fail",
        "matched_phrases": matched,
        "missing_phrases": [phrase for phrase in required if phrase not in matched],
    }
