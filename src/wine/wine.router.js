const express = require("express");
const router = express.Router();

const wineController = require("./wine.controller");
const wineRecommendationController = require("./wineRecommendation.controller");
const { authMiddleware, adminMiddleware } = require("../user/user.middleware");

router.post("/ocr-scan", wineController.ocrScan);
router.post("/ai-enrich", wineController.aiEnrich);

router.post("/recommendations", authMiddleware, wineRecommendationController.recommendWines);
router.post("/recommendations/split", authMiddleware, wineRecommendationController.recommendWinesSplit);

router.post("/:id/rating", authMiddleware, wineController.newRating);
router.post("/:id/share", authMiddleware, wineController.shareWine);
router.delete("/:id/rating/:ratingId", authMiddleware, adminMiddleware, wineController.removeRating);
router.get("/:id/live-offers", authMiddleware, wineController.getLiveOffers);

router.get("/", wineController.getWines);
router.get("/admin/ratings", authMiddleware, adminMiddleware, wineController.getRatingList);
router.get("/:id", wineController.getWineById);

router.post("/", authMiddleware, wineController.addWine);

router.put("/:id", authMiddleware, adminMiddleware, wineController.updateWine);

router.delete("/:id", authMiddleware, adminMiddleware, wineController.deleteWine);

module.exports = router;
