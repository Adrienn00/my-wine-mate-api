const PairingRule = require("./pairing.model");
const PairingFeedback = require("./pairingFeedback.model");
const PairingTrainingRun = require("./pairingTrainingRun.model");
const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const execFileAsync = promisify(execFile);
const BACKEND_ROOT = path.resolve(__dirname, "../..");
const AI_SCRIPT_PATH = path.join(BACKEND_ROOT, "ai", "xgboost", "recommend_pairings.py");
const LLM_SCRIPT_PATH = path.join(BACKEND_ROOT, "ai", "llm", "llm_recommend_pairings.py");
const TRAIN_SCRIPT_PATH = path.join(BACKEND_ROOT, "ai", "xgboost", "train_pairing_model.py");
const VENV_PYTHON_PATH = path.join(BACKEND_ROOT, ".venv", "bin", "python");
const MODEL_PATH = path.join(BACKEND_ROOT, "ai", "artifacts", "xgboost_pairing_model.joblib");
function nowMs() {
  return Date.now();
}

const LLM_FEEDBACK_MIN_CONFIDENCE = parseFloat(process.env.LLM_FEEDBACK_MIN_CONFIDENCE || "0.60");
const LLM_FEEDBACK_AUTO_APPROVE_THRESHOLD = parseFloat(process.env.LLM_FEEDBACK_AUTO_APPROVE_THRESHOLD || "0.85");
const AUTO_TRAIN_THRESHOLD = parseInt(process.env.AUTO_TRAIN_THRESHOLD || "20", 10);
const AUTO_TRAIN_COOLDOWN_HOURS = parseInt(process.env.AUTO_TRAIN_COOLDOWN_HOURS || "24", 10);
const TRAINING_METRICS_PATH = path.join(BACKEND_ROOT, "ai", "artifacts", "training_metrics.json");

function resolvePythonExecutable() {
  if (fs.existsSync(VENV_PYTHON_PATH)) {
    return VENV_PYTHON_PATH;
  }
  return "python3";
}

function approvedFeedbackFilter() {
  return { status: "approved" };
}

function pendingFeedbackFilter() {
  return {
    $or: [{ status: "pending" }, { status: { $exists: false } }, { status: null }],
  };
}

function serializeTrainingRun(run) {
  if (!run) return null;

  return {
    _id: run._id,
    status: run.status,
    triggerSource: run.triggerSource,
    triggeredBy: run.triggeredBy,
    approvedFeedbackCount: run.approvedFeedbackCount || 0,
    pendingFeedbackCount: run.pendingFeedbackCount || 0,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    metrics: run.metrics || null,
    stdoutTail: String(run.stdout || "").split("\n").slice(-8).join("\n").trim(),
    stderrTail: String(run.stderr || "").split("\n").slice(-8).join("\n").trim(),
  };
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

  return getAiRecommendationsByEngine({ recipeId, wineId, topK, engine: "auto" });
}

function normalizeEngine(engine) {
  const clean = String(engine || "auto").trim().toLowerCase();
  if (["auto", "llm", "xgboost"].includes(clean)) {
    return clean;
  }
  throw new Error("Invalid recommendation engine.");
}

function isLlmConfigured(userApiKey = null) {
  return Boolean((userApiKey || "").trim() || String(process.env.GROQ_API_KEY || "").trim());
}

function recommendationMetadata(engine, source = "") {
  const normalizedEngine = String(engine || "").toLowerCase();
  const normalizedSource = String(source || "").toLowerCase();

  if (normalizedEngine === "xgboost") {
    return {
      recommendationEngine: "xgboost",
      recommendationLabel: "XGBoost recommendation",
      recommendationSource: "xgboost-model",
    };
  }

  if (normalizedEngine === "llm") {
    return {
      recommendationEngine: normalizedSource.includes("fallback") ? "llm-fallback" : "llm-mcp",
      recommendationLabel: "AI recommendation",
      recommendationSource: source || "llm-mcp",
    };
  }

  return {
    recommendationEngine: "smart",
    recommendationLabel: "Smart recommendation",
    recommendationSource: source || "local-scoring",
  };
}

