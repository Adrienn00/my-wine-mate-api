const express = require("express");
const router = express.Router();

const wineController = require("./wine.controller");
const wineRecommendationController = require("./wineRecommendation.controller");
const { authMiddleware, adminMiddleware } = require("../user/user.middleware");

router.post("/recommendations", authMiddleware, wineRecommendationController.recommendWines);

router.post("/:id/rating", authMiddleware, wineController.newRating);
router.delete("/:id/rating/:ratingId", authMiddleware, adminMiddleware, wineController.removeRating);
router.get("/:id/live-offers", authMiddleware, wineController.getLiveOffers);

router.get("/", wineController.getWines);

router.post("/", authMiddleware, wineController.addWine);

router.put("/:id", authMiddleware, adminMiddleware, wineController.updateWine);

router.delete("/:id", authMiddleware, adminMiddleware, wineController.deleteWine);

module.exports = router;
