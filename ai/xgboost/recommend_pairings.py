from __future__ import annotations

import argparse
import json
import math
import sys
import time
from pathlib import Path

import joblib
from bson import ObjectId

CURRENT_DIR = Path(__file__).resolve().parent
AI_ROOT = CURRENT_DIR.parent
if str(AI_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_ROOT))

from pairing_common import (
    ARTIFACTS_DIR,
    build_pair_features,
    extract_recipe_signals,
    extract_wine_signals,
    mongo_database,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Use the trained XGBoost model to recommend wines for a recipe or recipes for a wine."
    )
    parser.add_argument("--recipe-id", type=str, default=None)
    parser.add_argument("--wine-id", type=str, default=None)
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument(
        "--model-path",
        type=Path,
        default=ARTIFACTS_DIR / "xgboost_pairing_model.joblib",
    )
    return parser.parse_args()


def load_model(model_path: Path):
    if not model_path.exists():
        raise RuntimeError(f"Model not found at {model_path}. Train it first.")
    return joblib.load(model_path)


def parse_object_id(raw_id: str) -> ObjectId:
    try:
        return ObjectId(raw_id)
    except Exception as error:
        raise RuntimeError(f"Invalid Mongo ObjectId: {raw_id}") from error


def clamp_probability(value: float) -> float:
    return max(0.0, min(0.9999, value))


def sanitize_json_value(value):
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return value
    if isinstance(value, list):
        return [sanitize_json_value(item) for item in value]
    if isinstance(value, dict):
        return {key: sanitize_json_value(item) for key, item in value.items()}
    return value


def rerank_probability(recipe: dict, wine: dict, base_probability: float) -> tuple[float, list[str]]:
    recipe_signals = extract_recipe_signals(recipe)
    wine_signals = extract_wine_signals(wine)
    adjusted = float(base_probability)
    reasons: list[str] = []
    wine_name = str(wine.get("name") or "").strip()

    if not wine_name:
        adjusted -= 0.25
        reasons.append("missing_name_penalty")

    if recipe_signals["sweetness"] == "savory" and wine_signals["type"] == "red" and wine_signals["sweetness"] == "sweet":
        adjusted -= 0.22
        reasons.append("sweet_red_penalty_for_savory_food")

    if recipe_signals["sweetness"] == "savory" and wine_signals["sweetness"] == "sweet":
        adjusted -= 0.18
        reasons.append("sweet_wine_penalty_for_savory_food")

    if "fried" in recipe_signals["cooking_methods"] and "crispy" in recipe_signals["textures"]:
        if wine_signals["type"] == "sparkling":
            adjusted += 0.14
            reasons.append("sparkling_bonus_for_fried_crispy_food")
        elif wine_signals["type"] == "white" and wine_signals["acidity"] == "high":
            adjusted += 0.1
            reasons.append("high_acid_white_bonus_for_fried_food")
        elif wine_signals["type"] == "red":
            adjusted -= 0.12
            reasons.append("red_penalty_for_fried_crispy_food")
        elif wine_signals["type"] == "red" and wine_signals["sweetness"] == "sweet":
            adjusted -= 0.18
            reasons.append("sweet_red_penalty_for_fried_food")

    if "fried" in recipe_signals["cooking_methods"] and wine_signals["sweetness"] == "sweet":
        adjusted -= 0.12
        reasons.append("sweet_wine_penalty_for_fried_food")

    if (
        recipe_signals["sweetness"] == "savory"
        and "fried" in recipe_signals["cooking_methods"]
        and "crispy" in recipe_signals["textures"]
        and wine_signals["type"] == "red"
    ):
        adjusted -= 0.14
        reasons.append("savory_fried_snack_red_penalty")

    if {"fish", "seafood"} & set(recipe_signals["meat_types"]):
        if wine_signals["type"] == "red" and wine_signals["tannin"] == "high":
            adjusted -= 0.18
            reasons.append("tannic_red_penalty_for_seafood")
        elif wine_signals["type"] in {"white", "rose", "sparkling"}:
            adjusted += 0.08
            reasons.append("fresh_wine_bonus_for_seafood")

    if {"beef", "lamb", "duck"} & set(recipe_signals["meat_types"]):
        if wine_signals["type"] == "red":
            adjusted += 0.08
            reasons.append("red_bonus_for_red_meat")
        elif wine_signals["type"] == "white" and wine_signals["sweetness"] == "dry":
            adjusted -= 0.14
            reasons.append("dry_white_penalty_for_red_meat")

    if recipe_signals["spice_level"] == "high" and wine_signals["alcohol_bucket"] == "high":
        adjusted -= 0.12
        reasons.append("high_alcohol_penalty_for_spicy_food")

    if recipe_signals["sweetness"] == "sweet":
        if wine_signals["sweetness"] == "sweet":
            adjusted += 0.12
            reasons.append("sweet_wine_bonus_for_dessert")
        elif wine_signals["sweetness"] == "dry":
            adjusted -= 0.15
            reasons.append("dry_wine_penalty_for_dessert")

    if "cream" in recipe_signals["sauce_types"] and wine_signals["type"] == "white" and wine_signals["body"] in {"medium", "full"}:
        adjusted += 0.08
        reasons.append("fuller_white_bonus_for_cream_sauce")

    return clamp_probability(adjusted), reasons


