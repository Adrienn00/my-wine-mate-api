from __future__ import annotations

from typing import Any

from pairing_common import extract_recipe_signals, extract_wine_signals, heuristic_pair_score

from llm.common import is_confirmed, tokenize
from llm.preferences import PreferenceProfile


def recipe_tokens(recipe: dict) -> list[str]:
    return tokenize(
        [
            recipe.get("name"),
            *(recipe.get("ingredients") or []),
            *(recipe.get("recipeCategories") or []),
            *(recipe.get("tags") or []),
            *(recipe.get("winePairingHints") or []),
        ]
    )


def wine_tokens(wine: dict) -> list[str]:
    return tokenize(
        [
            wine.get("name"),
            wine.get("winery"),
            wine.get("description"),
            wine.get("type"),
            wine.get("style"),
            *(wine.get("flavorProfiles") or []),
            *(wine.get("grapeVarieties") or []),
            *(wine.get("foodPairingHints") or []),
            *(wine.get("tags") or []),
            wine.get("origin", {}).get("country"),
            wine.get("origin", {}).get("region"),
        ]
    )


def overlap_score(tokens_a: list[str], tokens_b: list[str]) -> float:
    if not tokens_a or not tokens_b:
        return 0.0
    set_b = set(tokens_b)
    hits = sum(1 for token in tokens_a if token in set_b)
    return hits / max(1, len(tokens_a))


def boosted_overlap_score(tokens_a: list[str], tokens_b: list[str]) -> float:
    base_score = overlap_score(tokens_a, tokens_b)
    if not tokens_a or not tokens_b:
        return base_score
    reverse_score = overlap_score(tokens_b, tokens_a)
    return (base_score * 0.7) + (reverse_score * 0.3)


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


def top_k_by_score(scored: list[tuple[float, dict[str, Any]]], max_candidates: int) -> list[dict[str, Any]]:
    scored.sort(key=lambda item: item[0], reverse=True)
    return [item for _, item in scored[:max_candidates]]


def build_candidates_for_recipe(recipe: dict, wines: list[dict], max_candidates: int) -> list[dict]:
    recipe_tokens_list = recipe_tokens(recipe)
    ranked = []
    for wine in wines:
        tokens = wine_tokens(wine)
        score = boosted_overlap_score(recipe_tokens_list, tokens) + heuristic_pair_score(recipe, wine)
        ranked.append((score, wine))

    return top_k_by_score(ranked, max_candidates)


def build_candidates_for_wine(
    wine: dict,
    recipes: list[dict],
    max_candidates: int,
    preferences: dict[str, Any] | PreferenceProfile | None = None,
) -> list[dict]:
    wine_tokens_list = wine_tokens(wine)
    wine_signals = extract_wine_signals(wine)
    preference_profile = (
        preferences if isinstance(preferences, PreferenceProfile) else PreferenceProfile.from_raw(preferences)
    )
    ranked = []

    for recipe in recipes:
        recipe_signals = extract_recipe_signals(recipe)
        if not preference_profile.allows_recipe(recipe_signals):
            continue

        tokens = recipe_tokens(recipe)
        lexical_score = boosted_overlap_score(wine_tokens_list, tokens)
        heuristic_score = heuristic_pair_score(recipe, wine)
        target_overlap = len(set(recipe_signals["main_ingredients"]) & set(wine_signals["pairing_targets"]))
        category_overlap = len(set(recipe_signals["categories"]) & set(wine_signals["pairing_targets"]))
        preference_score = preference_profile.score_recipe(recipe_signals)
        score = lexical_score + heuristic_score + (target_overlap * 1.5) + (category_overlap * 1.2) + preference_score
        ranked.append((score, recipe))

    return top_k_by_score(ranked, max_candidates)
