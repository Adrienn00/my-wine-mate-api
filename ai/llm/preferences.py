from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from llm.common import normalize_text

def normalize_preference_values(values: Any) -> list[str]:
    if isinstance(values, list):
        source = values
    elif values in (None, "", False):
        source = []
    else:
        source = [values]
    return [normalize_text(value) for value in source if normalize_text(value)]


@dataclass
class PreferenceProfile:
    preferred_categories: set[str] = field(default_factory=set)
    preferred_meat_types: set[str] = field(default_factory=set)
    preferred_dish_types: set[str] = field(default_factory=set)
    preferred_main_ingredients: set[str] = field(default_factory=set)
    exclude_meat: bool = False
    exclude_animal_products: bool = False
    weight_category: float = 3.0
    weight_meat: float = 2.5
    weight_dish: float = 1.8
    weight_ingredient: float = 2.2
    weight_no_meat: float = 3.5
    weight_vegan: float = 4.0

    @classmethod
    def from_raw(cls, preferences: dict[str, Any] | None) -> "PreferenceProfile":
        if not preferences:
            return cls()

        categories = set(normalize_preference_values(preferences.get("recipeCategories")))
        meat_types = set(normalize_preference_values(preferences.get("recipeMeatTypes")))
        dish_types = set(normalize_preference_values(preferences.get("recipeDishTypes")))
        ingredients = set(normalize_preference_values(preferences.get("recipeMainIngredients")))
        food_preferences = set(normalize_preference_values(preferences.get("foodPreferences")))

        mappings = {
            "vegetarian": (categories, "vegetarian"),
            "vegan": (categories, "vegan"),
            "dessert": (categories, "dessert"),
            "fish": (meat_types, "fish"),
            "meaty": (categories, "meaty"),
        }
        for preference, (target, value) in mappings.items():
            if preference in food_preferences:
                target.add(value)
        if "dessert" in food_preferences:
            dish_types.add("dessert")

        return cls(
            preferred_categories=categories,
            preferred_meat_types=meat_types,
            preferred_dish_types=dish_types,
            preferred_main_ingredients=ingredients,
            exclude_meat=("vegetarian" in categories or "vegan" in categories),
            exclude_animal_products=("vegan" in categories),
        )

    @property
    def has_preferences(self) -> bool:
        return bool(
            self.preferred_categories
            or self.preferred_meat_types
            or self.preferred_dish_types
            or self.preferred_main_ingredients
            or self.exclude_meat
            or self.exclude_animal_products
        )

    def allows_recipe(self, recipe_signals: dict[str, Any]) -> bool:
        categories = {normalize_text(value) for value in recipe_signals.get("categories", [])}
        meat_types = {normalize_text(value) for value in recipe_signals.get("meat_types", [])}
        main_ingredients = {normalize_text(value) for value in recipe_signals.get("main_ingredients", [])}

        if self.exclude_meat and meat_types:
            return False
        if self.exclude_animal_products and (meat_types or {"cheese"} & main_ingredients):
            return "vegan" in categories
        return True

    def score_recipe(self, recipe_signals: dict[str, Any]) -> float:
        if not self.has_preferences:
            return 0.0

        categories = {normalize_text(value) for value in recipe_signals.get("categories", [])}
        meat_types = {normalize_text(value) for value in recipe_signals.get("meat_types", [])}
        dish_types = {normalize_text(value) for value in recipe_signals.get("dish_types", [])}
        main_ingredients = {normalize_text(value) for value in recipe_signals.get("main_ingredients", [])}

        score = 0.0
        if self.preferred_categories & categories:
            score += self.weight_category
        if self.preferred_meat_types & meat_types:
            score += self.weight_meat
        if self.preferred_dish_types & dish_types:
            score += self.weight_dish
        if self.preferred_main_ingredients & main_ingredients:
            score += self.weight_ingredient
        if self.exclude_meat and not meat_types:
            score += self.weight_no_meat
        if self.exclude_animal_products and "vegan" in categories:
            score += self.weight_vegan
        return score
