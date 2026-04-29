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
router.get("/recommend-bundle", pairingController.getAiRecommendationBundle);
router.get("/recommend-tabs", optionalAuthMiddleware, pairingController.getRecommendationTabs);
router.post("/agent-search", optionalAuthMiddleware, pairingAgentController.searchConversationalPairings);
router.post("/feedback", optionalAuthMiddleware, pairingController.savePairingFeedback);
router.get("/admin/feedback", authMiddleware, adminMiddleware, pairingController.getPairingFeedbackList);
router.put("/admin/feedback/:id/status", authMiddleware, adminMiddleware, pairingController.reviewPairingFeedback);
router.post(
  "/admin/feedback/approve-pending",
  authMiddleware,
  adminMiddleware,
  pairingController.approvePendingPairingFeedback
);
router.get(
  "/admin/training-summary",
  authMiddleware,
  adminMiddleware,
  pairingController.getPairingTrainingSummary
);
router.post("/admin/train", authMiddleware, adminMiddleware, pairingController.trainPairingModel);
router.post("/", authMiddleware, adminMiddleware, pairingController.addPairingRule);
router.put("/:id", authMiddleware, adminMiddleware, pairingController.updatePairingRule);
router.delete("/:id", authMiddleware, adminMiddleware, pairingController.deletePairingRule);

module.exports = router;