function attachRecommendationMetadata(payload, engine) {
  const metadata = recommendationMetadata(engine, payload?.source);
  const results = Array.isArray(payload?.results)
    ? payload.results.map((item) => ({
        ...item,
        ...metadata,
      }))
    : [];

  return {
    ...payload,
    ...metadata,
    engine,
    results,
  };
}

async function saveLlmFeedbackFromRecommendations({ results, direction, wineId, recipeId }) {
  const eligible = (results || []).filter(
    (r) => typeof r.probability === "number" && r.probability >= LLM_FEEDBACK_MIN_CONFIDENCE
  );
  if (!eligible.length) return;

  const ops = eligible.map((r) => {
    const confidence = r.probability;
    const status = confidence >= LLM_FEEDBACK_AUTO_APPROVE_THRESHOLD ? "approved" : "pending";
    const resolvedWineId = wineId || r.wine_id || r._id;
    const resolvedRecipeId = recipeId || r.recipe_id || r._id;

    return {
      updateOne: {
        filter: { recipeId: resolvedRecipeId, wineId: resolvedWineId, direction, source: "llm" },
        update: {
          $set: {
            feedback: "good",
            confidence,
            status,
            recommendationScore: confidence,
            reviewedAt: status === "approved" ? new Date() : null,
          },
          $setOnInsert: { recipeId: resolvedRecipeId, wineId: resolvedWineId, direction, source: "llm", userId: null },
        },
        upsert: true,
      },
    };
  });

  try {
    const result = await PairingFeedback.bulkWrite(ops, { ordered: false });
    const saved = (result.upsertedCount || 0) + (result.modifiedCount || 0);
    if (saved > 0) {
      console.log(`[llm-feedback] saved ${saved} entries (${eligible.length} eligible, threshold=${LLM_FEEDBACK_MIN_CONFIDENCE})`);
    }
  } catch (error) {
    console.warn("[llm-feedback] bulkWrite error:", error.message);
  }
}

async function checkAndTriggerAutoTraining() {
  try {
    const lastRun = await PairingTrainingRun.findOne({ status: "completed" }).sort({ completedAt: -1 });
    const cooldownCutoff = new Date(Date.now() - AUTO_TRAIN_COOLDOWN_HOURS * 60 * 60 * 1000);

    if (lastRun?.completedAt && lastRun.completedAt > cooldownCutoff) {
      return;
    }

    const sinceFilter = lastRun?.completedAt ? { updatedAt: { $gt: lastRun.completedAt } } : {};
    const newAutoApproved = await PairingFeedback.countDocuments({
      source: "llm",
      status: "approved",
      ...sinceFilter,
    });

    if (newAutoApproved < AUTO_TRAIN_THRESHOLD) {
      return;
    }

    console.log(`[auto-train] ${newAutoApproved} new LLM-approved labels → triggering retraining`);
    const [approvedFeedbackCount, pendingFeedbackCount] = await Promise.all([
      PairingFeedback.countDocuments(approvedFeedbackFilter()),
      PairingFeedback.countDocuments(pendingFeedbackFilter()),
    ]);

    const trainingRun = await PairingTrainingRun.create({
      status: "running",
      triggerSource: "auto",
      triggeredBy: null,
      approvedFeedbackCount,
      pendingFeedbackCount,
      startedAt: new Date(),
    });

    const pythonExecutable = resolvePythonExecutable();
    execFileAsync(pythonExecutable, [TRAIN_SCRIPT_PATH, "--include-feedback"], {
      cwd: BACKEND_ROOT,
      timeout: 600000,
      maxBuffer: 10 * 1024 * 1024,
    })
      .then(async ({ stdout, stderr }) => {
        let metrics = null;
        try {
          if (fs.existsSync(TRAINING_METRICS_PATH)) {
            metrics = JSON.parse(fs.readFileSync(TRAINING_METRICS_PATH, "utf-8"));
          }
        } catch {}
        trainingRun.status = "completed";
        trainingRun.stdout = String(stdout || "");
        trainingRun.stderr = String(stderr || "");
        trainingRun.metrics = metrics;
        trainingRun.completedAt = new Date();
        await trainingRun.save();
        console.log("[auto-train] completed successfully");
      })
      .catch(async (error) => {
        trainingRun.status = "failed";
        trainingRun.stderr = String(error.stderr || error.message || "");
        trainingRun.completedAt = new Date();
        await trainingRun.save();
        console.warn("[auto-train] failed:", trainingRun.stderr.slice(0, 200));
      });
  } catch (error) {
    console.warn("[auto-train] check error:", error.message);
  }
}

