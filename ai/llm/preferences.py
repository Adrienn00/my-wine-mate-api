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


@dataclass
class WinePreferenceProfile:
    preferred_types: set[str] = field(default_factory=set)
    preferred_styles: set[str] = field(default_factory=set)
    preferred_flavours: set[str] = field(default_factory=set)
    preferred_regions: set[str] = field(default_factory=set)
    preferred_alcohol_levels: set[str] = field(default_factory=set)
    preferred_foods: set[str] = field(default_factory=set)
    preferred_price_ranges: set[str] = field(default_factory=set)
    preferred_year: str = ""
    weight_type: float = 2.6
    weight_style: float = 2.2
    weight_flavour: float = 2.4
    weight_region: float = 1.4
    weight_alcohol: float = 1.0
    weight_food: float = 1.6

    @classmethod
    def from_raw(cls, preferences: dict[str, Any] | None) -> "WinePreferenceProfile":
        if not preferences:
            return cls()

        return cls(
            preferred_types=set(normalize_preference_values(preferences.get("wineTypes"))),
            preferred_styles=set(normalize_preference_values(preferences.get("style"))),
            preferred_flavours=set(normalize_preference_values(preferences.get("flavourProfile"))),
            preferred_regions=set(normalize_preference_values(preferences.get("regions"))),
            preferred_alcohol_levels=set(normalize_preference_values(preferences.get("alcoholLevels"))),
            preferred_foods=set(normalize_preference_values(preferences.get("foodPreferences"))),
            preferred_price_ranges=set(normalize_preference_values(preferences.get("priceRanges"))),
            preferred_year=normalize_text(preferences.get("wineYears")),
        )

    @property
    def has_preferences(self) -> bool:
        return bool(
            self.preferred_types
            or self.preferred_styles
            or self.preferred_flavours
            or self.preferred_regions
            or self.preferred_alcohol_levels
            or self.preferred_foods
            or self.preferred_price_ranges
            or self.preferred_year
        )
