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


def serialize_recipe_candidate(recipe: dict[str, Any]) -> dict[str, Any]:
    signals = extract_recipe_signals(recipe)
    return {
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


def serialize_wine_candidate(wine: dict[str, Any]) -> dict[str, Any]:
    signals = extract_wine_signals(wine)
    return {
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


def build_recipe_to_wine_prompt(recipe: dict[str, Any], candidates: list[dict[str, Any]], preferences: dict | None) -> str:
    recipe_signals = extract_recipe_signals(recipe)
    return json.dumps(
        {
            "mode": "recipe_to_wine",
            "top_k": len(candidates),
            "preferences": preferences,
            "source": "Candidates were retrieved from the application's own MongoDB wines collection.",
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
            "candidates": [serialize_wine_candidate(wine) for wine in candidates],
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


def build_wine_to_recipe_prompt(wine: dict[str, Any], candidates: list[dict[str, Any]], preferences: dict | None) -> str:
    wine_signals = extract_wine_signals(wine)
    return json.dumps(
        {
            "mode": "wine_to_recipe",
            "top_k": len(candidates),
            "preferences": preferences,
            "source": "Candidates were retrieved from the application's own MongoDB recipes collection.",
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
            "candidates": [serialize_recipe_candidate(recipe) for recipe in candidates],
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

