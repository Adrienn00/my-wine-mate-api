from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

CURRENT_DIR = Path(__file__).resolve().parent
AI_ROOT = CURRENT_DIR.parent
if str(AI_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_ROOT))

from llm.recommender import load_user_preferences, recommend_for_recipe, recommend_for_wine


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Use a hosted LLM to recommend wines for a recipe or recipes for a wine."
    )
    parser.add_argument("--recipe-id", type=str, default=None)
    parser.add_argument("--wine-id", type=str, default=None)
    parser.add_argument("--user-id", type=str, default=None)
    parser.add_argument("--use-preferences", action="store_true")
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--max-candidates", type=int, default=25)
    return parser.parse_args()


def main() -> None:
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s: %(message)s")
    args = parse_args()
    if bool(args.recipe_id) == bool(args.wine_id):
        raise SystemExit("Error: pass exactly one of --recipe-id or --wine-id.")

    preferences = load_user_preferences(args.user_id, args.use_preferences)

    if args.recipe_id:
        results = recommend_for_recipe(args.recipe_id, args.top_k, args.max_candidates, preferences)
    else:
        results = recommend_for_wine(args.wine_id, args.top_k, args.max_candidates, preferences)

    if preferences and args.use_preferences:
        results["preferences"] = preferences

    print(json.dumps(results, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
