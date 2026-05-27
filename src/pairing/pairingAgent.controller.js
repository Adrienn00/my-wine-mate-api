const pairingAgentService = require("./pairingAgent.service");

async function searchConversationalPairings(req, res) {
  try {
    const topK = Number.parseInt(req.body.topK || req.query.topK || "5", 10);
    const result = await pairingAgentService.searchConversationalPairings({
      message: req.body.message || req.query.message || "",
      userId: req.user?.id || req.body.userId || req.query.userId || null,
      topK: Number.isFinite(topK) && topK > 0 ? topK : 5,
    });

    return res.status(200).json(result);
  } catch (error) {
    const message = String(error.message || "");
    const statusCode = message.includes("Pass a message") ? 400 : 500;
    return res.status(statusCode).json({
      message: "Error while searching conversational pairings",
      error: error.message,
    });
  }
}

module.exports = {
  searchConversationalPairings,
};
