from __future__ import annotations

from typing import Any

from llm.common import is_confirmed


def fetch_confirmed_wines(db) -> list[dict[str, Any]]:
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
        "aiFoodPairingEnabled": 1,
        "is_confirmed": 1,
        "status": 1,
    }
    wines = list(db["wines"].find({}, projection))
    return [wine for wine in wines if is_confirmed(wine)]


def fetch_confirmed_recipes(db) -> list[dict[str, Any]]:
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
