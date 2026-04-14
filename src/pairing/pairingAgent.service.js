const Recipe = require("../recipe/recipe.model");
const User = require("../user/user.model");
const Wine = require("../wine/wine.model");

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function asArray(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function tokenize(values) {
  return unique(
    asArray(values).flatMap((value) =>
      normalizeText(value)
        .split(/[^a-z0-9]+/g)
        .filter((token) => token.length > 2)
    )
  );
}

function overlapCount(left, right) {
  if (!left.length || !right.length) return 0;
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item)).length;
}

function inferIntent(message) {
  const text = normalizeText(message);
  const wineWords = ["wine", "bor", "red", "white", "rose", "sparkling", "dry", "sweet", "fruity"];
  const recipeWords = ["recipe", "recept", "food", "meal", "dish", "etel", "etelek", "dinner", "lunch"];

  const wantsWine = wineWords.some((word) => text.includes(word));
  const wantsRecipe = recipeWords.some((word) => text.includes(word));

  return {
    wantsWine: wantsWine || !wantsRecipe,
    wantsRecipe: wantsRecipe || !wantsWine,
  };
}

function normalizePreferences(preferences = {}) {
  return {
    wineTypes: asArray(preferences.wineTypes).map(normalizeText),
    wineStyles: asArray(preferences.style).map(normalizeText),
    wineFlavours: asArray(preferences.flavourProfile).map(normalizeText),
    wineRegions: asArray(preferences.regions).map(normalizeText),
    wineAlcoholLevels: asArray(preferences.alcoholLevels).map(normalizeText),
    wineFoods: asArray(preferences.foodPreferences).map(normalizeText),
    winePrices: asArray(preferences.priceRanges).map(normalizeText),
    wineYear: normalizeText(preferences.wineYears),
    recipeCategories: asArray(preferences.recipeCategories).map(normalizeText),
    recipeMeatTypes: asArray(preferences.recipeMeatTypes).map(normalizeText),
    recipeDishTypes: asArray(preferences.recipeDishTypes).map(normalizeText),
    recipeMainIngredients: asArray(preferences.recipeMainIngredients).map(normalizeText),
    foodPreferences: asArray(preferences.foodPreferences).map(normalizeText),
  };
}

function wineTokens(wine) {
  return tokenize([
    wine.name,
    wine.winery,
    wine.description,
    wine.type,
    wine.style,
    ...(wine.flavorProfiles || []),
    ...(wine.grapeVarieties || []),
    ...(wine.foodPairingHints || []),
    ...(wine.tags || []),
    wine.origin?.country,
    wine.origin?.region,
    wine.year,
    wine.priceRange,
  ]);
}

function recipeTokens(recipe) {
  return tokenize([
    recipe.name,
    ...(recipe.ingredients || []),
    ...(recipe.instructions || []),
    ...(recipe.recipeCategories || []),
    ...(recipe.tags || []),
    ...(recipe.winePairingHints || []),
  ]);
}

function scoreWineAgainstQueryAndPreferences(wine, queryTokens, preferences) {
  const tokens = wineTokens(wine);
  const queryHits = overlapCount(queryTokens, tokens);
  let score = queryHits * 2.2;
  const reasons = [];

  if (queryHits) {
    reasons.push("Matches your request keywords.");
  }

  const type = normalizeText(wine.type);
  const style = normalizeText(wine.style);
  const flavours = (wine.flavorProfiles || []).map(normalizeText);
  const regions = [normalizeText(wine.origin?.country), normalizeText(wine.origin?.region)];
  const foods = (wine.foodPairingHints || []).map(normalizeText);
  const priceRange = normalizeText(wine.priceRange);
  const year = normalizeText(wine.year);

  if (preferences.wineTypes.includes(type)) {
    score += 2.6;
    reasons.push("Matches your preferred wine type.");
  }
  if (preferences.wineStyles.includes(style)) {
    score += 2.1;
    reasons.push("Fits your preferred wine style.");
  }
  if (overlapCount(preferences.wineFlavours, flavours)) {
    score += 2.4;
    reasons.push("Includes flavor notes you like.");
  }
  if (overlapCount(preferences.wineRegions, regions)) {
    score += 1.5;
    reasons.push("Comes from a preferred region.");
  }
  if (overlapCount(preferences.wineFoods, foods)) {
    score += 1.7;
    reasons.push("Fits your food preferences.");
  }
  if (preferences.winePrices.includes(priceRange)) {
    score += 1.0;
    reasons.push("Matches your preferred price range.");
  }
  if (preferences.wineYear && year && year.includes(preferences.wineYear)) {
    score += 0.8;
    reasons.push("Vintage is close to your preference.");
  }

  return {
    ...wine,
    score,
    reason: reasons[0] || "Relevant wine from your database.",
  };
}

