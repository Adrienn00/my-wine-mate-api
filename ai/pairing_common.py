from __future__ import annotations

import math
import os
import random
import re
import unicodedata
from pathlib import Path
from typing import Any, Iterable

from dotenv import load_dotenv
from pymongo import MongoClient


ROOT_DIR = Path(__file__).resolve().parent.parent
ARTIFACTS_DIR = ROOT_DIR / "ai" / "artifacts"


def load_environment() -> None:
    load_dotenv(ROOT_DIR / ".env")


def mongo_database():
    load_environment()
    mongo_uri = os.getenv("MONGO_URI")
    if not mongo_uri:
        raise RuntimeError("MONGO_URI is missing from the backend .env file.")

    client = MongoClient(mongo_uri)
    return client.get_default_database()


def normalize_text(value: Any) -> str:
    text = str(value or "").strip().lower()
    text = unicodedata.normalize("NFD", text)
    return "".join(char for char in text if unicodedata.category(char) != "Mn")


def slugify(value: Any) -> str:
    text = normalize_text(value)
    return re.sub(r"[^a-z0-9]+", "_", text).strip("_")


def ensure_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if value in (None, "", False):
        return []
    return [value]


def unique_tokens(values: Iterable[Any]) -> list[str]:
    seen = []
    for value in values:
        token = normalize_text(value)
        if token and token not in seen:
            seen.append(token)
    return seen


RECIPE_CATEGORY_KEYWORDS = {
    "dessert": ["dessert", "sweet", "cake", "cookie", "pudding", "pie", "brownie"],
    "vegetarian": ["vegetarian"],
    "vegan": ["vegan"],
    "salad": ["salad"],
    "soup": ["soup", "broth", "stew", "chowder"],
    "pasta": ["pasta", "spaghetti", "noodle", "macaroni", "lasagna", "linguine"],
    "rice": ["rice", "risotto", "pilaf", "paella"],
    "seafood": ["seafood", "shrimp", "prawn", "mussel", "clam", "octopus", "squid"],
    "breakfast": ["breakfast", "omelet", "omelette", "pancake", "waffle"],
}

SWEET_DISH_KEYWORDS = [
    "dessert",
    "sweet",
    "cake",
    "cookie",
    "brownie",
    "pudding",
    "pastry",
    "cheesecake",
    "ice cream",
    "chocolate",
    "tart",
    "pie",
]

RECIPE_MAIN_INGREDIENT_KEYWORDS = {
    "beef": ["beef", "steak", "veal"],
    "pork": ["pork", "bacon", "ham"],
    "lamb": ["lamb"],
    "duck": ["duck"],
    "chicken": ["chicken"],
    "turkey": ["turkey"],
    "fish": ["fish", "salmon", "cod", "tuna", "trout"],
    "seafood": ["shrimp", "prawn", "mussel", "clam", "octopus", "squid", "scallop"],
    "mushroom": ["mushroom", "porcini"],
    "cheese": ["cheese", "parmesan", "mozzarella", "cheddar", "goat cheese", "feta"],
    "tomato": ["tomato"],
    "potato": ["potato"],
    "rice": ["rice", "risotto", "paella"],
    "pasta": ["pasta", "spaghetti", "lasagna", "linguine", "macaroni"],
    "chocolate": ["chocolate", "cocoa"],
    "berry": ["berry", "strawberry", "blueberry", "raspberry", "blackberry"],
    "citrus": ["lemon", "lime", "orange", "grapefruit"],
}

WINE_PAIRING_HINT_KEYWORDS = {
    "beef": ["beef", "steak", "veal"],
    "pork": ["pork", "ham", "bacon"],
    "lamb": ["lamb"],
    "duck": ["duck"],
    "chicken": ["chicken", "poultry", "turkey"],
    "fish": ["fish", "salmon", "cod", "trout", "tuna"],
    "seafood": ["seafood", "shrimp", "prawn", "shellfish", "mussel", "clam"],
    "mushroom": ["mushroom"],
    "cheese": ["cheese"],
    "dessert": ["dessert", "cake", "pastry", "chocolate", "sweet"],
    "salad": ["salad", "greens"],
    "pasta": ["pasta"],
    "rice": ["rice", "risotto"],
    "spicy": ["spicy", "chili", "peppery"],
    "vegetarian": ["vegetarian", "vegan", "vegetable"],
}

