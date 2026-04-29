const pairingService = require("./pairing.service");

async function getPairingRules(req, res) {
  try {
    const onlyActive = req.query.active === "true";
    const rules = onlyActive
      ? await pairingService.getActivePairingRules()
      : await pairingService.getAllPairingRules();
    return res.status(200).json(rules);
  } catch (error) {
    return res.status(500).json({
      message: "Error while fetching pairing rules",
      error: error.message,
    });
  }
}

async function getAiRecommendations(req, res) {
  try {
    const recipeId = req.query.recipeId;
    const wineId = req.query.wineId;
    const topK = Number.parseInt(req.query.topK || "5", 10);
    const engine = req.query.engine || "auto";
    const usePreferences = String(req.query.usePreferences || "false") === "true";

    if (Boolean(recipeId) === Boolean(wineId)) {
      return res.status(400).json({
        message: "Pass exactly one of recipeId or wineId.",
      });
    }

    const recommendations = await pairingService.getAiRecommendationsByEngine({
      recipeId,
      wineId,
      topK: Number.isFinite(topK) && topK > 0 ? topK : 5,
      engine,
      userId: req.user?.id || req.query.userId || null,
      usePreferences,
    });

    return res.status(200).json(recommendations);
  } catch (error) {
    const message = String(error.message || "");
    const statusCode =
      message.includes("not found") || message.includes("Invalid Mongo ObjectId")
        ? 404
        : message.includes("Train the model first") ||
            message.includes("Pass exactly one") ||
            message.includes("Invalid recommendation engine")
          ? 400
          : 500;

    return res.status(statusCode).json({
      message: "Error while generating AI recommendations",
      error: error.message,
    });
  }
}

async function getAiRecommendationBundle(req, res) {
  const requestStartedAt = Date.now();

  try {
    const recipeId = req.query.recipeId;
    const wineId = req.query.wineId;
    const topK = Number.parseInt(req.query.topK || "5", 10);
    const engine = req.query.engine || "auto";
    const includePreferences = String(req.query.includePreferences || "false") === "true";
    const resolvedTopK = Number.isFinite(topK) && topK > 0 ? topK : 5;
    const userId = req.user?.id || req.query.userId || null;

    if (Boolean(recipeId) === Boolean(wineId)) {
      return res.status(400).json({
        message: "Pass exactly one of recipeId or wineId.",
      });
    }

    const generalPromise = pairingService.getAiRecommendationsByEngine({
      recipeId,
      wineId,
      topK: resolvedTopK,
      engine,
      userId,
      usePreferences: false,
    });

    const preferencePromise =
      includePreferences && userId
        ? pairingService.getAiRecommendationsByEngine({
            recipeId,
            wineId,
            topK: resolvedTopK,
            engine,
            userId,
            usePreferences: true,
          })
        : Promise.resolve(null);

    const [general, preference] = await Promise.all([generalPromise, preferencePromise]);

    return res.status(200).json({
      mode: general?.mode || (wineId ? "wine_to_recipe" : "recipe_to_wine"),
      general,
      preference,
      timings: {
        total_bundle_ms: Date.now() - requestStartedAt,
        general_backend_ms: general?.timings?.total_backend_ms || null,
        preference_backend_ms: preference?.timings?.total_backend_ms || null,
      },
    });
  } catch (error) {
    const message = String(error.message || "");
    const statusCode =
      message.includes("not found") || message.includes("Invalid Mongo ObjectId")
        ? 404
        : message.includes("Train the model first") ||
            message.includes("Pass exactly one") ||
            message.includes("Invalid recommendation engine")
          ? 400
          : 500;

    return res.status(statusCode).json({
      message: "Error while generating bundled AI recommendations",
      error: error.message,
    });
  }
}

