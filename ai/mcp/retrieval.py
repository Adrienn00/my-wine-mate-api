from __future__ import annotations

from typing import Any

from llm.client import call_llm
from llm.common import tokenize
from llm.serializers import (
    build_recipe_to_wine_search_prompt,
    build_wine_to_recipe_search_prompt,
    parse_search_spec,
)
from mcp.client import MCPClient

SEARCH_PLAN_SYSTEM_PROMPT = (
    "You are an expert sommelier acting as a retrieval planner for a wine and food pairing app. "
    "First reason about what should pair well. Then produce broad but relevant database search filters. "
    "Do not rank. Do not recommend final results. Return JSON only."
)


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


def _recipe_from_mcp_result(serialized: dict[str, Any], recipes: list[dict[str, Any]]) -> dict[str, Any] | None:
    recipe_id = serialized.get("recipe_id")
    if not recipe_id:
        return None
    return next((recipe for recipe in recipes if str(recipe.get("_id")) == recipe_id), None)


def _wine_from_mcp_result(serialized: dict[str, Any], wines: list[dict[str, Any]]) -> dict[str, Any] | None:
    wine_id = serialized.get("wine_id")
    if not wine_id:
        return None
    return next((wine for wine in wines if str(wine.get("_id")) == wine_id), None)


def build_recipe_candidates_via_search_plan(
    wine: dict[str, Any],
    recipes: list[dict[str, Any]],
    preferences: dict[str, Any] | None,
    max_candidates: int,
) -> list[dict[str, Any]]:
    search_plan = parse_search_spec(
        call_llm(build_wine_to_recipe_search_prompt(wine, preferences), system_prompt=SEARCH_PLAN_SYSTEM_PROMPT)
    )

    with MCPClient() as client:
        search_response = client.call_tool(
            "search_recipes",
            {
                "search_terms": search_plan.get("search_terms", []),
                "must_have_categories": search_plan.get("must_have_categories", []),
                "should_have_ingredients": search_plan.get("should_have_ingredients", []),
                "exclude_terms": search_plan.get("exclude_terms", []),
                "limit": max_candidates,
            },
        )

    matched: list[dict[str, Any]] = []
    for serialized in search_response.get("results", []):
        recipe = _recipe_from_mcp_result(serialized, recipes)
        if recipe is not None:
            matched.append(recipe)
    if matched:
        return matched[:max_candidates]

    broad_terms = tokenize(
        [
            wine.get("name"),
            wine.get("type"),
            wine.get("style"),
            *(wine.get("foodPairingHints") or []),
            *(wine.get("flavorProfiles") or []),
            *(wine.get("grapeVarieties") or []),
        ]
    )
    broad_matched = [recipe for recipe in recipes if set(_document_blob(recipe)) & set(broad_terms)]
    if broad_matched:
        return broad_matched[:max_candidates]

    return recipes[:max_candidates]


def build_wine_candidates_via_search_plan(
    recipe: dict[str, Any],
    wines: list[dict[str, Any]],
    preferences: dict[str, Any] | None,
    max_candidates: int,
) -> list[dict[str, Any]]:
    search_plan = parse_search_spec(
        call_llm(build_recipe_to_wine_search_prompt(recipe, preferences), system_prompt=SEARCH_PLAN_SYSTEM_PROMPT)
    )

    with MCPClient() as client:
        search_response = client.call_tool(
            "search_wines",
            {
                "search_terms": search_plan.get("search_terms", []),
                "preferred_types": search_plan.get("preferred_types", []),
                "preferred_styles": search_plan.get("preferred_styles", []),
                "preferred_flavors": search_plan.get("preferred_flavors", []),
                "preferred_pairing_targets": search_plan.get("preferred_pairing_targets", []),
                "exclude_terms": search_plan.get("exclude_terms", []),
                "limit": max_candidates,
            },
        )

    matched: list[dict[str, Any]] = []
    for serialized in search_response.get("results", []):
        wine = _wine_from_mcp_result(serialized, wines)
        if wine is not None:
            matched.append(wine)
    if matched:
        return matched[:max_candidates]

    broad_terms = tokenize(
        [
            recipe.get("name"),
            *(recipe.get("ingredients") or []),
            *(recipe.get("recipeCategories") or []),
            *(recipe.get("winePairingHints") or []),
        ]
    )
    broad_matched = [wine for wine in wines if set(_document_blob(wine)) & set(broad_terms)]
    if broad_matched:
        return broad_matched[:max_candidates]

    return wines[:max_candidates]
