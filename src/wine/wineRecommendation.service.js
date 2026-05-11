const Wine = require("./wine.model");
const User = require("../user/user.model");
const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");

const execFileAsync = promisify(execFile);
const BACKEND_ROOT = path.resolve(__dirname, "../..");
const VENV_PYTHON_PATH = path.join(BACKEND_ROOT, ".venv", "bin", "python");
const LLM_PREFERENCE_SCRIPT_PATH = path.join(
  BACKEND_ROOT,
  "ai",
  "llm",
  "preference_wine_recommendations.py"
);

function resolvePythonExecutable() {
  if (fs.existsSync(VENV_PYTHON_PATH)) {
    return VENV_PYTHON_PATH;
  }
  return "python3";
}

function isLlmConfigured() {
  return Boolean(String(process.env.GROQ_API_KEY || "").trim());
}

function asArray(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function normalizeText(value) {
  return (value ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function resolveCatalogValue(value, catalogValues = []) {
  const clean = normalizeText(value);
  if (!clean) return "";
  if (catalogValues.includes(clean)) return clean;
  const fuzzy = catalogValues.find((item) => item.includes(clean) || clean.includes(item));
  return fuzzy || clean;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function withRecommendationMetadata(wine, type) {
  const isAi = type === "ai";
  return {
    ...wine,
    recommendationType: isAi ? "ai" : "smart",
    recommendationLabel: isAi ? "AI recommendation" : "Smart recommendation",
    recommendationSource: isAi ? "llm-mcp" : "local-scoring",
  };
}

function overlapRatio(prefValues, wineValues) {
  if (!prefValues.length || !wineValues.length) return 0;
  const wineSet = new Set(wineValues);
  const hits = prefValues.filter((value) => wineSet.has(value)).length;
  return hits / prefValues.length;
}

function alcoholBucketFromLabel(label) {
  const clean = normalizeText(label);
  if (!clean) return "";
  if (clean.includes("alacsony") || clean.includes("low")) return "low";
  if (clean.includes("kozepes") || clean.includes("medium") || clean.includes("mid")) return "medium";
  if (clean.includes("magas") || clean.includes("high")) return "high";
  return "";
}

function alcoholBucketFromValue(value) {
  const level = Number.parseFloat(value);
  if (!Number.isFinite(level)) return "";
  if (level < 11) return "low";
  if (level <= 13.5) return "medium";
  return "high";
}

function parsePriceRange(rangeText) {
  const raw = normalizeText(rangeText).replace(/\s+/g, "");
  if (!raw) return null;
  if (raw.startsWith(">")) {
    const min = Number(raw.slice(1));
    return Number.isFinite(min) ? { min, max: Infinity } : null;
  }

  const [minStr, maxStr] = raw.split("-");
  const min = Number(minStr);
  const max = Number(maxStr);
  if (Number.isFinite(min) && Number.isFinite(max)) return { min, max };
  return null;
}

function rangesOverlap(a, b) {
  if (!a || !b) return false;
  return a.min <= b.max && b.min <= a.max;
}

function priceMatchScore(prefPrices, winePrice) {
  if (!prefPrices.length || !winePrice) return 0;
  const wineRange = parsePriceRange(winePrice);
  if (!wineRange) return prefPrices.includes(normalizeText(winePrice)) ? 1 : 0;
  const hits = prefPrices.filter((prefPrice) => rangesOverlap(parsePriceRange(prefPrice), wineRange)).length;
  return hits / prefPrices.length;
}

function averageRating(wine) {
  const ratings = asArray(wine?.ratings);
  if (!ratings.length) return 0;
  const validRatings = ratings
    .map((rating) => (Number.isFinite(Number(rating?.overall)) ? Number(rating.overall) : Number(rating?.rating)))
    .filter((value) => Number.isFinite(value));

  if (!validRatings.length) return 0;
  return validRatings.reduce((sum, value) => sum + value, 0) / validRatings.length;
}

function wineSemanticTokens(wine) {
  return [
    wine.name,
    wine.winery,
    wine.description,
    ...(wine.tags || []),
    ...(wine.grapeVarieties || []),
    ...(wine.foodPairingHints || []),
    wine.style,
    wine.type,
    wine.origin?.region,
  ].flatMap((entry) =>
    normalizeText(entry)
      .split(/[^a-z0-9]+/g)
      .filter((token) => token.length > 2)
  );
}

function buildRecommendationCatalog(wines = [], preferences = {}) {
  const typeValues = wines.map((wine) => normalizeText(wine?.type));
  const styleValues = wines.map((wine) => normalizeText(wine?.style));
  const flavourValues = wines.flatMap((wine) => asArray(wine?.flavorProfiles).map(normalizeText));
  const regionValues = wines.flatMap((wine) => [wine?.origin?.region, wine?.origin?.country].map(normalizeText));
  const foodValues = wines.flatMap((wine) => asArray(wine?.foodPairingHints).map(normalizeText));
  const priceValues = wines.map((wine) => normalizeText(wine?.priceRange));

  const prefTypes = asArray(preferences.wineTypes).map(normalizeText);
  const prefStyles = asArray(preferences.style).map(normalizeText);
  const prefFlavours = asArray(preferences.flavourProfile).map(normalizeText);
  const prefRegions = asArray(preferences.regions).map(normalizeText);
  const prefFoods = asArray(preferences.foodPreferences).map(normalizeText);
  const prefPrices = asArray(preferences.priceRanges).map(normalizeText);

  return {
    types: unique([...typeValues, ...prefTypes]),
    styles: unique([...styleValues, ...prefStyles]),
    flavours: unique([...flavourValues, ...prefFlavours]),
    regions: unique([...regionValues, ...prefRegions]),
    foods: unique([...foodValues, ...prefFoods]),
    prices: unique([...priceValues, ...prefPrices]),
  };
}

function mapPrefValues(values, catalogValues) {
  return asArray(values)
    .map((value) => resolveCatalogValue(value, catalogValues))
    .filter(Boolean);
}

const WEIGHTS = {
  type: 2.5,
  style: 2,
  flavour: 2.5,
  region: 1.5,
  food: 1.8,
  price: 1.3,
  alcohol: 1.1,
  year: 0.9,
  semantic: 1.4,
};

function buildPreferenceContext(preferences, catalog) {
  const prefTypes = mapPrefValues(preferences.wineTypes, catalog.types);
  const prefStyles = mapPrefValues(preferences.style, catalog.styles);
  const prefFlavours = mapPrefValues(preferences.flavourProfile, catalog.flavours);
  const prefRegions = mapPrefValues(preferences.regions, catalog.regions);
  const prefFood = mapPrefValues(preferences.foodPreferences, catalog.foods);
  const prefPrices = mapPrefValues(preferences.priceRanges, catalog.prices);
  const prefAlcoholBuckets = asArray(preferences.alcoholLevels).map(alcoholBucketFromLabel).filter(Boolean);
  const prefYear = normalizeText(preferences.wineYears);

  const prefSemanticTokens = new Set(
    [...prefTypes, ...prefStyles, ...prefFlavours, ...prefRegions, ...prefFood, ...prefPrices, prefYear].filter(
      (token) => token && token.length > 2
    )
  );

  const hasAnyPreference =
    prefTypes.length ||
    prefStyles.length ||
    prefFlavours.length ||
    prefRegions.length ||
    prefFood.length ||
    prefPrices.length ||
    prefAlcoholBuckets.length ||
    !!prefYear;

  const maxScore =
    (prefTypes.length ? WEIGHTS.type : 0) +
    (prefStyles.length ? WEIGHTS.style : 0) +
    (prefFlavours.length ? WEIGHTS.flavour : 0) +
    (prefRegions.length ? WEIGHTS.region : 0) +
    (prefFood.length ? WEIGHTS.food : 0) +
    (prefPrices.length ? WEIGHTS.price : 0) +
    (prefAlcoholBuckets.length ? WEIGHTS.alcohol : 0) +
    (prefYear ? WEIGHTS.year : 0) +
    (prefSemanticTokens.size ? WEIGHTS.semantic : 0);

  return {
    prefTypes,
    prefStyles,
    prefFlavours,
    prefRegions,
    prefFood,
    prefPrices,
    prefAlcoholBuckets,
    prefYear,
    prefSemanticTokens,
    maxScore,
    hasAnyPreference,
  };
}

function scoreWine(wine, catalog, context) {
  let score = 0;
  const reasons = [];

  const wineType = resolveCatalogValue(wine.type, catalog.types);
  const wineStyle = resolveCatalogValue(wine.style, catalog.styles);
  const wineFlavours = mapPrefValues(wine.flavorProfiles, catalog.flavours);
  const wineRegions = mapPrefValues([wine.origin?.region, wine.origin?.country], catalog.regions);
  const wineFood = mapPrefValues(wine.foodPairingHints, catalog.foods);
  const winePrice = resolveCatalogValue(wine.priceRange, catalog.prices);
  const wineAlcohol = alcoholBucketFromValue(wine.alcohol);

  const typeScore = context.prefTypes.includes(wineType) ? 1 : 0;
  if (typeScore) {
    score += WEIGHTS.type;
    reasons.push(`Type match: ${wine.type}`);
  }

  const styleScore = context.prefStyles.includes(wineStyle) ? 1 : 0;
  if (styleScore) {
    score += WEIGHTS.style;
    reasons.push(`Style match: ${wine.style}`);
  }

  const flavourScore = overlapRatio(context.prefFlavours, wineFlavours);
  if (flavourScore) {
    score += WEIGHTS.flavour * flavourScore;
    reasons.push("Flavor profile matches your taste");
  }

  const regionScore = overlapRatio(context.prefRegions, wineRegions);
  if (regionScore) {
    score += WEIGHTS.region * regionScore;
    reasons.push(`Region match: ${wine.origin?.region || wine.origin?.country}`);
  }

  const foodScore = overlapRatio(context.prefFood, wineFood);
  if (foodScore) {
    score += WEIGHTS.food * foodScore;
    reasons.push("Fits your food preferences");
  }

  const priceScore = priceMatchScore(context.prefPrices, winePrice);
  if (priceScore) {
    score += WEIGHTS.price * priceScore;
    reasons.push(`Price range match: ${wine.priceRange}`);
  }

  if (context.prefAlcoholBuckets.includes(wineAlcohol)) {
    score += WEIGHTS.alcohol;
    reasons.push("Alcohol level matches");
  }

  if (context.prefYear && wine.year) {
    const preferredYear = Number(context.prefYear);
    const wineYear = Number(wine.year);
    let yearScore = 0;

    if (Number.isFinite(preferredYear) && Number.isFinite(wineYear)) {
      const yearDiff = Math.abs(preferredYear - wineYear);
      yearScore = yearDiff === 0 ? 1 : yearDiff === 1 ? 0.6 : 0;
    } else if (normalizeText(wine.year).includes(context.prefYear)) {
      yearScore = 0.6;
    }

    if (yearScore) {
      score += WEIGHTS.year * yearScore;
      reasons.push(`Vintage is close: ${wine.year}`);
    }
  }

  const tokens = new Set(wineSemanticTokens(wine));
  const semanticHits = [...context.prefSemanticTokens].filter((token) => tokens.has(token)).length;
  const semanticScore = context.prefSemanticTokens.size ? semanticHits / context.prefSemanticTokens.size : 0;
  if (semanticScore) {
    score += WEIGHTS.semantic * clamp(semanticScore * 1.8);
    reasons.push("Description and tags also align well");
  }

  const matchPercent = context.maxScore ? Math.round(clamp(score / context.maxScore) * 100) : 0;

  return {
    ...withRecommendationMetadata(wine.toObject(), "smart"),
    score,
    matchPercent,
    reasons,
  };
}

function buildFallbackRecommendations(wines, limit) {
  return wines
    .map((wine) => {
      const rating = averageRating(wine);
      const ratingPercent = Math.round((rating / 5) * 100);
      return {
        ...withRecommendationMetadata(wine.toObject(), "smart"),
        score: rating,
        matchPercent: ratingPercent,
        reasons: rating ? ["Popular among users"] : ["Generally recommended choice"],
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

async function getEffectivePreferences({ userId = null, preferences = null } = {}) {
  let effectivePreferences = preferences;

  if ((!effectivePreferences || !Object.keys(effectivePreferences).length) && userId) {
    const user = await User.findById(userId).select("preferences");
    effectivePreferences = user?.preferences || {};
  }

  return effectivePreferences || {};
}

async function getLlmMcpWineRecommendations({ preferences = {}, limit = 6 } = {}) {
  if (!isLlmConfigured()) {
    throw new Error("LLM recommender is not configured. Set GROQ_API_KEY.");
  }

  if (!fs.existsSync(LLM_PREFERENCE_SCRIPT_PATH)) {
    throw new Error("LLM preference recommender script not found.");
  }

  const pythonExecutable = resolvePythonExecutable();
  const args = [
    LLM_PREFERENCE_SCRIPT_PATH,
    "--top-k",
    String(limit),
    "--max-candidates",
    String(Math.max(limit, 25)),
    "--preferences-json",
    JSON.stringify(preferences || {}),
  ];

  const { stdout, stderr } = await execFileAsync(pythonExecutable, args, {
    cwd: BACKEND_ROOT,
    timeout: 120000,
  });

  const rawOutput = String(stdout || "").trim();
  if (!rawOutput) {
    throw new Error(String(stderr || "The LLM preference recommender returned no output.").trim());
  }

  const parsed = JSON.parse(rawOutput);
  return Array.isArray(parsed?.results)
    ? parsed.results.map((wine) => withRecommendationMetadata(wine, "ai"))
    : [];
}

async function recommendWinesForPreferences({ userId = null, preferences = null, limit = 6 } = {}) {
  const effectivePreferences = await getEffectivePreferences({ userId, preferences });

  if (isLlmConfigured()) {
    try {
      const llmRecommendations = await getLlmMcpWineRecommendations({
        preferences: effectivePreferences,
        limit,
      });
      if (llmRecommendations.length) {
        return llmRecommendations;
      }
    } catch (error) {
      console.warn("LLM/MCP wine recommendation failed, falling back to local scoring:", error.message);
    }
  }

  const confirmedWines = await Wine.find({ is_confirmed: true });
  const catalog = buildRecommendationCatalog(confirmedWines, effectivePreferences || {});
  const context = buildPreferenceContext(effectivePreferences || {}, catalog);

  if (!context.hasAnyPreference) {
    return buildFallbackRecommendations(confirmedWines, limit);
  }

  return confirmedWines
    .map((wine) => scoreWine(wine, catalog, context))
    .filter((wine) => wine.score > 0.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

async function buildPersonalRecommendations({ effectivePreferences, confirmedWines, catalog, context, limit }) {
  if (isLlmConfigured()) {
    try {
      const llmResults = await getLlmMcpWineRecommendations({ preferences: effectivePreferences, limit });
      if (llmResults.length) return llmResults;
    } catch (error) {
      console.warn("LLM preference recommendation failed in split, falling back to local scoring:", error.message);
    }
  }

  return confirmedWines
    .map((wine) => scoreWine(wine, catalog, context))
    .filter((wine) => wine.score > 0.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

async function recommendWinesSplit({ userId = null, preferences = null, limit = 6 } = {}) {
  const effectivePreferences = await getEffectivePreferences({ userId, preferences });

  const confirmedWines = await Wine.find({ is_confirmed: true });
  const catalog = buildRecommendationCatalog(confirmedWines, effectivePreferences || {});
  const context = buildPreferenceContext(effectivePreferences || {}, catalog);

  const general = buildFallbackRecommendations(confirmedWines, limit);

  if (!context.hasAnyPreference) {
    return { personal: [], general, hasPreferences: false };
  }

  const personal = await buildPersonalRecommendations({
    effectivePreferences,
    confirmedWines,
    catalog,
    context,
    limit,
  });

  const personalIds = new Set(personal.map((w) => String(w._id)));
  const filteredGeneral = general.filter((w) => !personalIds.has(String(w._id))).slice(0, limit);

  return { personal, general: filteredGeneral, hasPreferences: true };
}

module.exports = {
  recommendWinesForPreferences,
  recommendWinesSplit,
};
