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
  getRecommendationTabs,
  savePairingFeedback,
  addPairingRule,
  updatePairingRule,
  deletePairingRule,
};
