const express = require("express");
const router = express.Router();

const pairingController = require("./pairing.controller");
const pairingAgentController = require("./pairingAgent.controller");
const {
  authMiddleware,
  optionalAuthMiddleware,
  adminMiddleware,
} = require("../user/user.middleware");

router.get("/", pairingController.getPairingRules);
router.get("/recommend", pairingController.getAiRecommendations);
router.get("/recommend-tabs", optionalAuthMiddleware, pairingController.getRecommendationTabs);
router.post("/agent-search", optionalAuthMiddleware, pairingAgentController.searchConversationalPairings);
router.post("/feedback", optionalAuthMiddleware, pairingController.savePairingFeedback);
router.post("/", authMiddleware, adminMiddleware, pairingController.addPairingRule);
router.put("/:id", authMiddleware, adminMiddleware, pairingController.updatePairingRule);
router.delete("/:id", authMiddleware, adminMiddleware, pairingController.deletePairingRule);

module.exports = router;
