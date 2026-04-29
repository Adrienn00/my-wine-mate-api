from __future__ import annotations

import json
import math
from typing import Any

from pairing_common import extract_recipe_signals, extract_wine_signals


def clamp_probability(value: float) -> float:
    return max(0.0, min(0.9999, value))


def safe_float(value: Any, fallback: float = 0.0) -> float:
    try:
        numeric = float(value)
        if math.isnan(numeric) or math.isinf(numeric):
            return fallback
        return numeric
    except Exception:
        return fallback


def _serialize_feedback_stats(feedback_stats: dict[str, Any] | None) -> dict[str, Any] | None:
    if not feedback_stats or not feedback_stats.get("total"):
        return None

    return {
        "good": int(feedback_stats.get("good") or 0),
        "bad": int(feedback_stats.get("bad") or 0),
        "total": int(feedback_stats.get("total") or 0),
        "positive_ratio": safe_float(feedback_stats.get("positive_ratio"), 0.0),
        "avg_recommendation_score": feedback_stats.get("avg_recommendation_score"),
    }


def serialize_recipe_candidate(recipe: dict[str, Any], feedback_stats: dict[str, Any] | None = None) -> dict[str, Any]:
    signals = extract_recipe_signals(recipe)
    serialized = {
        "recipe_id": str(recipe["_id"]),
        "recipe_name": recipe.get("name"),
        "categories": recipe.get("recipeCategories", []),
        "ingredients": recipe.get("ingredients", [])[:15],
        "main_ingredients": signals.get("main_ingredients", []),
        "dish_types": signals.get("dish_types", []),
        "meat_types": signals.get("meat_types", []),
        "cooking_methods": signals.get("cooking_methods", []),
        "textures": signals.get("textures", []),
        "sauce_types": signals.get("sauce_types", []),
        "spice_level": signals.get("spice_level"),
        "sweetness": signals.get("sweetness"),
        "winePairingHints": recipe.get("winePairingHints", []),
    }
    feedback = _serialize_feedback_stats(feedback_stats)
    if feedback:
        serialized["feedback"] = feedback
    return serialized


def serialize_wine_candidate(wine: dict[str, Any], feedback_stats: dict[str, Any] | None = None) -> dict[str, Any]:
    signals = extract_wine_signals(wine)
    serialized = {
        "wine_id": str(wine["_id"]),
        "wine_name": wine.get("name"),
        "type": wine.get("type"),
        "style": wine.get("style"),
        "foodPairingHints": wine.get("foodPairingHints", []),
        "grapeVarieties": wine.get("grapeVarieties", []),
        "flavorProfiles": wine.get("flavorProfiles", []),
        "sweetness": signals.get("sweetness"),
        "body": signals.get("body"),
        "acidity": signals.get("acidity"),
        "tannin": signals.get("tannin"),
        "pairing_targets": signals.get("pairing_targets", []),
    }
    feedback = _serialize_feedback_stats(feedback_stats)
    if feedback:
        serialized["feedback"] = feedback
    return serialized


def build_wine_to_recipe_search_prompt(wine: dict[str, Any], preferences: dict | None) -> str:
    wine_signals = extract_wine_signals(wine)
    return json.dumps(
        {
            "task": "Act as a sommelier and decide what kinds of recipes should be retrieved for this wine.",
            "constraints": [
                "Return JSON only.",
                "Do not rank candidates.",
                "Think first about what dishes really fit the wine.",
                "Then express that as recipe search filters and keywords.",
                "Prefer broad but relevant retrieval so the final selector can choose from a larger set.",
            ],
            "wine": {
                "id": str(wine["_id"]),
                "name": wine.get("name"),
                "type": wine.get("type"),
                "style": wine.get("style"),
                "foodPairingHints": wine.get("foodPairingHints", []),
                "grapeVarieties": wine.get("grapeVarieties", []),
                "flavorProfiles": wine.get("flavorProfiles", []),
                "pairing_targets": wine_signals.get("pairing_targets", []),
                "sweetness": wine_signals.get("sweetness"),
                "body": wine_signals.get("body"),
                "acidity": wine_signals.get("acidity"),
                "tannin": wine_signals.get("tannin"),
            },
            "preferences": preferences,
            "required_output": {
                "search_terms": ["string"],
                "must_have_categories": ["string"],
                "should_have_ingredients": ["string"],
                "exclude_terms": ["string"],
            },
        },
        ensure_ascii=False,
    )


