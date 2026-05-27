require("dotenv").config();

const Recipe = require("../recipe/recipe.model");
const Wine = require("../wine/wine.model");
const PairingRule = require("./pairing.model");
const PairingFeedback = require("./pairingFeedback.model");

const GROQ_API_URL = process.env.GROQ_API_URL || "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-20b";
const DEFAULT_CANDIDATE_LIMIT = 12;
const DEFAULT_RULE_LIMIT = 20;

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

function averageRating(entity) {
  const ratings = asArray(entity?.ratings);
  if (!ratings.length) return 0;

  const values = ratings
    .map((rating) => Number(rating?.overall ?? rating?.rating))
    .filter((value) => Number.isFinite(value));

  if (!values.length) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function recipeSignalTokens(recipe) {
  return tokenize([
    recipe?.name,
    ...(recipe?.ingredients || []),
    ...(recipe?.recipeCategories || []),
    ...(recipe?.tags || []),
    ...(recipe?.winePairingHints || []),
  ]);
}

function wineSignalTokens(wine) {
  return tokenize([
    wine?.name,
    wine?.winery,
    wine?.description,
    wine?.type,
    wine?.style,
    ...(wine?.flavorProfiles || []),
    ...(wine?.grapeVarieties || []),
    ...(wine?.foodPairingHints || []),
    ...(wine?.tags || []),
    wine?.origin?.country,
    wine?.origin?.region,
  ]);
}

function summarizeRecipe(recipe) {
  return {
    id: String(recipe._id),
    name: recipe.name || "",
    recipeCategories: recipe.recipeCategories || [],
    ingredients: (recipe.ingredients || []).slice(0, 12),
    tags: recipe.tags || [],
    winePairingHints: recipe.winePairingHints || [],
    averageRating: averageRating(recipe),
  };
}

function summarizeWine(wine) {
  return {
    id: String(wine._id),
    name: wine.name || "",
    winery: wine.winery || "",
    type: wine.type || "",
    style: wine.style || "",
    flavorProfiles: wine.flavorProfiles || [],
    grapeVarieties: wine.grapeVarieties || [],
    foodPairingHints: wine.foodPairingHints || [],
    tags: wine.tags || [],
    alcohol: wine.alcohol ?? null,
    averageRating: averageRating(wine),
    origin: {
      country: wine.origin?.country || "",
      region: wine.origin?.region || "",
    },
  };
}

function summarizeRule(rule) {
  return {
    id: String(rule._id),
    name: rule.name,
    label: rule.label,
    confidence: rule.confidence,
    score: rule.score,
    description: rule.description || "",
    notes: rule.notes || "",
    criteria: rule.criteria || {},
    examples: rule.examples || {},
  };
}

function buildRecipeToWineCandidateScore(recipe, wine, feedbackSummary) {
  const recipeTokens = recipeSignalTokens(recipe);
  const wineTokens = wineSignalTokens(wine);
  const overlap = overlapCount(recipeTokens, wineTokens);
  const feedback = feedbackSummary.get(String(wine._id)) || { good: 0, bad: 0 };
  return overlap * 3 + feedback.good * 2 - feedback.bad * 2 + averageRating(wine);
}

function buildWineToRecipeCandidateScore(wine, recipe, feedbackSummary) {
  const wineTokens = wineSignalTokens(wine);
  const recipeTokens = recipeSignalTokens(recipe);
  const overlap = overlapCount(wineTokens, recipeTokens);
  const feedback = feedbackSummary.get(String(recipe._id)) || { good: 0, bad: 0 };
  return overlap * 3 + feedback.good * 2 - feedback.bad * 2 + averageRating(recipe);
}

function collectRuleTokens(rule) {
  return tokenize([
    rule.name,
    rule.description,
    rule.notes,
    ...(rule.criteria?.wineTypes || []),
    ...(rule.criteria?.wineStyles || []),
    ...(rule.criteria?.wineFlavors || []),
    ...(rule.criteria?.winePairingTargets || []),
    ...(rule.criteria?.recipeCategories || []),
    ...(rule.criteria?.dishTypes || []),
    ...(rule.criteria?.mainIngredients || []),
    ...(rule.criteria?.meatTypes || []),
    ...(rule.criteria?.spiceLevels || []),
    ...(rule.criteria?.foodSweetness || []),
    ...(rule.criteria?.spices || []),
    ...(rule.criteria?.cookingMethods || []),
    ...(rule.criteria?.textures || []),
    ...(rule.criteria?.sauceTypes || []),
    ...(rule.criteria?.grapeVarieties || []),
    ...(rule.examples?.wines || []),
    ...(rule.examples?.foods || []),
  ]);
}

function selectRelevantRules(entity, rules) {
  const entityTokens =
    entity.kind === "recipe" ? recipeSignalTokens(entity.data) : wineSignalTokens(entity.data);

  return rules
    .map((rule) => ({
      rule,
      matchScore: overlapCount(entityTokens, collectRuleTokens(rule)),
    }))
    .sort((left, right) => {
      if (right.matchScore !== left.matchScore) return right.matchScore - left.matchScore;
      if (right.rule.score !== left.rule.score) return right.rule.score - left.rule.score;
      return 0;
    })
    .slice(0, DEFAULT_RULE_LIMIT)
    .map(({ rule }) => summarizeRule(rule));
}

async function getFeedbackSummaryForRecipe(recipeId) {
  const rows = await PairingFeedback.aggregate([
    { $match: { recipeId } },
    {
      $group: {
        _id: "$wineId",
        good: {
          $sum: {
            $cond: [{ $eq: ["$feedback", "good"] }, 1, 0],
          },
        },
        bad: {
          $sum: {
            $cond: [{ $eq: ["$feedback", "bad"] }, 1, 0],
          },
        },
      },
    },
  ]);

  return new Map(rows.map((row) => [String(row._id), { good: row.good, bad: row.bad }]));
}

async function getFeedbackSummaryForWine(wineId) {
  const rows = await PairingFeedback.aggregate([
    { $match: { wineId } },
    {
      $group: {
        _id: "$recipeId",
        good: {
          $sum: {
            $cond: [{ $eq: ["$feedback", "good"] }, 1, 0],
          },
        },
        bad: {
          $sum: {
            $cond: [{ $eq: ["$feedback", "bad"] }, 1, 0],
          },
        },
      },
    },
  ]);

  return new Map(rows.map((row) => [String(row._id), { good: row.good, bad: row.bad }]));
}

function buildSystemPrompt(topK) {
  return [
    "You are a wine and food pairing assistant.",
    "You must only recommend from the provided candidate list.",
    `Return exactly ${topK} items or fewer if the candidate list is smaller.`,
    "Never invent wines, recipes, ids, styles, or reasons not grounded in the provided data.",
    "Prefer candidates supported by candidate attributes, pairing rules, and positive feedback.",
    "Avoid candidates with strong negative feedback unless there are no better options.",
    "Return strict JSON only, without markdown fences.",
    "The JSON shape must be:",
    '{ "results": [ { "id": "...", "score": 0.0-1.0, "reason": "...", "ruleMatches": ["..."] } ] }',
  ].join(" ");
}

function buildUserPrompt(payload) {
  return JSON.stringify(payload, null, 2);
}

function safeJsonParse(rawText) {
  try {
    return JSON.parse(rawText);
  } catch (error) {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) throw error;
    return JSON.parse(match[0]);
  }
}

