const PairingRule = require("./pairing.model");
const PairingFeedback = require("./pairingFeedback.model");
const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { getLlmPairingRecommendations, isLlmConfigured } = require("./pairingLlm.service");

const execFileAsync = promisify(execFile);
const BACKEND_ROOT = path.resolve(__dirname, "../..");
const AI_SCRIPT_PATH = path.join(BACKEND_ROOT, "ai", "recommend_pairings.py");
const VENV_PYTHON_PATH = path.join(BACKEND_ROOT, ".venv", "bin", "python");
const MODEL_PATH = path.join(BACKEND_ROOT, "ai", "artifacts", "xgboost_pairing_model.joblib");

function resolvePythonExecutable() {
  if (fs.existsSync(VENV_PYTHON_PATH)) {
    return VENV_PYTHON_PATH;
  }
  return "python3";
}

async function getAllPairingRules() {
  return await PairingRule.find().sort({ score: -1, confidence: -1, createdAt: -1 });
}

async function getActivePairingRules() {
  return await PairingRule.find({ active: true }).sort({ score: -1, confidence: -1, createdAt: -1 });
}

async function addPairingRule(payload) {
  const rule = new PairingRule(payload);
  await rule.save();
  return rule;
}

async function updatePairingRule(id, payload) {
  const { _id, __v, ...cleanedPayload } = payload;
  const updatedRule = await PairingRule.findByIdAndUpdate(id, cleanedPayload, {
    new: true,
    runValidators: true,
  });

  if (!updatedRule) {
    throw new Error("pairing rule not found");
  }

  return updatedRule;
}

async function deletePairingRule(id) {
  const result = await PairingRule.deleteOne({ _id: id });
  return result.deletedCount > 0;
}

async function getAiRecommendations({ recipeId, wineId, topK = 5 }) {
  if (Boolean(recipeId) === Boolean(wineId)) {
    throw new Error("Pass exactly one of recipeId or wineId.");
  }

  return getAiRecommendationsByEngine({
    recipeId,
    wineId,
    topK,
    engine: "auto",
  });
}

function normalizeEngine(engine) {
  const clean = String(engine || "auto").trim().toLowerCase();
  if (["auto", "llm", "xgboost"].includes(clean)) {
    return clean;
  }
  throw new Error("Invalid recommendation engine.");
}

async function getXgboostRecommendations({ recipeId, wineId, topK = 5 }) {
  if (Boolean(recipeId) === Boolean(wineId)) {
    throw new Error("Pass exactly one of recipeId or wineId.");
  }

  if (!fs.existsSync(MODEL_PATH)) {
    throw new Error("AI model not found. Train the model first.");
  }

  const pythonExecutable = resolvePythonExecutable();
  const args = [AI_SCRIPT_PATH, "--top-k", String(topK), "--model-path", MODEL_PATH];

  if (recipeId) {
    args.push("--recipe-id", String(recipeId));
  } else {
    args.push("--wine-id", String(wineId));
  }

  const { stdout, stderr } = await execFileAsync(pythonExecutable, args, {
    cwd: BACKEND_ROOT,
    timeout: 120000,
  });

  const rawOutput = String(stdout || "").trim();
  if (!rawOutput) {
    throw new Error(String(stderr || "The AI recommender returned no output.").trim());
  }

  const parsed = JSON.parse(rawOutput);
  return {
    ...parsed,
    engine: "xgboost",
  };
}

async function getAiRecommendationsByEngine({ recipeId, wineId, topK = 5, engine = "auto" }) {
  const normalizedEngine = normalizeEngine(engine);

  if (normalizedEngine === "xgboost") {
    return getXgboostRecommendations({ recipeId, wineId, topK });
  }

  if (normalizedEngine === "llm") {
    return getLlmPairingRecommendations({ recipeId, wineId, topK });
  }

  if (isLlmConfigured()) {
    try {
      return await getLlmPairingRecommendations({ recipeId, wineId, topK });
    } catch (error) {
      if (!fs.existsSync(MODEL_PATH)) {
        throw error;
      }
    }
  }

  return getXgboostRecommendations({ recipeId, wineId, topK });
}

async function savePairingFeedback({
  userId = null,
  recipeId,
  wineId,
  direction,
  feedback,
  recommendationScore = null,
}) {
  if (!recipeId || !wineId) {
    throw new Error("Pass both recipeId and wineId.");
  }

  if (!["recipe_to_wine", "wine_to_recipe"].includes(direction)) {
    throw new Error("Invalid recommendation direction.");
  }

  if (!["good", "bad"].includes(feedback)) {
    throw new Error("Invalid feedback value.");
  }

  const payload = {
    recipeId,
    wineId,
    direction,
    feedback,
    recommendationScore:
      recommendationScore === null || recommendationScore === undefined
        ? null
        : Number(recommendationScore),
  };

  if (userId && mongoose.Types.ObjectId.isValid(userId)) {
    return await PairingFeedback.findOneAndUpdate(
      {
        userId,
        recipeId,
        wineId,
        direction,
      },
      {
        ...payload,
        userId,
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );
  }

  const feedbackEntry = new PairingFeedback(payload);
  await feedbackEntry.save();
  return feedbackEntry;
}

module.exports = {
  getAllPairingRules,
  getActivePairingRules,
  addPairingRule,
  updatePairingRule,
  deletePairingRule,
  getAiRecommendations,
  getAiRecommendationsByEngine,
  savePairingFeedback,
};