def recommend_for_recipe(recipe_id: str, top_k: int, model) -> list[dict]:
    db = mongo_database()
    recipe = db["recipes"].find_one({"_id": parse_object_id(recipe_id)})
    if not recipe:
        raise RuntimeError("Recipe not found.")

    wines = list(db["wines"].find({"is_confirmed": True}))
    feature_rows = [build_pair_features(recipe, wine) for wine in wines]
    probabilities = model.predict_proba(feature_rows)[:, 1]

    ranked_rows = []
    for wine, probability in zip(wines, probabilities, strict=False):
        adjusted_probability, rerank_reasons = rerank_probability(recipe, wine, float(probability))
        wine_name = str(wine.get("name") or "").strip()
        if not wine_name or wine_name.lower() == "nan":
            continue
        ranked_rows.append(
            {
                "wine_id": str(wine["_id"]),
                "wine_name": wine_name,
                "probability": round(adjusted_probability, 4),
                "model_probability": round(float(probability), 4),
                "type": wine.get("type"),
                "style": wine.get("style"),
                "rerank_reasons": rerank_reasons,
            }
        )

    ranked = sorted(ranked_rows, key=lambda item: item["probability"], reverse=True)
    return ranked[:top_k]


def recommend_for_wine(wine_id: str, top_k: int, model) -> list[dict]:
    db = mongo_database()
    wine = db["wines"].find_one({"_id": parse_object_id(wine_id)})
    if not wine:
        raise RuntimeError("Wine not found.")

    recipes = list(db["recipes"].find({"is_confirmed": True}))
    feature_rows = [build_pair_features(recipe, wine) for recipe in recipes]
    probabilities = model.predict_proba(feature_rows)[:, 1]

    ranked_rows = []
    for recipe, probability in zip(recipes, probabilities, strict=False):
        adjusted_probability, rerank_reasons = rerank_probability(recipe, wine, float(probability))
        recipe_name = str(recipe.get("name") or "").strip()
        if not recipe_name or recipe_name.lower() == "nan":
            continue
        ranked_rows.append(
            {
                "recipe_id": str(recipe["_id"]),
                "recipe_name": recipe_name,
                "probability": round(adjusted_probability, 4),
                "model_probability": round(float(probability), 4),
                "categories": recipe.get("recipeCategories", []),
                "rerank_reasons": rerank_reasons,
            }
        )

    ranked = sorted(ranked_rows, key=lambda item: item["probability"], reverse=True)
    return ranked[:top_k]


def main() -> None:
    started_at = time.perf_counter()
    args = parse_args()
    if bool(args.recipe_id) == bool(args.wine_id):
        raise RuntimeError("Pass exactly one of --recipe-id or --wine-id.")

    model_started_at = time.perf_counter()
    model = load_model(args.model_path)
    model_load_ms = round((time.perf_counter() - model_started_at) * 1000, 2)

    if args.recipe_id:
        inference_started_at = time.perf_counter()
        results = {
            "mode": "recipe_to_wine",
            "results": recommend_for_recipe(args.recipe_id, args.top_k, model),
        }
    else:
        inference_started_at = time.perf_counter()
        results = {
            "mode": "wine_to_recipe",
            "results": recommend_for_wine(args.wine_id, args.top_k, model),
        }
    results["timings"] = {
        "model_load_ms": model_load_ms,
        "inference_ms": round((time.perf_counter() - inference_started_at) * 1000, 2),
        "total_python_ms": round((time.perf_counter() - started_at) * 1000, 2),
    }

    print(json.dumps(sanitize_json_value(results), indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