async function getXgboostRecommendations({ recipeId, wineId, topK = 5 }) {
  const startedAt = nowMs();
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

  const pythonStartedAt = nowMs();
  const { stdout, stderr } = await execFileAsync(pythonExecutable, args, {
    cwd: BACKEND_ROOT,
    timeout: 120000,
  });
  const pythonDurationMs = nowMs() - pythonStartedAt;

  const rawOutput = String(stdout || "").trim();
  if (!rawOutput) {
    throw new Error(String(stderr || "The AI recommender returned no output.").trim());
  }

  const parsed = JSON.parse(rawOutput);
  const response = attachRecommendationMetadata(parsed, "xgboost");
  response.timings = {
    ...(parsed?.timings || {}),
    python_exec_ms: pythonDurationMs,
    total_backend_ms: nowMs() - startedAt,
  };
  console.log("[pairings:xgboost:timings]", JSON.stringify(response.timings));
  return response;
}

async function getLlmRecommendations({
  recipeId,
  wineId,
  topK = 5,
  maxCandidates = 12,
  userId = null,
  usePreferences = false,
  captureTrainingData = false,
  userApiKey = null,
}) {
  const startedAt = nowMs();
  if (Boolean(recipeId) === Boolean(wineId)) {
    throw new Error("Pass exactly one of recipeId or wineId.");
  }

  if (!fs.existsSync(LLM_SCRIPT_PATH)) {
    throw new Error("LLM recommender script not found.");
  }

  const pythonExecutable = resolvePythonExecutable();
  const args = [LLM_SCRIPT_PATH, "--top-k", String(topK), "--max-candidates", String(maxCandidates)];

  if (recipeId) {
    args.push("--recipe-id", String(recipeId));
  } else {
    args.push("--wine-id", String(wineId));
  }

  if (usePreferences && userId) {
    args.push("--use-preferences", "--user-id", String(userId));
  }

  const resolvedKey = (userApiKey || "").trim() || process.env.GROQ_API_KEY || "";
  const pythonStartedAt = nowMs();
  const { stdout, stderr } = await execFileAsync(pythonExecutable, args, {
    cwd: BACKEND_ROOT,
    timeout: 120000,
    env: { ...process.env, GROQ_API_KEY: resolvedKey },
  });
  const pythonDurationMs = nowMs() - pythonStartedAt;

  const rawOutput = String(stdout || "").trim();
  if (!rawOutput) {
    throw new Error(String(stderr || "The LLM recommender returned no output.").trim());
  }

  const parsed = JSON.parse(rawOutput);
  const response = attachRecommendationMetadata(parsed, "llm");
  response.timings = {
    ...(parsed?.timings || {}),
    python_exec_ms: pythonDurationMs,
    total_backend_ms: nowMs() - startedAt,
  };
  console.log("[pairings:llm:timings]", JSON.stringify(response.timings));

  if (captureTrainingData && !usePreferences) {
    const direction = wineId ? "wine_to_recipe" : "recipe_to_wine";
    setImmediate(() => {
      saveLlmFeedbackFromRecommendations({ results: response.results, direction, wineId, recipeId })
        .then(() => checkAndTriggerAutoTraining())
        .catch((err) => console.warn("[llm-feedback] background error:", err.message));
    });
  }

  return response;
}

async function getAiRecommendationsByEngine({
  recipeId,
  wineId,
  topK = 5,
  engine = "auto",
  userId = null,
  usePreferences = false,
  userApiKey = null,
}) {
  const normalizedEngine = normalizeEngine(engine);

  if (normalizedEngine === "xgboost") {
    return getXgboostRecommendations({ recipeId, wineId, topK });
  }

  if (normalizedEngine === "llm") {
    return getLlmRecommendations({ recipeId, wineId, topK, userId, usePreferences, userApiKey });
  }

  if (isLlmConfigured(userApiKey)) {
    try {
      return await getLlmRecommendations({
        recipeId,
        wineId,
        topK,
        userId,
        usePreferences,
        captureTrainingData: !usePreferences,
        userApiKey,
      });
    } catch (error) {
      console.warn("LLM pairing recommendation failed, falling back to XGBoost:", error.message);
    }
  }

  return getXgboostRecommendations({ recipeId, wineId, topK });
}

