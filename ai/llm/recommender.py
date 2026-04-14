from __future__ import annotations

from typing import Any

from pairing_common import extract_recipe_signals, extract_wine_signals, mongo_database
from llm.candidates import fetch_confirmed_recipes, fetch_confirmed_wines
from llm.client import call_llm
from llm.common import parse_object_id
from llm.preferences import PreferenceProfile, WinePreferenceProfile
from llm.serializers import (
    build_recipe_to_wine_prompt,
    build_wine_to_recipe_prompt,
    parse_recipe_to_wine_results,
    parse_wine_to_recipe_results,
)
from mcp.retrieval import build_recipe_candidates_via_search_plan, build_wine_candidates_via_search_plan


def _recommendation_variant_suffix(preferences: dict[str, Any] | None) -> str:
    return "preferences" if preferences else "general"


def _reason_for_recipe_candidate(recipe: dict[str, Any], wine: dict[str, Any], profile: PreferenceProfile) -> str:
    recipe_signals = extract_recipe_signals(recipe)
    wine_signals = extract_wine_signals(wine)
    reasons: list[str] = []

    ingredient_hits = sorted(set(recipe_signals.get("main_ingredients", [])) & set(wine_signals.get("pairing_targets", [])))
    category_hits = sorted(set(recipe_signals.get("categories", [])) & set(wine_signals.get("pairing_targets", [])))

    if ingredient_hits:
        reasons.append(f"Matches the wine's pairing hints: {', '.join(ingredient_hits[:3])}.")
    elif category_hits:
        reasons.append(f"Fits this wine well in the {', '.join(category_hits[:2])} category.")

    if profile.exclude_animal_products and "vegan" in {str(v).lower() for v in recipe_signals.get("categories", [])}:
        reasons.append("Also matches your vegan preference.")
    elif profile.exclude_meat and not recipe_signals.get("meat_types"):
        reasons.append("Also matches your vegetarian-style preferences.")

    if profile.preferred_main_ingredients:
        ingredient_pref_hits = sorted(
            set(profile.preferred_main_ingredients) & {str(v).lower() for v in recipe_signals.get("main_ingredients", [])}
        )
        if ingredient_pref_hits:
            reasons.append(f"Includes ingredients you prefer: {', '.join(ingredient_pref_hits[:3])}.")

    return " ".join(reasons) or "Recommended from local pairing signals and your saved preferences."


def _reason_for_wine_candidate(recipe: dict[str, Any], wine: dict[str, Any]) -> str:
    recipe_signals = extract_recipe_signals(recipe)
    wine_signals = extract_wine_signals(wine)
    reasons: list[str] = []

    if recipe_signals.get("sweetness") == "sweet" and wine_signals.get("sweetness") == "sweet":
        reasons.append("Sweetness is balanced between the dish and the wine.")
    if set(recipe_signals.get("meat_types", [])) & set(wine_signals.get("pairing_targets", [])):
        hit = sorted(set(recipe_signals.get("meat_types", [])) & set(wine_signals.get("pairing_targets", [])))
        reasons.append(f"Matches the dish's main protein: {', '.join(hit[:2])}.")
    if set(recipe_signals.get("categories", [])) & set(wine_signals.get("pairing_targets", [])):
        hit = sorted(set(recipe_signals.get("categories", [])) & set(wine_signals.get("pairing_targets", [])))
        reasons.append(f"Fits the recipe category: {', '.join(hit[:2])}.")

    return " ".join(reasons) or "Recommended from local pairing signals."


def _reason_for_wine_candidate_with_preferences(
    recipe: dict[str, Any], wine: dict[str, Any], profile: WinePreferenceProfile
) -> str:
    base_reason = _reason_for_wine_candidate(recipe, wine)
    wine_signals = extract_wine_signals(wine)
    reasons = [base_reason] if base_reason else []

    if profile.preferred_types and str(wine_signals.get("type", "")).lower() in profile.preferred_types:
        reasons.append("Also matches your preferred wine type.")
    if profile.preferred_styles and str(wine_signals.get("style", "")).lower() in profile.preferred_styles:
        reasons.append("Fits your preferred wine style.")
    if profile.preferred_flavours & {str(v).lower() for v in wine_signals.get("flavours", [])}:
        reasons.append("Includes flavour notes you like.")

    return " ".join(reasons) or "Recommended from local pairing signals and your saved preferences."


