from __future__ import annotations

from typing import Any

from pairing_common import mongo_database
from llm.common import parse_object_id, safe_float


FeedbackLookup = dict[str, dict[str, Any]]


def empty_feedback_stats() -> dict[str, Any]:
    return {
        "good": 0,
        "bad": 0,
        "total": 0,
        "net": 0,
        "positive_ratio": 0.0,
        "avg_recommendation_score": None,
    }


def _normalize_feedback_row(row: dict[str, Any]) -> dict[str, Any]:
    good = int(row.get("good") or 0)
    bad = int(row.get("bad") or 0)
    total = good + bad
    avg_score = row.get("avgRecommendationScore")
    normalized_avg = round(safe_float(avg_score, 0.0), 4) if avg_score is not None else None

    return {
        "good": good,
        "bad": bad,
        "total": total,
        "net": good - bad,
        "positive_ratio": round((good / total), 4) if total else 0.0,
        "avg_recommendation_score": normalized_avg,
    }


def _aggregate_feedback(match_field: str, source_id: str, group_field: str) -> FeedbackLookup:
    db = mongo_database()
    rows = db["pairingfeedbacks"].aggregate(
        [
            {"$match": {match_field: parse_object_id(source_id), "status": "approved"}},
            {
                "$group": {
                    "_id": f"${group_field}",
                    "good": {
                        "$sum": {
                            "$cond": [{"$eq": ["$feedback", "good"]}, 1, 0],
                        }
                    },
                    "bad": {
                        "$sum": {
                            "$cond": [{"$eq": ["$feedback", "bad"]}, 1, 0],
                        }
                    },
                    "avgRecommendationScore": {"$avg": "$recommendationScore"},
                }
            },
        ]
    )
    return {str(row.get("_id")): _normalize_feedback_row(row) for row in rows if row.get("_id")}


def build_feedback_lookup_for_recipe(recipe_id: str) -> FeedbackLookup:
    return _aggregate_feedback("recipeId", recipe_id, "wineId")


def build_feedback_lookup_for_wine(wine_id: str) -> FeedbackLookup:
    return _aggregate_feedback("wineId", wine_id, "recipeId")


def feedback_signal(stats: dict[str, Any] | None) -> float:
    if not stats:
        return 0.0

    good = int(stats.get("good") or 0)
    bad = int(stats.get("bad") or 0)
    total = int(stats.get("total") or 0)
    avg_score = stats.get("avg_recommendation_score")

    score = good * 0.9 - bad * 1.15
    if total >= 2:
        score += (float(stats.get("positive_ratio") or 0.0) - 0.5) * 1.2
    if avg_score is not None:
        score += (safe_float(avg_score, 0.5) - 0.5) * 0.8
    return round(score, 4)


def rerank_candidates_with_feedback(candidates: list[dict[str, Any]], feedback_lookup: FeedbackLookup) -> list[dict[str, Any]]:
    if not candidates or not feedback_lookup:
        return candidates

    total = max(len(candidates), 1)

    def sort_key(payload: tuple[int, dict[str, Any]]):
        index, candidate = payload
        candidate_id = str(candidate.get("_id") or "")
        stats = feedback_lookup.get(candidate_id)
        base_rank_score = (total - index) / total
        combined_score = base_rank_score + feedback_signal(stats)
        return (
            combined_score,
            int((stats or {}).get("good") or 0),
            -int((stats or {}).get("bad") or 0),
            base_rank_score,
        )

    return [candidate for index, candidate in sorted(enumerate(candidates), key=sort_key, reverse=True)]


def feedback_reason_suffix(stats: dict[str, Any] | None) -> str:
    if not stats or not stats.get("total"):
        return ""

    good = int(stats.get("good") or 0)
    bad = int(stats.get("bad") or 0)
    total = int(stats.get("total") or 0)

    if good >= 2 and bad == 0:
        return f" Community feedback has been consistently positive ({good}/{total})."
    if good > bad and total >= 3:
        return f" Community feedback leans positive ({good} good vs {bad} bad)."
    if bad > good and total >= 3:
        return f" Community feedback is mixed, with some negative votes ({good} good vs {bad} bad)."
    return ""
