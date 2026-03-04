const express = require("express");
const router = express.Router();

const wineController = require("./wine.controller");
const { authMiddleware, adminMiddleware } = require("../user/user.middleware");
router.post("/:id/rating", authMiddleware, wineController.newRating);

router.get("/", wineController.getWines);

router.post("/", authMiddleware, wineController.addWine);

router.put("/:id", authMiddleware, adminMiddleware, wineController.updateWine);

router.delete("/:id", authMiddleware, adminMiddleware, wineController.deleteWine);

module.exports = router;
