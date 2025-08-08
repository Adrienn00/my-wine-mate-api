const express = require("express");
const router = express.Router();

const wineController = require("./wine.controller");

router.post("/:id/rating", wineController.newRating);
router.get("/", wineController.getWines);
router.post("/", wineController.addWine);
router.put("/:id", wineController.updateWine);
router.delete("/:id", wineController.deleteWine);

module.exports = router;