function normalizeLlmResults({ mode, llmPayload, entityMap, topK }) {
  const normalized = asArray(llmPayload?.results)
    .map((item = {}) => {
      const sourceEntity = entityMap.get(String(item.id || ""));
      if (!sourceEntity) return null;

      if (mode === "recipe_to_wine") {
        return {
          wine_id: sourceEntity.id,
          wine_name: sourceEntity.name,
          probability: Math.max(0, Math.min(0.9999, Number(item.score) || 0.5)),
          type: sourceEntity.type || "",
          style: sourceEntity.style || "",
          reason: String(item.reason || "").trim(),
          rule_matches: asArray(item.ruleMatches).map(String).filter(Boolean).slice(0, 3),
          source: "llm",
        };
      }

      return {
        recipe_id: sourceEntity.id,
        recipe_name: sourceEntity.name,
        probability: Math.max(0, Math.min(0.9999, Number(item.score) || 0.5)),
        categories: sourceEntity.recipeCategories || [],
        reason: String(item.reason || "").trim(),
        rule_matches: asArray(item.ruleMatches).map(String).filter(Boolean).slice(0, 3),
        source: "llm",
      };
    })
    .filter(Boolean)
    .slice(0, topK);

  if (!normalized.length) {
    throw new Error("LLM returned no valid pairing results.");
  }

  return normalized;
}

function isLlmConfigured() {
  return Boolean(String(process.env.GROQ_API_KEY || "").trim());
}