FLAVOUR_KEYWORDS = {
    "fruity": ["fruity", "berry", "cherry", "plum", "apple", "pear", "citrus", "peach"],
    "spicy": ["spicy", "pepper", "clove", "cinnamon"],
    "floral": ["floral", "flower", "rose", "violet", "blossom"],
    "earthy": ["earthy", "forest floor", "mineral", "soil", "truffle"],
    "vanilla": ["vanilla", "oak"],
    "honeyed": ["honey", "honeyed"],
    "herbal": ["herb", "sage", "mint", "thyme"],
    "fresh": ["fresh", "crisp", "zesty", "bright"],
}

SPICE_KEYWORDS = {
    "pepper": ["pepper", "black pepper", "white pepper"],
    "chili": ["chili", "chilli", "jalapeno", "jalapeno", "cayenne"],
    "paprika": ["paprika", "smoked paprika"],
    "garlic": ["garlic"],
    "ginger": ["ginger"],
    "soy": ["soy", "soy sauce"],
    "cumin": ["cumin"],
    "herbs": ["herb", "parsley", "cilantro", "coriander", "basil", "oregano", "thyme", "rosemary"],
}

COOKING_METHOD_KEYWORDS = {
    "fried": ["fried", "deep fried", "air fryer", "air fried", "crispy"],
    "grilled": ["grilled", "charred", "barbecue", "bbq"],
    "roasted": ["roasted", "roast", "baked"],
    "stewed": ["stew", "braised", "slow cooked", "ragu"],
    "steamed": ["steamed", "poached"],
    "raw": ["raw", "carpaccio", "tartare"],
}

TEXTURE_KEYWORDS = {
    "crispy": ["crispy", "crunchy", "fried"],
    "creamy": ["creamy", "cream", "buttery", "velvety"],
    "light": ["light", "fresh", "delicate"],
    "rich": ["rich", "hearty", "bold", "sticky"],
}

SAUCE_KEYWORDS = {
    "tomato": ["tomato", "marinara", "ragu"],
    "cream": ["cream", "alfredo", "bechamel", "cheese sauce"],
    "soy": ["soy", "teriyaki", "hoisin"],
    "citrus": ["lemon", "lime", "orange", "citrus"],
    "herb": ["chimichurri", "pesto", "herb sauce"],
    "spicy": ["chili sauce", "hot sauce", "spicy sauce"],
}

BODY_KEYWORDS = {
    "light": ["light-bodied", "light bodied", "delicate", "crisp"],
    "medium": ["medium-bodied", "medium bodied", "balanced"],
    "full": ["full-bodied", "full bodied", "rich", "powerful"],
}

ACIDITY_KEYWORDS = {
    "low": ["soft acidity", "low acidity", "round"],
    "medium": ["balanced acidity", "medium acidity"],
    "high": ["high acidity", "bright", "zesty", "crisp", "fresh"],
}

TANNIN_KEYWORDS = {
    "low": ["soft tannin", "low tannin", "silky"],
    "medium": ["medium tannin", "supple tannin"],
    "high": ["high tannin", "firm tannin", "structured", "grippy"],
}

SWEET_WINE_KEYWORDS = [
    "sweet",
    "dessert",
    "late harvest",
    "vendanges tardives",
    "auslese",
    "beerenauslese",
    "trockenbeerenauslese",
    "eszencia",
    "aszu",
    "ice wine",
    "icewine",
    "sauternes",
    "tokaji",
    "passito",
]

SPARKLING_WINE_KEYWORDS = [
    "champagne",
    "cava",
    "prosecco",
    "sparkling",
    "spumante",
    "millesimato",
    "franciacorta",
    "cremant",
]


def contains_any(text: str, keywords: Iterable[str]) -> bool:
    return any(keyword in text for keyword in keywords)


def collect_matching_labels(text: str, keyword_map: dict[str, list[str]]) -> list[str]:
    labels = []
    for label, keywords in keyword_map.items():
        if contains_any(text, keywords):
            labels.append(label)
    return labels


