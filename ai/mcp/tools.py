from __future__ import annotations

import sys
from typing import Any
from pathlib import Path

from bson import ObjectId

CURRENT_DIR = Path(__file__).resolve().parent
AI_ROOT = CURRENT_DIR.parent
if str(AI_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_ROOT))

from pairing_common import extract_recipe_signals, extract_wine_signals, mongo_database


def normalize_text(value: Any) -> str:
    return str(value or "").strip().lower()


def ensure_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if value in (None, "", False):
        return []
    return [value]


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


def _document_blob(document: dict[str, Any]) -> list[str]:
    values: list[Any] = []
    for value in document.values():
        if isinstance(value, dict):
            values.extend(value.values())
        elif isinstance(value, list):
            values.extend(value)
        else:
            values.append(value)
    return tokenize(values)


def _fetch_confirmed_recipes() -> list[dict[str, Any]]:
    db = mongo_database()
    projection = {
        "name": 1,
        "ingredients": 1,
        "instructions": 1,
        "recipeCategories": 1,
        "tags": 1,
        "winePairingHints": 1,
        "imageUrl": 1,
        "is_confirmed": 1,
        "status": 1,
    }
    recipes = list(db["recipes"].find({}, projection))
    return [recipe for recipe in recipes if is_confirmed(recipe)]


def _fetch_confirmed_wines() -> list[dict[str, Any]]:
    db = mongo_database()
    projection = {
        "name": 1,
        "winery": 1,
        "description": 1,
        "type": 1,
        "style": 1,
        "flavorProfiles": 1,
        "origin": 1,
        "grapeVarieties": 1,
        "foodPairingHints": 1,
        "tags": 1,
        "alcohol": 1,
        "year": 1,
        "priceRange": 1,
        "is_confirmed": 1,
        "status": 1,
    }
    wines = list(db["wines"].find({}, {**projection, "imageUrl": 1}))
    return [wine for wine in wines if is_confirmed(wine)]


def serialize_recipe(recipe: dict[str, Any], score: float = 0.0) -> dict[str, Any]:
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
        "imageUrl": recipe.get("imageUrl", ""),
        "retrieval_score": round(float(score), 4),
    }


def serialize_wine(wine: dict[str, Any], score: float = 0.0) -> dict[str, Any]:
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
        "imageUrl": wine.get("imageUrl", ""),
        "retrieval_score": round(float(score), 4),
    }


def get_user_preferences(user_id: str) -> dict[str, Any]:
    db = mongo_database()
    user = db["users"].find_one({"_id": ObjectId(user_id)}, {"preferences": 1})
    if not user:
        raise RuntimeError("User not found.")
    return {"user_id": user_id, "preferences": user.get("preferences") or {}}


def search_recipes(
    search_terms: list[str] | None = None,
    must_have_categories: list[str] | None = None,
    should_have_ingredients: list[str] | None = None,
    exclude_terms: list[str] | None = None,
    limit: int = 25,
) -> dict[str, Any]:
    recipes = _fetch_confirmed_recipes()
    search_terms = [normalize_text(value) for value in ensure_list(search_terms) if normalize_text(value)]
    must_have_categories = [normalize_text(value) for value in ensure_list(must_have_categories) if normalize_text(value)]
    should_have_ingredients = [normalize_text(value) for value in ensure_list(should_have_ingredients) if normalize_text(value)]
    exclude_terms = [normalize_text(value) for value in ensure_list(exclude_terms) if normalize_text(value)]

    ranked: list[tuple[float, dict[str, Any]]] = []
    for recipe in recipes:
        tokens = set(_document_blob(recipe))
        signals = extract_recipe_signals(recipe)
        categories = {normalize_text(value) for value in signals.get("categories", [])}
        ingredients = {normalize_text(value) for value in signals.get("main_ingredients", [])}

        if exclude_terms and set(exclude_terms) & tokens:
            continue
        if must_have_categories and not (set(must_have_categories) & categories):
            continue

        score = 0.0
        score += len(set(search_terms) & tokens) * 2.0
        score += len(set(should_have_ingredients) & ingredients) * 1.7
        score += len(set(must_have_categories) & categories) * 2.2

        if score > 0 or must_have_categories:
            ranked.append((score, recipe))

    ranked.sort(key=lambda item: item[0], reverse=True)
    return {
        "count": len(ranked[:limit]),
        "results": [serialize_recipe(recipe, score) for score, recipe in ranked[:limit]],
    }


def search_wines(
    search_terms: list[str] | None = None,
    preferred_types: list[str] | None = None,
    preferred_styles: list[str] | None = None,
    preferred_flavors: list[str] | None = None,
    preferred_pairing_targets: list[str] | None = None,
    exclude_terms: list[str] | None = None,
    limit: int = 25,
) -> dict[str, Any]:
    wines = _fetch_confirmed_wines()
    search_terms = [normalize_text(value) for value in ensure_list(search_terms) if normalize_text(value)]
    preferred_types = [normalize_text(value) for value in ensure_list(preferred_types) if normalize_text(value)]
    preferred_styles = [normalize_text(value) for value in ensure_list(preferred_styles) if normalize_text(value)]
    preferred_flavors = [normalize_text(value) for value in ensure_list(preferred_flavors) if normalize_text(value)]
    preferred_pairing_targets = [
        normalize_text(value) for value in ensure_list(preferred_pairing_targets) if normalize_text(value)
    ]
    exclude_terms = [normalize_text(value) for value in ensure_list(exclude_terms) if normalize_text(value)]

    ranked: list[tuple[float, dict[str, Any]]] = []
    for wine in wines:
        tokens = set(_document_blob(wine))
        signals = extract_wine_signals(wine)
        wine_type = normalize_text(signals.get("type"))
        wine_style = normalize_text(signals.get("style"))
        flavors = {normalize_text(value) for value in signals.get("flavours", [])}
        pairing_targets = {normalize_text(value) for value in signals.get("pairing_targets", [])}

        if exclude_terms and set(exclude_terms) & tokens:
            continue

        score = 0.0
        score += len(set(search_terms) & tokens) * 2.0
        score += 2.2 if preferred_types and wine_type in set(preferred_types) else 0.0
        score += 1.8 if preferred_styles and wine_style in set(preferred_styles) else 0.0
        score += len(set(preferred_flavors) & flavors) * 1.6
        score += len(set(preferred_pairing_targets) & pairing_targets) * 1.7

        if score > 0 or preferred_types or preferred_styles:
            ranked.append((score, wine))

    ranked.sort(key=lambda item: item[0], reverse=True)
    return {
        "count": len(ranked[:limit]),
        "results": [serialize_wine(wine, score) for score, wine in ranked[:limit]],
    }


def get_recipe_by_id(recipe_id: str) -> dict[str, Any]:
    db = mongo_database()
    recipe = db["recipes"].find_one({"_id": ObjectId(recipe_id)})
    if not recipe:
        raise RuntimeError("Recipe not found.")
    return serialize_recipe(recipe, 0.0)


def get_wine_by_id(wine_id: str) -> dict[str, Any]:
    db = mongo_database()
    wine = db["wines"].find_one({"_id": ObjectId(wine_id)})
    if not wine:
        raise RuntimeError("Wine not found.")
    return serialize_wine(wine, 0.0)