async function requestLlmJson({ systemPrompt, userPrompt }) {
  const apiKey = String(process.env.GROQ_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("No LLM API key is configured. Set GROQ_API_KEY.");
  }

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      temperature: 0.2,
      response_format: {
        type: "json_object",
      },
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM request failed (${response.status}): ${errorText}`);
  }

  const responseJson = await response.json();
  const rawText = String(responseJson?.choices?.[0]?.message?.content || "").trim();
  if (!rawText) {
    throw new Error("LLM response did not contain text output.");
  }

  return safeJsonParse(rawText);
}

async function getRecipeToWineRecommendations(recipeId, topK) {
  const recipe = await Recipe.findById(recipeId).lean();
  if (!recipe) throw new Error("Recipe not found.");

  const [wines, rules, feedbackSummary] = await Promise.all([
    Wine.find({ is_confirmed: true, status: { $ne: "rejected" } }).lean(),
    PairingRule.find({ active: true }).sort({ score: -1, confidence: -1, createdAt: -1 }).lean(),
    getFeedbackSummaryForRecipe(recipe._id),
  ]);

  const candidateWines = wines
    .map((wine) => ({
      wine,
      candidateScore: buildRecipeToWineCandidateScore(recipe, wine, feedbackSummary),
    }))
    .sort((left, right) => right.candidateScore - left.candidateScore)
    .slice(0, Math.max(topK, DEFAULT_CANDIDATE_LIMIT))
    .map(({ wine }) => summarizeWine(wine));

  const relevantRules = selectRelevantRules({ kind: "recipe", data: recipe }, rules);
  const entityMap = new Map(candidateWines.map((wine) => [wine.id, wine]));

  const llmPayload = await requestLlmJson({
    systemPrompt: buildSystemPrompt(topK),
    userPrompt: buildUserPrompt({
      mode: "recipe_to_wine",
      requestedTopK: topK,
      selectedRecipe: summarizeRecipe(recipe),
      candidateWines,
      relevantRules,
      feedbackHint:
        "Candidate wines were pre-ranked with DB overlap, ratings, and user feedback. Use that as a hint, not a hard rule.",
    }),
  });

  return {
    mode: "recipe_to_wine",
    engine: "llm",
    model: DEFAULT_MODEL,
    results: normalizeLlmResults({
      mode: "recipe_to_wine",
      llmPayload,
      entityMap,
      topK,
    }),
  };
}

async function getWineToRecipeRecommendations(wineId, topK) {
  const wine = await Wine.findById(wineId).lean();
  if (!wine) throw new Error("Wine not found.");

  const [recipes, rules, feedbackSummary] = await Promise.all([
    Recipe.find({ is_confirmed: true, status: { $ne: "rejected" } }).lean(),
    PairingRule.find({ active: true }).sort({ score: -1, confidence: -1, createdAt: -1 }).lean(),
    getFeedbackSummaryForWine(wine._id),
  ]);

  const candidateRecipes = recipes
    .map((recipe) => ({
      recipe,
      candidateScore: buildWineToRecipeCandidateScore(wine, recipe, feedbackSummary),
    }))
    .sort((left, right) => right.candidateScore - left.candidateScore)
    .slice(0, Math.max(topK, DEFAULT_CANDIDATE_LIMIT))
    .map(({ recipe }) => summarizeRecipe(recipe));

  const relevantRules = selectRelevantRules({ kind: "wine", data: wine }, rules);
  const entityMap = new Map(candidateRecipes.map((recipe) => [recipe.id, recipe]));

  const llmPayload = await requestLlmJson({
    systemPrompt: buildSystemPrompt(topK),
    userPrompt: buildUserPrompt({
      mode: "wine_to_recipe",
      requestedTopK: topK,
      selectedWine: summarizeWine(wine),
      candidateRecipes,
      relevantRules,
      feedbackHint:
        "Candidate recipes were pre-ranked with DB overlap, ratings, and user feedback. Use that as a hint, not a hard rule.",
    }),
  });

  return {
    mode: "wine_to_recipe",
    engine: "llm",
    model: DEFAULT_MODEL,
    results: normalizeLlmResults({
      mode: "wine_to_recipe",
      llmPayload,
      entityMap,
      topK,
    }),
  };
}

async function getLlmPairingRecommendations({ recipeId, wineId, topK = 5 }) {
  if (Boolean(recipeId) === Boolean(wineId)) {
    throw new Error("Pass exactly one of recipeId or wineId.");
  }

  if (recipeId) {
    return getRecipeToWineRecommendations(recipeId, topK);
  }

  return getWineToRecipeRecommendations(wineId, topK);
}

module.exports = {
  isLlmConfigured,
  getLlmPairingRecommendations,
};
