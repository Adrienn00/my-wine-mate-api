const { runConversationalChat, streamConversationalChat } = require("./pairingChat.service");

async function chat(req, res) {
  try {
    const topK = Number.parseInt(req.body.topK || "4", 10);
    const messages = req.body.messages;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ message: "Pass a non-empty messages array." });
    }

    const result = await runConversationalChat({
      messages,
      userId: req.user?.id || req.body.userId || null,
      topK: Number.isFinite(topK) && topK > 0 ? topK : 4,
    });

    return res.status(200).json(result);
  } catch (error) {
    const message = String(error.message || "");
    const statusCode = message.includes("Pass at least one") ? 400 : 500;
    return res.status(statusCode).json({
      message: "Error in conversational chat",
      error: error.message,
    });
  }
}

function chatStream(req, res) {
  const topK = Number.parseInt(req.body.topK || "4", 10);
  const messages = req.body.messages;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ message: "Pass a non-empty messages array." });
  }

  streamConversationalChat(
    {
      messages,
      userId: req.user?.id || req.body.userId || null,
      topK: Number.isFinite(topK) && topK > 0 ? topK : 4,
    },
    res
  );
}

module.exports = { chat, chatStream };