def build_recipe_to_wine_search_prompt(recipe: dict[str, Any], preferences: dict | None) -> str:
    recipe_signals = extract_recipe_signals(recipe)
    return json.dumps(
        {
            "task": "Act as a sommelier and decide what kinds of wines should be retrieved for this recipe.",
            "constraints": [
                "Return JSON only.",
                "Do not rank candidates.",
                "Think first about what wines really fit the dish.",
                "Then express that as wine search filters and keywords.",
                "Prefer broad but relevant retrieval so the final selector can choose from a larger set.",
            ],
            "recipe": {
                "id": str(recipe["_id"]),
                "name": recipe.get("name"),
                "categories": recipe.get("recipeCategories", []),
                "ingredients": recipe.get("ingredients", []),
                "hints": recipe.get("winePairingHints", []),
                "main_ingredients": recipe_signals.get("main_ingredients", []),
                "dish_types": recipe_signals.get("dish_types", []),
                "meat_types": recipe_signals.get("meat_types", []),
                "cooking_methods": recipe_signals.get("cooking_methods", []),
                "textures": recipe_signals.get("textures", []),
                "sauce_types": recipe_signals.get("sauce_types", []),
                "spice_level": recipe_signals.get("spice_level"),
                "sweetness": recipe_signals.get("sweetness"),
            },
            "preferences": preferences,
            "required_output": {
                "search_terms": ["string"],
                "preferred_types": ["string"],
                "preferred_styles": ["string"],
                "preferred_flavors": ["string"],
                "preferred_pairing_targets": ["string"],
                "exclude_terms": ["string"],
            },
        },
        ensure_ascii=False,
    )


def parse_search_spec(llm_payload: dict[str, Any]) -> dict[str, list[str]]:
    def _values(key: str) -> list[str]:
        raw = llm_payload.get(key, [])
        if not isinstance(raw, list):
            raw = [raw] if raw else []
        return [str(value).strip() for value in raw if str(value).strip()]

    return {
        "search_terms": _values("search_terms"),
        "must_have_categories": _values("must_have_categories"),
        "should_have_ingredients": _values("should_have_ingredients"),
        "preferred_types": _values("preferred_types"),
        "preferred_styles": _values("preferred_styles"),
        "preferred_flavors": _values("preferred_flavors"),
        "preferred_pairing_targets": _values("preferred_pairing_targets"),
        "exclude_terms": _values("exclude_terms"),
    }


def build_recipe_to_wine_prompt(
    recipe: dict[str, Any],
    candidates: list[dict[str, Any]],
    preferences: dict | None,
    feedback_lookup: dict[str, dict[str, Any]] | None = None,
) -> str:
    recipe_signals = extract_recipe_signals(recipe)
    feedback_lookup = feedback_lookup or {}
    return json.dumps(
        {
            "mode": "recipe_to_wine",
            "top_k": len(candidates),
            "preferences": preferences,
            "source": "Candidates were retrieved from the application's own MongoDB wines collection.",
            "instruction": "Act as an expert sommelier. Choose the best wines for this recipe only from the provided candidates.",
            "constraints": [
                "Only return items from the candidate list.",
                "Treat candidate feedback as a soft but meaningful learning signal from prior users.",
                "Consistently negative feedback should push a candidate down unless the pairing logic is clearly stronger.",
            ],
            "recipe": {
                "id": str(recipe["_id"]),
                "name": recipe.get("name"),
                "categories": recipe.get("recipeCategories", []),
                "ingredients": recipe.get("ingredients", []),
                "hints": recipe.get("winePairingHints", []),
                "main_ingredients": recipe_signals.get("main_ingredients", []),
                "dish_types": recipe_signals.get("dish_types", []),
                "meat_types": recipe_signals.get("meat_types", []),
                "cooking_methods": recipe_signals.get("cooking_methods", []),
                "textures": recipe_signals.get("textures", []),
                "sauce_types": recipe_signals.get("sauce_types", []),
                "spice_level": recipe_signals.get("spice_level"),
                "sweetness": recipe_signals.get("sweetness"),
            },
            "candidates": [
                serialize_wine_candidate(wine, feedback_lookup.get(str(wine.get("_id"))))
                for wine in candidates
            ],
            "required_output": {
                "results": [
                    {
                        "wine_id": "string",
                        "wine_name": "string",
                        "type": "string",
                        "style": "string",
                        "score": "0-1 match score for this recipe",
                        "reason": "short reason",
                    }
                ]
            },
        },
        ensure_ascii=False,
    )