async function getRecommendationTabs(req, res) {
  try {
    const wineId = req.query.wineId;
    const topK = Number.parseInt(req.query.topK || "18", 10);
    const perTab = Number.parseInt(req.query.perTab || "3", 10);
    const engine = req.query.engine || "auto";
    const usePreferences = String(req.query.usePreferences || "false") === "true";

    if (!wineId) {
      return res.status(400).json({
        message: "Pass wineId.",
      });
    }

    const tabs = await pairingService.getRecommendationTabs({
      wineId,
      topK: Number.isFinite(topK) && topK > 0 ? topK : 18,
      perTab: Number.isFinite(perTab) && perTab > 0 ? perTab : 3,
      engine,
      userId: req.user?.id || req.query.userId || null,
      usePreferences,
    });

    return res.status(200).json(tabs);
  } catch (error) {
    const message = String(error.message || "");
    const statusCode =
      message.includes("not found") || message.includes("Invalid Mongo ObjectId")
        ? 404
        : message.includes("Pass wineId") || message.includes("Invalid recommendation engine")
          ? 400
          : 500;

    return res.status(statusCode).json({
      message: "Error while generating recommendation tabs",
      error: error.message,
    });
  }
}

async function addPairingRule(req, res) {
  try {
    const rule = await pairingService.addPairingRule(req.body);
    return res.status(201).json(rule);
  } catch (error) {
    return res.status(400).json({
      message: "Error while creating pairing rule",
      error: error.message,
    });
  }
}

async function savePairingFeedback(req, res) {
  try {
    const feedback = await pairingService.savePairingFeedback({
      userId: req.user?.id || null,
      recipeId: req.body.recipeId,
      wineId: req.body.wineId,
      direction: req.body.direction,
      feedback: req.body.feedback,
      recommendationScore: req.body.recommendationScore,
    });

    return res.status(201).json(feedback);
  } catch (error) {
    const message = String(error.message || "");
    const statusCode =
      message.includes("Invalid") || message.includes("Pass both") ? 400 : 500;

    return res.status(statusCode).json({
      message: "Error while saving pairing feedback",
      error: error.message,
    });
  }
}

async function getPairingFeedbackList(req, res) {
  try {
    const feedback = await pairingService.getPairingFeedbackList({
      status: req.query.status || "all",
      limit: req.query.limit || 50,
    });
    return res.status(200).json(feedback);
  } catch (error) {
    return res.status(500).json({
      message: "Error while fetching pairing feedback",
      error: error.message,
    });
  }
}

async function reviewPairingFeedback(req, res) {
  try {
    const feedback = await pairingService.updatePairingFeedbackStatus(req.params.id, {
      status: req.body.status,
      reviewedBy: req.user?.id || null,
    });
    return res.status(200).json(feedback);
  } catch (error) {
    const statusCode =
      error.message.includes("not found") ? 404 : error.message.includes("Invalid") ? 400 : 500;
    return res.status(statusCode).json({
      message: "Error while updating pairing feedback status",
      error: error.message,
    });
  }
}

async function approvePendingPairingFeedback(req, res) {
  try {
    const result = await pairingService.approvePendingPairingFeedback(req.user?.id || null);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      message: "Error while approving pending feedback",
      error: error.message,
    });
  }
}

async function getPairingTrainingSummary(req, res) {
  try {
    const summary = await pairingService.getPairingTrainingSummary();
    return res.status(200).json(summary);
  } catch (error) {
    return res.status(500).json({
      message: "Error while fetching pairing training summary",
      error: error.message,
    });
  }
}

async function trainPairingModel(req, res) {
  try {
    const run = await pairingService.trainPairingModel({
      triggeredBy: req.user?.id || null,
    });
    return res.status(200).json(run);
  } catch (error) {
    return res.status(500).json({
      message: "Error while training pairing model",
      error: error.message,
    });
  }
}

async function updatePairingRule(req, res) {
  try {
    const updatedRule = await pairingService.updatePairingRule(req.params.id, req.body);
    return res.status(200).json(updatedRule);
  } catch (error) {
    if (error.message === "pairing rule not found") {
      return res.status(404).json({ message: "Pairing Rule Not Found" });
    }

    return res.status(400).json({
      message: "Error while updating pairing rule",
      error: error.message,
    });
  }
}

async function deletePairingRule(req, res) {
  try {
    const deleted = await pairingService.deletePairingRule(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Pairing Rule Not Found" });
    }

    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({
      message: "Error while deleting pairing rule",
      error: error.message,
    });
  }
}

module.exports = {
  getPairingRules,
  getAiRecommendations,
  getAiRecommendationBundle,
  getRecommendationTabs,
  savePairingFeedback,
  getPairingFeedbackList,
  reviewPairingFeedback,
  approvePendingPairingFeedback,
  getPairingTrainingSummary,
  trainPairingModel,
  addPairingRule,
  updatePairingRule,
  deletePairingRule,
};
