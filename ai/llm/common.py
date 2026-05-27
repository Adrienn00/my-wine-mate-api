from __future__ import annotations

import math
from typing import Any

from bson import ObjectId


def parse_object_id(raw: str) -> ObjectId:
    try:
        return ObjectId(raw)
    except Exception as exc:
        raise RuntimeError(f"Invalid MongoDB ObjectId: {raw!r}") from exc


def safe_float(value: Any, fallback: float = 0.0) -> float:
    try:
        numeric = float(value)
        return fallback if (math.isnan(numeric) or math.isinf(numeric)) else numeric
    except Exception:
        return fallback


def clamp_probability(value: float) -> float:
    return max(0.0, min(0.9999, value))


def normalize_text(value: Any) -> str:
    return str(value or "").strip().lower()


def tokenize(values: list[Any]) -> list[str]:
    seen: dict[str, None] = {}
    for raw in values:
        for word in normalize_text(raw).split():
            token = "".join(ch for ch in word if ch.isalnum())
            if len(token) > 2:
                seen[token] = None
    return list(seen)


def is_confirmed(document: dict[str, Any]) -> bool:
    return document.get("is_confirmed") is True or normalize_text(document.get("status", "")) == "approved"