def build_wine_to_recipe_prompt(
    wine: dict[str, Any],
    candidates: list[dict[str, Any]],
    preferences: dict | None,
    feedback_lookup: dict[str, dict[str, Any]] | None = None,
) -> str:
    wine_signals = extract_wine_signals(wine)
    feedback_lookup = feedback_lookup or {}
    return json.dumps(
        {
            "mode": "wine_to_recipe",
            "top_k": len(candidates),
            "preferences": preferences,
            "source": "Candidates were retrieved from the application's own MongoDB recipes collection.",
            "instruction": "Act as an expert sommelier. Choose the best recipes for this wine only from the provided candidates.",
            "constraints": [
                "Only return items from the candidate list.",
                "Treat candidate feedback as a soft but meaningful learning signal from prior users.",
                "Consistently negative feedback should push a candidate down unless the pairing logic is clearly stronger.",
            ],
            "wine": {
                "id": str(wine["_id"]),
                "name": wine.get("name"),
                "type": wine.get("type"),
                "style": wine.get("style"),
                "foodPairingHints": wine.get("foodPairingHints", []),
                "grapeVarieties": wine.get("grapeVarieties", []),
                "flavorProfiles": wine.get("flavorProfiles", []),
                "pairing_targets": wine_signals.get("pairing_targets", []),
                "sweetness": wine_signals.get("sweetness"),
                "body": wine_signals.get("body"),
                "acidity": wine_signals.get("acidity"),
                "tannin": wine_signals.get("tannin"),
            },
            "candidates": [
                serialize_recipe_candidate(recipe, feedback_lookup.get(str(recipe.get("_id"))))
                for recipe in candidates
            ],
            "required_output": {
                "results": [
                    {
                        "recipe_id": "string",
                        "recipe_name": "string",
                        "categories": ["string"],
                        "score": "0-1 match score for this wine",
                        "reason": "short reason",
                    }
                ]
            },
        },
        ensure_ascii=False,
    )


def parse_recipe_to_wine_results(llm_payload: dict[str, Any], top_k: int) -> list[dict[str, Any]]:
    results = []
    for item in llm_payload.get("results", [])[:top_k]:
        score = clamp_probability(safe_float(item.get("score", 0.5)))
        results.append(
            {
                "wine_id": item.get("wine_id") or item.get("id"),
                "wine_name": item.get("wine_name") or item.get("name", ""),
                "match_score": score,
                "probability": score,
                "type": item.get("type", ""),
                "style": item.get("style", ""),
                "reason": item.get("reason", ""),
            }
        )
    return results


def parse_wine_to_recipe_results(llm_payload: dict[str, Any], top_k: int) -> list[dict[str, Any]]:
    results = []
    for item in llm_payload.get("results", [])[:top_k]:
        score = clamp_probability(safe_float(item.get("score", 0.5)))
        results.append(
            {
                "recipe_id": item.get("recipe_id") or item.get("id"),
                "recipe_name": item.get("recipe_name") or item.get("name", ""),
                "match_score": score,
                "probability": score,
                "categories": item.get("categories", []),
                "reason": item.get("reason", ""),
            }
        )
    return results
