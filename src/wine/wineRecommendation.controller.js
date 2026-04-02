const wineRecommendationService = require("./wineRecommendation.service");

async function recommendWines(req, res) {
  try {
    const limit = Number.parseInt(req.body?.limit, 10);
    const recommendations = await wineRecommendationService.recommendWinesForPreferences({
      userId: req.user?.id || null,
      preferences: req.body?.preferences || null,
      limit: Number.isFinite(limit) ? Math.max(1, Math.min(limit, 20)) : 6,
    });

    return res.status(200).json({ results: recommendations });
  } catch (error) {
    return res.status(500).json({
      message: "Error while generating wine recommendations",
      error: error.message,
    });
  }
}

module.exports = {
  recommendWines,
};
