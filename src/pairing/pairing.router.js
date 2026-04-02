const express = require("express");
const router = express.Router();

const pairingController = require("./pairing.controller");
const {
  authMiddleware,
  optionalAuthMiddleware,
  adminMiddleware,
} = require("../user/user.middleware");

router.get("/", pairingController.getPairingRules);
router.get("/recommend", pairingController.getAiRecommendations);
router.post("/feedback", optionalAuthMiddleware, pairingController.savePairingFeedback);
router.post("/", authMiddleware, adminMiddleware, pairingController.addPairingRule);
router.put("/:id", authMiddleware, adminMiddleware, pairingController.updatePairingRule);
router.delete("/:id", authMiddleware, adminMiddleware, pairingController.deletePairingRule);

module.exports = router;