def _fallback_recipe_results(candidates: list[dict[str, Any]], wine: dict[str, Any], top_k: int, profile: PreferenceProfile) -> list[dict[str, Any]]:
    sliced = candidates[:top_k]
    total = max(1, len(sliced))
    results = []
    for index, recipe in enumerate(sliced):
        probability = max(0.55, round(0.95 - (index * (0.3 / total)), 4))
        results.append(
            {
                "recipe_id": str(recipe["_id"]),
                "recipe_name": recipe.get("name", ""),
                "match_score": probability,
                "probability": probability,
                "categories": recipe.get("recipeCategories", []),
                "reason": _reason_for_recipe_candidate(recipe, wine, profile),
            }
        )
    return results


def _fallback_wine_results(
    candidates: list[dict[str, Any]],
    recipe: dict[str, Any],
    top_k: int,
    profile: WinePreferenceProfile | None = None,
) -> list[dict[str, Any]]:
    sliced = candidates[:top_k]
    total = max(1, len(sliced))
    results = []
    for index, wine in enumerate(sliced):
        probability = max(0.55, round(0.95 - (index * (0.3 / total)), 4))
        results.append(
            {
                "wine_id": str(wine["_id"]),
                "wine_name": wine.get("name", ""),
                "match_score": probability,
                "probability": probability,
                "type": wine.get("type", ""),
                "style": wine.get("style", ""),
                "reason": (
                    _reason_for_wine_candidate_with_preferences(recipe, wine, profile)
                    if profile and profile.has_preferences
                    else _reason_for_wine_candidate(recipe, wine)
                ),
            }
        )
    return results


def load_user_preferences(user_id: str | None, use_preferences: bool) -> dict[str, Any] | None:
    if not user_id or not use_preferences:
        return None

    db = mongo_database()
    try:
        user = db["users"].find_one({"_id": parse_object_id(user_id)})
        return (user or {}).get("preferences") or None
    except Exception:
        return None


def recommend_for_recipe(recipe_id: str, top_k: int, max_candidates: int, preferences: dict[str, Any] | None) -> dict:
    db = mongo_database()
    recipe = db["recipes"].find_one({"_id": parse_object_id(recipe_id)})
    if not recipe:
        raise RuntimeError(f"Recipe not found: {recipe_id}")

    wines = fetch_confirmed_wines(db)
    profile = WinePreferenceProfile.from_raw(preferences)
    candidates = build_wine_candidates_via_search_plan(recipe, wines, preferences, max_candidates)
    try:
        llm_response = call_llm(build_recipe_to_wine_prompt(recipe, candidates, preferences))
        results = parse_recipe_to_wine_results(llm_response, top_k)
        if results:
            source = f"mongodb:wines:llm-agent:{_recommendation_variant_suffix(preferences)}"
        else:
            results = _fallback_wine_results(candidates, recipe, top_k, profile)
            source = f"mongodb:wines:fallback-empty:{_recommendation_variant_suffix(preferences)}"
    except Exception:
        results = _fallback_wine_results(candidates, recipe, top_k, profile)
        source = f"mongodb:wines:fallback:{_recommendation_variant_suffix(preferences)}"

    return {
        "mode": "recipe_to_wine",
        "source": source,
        "candidate_count": len(candidates),
        "results": results,
    }


def recommend_for_wine(wine_id: str, top_k: int, max_candidates: int, preferences: dict[str, Any] | None) -> dict:
    db = mongo_database()
    wine = db["wines"].find_one({"_id": parse_object_id(wine_id)})
    if not wine:
        raise RuntimeError(f"Wine not found: {wine_id}")

    recipes = fetch_confirmed_recipes(db)
    profile = PreferenceProfile.from_raw(preferences)
    candidates = build_recipe_candidates_via_search_plan(wine, recipes, preferences, max_candidates)
    try:
        llm_response = call_llm(build_wine_to_recipe_prompt(wine, candidates, preferences))
        results = parse_wine_to_recipe_results(llm_response, top_k)
        if results:
            source = f"mongodb:recipes:llm-agent:{_recommendation_variant_suffix(preferences)}"
        else:
            results = _fallback_recipe_results(candidates, wine, top_k, profile)
            source = f"mongodb:recipes:fallback-empty:{_recommendation_variant_suffix(preferences)}"
    except Exception:
        results = _fallback_recipe_results(candidates, wine, top_k, profile)
        source = f"mongodb:recipes:fallback:{_recommendation_variant_suffix(preferences)}"

    return {
        "mode": "wine_to_recipe",
        "source": source,
        "candidate_count": len(candidates),
        "results": results,
    }