function scoreRecipeAgainstQueryAndPreferences(recipe, queryTokens, preferences, selectedWines = []) {
  const tokens = recipeTokens(recipe);
  const queryHits = overlapCount(queryTokens, tokens);
  let score = queryHits * 2.0;
  const reasons = [];

  if (queryHits) {
    reasons.push("Matches your request keywords.");
  }

  const categories = (recipe.recipeCategories || []).map(normalizeText);
  const ingredients = (recipe.ingredients || []).map(normalizeText);
  const hints = (recipe.winePairingHints || []).map(normalizeText);

  if (overlapCount(preferences.recipeCategories, categories)) {
    score += 2.4;
    reasons.push("Matches your preferred recipe categories.");
  }
  if (overlapCount(preferences.recipeMainIngredients, ingredients)) {
    score += 2.0;
    reasons.push("Uses ingredients you prefer.");
  }
  if (preferences.foodPreferences.includes("vegetarian") && !ingredients.some((item) =>
    ["beef", "pork", "lamb", "duck", "chicken", "turkey", "fish", "salmon", "tuna", "shrimp", "prawn"].includes(item)
  )) {
    score += 2.0;
    reasons.push("Works with a vegetarian preference.");
  }
  if (preferences.foodPreferences.includes("vegan") && categories.includes("vegan")) {
    score += 2.5;
    reasons.push("Works with a vegan preference.");
  }

  if (selectedWines.length) {
    const winePairingTokens = unique(
      selectedWines.flatMap((wine) => [
        ...(wine.foodPairingHints || []).map(normalizeText),
        ...(wine.flavorProfiles || []).map(normalizeText),
        normalizeText(wine.type),
        normalizeText(wine.style),
      ])
    );
    const pairHits = overlapCount([...ingredients, ...categories, ...hints], winePairingTokens);
    if (pairHits) {
      score += pairHits * 1.6;
      reasons.push("Looks like a good fit for the recommended wines.");
    }
  }

  return {
    ...recipe,
    score,
    reason: reasons[0] || "Relevant recipe from your database.",
  };
}

function summarizeWine(wine) {
  return {
    wine_id: String(wine._id),
    wine_name: wine.name || "",
    type: wine.type || "",
    style: wine.style || "",
    foodPairingHints: wine.foodPairingHints || [],
    flavorProfiles: wine.flavorProfiles || [],
    reason: wine.reason || "",
    match_score: Math.max(0.5, Math.min(0.99, Number((wine.score || 0) / 10).toFixed(2))),
  };
}

function summarizeRecipe(recipe) {
  return {
    recipe_id: String(recipe._id),
    recipe_name: recipe.name || "",
    categories: recipe.recipeCategories || [],
    ingredients: (recipe.ingredients || []).slice(0, 8),
    winePairingHints: recipe.winePairingHints || [],
    reason: recipe.reason || "",
    match_score: Math.max(0.5, Math.min(0.99, Number((recipe.score || 0) / 10).toFixed(2))),
  };
}

function buildReply({ message, wines, recipes, preferencesApplied }) {
  const parts = [];
  parts.push(`I searched your own database for: "${message}".`);

  if (wines.length) {
    parts.push(`Top wine picks: ${wines.slice(0, 3).map((wine) => wine.wine_name).join(", ")}.`);
  }
  if (recipes.length) {
    parts.push(`Best matching recipes: ${recipes.slice(0, 3).map((recipe) => recipe.recipe_name).join(", ")}.`);
  }
  if (preferencesApplied) {
    parts.push("Your saved preferences were also taken into account.");
  }

  return parts.join(" ");
}

async function searchConversationalPairings({ message, userId = null, topK = 5 }) {
  const cleanMessage = String(message || "").trim();
  if (!cleanMessage) {
    throw new Error("Pass a message.");
  }

  const [wines, recipes, user] = await Promise.all([
    Wine.find({ is_confirmed: true, status: { $ne: "rejected" } }).lean(),
    Recipe.find({ is_confirmed: true, status: { $ne: "rejected" } }).lean(),
    userId ? User.findById(userId).select("preferences").lean() : null,
  ]);

  const preferences = normalizePreferences(user?.preferences || {});
  const queryTokens = tokenize(cleanMessage);
  const intent = inferIntent(cleanMessage);

  const rankedWines = wines
    .map((wine) => scoreWineAgainstQueryAndPreferences(wine, queryTokens, preferences))
    .filter((wine) => wine.score > 0)
    .sort((left, right) => right.score - left.score);

  const selectedWines = rankedWines.slice(0, Math.max(topK, 3));

  const rankedRecipes = recipes
    .map((recipe) => scoreRecipeAgainstQueryAndPreferences(recipe, queryTokens, preferences, selectedWines))
    .filter((recipe) => recipe.score > 0)
    .sort((left, right) => right.score - left.score);

  const responseWines = intent.wantsWine ? selectedWines.slice(0, topK).map(summarizeWine) : [];
  const responseRecipes = intent.wantsRecipe ? rankedRecipes.slice(0, topK).map(summarizeRecipe) : [];

  return {
    mode: "conversation_search",
    source: "mongodb:hybrid-search",
    intent,
    preferencesApplied: Boolean(user?.preferences && Object.keys(user.preferences).length),
    wines: responseWines,
    recipes: responseRecipes,
    reply: buildReply({
      message: cleanMessage,
      wines: responseWines,
      recipes: responseRecipes,
      preferencesApplied: Boolean(user?.preferences && Object.keys(user.preferences).length),
    }),
  };
}

module.exports = {
  searchConversationalPairings,
};