def text_blob(*parts: Any) -> str:
    flattened: list[str] = []
    for part in parts:
        if isinstance(part, list):
            flattened.extend(str(item or "") for item in part)
        elif isinstance(part, dict):
            flattened.extend(str(item or "") for item in part.values())
        elif part:
            flattened.append(str(part))
    return normalize_text(" ".join(flattened))


def extract_recipe_signals(recipe: dict[str, Any]) -> dict[str, Any]:
    text = text_blob(
        recipe.get("name"),
        recipe.get("ingredients"),
        recipe.get("instructions"),
        recipe.get("recipeCategories"),
        recipe.get("tags"),
        recipe.get("winePairingHints"),
    )
    culinary_text = text_blob(
        recipe.get("name"),
        recipe.get("ingredients"),
        recipe.get("instructions"),
        recipe.get("tags"),
        recipe.get("winePairingHints"),
    )
    categories = unique_tokens(recipe.get("recipeCategories", []))
    inferred_categories = collect_matching_labels(culinary_text, RECIPE_CATEGORY_KEYWORDS)
    main_ingredients = collect_matching_labels(culinary_text, RECIPE_MAIN_INGREDIENT_KEYWORDS)

    meat_types = [
        label
        for label in main_ingredients
        if label in {"beef", "pork", "lamb", "duck", "chicken", "turkey", "fish", "seafood"}
    ]

    dish_types = [
        label
        for label in inferred_categories
        if label in {"dessert", "salad", "soup", "pasta", "rice", "breakfast"}
    ]

    spice_level = "high" if "spicy" in culinary_text or "chili" in culinary_text else "low"
    sweetness = "sweet" if "dessert" in inferred_categories or contains_any(culinary_text, SWEET_DISH_KEYWORDS) else "savory"
    spices = collect_matching_labels(culinary_text, SPICE_KEYWORDS)
    cooking_methods = collect_matching_labels(culinary_text, COOKING_METHOD_KEYWORDS)
    textures = collect_matching_labels(culinary_text, TEXTURE_KEYWORDS)
    sauce_types = collect_matching_labels(culinary_text, SAUCE_KEYWORDS)

    categories_combined = unique_tokens(categories + inferred_categories)

    # Some imported recipes contain noisy categories like "Dessert" on clearly savory fish/meat dishes.
    if "dessert" in categories_combined and sweetness == "savory" and meat_types:
        categories_combined = [label for label in categories_combined if label != "dessert"]

    if "dessert" in categories_combined and sweetness == "savory" and {"fish", "seafood", "beef", "lamb", "duck", "chicken", "turkey", "pork"} & set(meat_types):
        categories_combined = [label for label in categories_combined if label != "dessert"]

    # Recompute sweetness after category cleanup so noisy imported dessert labels
    # do not continue to affect downstream pairing logic.
    sweetness = "sweet" if "dessert" in categories_combined or contains_any(culinary_text, SWEET_DISH_KEYWORDS) else "savory"

    return {
        "categories": categories_combined,
        "main_ingredients": unique_tokens(main_ingredients),
        "meat_types": unique_tokens(meat_types),
        "dish_types": unique_tokens(dish_types),
        "spice_level": spice_level,
        "sweetness": sweetness,
        "spices": unique_tokens(spices),
        "cooking_methods": unique_tokens(cooking_methods),
        "textures": unique_tokens(textures),
        "sauce_types": unique_tokens(sauce_types),
        "text": text,
    }


