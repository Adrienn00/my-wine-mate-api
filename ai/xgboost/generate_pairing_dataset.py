from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pandas as pd

CURRENT_DIR = Path(__file__).resolve().parent
AI_ROOT = CURRENT_DIR.parent
if str(AI_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_ROOT))

from pairing_common import (
    ARTIFACTS_DIR,
    build_pair_features,
    confidence_weight,
    heuristic_pair_score,
    mongo_database,
    rule_matches_pair,
    silver_label_from_score,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate labeled wine-recipe training pairs from the pairing knowledge base."
    )
    parser.add_argument("--limit-wines", type=int, default=220)
    parser.add_argument("--limit-recipes", type=int, default=150)
    parser.add_argument(
        "--include-feedback",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Include saved pairing feedback and let it override rule-based labels for the same pair.",
    )
    parser.add_argument(
        "--include-heuristics",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Add high-confidence heuristic pairs for examples not covered by explicit pairing rules.",
    )
    parser.add_argument("--top-good-per-recipe", type=int, default=4)
    parser.add_argument("--top-bad-per-recipe", type=int, default=4)
    parser.add_argument("--positive-threshold", type=float, default=4.5)
    parser.add_argument("--negative-threshold", type=float, default=1.1)
    parser.add_argument("--output-dir", type=Path, default=ARTIFACTS_DIR)
    return parser.parse_args()


def fetch_data(limit_wines: int, limit_recipes: int):
    db = mongo_database()
    wines = list(db["wines"].find({"is_confirmed": True}).limit(limit_wines))
    recipes = list(db["recipes"].find({"is_confirmed": True}).limit(limit_recipes))
    rules = list(db["pairingrules"].find({"active": True}))

    if not wines or not recipes:
        raise RuntimeError("No confirmed wines or recipes were found in MongoDB.")
    if not rules:
        raise RuntimeError("No active pairing rules were found. Seed the knowledge base first.")

    return wines, recipes, rules


def pick_best_rule(matches: list[dict]) -> dict:
    return sorted(
        matches,
        key=lambda rule: (
            confidence_weight(rule.get("confidence")),
            int(rule.get("score", 0)),
            int(rule.get("_match_count", 0)),
        ),
        reverse=True,
    )[0]


def feedback_collection(db):
    return db["pairingfeedbacks"]


def fetch_feedback_rows(db, valid_recipe_ids: set[str], valid_wine_ids: set[str]) -> list[dict]:
    rows = []
    cursor = feedback_collection(db).find()

    for entry in cursor:
        recipe_id = str(entry.get("recipeId") or "")
        wine_id = str(entry.get("wineId") or "")
        feedback = str(entry.get("feedback") or "").strip().lower()

        if recipe_id not in valid_recipe_ids or wine_id not in valid_wine_ids:
          continue
        if feedback not in {"good", "bad"}:
          continue

        rows.append(
            {
                "recipe_id": recipe_id,
                "wine_id": wine_id,
                "label": 1 if feedback == "good" else 0,
                "label_name": feedback,
                "rule_name": "user_feedback",
                "rule_confidence": "high",
                "rule_score": 10,
                "feedback_direction": entry.get("direction"),
                "feedback_user_id": str(entry.get("userId")) if entry.get("userId") else None,
                "feedback_created_at": (
                    entry.get("createdAt").isoformat() if entry.get("createdAt") else None
                ),
            }
        )

    return rows


def add_heuristic_rows(
    rows_by_pair: dict,
    recipes: list[dict],
    wines: list[dict],
    top_good_per_recipe: int,
    top_bad_per_recipe: int,
    positive_threshold: float,
    negative_threshold: float,
) -> int:
    heuristic_rows_used = 0

    for recipe in recipes:
        scored_pairs = []
        for wine in wines:
            pair_key = (str(recipe["_id"]), str(wine["_id"]))
            if pair_key in rows_by_pair:
                continue

            score = heuristic_pair_score(recipe, wine)
            status, label, confidence = silver_label_from_score(
                score,
                positive_threshold=positive_threshold,
                negative_threshold=negative_threshold,
            )
            if label is None:
                continue

            scored_pairs.append((score, wine, label, status, confidence))

        scored_pairs.sort(key=lambda item: item[0], reverse=True)
        selected_good = [item for item in scored_pairs if item[2] == 1][:top_good_per_recipe]
        selected_bad = [item for item in reversed(scored_pairs) if item[2] == 0][:top_bad_per_recipe]

        for score, wine, label, status, confidence in selected_good + selected_bad:
            pair_key = (str(recipe["_id"]), str(wine["_id"]))
            rows_by_pair[pair_key] = {
                "recipe_id": str(recipe["_id"]),
                "recipe_name": recipe.get("name"),
                "wine_id": str(wine["_id"]),
                "wine_name": wine.get("name"),
                "label": label,
                "label_name": status,
                "rule_name": "heuristic_bootstrap",
                "rule_confidence": confidence,
                "rule_score": round(float(score), 3),
                "data_source": "heuristic",
                **build_pair_features(recipe, wine),
            }
            heuristic_rows_used += 1

    return heuristic_rows_used


