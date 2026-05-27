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
    heuristic_pair_score,
    mongo_database,
    silver_label_from_score,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate automatically pre-labeled wine and recipe pairs for review."
    )
    parser.add_argument("--limit-wines", type=int, default=160)
    parser.add_argument("--limit-recipes", type=int, default=120)
    parser.add_argument("--top-good-per-recipe", type=int, default=3)
    parser.add_argument("--top-bad-per-recipe", type=int, default=3)
    parser.add_argument("--review-band-size", type=int, default=2)
    parser.add_argument("--positive-threshold", type=float, default=4.0)
    parser.add_argument("--negative-threshold", type=float, default=1.2)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=ARTIFACTS_DIR,
        help="Directory for the exported CSV and JSON files.",
    )
    return parser.parse_args()


def fetch_data(limit_wines: int, limit_recipes: int) -> tuple[list[dict], list[dict]]:
    db = mongo_database()
    wines = list(db["wines"].find({"is_confirmed": True}).limit(limit_wines))
    recipes = list(db["recipes"].find({"is_confirmed": True}).limit(limit_recipes))

    if not wines or not recipes:
        raise RuntimeError("No confirmed wines or recipes were found in MongoDB.")

    return wines, recipes


def make_row(recipe: dict, wine: dict, score: float, status: str, label: int | None, confidence: str):
    features = build_pair_features(recipe, wine)
    return {
        "recipe_id": str(recipe["_id"]),
        "recipe_name": recipe.get("name"),
        "recipe_categories": ", ".join(recipe.get("recipeCategories", [])[:5]),
        "wine_id": str(wine["_id"]),
        "wine_name": wine.get("name"),
        "wine_type": wine.get("type"),
        "wine_style": wine.get("style"),
        "wine_flavor_profiles": ", ".join(wine.get("flavorProfiles", [])[:6]),
        "heuristic_score": round(float(score), 3),
        "auto_status": status,
        "auto_label": label,
        "confidence": confidence,
        "category_overlap": features["category_overlap"],
        "ingredient_overlap": features["ingredient_overlap"],
        "meat_overlap": features["meat_overlap"],
        "style_pair_score": features["style_pair_score"],
    }


def build_exports(args: argparse.Namespace) -> tuple[pd.DataFrame, dict]:
    wines, recipes = fetch_data(args.limit_wines, args.limit_recipes)
    export_rows = []
    stats = {"good": 0, "bad": 0, "review": 0}

    for recipe in recipes:
        scored_pairs = []
        for wine in wines:
            score = heuristic_pair_score(recipe, wine)
            status, label, confidence = silver_label_from_score(
                score,
                positive_threshold=args.positive_threshold,
                negative_threshold=args.negative_threshold,
            )
            scored_pairs.append((score, wine, status, label, confidence))

        scored_pairs.sort(key=lambda item: item[0], reverse=True)

        top_good = [item for item in scored_pairs if item[2] == "good"][: args.top_good_per_recipe]
        top_bad = [item for item in reversed(scored_pairs) if item[2] == "bad"][: args.top_bad_per_recipe]

        review_candidates = []
        for score, wine, status, label, confidence in scored_pairs:
            if status != "review":
                continue
            review_candidates.append((score, wine, status, label, confidence))
            if len(review_candidates) >= args.review_band_size:
                break

        selected = top_good + top_bad + review_candidates

        for score, wine, status, label, confidence in selected:
            export_rows.append(make_row(recipe, wine, score, status, label, confidence))
            stats[status] += 1

    dataframe = pd.DataFrame(export_rows)
    summary = {
        "rows": int(len(dataframe)),
        "recipes_used": int(len(recipes)),
        "wines_used": int(len(wines)),
        "status_breakdown": stats,
        "positive_threshold": args.positive_threshold,
        "negative_threshold": args.negative_threshold,
    }
    return dataframe, summary


def main() -> None:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    dataframe, summary = build_exports(args)
    csv_path = args.output_dir / "silver_pair_labels.csv"
    json_path = args.output_dir / "silver_pair_labels.json"
    summary_path = args.output_dir / "silver_pair_labels_summary.json"

    dataframe.to_csv(csv_path, index=False)
    json_path.write_text(
        json.dumps(dataframe.to_dict(orient="records"), indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print(f"Rows exported: {summary['rows']}")
    print(f"Good labels: {summary['status_breakdown']['good']}")
    print(f"Bad labels: {summary['status_breakdown']['bad']}")
    print(f"Review labels: {summary['status_breakdown']['review']}")
    print(f"CSV saved to: {csv_path}")
    print(f"Summary saved to: {summary_path}")


if __name__ == "__main__":
    main()
