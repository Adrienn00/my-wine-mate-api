from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

CURRENT_DIR = Path(__file__).resolve().parent
AI_ROOT = CURRENT_DIR.parent
if str(AI_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_ROOT))

from bson import ObjectId

from llm.client import call_llm
from llm.common import is_confirmed, tokenize
from llm.serializers import clamp_probability, parse_search_spec, safe_float
from mcp.client import MCPClient
from pairing_common import mongo_database


SEARCH_PLAN_SYSTEM_PROMPT = (
    "You are an expert sommelier acting as a retrieval planner for a wine recommendation app. "
    "Convert user wine preferences into broad but relevant MongoDB wine search filters. "
    "Do not rank. Do not recommend final results. Return JSON only."
)

FINAL_RANKING_SYSTEM_PROMPT = (
    "You are an expert sommelier. "
    "Recommend wines only from the provided candidate list. "
    "Prioritize the user's saved preferences. "
    "Never invent wines, ids, styles, or reasons not grounded in the candidates. "
    "Return JSON only."
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Use an LLM and the local MCP search layer to recommend wines from saved preferences."
    )
    parser.add_argument("--preferences-json", type=str, default="{}")
    parser.add_argument("--top-k", type=int, default=6)
    parser.add_argument("--max-candidates", type=int, default=25)
    return parser.parse_args()


def load_preferences(raw: str) -> dict[str, Any]:
    try:
        parsed = json.loads(raw or "{}")
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def fetch_confirmed_wines() -> list[dict[str, Any]]:
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
        "imageUrl": 1,
        "ratings": 1,
        "is_confirmed": 1,
        "status": 1,
    }
    wines = list(db["wines"].find({}, projection))
    return [wine for wine in wines if is_confirmed(wine)]


def average_rating(wine: dict[str, Any]) -> float:
    ratings = wine.get("ratings") or []
    values: list[float] = []
    for rating in ratings:
        if not isinstance(rating, dict):
            continue
        value = rating.get("overall", rating.get("rating"))
        numeric = safe_float(value, -1)
        if numeric >= 0:
            values.append(numeric)
    return round(sum(values) / len(values), 2) if values else 0.0


def serialize_candidate(wine: dict[str, Any]) -> dict[str, Any]:
    return {
        "wine_id": str(wine.get("_id")),
        "wine_name": wine.get("name", ""),
        "winery": wine.get("winery", ""),
        "type": wine.get("type", ""),
        "style": wine.get("style", ""),
        "flavorProfiles": wine.get("flavorProfiles", []),
        "grapeVarieties": wine.get("grapeVarieties", []),
        "foodPairingHints": wine.get("foodPairingHints", []),
        "origin": wine.get("origin", {}),
        "priceRange": wine.get("priceRange", ""),
        "year": wine.get("year"),
        "alcohol": wine.get("alcohol"),
        "averageRating": average_rating(wine),
    }


def serialize_result(wine: dict[str, Any], score: float, reasons: list[str]) -> dict[str, Any]:
    return {
        "_id": str(wine.get("_id")),
        "name": wine.get("name", ""),
        "winery": wine.get("winery", ""),
        "description": wine.get("description", ""),
        "type": wine.get("type", ""),
        "style": wine.get("style", ""),
        "flavorProfiles": wine.get("flavorProfiles", []),
        "origin": wine.get("origin", {}),
        "grapeVarieties": wine.get("grapeVarieties", []),
        "foodPairingHints": wine.get("foodPairingHints", []),
        "tags": wine.get("tags", []),
        "alcohol": wine.get("alcohol"),
        "year": wine.get("year"),
        "priceRange": wine.get("priceRange", ""),
        "imageUrl": wine.get("imageUrl", ""),
        "score": score,
        "matchPercent": round(score * 100),
        "reasons": reasons or ["Recommended by sommelier-style preference matching."],
        "recommendationType": "ai",
        "recommendationLabel": "AI recommendation",
        "recommendationSource": "llm-mcp",
        "source": "llm-mcp",
    }