def build_dataset(
    limit_wines: int,
    limit_recipes: int,
    include_feedback: bool = True,
    include_heuristics: bool = True,
    top_good_per_recipe: int = 4,
    top_bad_per_recipe: int = 4,
    positive_threshold: float = 4.5,
    negative_threshold: float = 1.1,
) -> tuple[pd.DataFrame, dict]:
    wines, recipes, rules = fetch_data(limit_wines, limit_recipes)
    db = mongo_database()
    rows_by_pair = {}
    summary = {"good": 0, "bad": 0}

    for recipe in recipes:
        for wine in wines:
            matches = []
            for rule in rules:
                matched, match_count = rule_matches_pair(rule, recipe, wine)
                if not matched:
                    continue

                match_copy = dict(rule)
                match_copy["_match_count"] = match_count
                matches.append(match_copy)

            if not matches:
                continue

            selected_rule = pick_best_rule(matches)
            features = build_pair_features(recipe, wine)
            label = 1 if selected_rule["label"] == "good" else 0

            pair_key = (str(recipe["_id"]), str(wine["_id"]))
            rows_by_pair[pair_key] = {
                "recipe_id": str(recipe["_id"]),
                "recipe_name": recipe.get("name"),
                "wine_id": str(wine["_id"]),
                "wine_name": wine.get("name"),
                "label": label,
                "label_name": selected_rule["label"],
                "rule_name": selected_rule["name"],
                "rule_confidence": selected_rule.get("confidence", "medium"),
                "rule_score": selected_rule.get("score", 0),
                "data_source": "knowledge_base",
                **features,
            }

    heuristic_rows_used = 0
    if include_heuristics:
        heuristic_rows_used = add_heuristic_rows(
            rows_by_pair,
            recipes,
            wines,
            top_good_per_recipe=top_good_per_recipe,
            top_bad_per_recipe=top_bad_per_recipe,
            positive_threshold=positive_threshold,
            negative_threshold=negative_threshold,
        )

    feedback_rows_used = 0
    if include_feedback:
        valid_recipe_ids = {str(recipe["_id"]) for recipe in recipes}
        valid_wine_ids = {str(wine["_id"]) for wine in wines}
        feedback_rows = fetch_feedback_rows(db, valid_recipe_ids, valid_wine_ids)
        feature_index = {(str(recipe["_id"]), str(wine["_id"])): (recipe, wine) for recipe in recipes for wine in wines}

        for feedback_row in feedback_rows:
            pair_key = (feedback_row["recipe_id"], feedback_row["wine_id"])
            if pair_key not in feature_index:
                continue

            recipe, wine = feature_index[pair_key]
            rows_by_pair[pair_key] = {
                "recipe_id": feedback_row["recipe_id"],
                "recipe_name": recipe.get("name"),
                "wine_id": feedback_row["wine_id"],
                "wine_name": wine.get("name"),
                "label": feedback_row["label"],
                "label_name": feedback_row["label_name"],
                "rule_name": feedback_row["rule_name"],
                "rule_confidence": feedback_row["rule_confidence"],
                "rule_score": feedback_row["rule_score"],
                "data_source": "feedback",
                "feedback_direction": feedback_row["feedback_direction"],
                "feedback_user_id": feedback_row["feedback_user_id"],
                "feedback_created_at": feedback_row["feedback_created_at"],
                **build_pair_features(recipe, wine),
            }
            feedback_rows_used += 1

    rows = list(rows_by_pair.values())
    for row in rows:
        summary["good" if row["label"] == 1 else "bad"] += 1

    if not rows:
        raise RuntimeError("No labeled training pairs were generated from the knowledge base.")

    dataset = pd.DataFrame(rows)
    metadata = {
        "rows": int(len(dataset)),
        "recipes_used": int(len(recipes)),
        "wines_used": int(len(wines)),
        "rules_used": int(len(rules)),
        "heuristic_rows_used": int(heuristic_rows_used),
        "label_breakdown": summary,
        "feedback_rows_used": int(feedback_rows_used),
    }
    return dataset, metadata


def main() -> None:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    dataset, metadata = build_dataset(
        args.limit_wines,
        args.limit_recipes,
        include_feedback=args.include_feedback,
        include_heuristics=args.include_heuristics,
        top_good_per_recipe=args.top_good_per_recipe,
        top_bad_per_recipe=args.top_bad_per_recipe,
        positive_threshold=args.positive_threshold,
        negative_threshold=args.negative_threshold,
    )
    csv_path = args.output_dir / "pairing_kb_dataset.csv"
    json_path = args.output_dir / "pairing_kb_dataset.json"
    summary_path = args.output_dir / "pairing_kb_dataset_summary.json"

    dataset.to_csv(csv_path, index=False)
    json_path.write_text(
        json.dumps(dataset.to_dict(orient="records"), indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    summary_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    print(f"Rows exported: {metadata['rows']}")
    print(f"Good labels: {metadata['label_breakdown']['good']}")
    print(f"Bad labels: {metadata['label_breakdown']['bad']}")
    print(f"CSV saved to: {csv_path}")


if __name__ == "__main__":
    main()