def extract_wine_signals(wine: dict[str, Any]) -> dict[str, Any]:
    text = text_blob(
        wine.get("name"),
        wine.get("description"),
        wine.get("type"),
        wine.get("style"),
        wine.get("flavorProfiles"),
        wine.get("foodPairingHints"),
        wine.get("tags"),
        wine.get("grapeVarieties"),
        wine.get("origin", {}),
    )
    flavour_tokens = unique_tokens(wine.get("flavorProfiles", []))
    flavour_tokens.extend(collect_matching_labels(text, FLAVOUR_KEYWORDS))
    type_token = normalize_text(wine.get("type"))
    style_token = normalize_text(wine.get("style"))

    if type_token in {"", "unknown", "white"} and contains_any(text, SPARKLING_WINE_KEYWORDS):
        type_token = "sparkling"

    pairing_targets = unique_tokens(
        ensure_list(wine.get("foodPairingHints", []))
        + collect_matching_labels(text, WINE_PAIRING_HINT_KEYWORDS)
    )

    alcohol = wine.get("alcohol")
    alcohol_bucket = "unknown"
    if isinstance(alcohol, (int, float)) and not math.isnan(alcohol):
        if alcohol < 11.5:
            alcohol_bucket = "low"
        elif alcohol < 13.5:
            alcohol_bucket = "medium"
        else:
            alcohol_bucket = "high"

    sweetness = (
        "sweet"
        if "sweet" in style_token or "dessert" in pairing_targets or contains_any(text, SWEET_WINE_KEYWORDS)
        else "dry"
    )
    body = next(
        (
            label
            for label in ["full", "medium", "light"]
            if collect_matching_labels(text, BODY_KEYWORDS) and label in collect_matching_labels(text, BODY_KEYWORDS)
        ),
        "medium",
    )
    acidity = next(
        (
            label
            for label in ["high", "medium", "low"]
            if collect_matching_labels(text, ACIDITY_KEYWORDS)
            and label in collect_matching_labels(text, ACIDITY_KEYWORDS)
        ),
        "medium",
    )
    tannin = next(
        (
            label
            for label in ["high", "medium", "low"]
            if collect_matching_labels(text, TANNIN_KEYWORDS)
            and label in collect_matching_labels(text, TANNIN_KEYWORDS)
        ),
        "medium" if type_token == "red" else "low",
    )
    grapes = unique_tokens(wine.get("grapeVarieties", []))

    return {
        "type": type_token,
        "style": style_token,
        "flavours": unique_tokens(flavour_tokens),
        "pairing_targets": pairing_targets,
        "alcohol_bucket": alcohol_bucket,
        "sweetness": sweetness,
        "body": body,
        "acidity": acidity,
        "tannin": tannin,
        "grapes": grapes,
        "text": text,
    }


def style_pair_score(recipe_signals: dict[str, Any], wine_signals: dict[str, Any]) -> float:
    score = 0.0

    if recipe_signals["sweetness"] == "sweet" and wine_signals["sweetness"] == "sweet":
        score += 2.0

    if "fish" in recipe_signals["meat_types"] or "seafood" in recipe_signals["meat_types"]:
        if wine_signals["type"] in {"white", "rose", "sparkling"}:
            score += 1.8

    if {"beef", "lamb", "duck"} & set(recipe_signals["meat_types"]):
        if wine_signals["type"] == "red":
            score += 2.0

    if "vegetarian" in recipe_signals["categories"] and wine_signals["type"] in {
        "white",
        "rose",
        "sparkling",
    }:
        score += 0.9

    if "spicy" in recipe_signals["categories"] or recipe_signals["spice_level"] == "high":
        if wine_signals["sweetness"] == "sweet" or "fruity" in wine_signals["flavours"]:
            score += 1.1

    return score


def overlap_count(values_a: Iterable[str], values_b: Iterable[str]) -> int:
    return len(set(values_a) & set(values_b))