def build_search_plan_prompt(preferences: dict[str, Any]) -> str:
    return json.dumps(
        {
            "task": "Create a wine search plan from saved user preferences.",
            "preferences": preferences,
            "constraints": [
                "Return JSON only.",
                "Use broad but relevant terms so MCP can retrieve real wines from MongoDB.",
                "Map food preferences to likely wine pairing targets when useful.",
            ],
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


def build_final_prompt(preferences: dict[str, Any], candidates: list[dict[str, Any]], top_k: int) -> str:
    return json.dumps(
        {
            "mode": "preference_to_wine",
            "top_k": top_k,
            "preferences": preferences,
            "source": "Candidates were retrieved from the application's own MongoDB wines collection via MCP.",
            "instruction": "Choose the best wines for these preferences only from the provided candidates.",
            "candidates": [serialize_candidate(wine) for wine in candidates],
            "required_output": {
                "results": [
                    {
                        "wine_id": "string",
                        "score": "0-1 preference match score",
                        "reasons": ["short reason grounded in the wine data and preferences"],
                    }
                ]
            },
        },
        ensure_ascii=False,
    )


def candidate_from_mcp_result(serialized: dict[str, Any], wines_by_id: dict[str, dict[str, Any]]) -> dict[str, Any] | None:
    wine_id = serialized.get("wine_id")
    if not wine_id:
        return None
    return wines_by_id.get(str(wine_id))


def fallback_candidates(preferences: dict[str, Any], wines: list[dict[str, Any]], max_candidates: int) -> list[dict[str, Any]]:
    terms = tokenize(
        [
            *(preferences.get("wineTypes") or []),
            *(preferences.get("style") or []),
            *(preferences.get("flavourProfile") or []),
            *(preferences.get("regions") or []),
            *(preferences.get("foodPreferences") or []),
            *(preferences.get("priceRanges") or []),
            preferences.get("wineYears"),
        ]
    )
    if not terms:
        return wines[:max_candidates]

    scored: list[tuple[int, dict[str, Any]]] = []
    for wine in wines:
        blob = tokenize(
            [
                wine.get("name"),
                wine.get("winery"),
                wine.get("description"),
                wine.get("type"),
                wine.get("style"),
                wine.get("priceRange"),
                wine.get("year"),
                *(wine.get("flavorProfiles") or []),
                *(wine.get("foodPairingHints") or []),
                *(wine.get("grapeVarieties") or []),
                *(wine.get("tags") or []),
                (wine.get("origin") or {}).get("country"),
                (wine.get("origin") or {}).get("region"),
            ]
        )
        hits = len(set(terms) & set(blob))
        if hits:
            scored.append((hits, wine))

    scored.sort(key=lambda item: item[0], reverse=True)
    return [wine for _, wine in scored[:max_candidates]] or wines[:max_candidates]


def build_candidates(preferences: dict[str, Any], wines: list[dict[str, Any]], max_candidates: int) -> list[dict[str, Any]]:
    wines_by_id = {str(wine.get("_id")): wine for wine in wines}
    search_plan = parse_search_spec(
        call_llm(build_search_plan_prompt(preferences), system_prompt=SEARCH_PLAN_SYSTEM_PROMPT)
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

    matched = [
        wine
        for wine in (
            candidate_from_mcp_result(serialized, wines_by_id)
            for serialized in search_response.get("results", [])
        )
        if wine is not None
    ]
    return matched[:max_candidates] if matched else fallback_candidates(preferences, wines, max_candidates)


def parse_final_results(payload: dict[str, Any], candidates: list[dict[str, Any]], top_k: int) -> list[dict[str, Any]]:
    candidates_by_id = {str(wine.get("_id")): wine for wine in candidates}
    results = []
    for item in payload.get("results", [])[:top_k]:
        wine_id = str(item.get("wine_id") or item.get("id") or "")
        wine = candidates_by_id.get(wine_id)
        if not wine:
            continue
        reasons = item.get("reasons", item.get("reason", []))
        if isinstance(reasons, str):
            reasons = [reasons]
        if not isinstance(reasons, list):
            reasons = []
        score = clamp_probability(safe_float(item.get("score", item.get("match_score", 0.7)), 0.7))
        results.append(serialize_result(wine, score, [str(reason) for reason in reasons if str(reason).strip()]))
    return results


def recommend_wines(preferences: dict[str, Any], top_k: int, max_candidates: int) -> dict[str, Any]:
    wines = fetch_confirmed_wines()
    candidates = build_candidates(preferences, wines, max_candidates)
    final_payload = call_llm(
        build_final_prompt(preferences, candidates, top_k),
        system_prompt=FINAL_RANKING_SYSTEM_PROMPT,
    )
    results = parse_final_results(final_payload, candidates, top_k)
    if not results:
        results = [
            serialize_result(wine, max(0.55, 0.95 - index * 0.05), ["Recommended from MCP-retrieved wine candidates."])
            for index, wine in enumerate(candidates[:top_k])
        ]
    return {
        "engine": "llm",
        "source": "mongodb:wines:llm-mcp:preferences",
        "candidate_count": len(candidates),
        "results": results,
    }


def main() -> None:
    args = parse_args()
    preferences = load_preferences(args.preferences_json)
    output = recommend_wines(preferences, args.top_k, args.max_candidates)
    print(json.dumps(output, ensure_ascii=False))


if __name__ == "__main__":
    main()
