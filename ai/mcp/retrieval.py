from __future__ import annotations

import time
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


def _normalize_recipe_candidate(serialized: dict[str, Any]) -> dict[str, Any] | None:
    recipe_id = serialized.get("recipe_id")
    if not recipe_id:
        return None

    return {
        "_id": recipe_id,
        "name": serialized.get("recipe_name", ""),
        "recipeCategories": serialized.get("categories", []),
        "ingredients": serialized.get("ingredients", []),
        "winePairingHints": serialized.get("winePairingHints", []),
        "retrieval_score": serialized.get("retrieval_score", 0.0),
        "_mcp_serialized": serialized,
    }


def _normalize_wine_candidate(serialized: dict[str, Any]) -> dict[str, Any] | None:
    wine_id = serialized.get("wine_id")
    if not wine_id:
        return None

    return {
        "_id": wine_id,
        "name": serialized.get("wine_name", ""),
        "type": serialized.get("type", ""),
        "style": serialized.get("style", ""),
        "foodPairingHints": serialized.get("foodPairingHints", []),
        "grapeVarieties": serialized.get("grapeVarieties", []),
        "flavorProfiles": serialized.get("flavorProfiles", []),
        "retrieval_score": serialized.get("retrieval_score", 0.0),
        "_mcp_serialized": serialized,
    }


def build_recipe_candidates_via_search_plan(
    wine: dict[str, Any],
    preferences: dict[str, Any] | None,
    max_candidates: int,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    started_at = time.perf_counter()
    planning_started_at = time.perf_counter()
    search_plan = parse_search_spec(
        call_llm(build_wine_to_recipe_search_prompt(wine, preferences), system_prompt=SEARCH_PLAN_SYSTEM_PROMPT)
    )
    planning_ms = round((time.perf_counter() - planning_started_at) * 1000, 2)

    mcp_started_at = time.perf_counter()
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
    mcp_ms = round((time.perf_counter() - mcp_started_at) * 1000, 2)

    matched: list[dict[str, Any]] = []
    for serialized in search_response.get("results", []):
        recipe = _normalize_recipe_candidate(serialized)
        if recipe is not None:
            matched.append(recipe)
    if matched:
        return matched[:max_candidates], {
            "search_plan_llm_ms": planning_ms,
            "mcp_search_ms": mcp_ms,
            "candidate_strategy": "mcp",
            "candidate_total_ms": round((time.perf_counter() - started_at) * 1000, 2),
        }

    broad_terms = tokenize([
        wine.get("name"),
        wine.get("type"),
        wine.get("style"),
        *(wine.get("foodPairingHints") or []),
        *(wine.get("flavorProfiles") or []),
        *(wine.get("grapeVarieties") or []),
    ])

    fallback_started_at = time.perf_counter()
    with MCPClient() as client:
        fallback_response = client.call_tool(
            "search_recipes",
            {
                "search_terms": broad_terms[:8],
                "must_have_categories": [],
                "should_have_ingredients": [],
                "exclude_terms": [],
                "limit": max_candidates,
            },
        )

    fallback_matched = []
    for serialized in fallback_response.get("results", []):
        recipe = _normalize_recipe_candidate(serialized)
        if recipe is not None:
            fallback_matched.append(recipe)

    if fallback_matched:
        return fallback_matched[:max_candidates], {
            "search_plan_llm_ms": planning_ms,
            "mcp_search_ms": mcp_ms,
            "candidate_strategy": "broad-fallback",
            "fallback_mcp_search_ms": round((time.perf_counter() - fallback_started_at) * 1000, 2),
            "candidate_total_ms": round((time.perf_counter() - started_at) * 1000, 2),
        }

    return [], {
        "search_plan_llm_ms": planning_ms,
        "mcp_search_ms": mcp_ms,
        "candidate_strategy": "empty-fallback",
        "candidate_total_ms": round((time.perf_counter() - started_at) * 1000, 2),
    }


def build_wine_candidates_via_search_plan(
    recipe: dict[str, Any],
    preferences: dict[str, Any] | None,
    max_candidates: int,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    started_at = time.perf_counter()
    planning_started_at = time.perf_counter()
    search_plan = parse_search_spec(
        call_llm(build_recipe_to_wine_search_prompt(recipe, preferences), system_prompt=SEARCH_PLAN_SYSTEM_PROMPT)
    )
    planning_ms = round((time.perf_counter() - planning_started_at) * 1000, 2)

    mcp_started_at = time.perf_counter()
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
    mcp_ms = round((time.perf_counter() - mcp_started_at) * 1000, 2)

    matched: list[dict[str, Any]] = []
    for serialized in search_response.get("results", []):
        wine = _normalize_wine_candidate(serialized)
        if wine is not None:
            matched.append(wine)
    if matched:
        return matched[:max_candidates], {
            "search_plan_llm_ms": planning_ms,
            "mcp_search_ms": mcp_ms,
            "candidate_strategy": "mcp",
            "candidate_total_ms": round((time.perf_counter() - started_at) * 1000, 2),
        }

    broad_terms = tokenize([
        recipe.get("name"),
        *(recipe.get("ingredients") or []),
        *(recipe.get("recipeCategories") or []),
        *(recipe.get("winePairingHints") or []),
    ])

    fallback_started_at = time.perf_counter()
    with MCPClient() as client:
        fallback_response = client.call_tool(
            "search_wines",
            {
                "search_terms": broad_terms[:8],
                "preferred_types": [],
                "preferred_styles": [],
                "preferred_flavors": [],
                "preferred_pairing_targets": [],
                "exclude_terms": [],
                "limit": max_candidates,
            },
        )

    fallback_matched = []
    for serialized in fallback_response.get("results", []):
        wine = _normalize_wine_candidate(serialized)
        if wine is not None:
            fallback_matched.append(wine)

    if fallback_matched:
        return fallback_matched[:max_candidates], {
            "search_plan_llm_ms": planning_ms,
            "mcp_search_ms": mcp_ms,
            "candidate_strategy": "broad-fallback",
            "fallback_mcp_search_ms": round((time.perf_counter() - fallback_started_at) * 1000, 2),
            "candidate_total_ms": round((time.perf_counter() - started_at) * 1000, 2),
        }

    return [], {
        "search_plan_llm_ms": planning_ms,
        "mcp_search_ms": mcp_ms,
        "candidate_strategy": "empty-fallback",
        "candidate_total_ms": round((time.perf_counter() - started_at) * 1000, 2),
    }