def build_pair_features(recipe: dict[str, Any], wine: dict[str, Any]) -> dict[str, Any]:
    recipe_signals = extract_recipe_signals(recipe)
    wine_signals = extract_wine_signals(wine)

    category_overlap = overlap_count(recipe_signals["categories"], wine_signals["pairing_targets"])
    ingredient_overlap = overlap_count(
        recipe_signals["main_ingredients"], wine_signals["pairing_targets"]
    )
    meat_overlap = overlap_count(recipe_signals["meat_types"], wine_signals["pairing_targets"])
    flavour_overlap = overlap_count(recipe_signals["main_ingredients"], wine_signals["flavours"])
    spice_overlap = overlap_count(recipe_signals["spices"], wine_signals["flavours"])
    cooking_overlap = overlap_count(recipe_signals["cooking_methods"], wine_signals["pairing_targets"])
    sauce_overlap = overlap_count(recipe_signals["sauce_types"], wine_signals["pairing_targets"])
    style_score = style_pair_score(recipe_signals, wine_signals)

    feature_row = {
        "wine_type": wine_signals["type"] or "unknown",
        "wine_style": wine_signals["style"] or "unknown",
        "wine_alcohol_bucket": wine_signals["alcohol_bucket"],
        "wine_sweetness": wine_signals["sweetness"],
        "recipe_spice_level": recipe_signals["spice_level"],
        "recipe_sweetness": recipe_signals["sweetness"],
        "recipe_category_count": len(recipe_signals["categories"]),
        "recipe_main_ingredient_count": len(recipe_signals["main_ingredients"]),
        "recipe_meat_count": len(recipe_signals["meat_types"]),
        "wine_flavour_count": len(wine_signals["flavours"]),
        "wine_pairing_target_count": len(wine_signals["pairing_targets"]),
        "category_overlap": category_overlap,
        "ingredient_overlap": ingredient_overlap,
        "meat_overlap": meat_overlap,
        "flavour_overlap": flavour_overlap,
        "spice_overlap": spice_overlap,
        "cooking_overlap": cooking_overlap,
        "sauce_overlap": sauce_overlap,
        "style_pair_score": style_score,
        "contains_dessert_category": int("dessert" in recipe_signals["categories"]),
        "contains_red_meat": int(bool({"beef", "lamb", "duck"} & set(recipe_signals["meat_types"]))),
        "contains_fish": int(bool({"fish", "seafood"} & set(recipe_signals["meat_types"]))),
        "wine_is_red": int(wine_signals["type"] == "red"),
        "wine_is_white": int(wine_signals["type"] == "white"),
        "wine_is_rose": int(wine_signals["type"] == "rose"),
        "wine_is_sparkling": int(wine_signals["type"] == "sparkling"),
        "wine_has_fruity_note": int("fruity" in wine_signals["flavours"]),
        "wine_has_spicy_note": int("spicy" in wine_signals["flavours"]),
        "wine_has_floral_note": int("floral" in wine_signals["flavours"]),
        "wine_body": wine_signals["body"],
        "wine_acidity": wine_signals["acidity"],
        "wine_tannin": wine_signals["tannin"],
    }

    for label in recipe_signals["categories"][:6]:
        feature_row[f"recipe_category__{slugify(label)}"] = 1

    for label in recipe_signals["main_ingredients"][:8]:
        feature_row[f"recipe_ingredient__{slugify(label)}"] = 1

    for label in recipe_signals["spices"][:6]:
        feature_row[f"recipe_spice__{slugify(label)}"] = 1

    for label in recipe_signals["cooking_methods"][:4]:
        feature_row[f"recipe_cooking__{slugify(label)}"] = 1

    for label in recipe_signals["textures"][:4]:
        feature_row[f"recipe_texture__{slugify(label)}"] = 1

    for label in recipe_signals["sauce_types"][:4]:
        feature_row[f"recipe_sauce__{slugify(label)}"] = 1

    for label in wine_signals["pairing_targets"][:8]:
        feature_row[f"wine_pairing_target__{slugify(label)}"] = 1

    for label in wine_signals["flavours"][:8]:
        feature_row[f"wine_flavour__{slugify(label)}"] = 1

    for label in wine_signals["grapes"][:6]:
        feature_row[f"wine_grape__{slugify(label)}"] = 1

    return feature_row


def heuristic_pair_score(recipe: dict[str, Any], wine: dict[str, Any]) -> float:
    features = build_pair_features(recipe, wine)
    return (
        features["category_overlap"] * 3.0
        + features["ingredient_overlap"] * 2.5
        + features["meat_overlap"] * 3.5
        + features["flavour_overlap"] * 1.4
        + features["spice_overlap"] * 1.5
        + features["cooking_overlap"] * 1.1
        + features["sauce_overlap"] * 1.2
        + features["style_pair_score"]
        + features["wine_has_fruity_note"] * 0.4
        + features["wine_has_spicy_note"] * 0.25
    )


def silver_label_from_score(
    score: float,
    positive_threshold: float = 4.0,
    negative_threshold: float = 1.2,
) -> tuple[str, int | None, str]:
    if score >= positive_threshold:
        return ("good", 1, "high")
    if score <= negative_threshold:
        return ("bad", 0, "high")
    return ("review", None, "medium")