function buildRecommendationTabs(results = [], perTab = 3) {
  const grouped = new Map();

  for (const item of results) {
    const categories = Array.isArray(item?.categories) && item.categories.length ? item.categories : ["Recommended"];

    for (const category of categories) {
      const key = String(category || "recommended").trim() || "recommended";
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key).push(item);
    }
  }

  return Array.from(grouped.entries())
    .map(([category, items]) => ({
      key: category.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      label: category,
      description: `Recipes in the "${category}" category that pair well with the selected wine.`,
      results: items.slice(0, perTab),
    }))
    .filter((tab) => tab.results.length > 0)
    .sort((left, right) => {
      const leftScore = Number(left.results[0]?.probability ?? 0);
      const rightScore = Number(right.results[0]?.probability ?? 0);
      return rightScore - leftScore;
    });
}

async function getRecommendationTabs({
  wineId,
  userId = null,
  usePreferences = false,
  topK = 18,
  perTab = 3,
  engine = "auto",
}) {
  if (!wineId) {
    throw new Error("Pass wineId.");
  }

  const recommendations = await getAiRecommendationsByEngine({
    wineId,
    topK,
    engine,
    userId,
    usePreferences,
  });

  return {
    wineId,
    tabs: buildRecommendationTabs(recommendations.results || [], perTab),
  };
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
    status: "pending",
    reviewedBy: null,
    reviewedAt: null,
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

async function getPairingFeedbackList({ status = "all", limit = 50 } = {}) {
  const parsedLimit = Math.min(Math.max(Number(limit) || 50, 1), 250);
  const query = {};

  if (status === "pending") {
    query.$or = pendingFeedbackFilter().$or;
  } else if (["approved", "rejected"].includes(status)) {
    query.status = status;
  }

  return await PairingFeedback.find(query)
    .sort({ createdAt: -1 })
    .limit(parsedLimit)
    .populate("userId", "username email")
    .populate("reviewedBy", "username email");
}

async function updatePairingFeedbackStatus(id, { status, reviewedBy = null } = {}) {
  if (!["approved", "rejected", "pending"].includes(status)) {
    throw new Error("Invalid feedback review status.");
  }

  const feedback = await PairingFeedback.findById(id);
  if (!feedback) {
    throw new Error("Pairing feedback not found.");
  }

  feedback.status = status;
  feedback.reviewedBy = reviewedBy && mongoose.Types.ObjectId.isValid(reviewedBy) ? reviewedBy : null;
  feedback.reviewedAt = status === "pending" ? null : new Date();
  await feedback.save();

  return await PairingFeedback.findById(feedback._id)
    .populate("userId", "username email")
    .populate("reviewedBy", "username email");
}

async function approvePendingPairingFeedback(reviewedBy = null) {
  const reviewPayload = {
    status: "approved",
    reviewedAt: new Date(),
    reviewedBy: reviewedBy && mongoose.Types.ObjectId.isValid(reviewedBy) ? reviewedBy : null,
  };

  const result = await PairingFeedback.updateMany(pendingFeedbackFilter(), reviewPayload);
  return {
    matchedCount: result.matchedCount || 0,
    modifiedCount: result.modifiedCount || 0,
  };
}

async function getPairingTrainingSummary() {
  const [totalFeedback, pendingFeedback, approvedFeedback, rejectedFeedback, approvedGood, approvedBad,
    llmTotal, llmAutoApproved, llmPending, lastRun] =
    await Promise.all([
      PairingFeedback.countDocuments(),
      PairingFeedback.countDocuments(pendingFeedbackFilter()),
      PairingFeedback.countDocuments(approvedFeedbackFilter()),
      PairingFeedback.countDocuments({ status: "rejected" }),
      PairingFeedback.countDocuments({ ...approvedFeedbackFilter(), feedback: "good" }),
      PairingFeedback.countDocuments({ ...approvedFeedbackFilter(), feedback: "bad" }),
      PairingFeedback.countDocuments({ source: "llm" }),
      PairingFeedback.countDocuments({ source: "llm", status: "approved" }),
      PairingFeedback.countDocuments({ source: "llm", status: "pending" }),
      PairingTrainingRun.findOne().sort({ createdAt: -1 }).populate("triggeredBy", "username email"),
    ]);

  const lastCompletedAt = lastRun?.completedAt ? new Date(lastRun.completedAt) : null;
  const approvedSinceLastTraining = lastCompletedAt
    ? await PairingFeedback.countDocuments({
        ...approvedFeedbackFilter(),
        updatedAt: { $gt: lastCompletedAt },
      })
    : approvedFeedback;

  const nextAutoTrainAt = lastCompletedAt
    ? new Date(lastCompletedAt.getTime() + AUTO_TRAIN_COOLDOWN_HOURS * 60 * 60 * 1000)
    : null;

  return {
    feedback: {
      total: totalFeedback,
      pending: pendingFeedback,
      approved: approvedFeedback,
      rejected: rejectedFeedback,
      approvedGood,
      approvedBad,
    },
    llmFeedback: {
      total: llmTotal,
      autoApproved: llmAutoApproved,
      pending: llmPending,
      autoApproveThreshold: LLM_FEEDBACK_AUTO_APPROVE_THRESHOLD,
      minConfidence: LLM_FEEDBACK_MIN_CONFIDENCE,
    },
    training: {
      recommendedToRetrain: approvedSinceLastTraining > 0,
      approvedSinceLastTraining,
      autoTrainThreshold: AUTO_TRAIN_THRESHOLD,
      autoTrainCooldownHours: AUTO_TRAIN_COOLDOWN_HOURS,
      nextAutoTrainAt,
      lastRun: serializeTrainingRun(lastRun),
      modelExists: fs.existsSync(MODEL_PATH),
      metricsExists: fs.existsSync(TRAINING_METRICS_PATH),
    },
  };
}

async function trainPairingModel({ triggeredBy = null } = {}) {
  const [approvedFeedbackCount, pendingFeedbackCount] = await Promise.all([
    PairingFeedback.countDocuments(approvedFeedbackFilter()),
    PairingFeedback.countDocuments(pendingFeedbackFilter()),
  ]);

  const trainingRun = await PairingTrainingRun.create({
    status: "running",
    triggerSource: triggeredBy ? "admin" : "auto",
    triggeredBy: triggeredBy && mongoose.Types.ObjectId.isValid(triggeredBy) ? triggeredBy : null,
    approvedFeedbackCount,
    pendingFeedbackCount,
    startedAt: new Date(),
  });

  const pythonExecutable = resolvePythonExecutable();
  const args = [TRAIN_SCRIPT_PATH, "--include-feedback"];

  try {
    const { stdout, stderr } = await execFileAsync(pythonExecutable, args, {
      cwd: BACKEND_ROOT,
      timeout: 600000,
      maxBuffer: 10 * 1024 * 1024,
    });

    let metrics = null;
    if (fs.existsSync(TRAINING_METRICS_PATH)) {
      try {
        metrics = JSON.parse(fs.readFileSync(TRAINING_METRICS_PATH, "utf-8"));
      } catch {
        metrics = null;
      }
    }

    trainingRun.status = "completed";
    trainingRun.stdout = String(stdout || "");
    trainingRun.stderr = String(stderr || "");
    trainingRun.metrics = metrics;
    trainingRun.completedAt = new Date();
    await trainingRun.save();

    return serializeTrainingRun(
      await PairingTrainingRun.findById(trainingRun._id).populate("triggeredBy", "username email")
    );
  } catch (error) {
    trainingRun.status = "failed";
    trainingRun.stdout = String(error.stdout || "");
    trainingRun.stderr = String(error.stderr || error.message || "");
    trainingRun.completedAt = new Date();
    await trainingRun.save();
    throw new Error(trainingRun.stderr || "Training failed.");
  }
}

module.exports = {
  getAllPairingRules,
  getActivePairingRules,
  addPairingRule,
  updatePairingRule,
  deletePairingRule,
  getAiRecommendations,
  getAiRecommendationsByEngine,
  getRecommendationTabs,
  savePairingFeedback,
  saveLlmFeedbackFromRecommendations,
  getPairingFeedbackList,
  updatePairingFeedbackStatus,
  approvePendingPairingFeedback,
  getPairingTrainingSummary,
  trainPairingModel,
};
