const { runConversationalChat, streamConversationalChat, mapChatError } = require("./pairingChat.service");

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
      image: req.body.image || null,
      mimeType: req.body.mimeType || "image/jpeg",
      groqApiKey: req.headers["x-groq-api-key"] || null,
    });

    return res.status(200).json(result);
  } catch (error) {
    const mappedError = mapChatError(error);
    return res.status(mappedError.statusCode).json({
      message: mappedError.userMessage,
      code: mappedError.code,
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
      image: req.body.image || null,
      mimeType: req.body.mimeType || "image/jpeg",
      groqApiKey: req.headers["x-groq-api-key"] || null,
    },
    res
  );
}

module.exports = { chat, chatStream };