def token_overlap(rule_values: Iterable[str], actual_values: Iterable[str]) -> bool:
    rule_set = {normalize_text(value) for value in rule_values if normalize_text(value)}
    actual_set = {normalize_text(value) for value in actual_values if normalize_text(value)}
    if not rule_set:
        return True
    return bool(rule_set & actual_set)


def build_rule_context(recipe: dict[str, Any], wine: dict[str, Any]) -> dict[str, list[str] | str]:
    recipe_signals = extract_recipe_signals(recipe)
    wine_signals = extract_wine_signals(wine)
    return {
        "wineTypes": [wine_signals["type"]],
        "wineStyles": [wine_signals["style"]],
        "wineFlavors": wine_signals["flavours"],
        "wineAlcoholBuckets": [wine_signals["alcohol_bucket"]],
        "wineSweetness": [wine_signals["sweetness"]],
        "winePairingTargets": wine_signals["pairing_targets"],
        "recipeCategories": recipe_signals["categories"],
        "dishTypes": recipe_signals["dish_types"],
        "mainIngredients": recipe_signals["main_ingredients"],
        "meatTypes": recipe_signals["meat_types"],
        "spiceLevels": [recipe_signals["spice_level"]],
        "foodSweetness": [recipe_signals["sweetness"]],
        "spices": recipe_signals["spices"],
        "cookingMethods": recipe_signals["cooking_methods"],
        "textures": recipe_signals["textures"],
        "sauceTypes": recipe_signals["sauce_types"],
        "wineBodies": [wine_signals["body"]],
        "wineAcidity": [wine_signals["acidity"]],
        "wineTannins": [wine_signals["tannin"]],
        "grapeVarieties": wine_signals["grapes"],
    }


def rule_matches_pair(rule: dict[str, Any], recipe: dict[str, Any], wine: dict[str, Any]) -> tuple[bool, int]:
    criteria = (rule or {}).get("criteria", {}) or {}
    context = build_rule_context(recipe, wine)
    active_checks = 0
    matched_checks = 0

    for key, actual_values in context.items():
        rule_values = criteria.get(key) or []
        normalized_rule_values = [normalize_text(value) for value in rule_values if normalize_text(value)]
        if not normalized_rule_values:
            continue

        active_checks += 1
        if token_overlap(normalized_rule_values, actual_values):
            matched_checks += 1

    return (active_checks > 0 and matched_checks == active_checks, matched_checks)


def confidence_weight(value: str) -> int:
    normalized = normalize_text(value)
    if normalized == "high":
        return 3
    if normalized == "medium":
        return 2
    return 1


def build_training_rows(
    recipes: list[dict[str, Any]],
    wines: list[dict[str, Any]],
    negative_ratio: int = 2,
    random_seed: int = 42,
) -> list[dict[str, Any]]:
    random.seed(random_seed)
    rows: list[dict[str, Any]] = []

    for recipe in recipes:
        scored_wines = []
        for wine in wines:
            heuristic_score = heuristic_pair_score(recipe, wine)
            scored_wines.append((heuristic_score, wine))

        scored_wines.sort(key=lambda item: item[0], reverse=True)
        positive_pairs = [(score, wine) for score, wine in scored_wines if score >= 2.5][:4]
        negative_candidates = [(score, wine) for score, wine in scored_wines if score < 1.0]

        for heuristic_score, wine in positive_pairs:
            features = build_pair_features(recipe, wine)
            features.update(
                {
                    "label": 1,
                    "heuristic_score": round(heuristic_score, 3),
                    "recipe_id": str(recipe["_id"]),
                    "wine_id": str(wine["_id"]),
                }
            )
            rows.append(features)

        sample_size = min(len(negative_candidates), max(len(positive_pairs) * negative_ratio, 3))
        sampled_negatives = random.sample(negative_candidates, sample_size) if sample_size else []

        for heuristic_score, wine in sampled_negatives:
            features = build_pair_features(recipe, wine)
            features.update(
                {
                    "label": 0,
                    "heuristic_score": round(heuristic_score, 3),
                    "recipe_id": str(recipe["_id"]),
                    "wine_id": str(wine["_id"]),
                }
            )
            rows.append(features)

    return rows
