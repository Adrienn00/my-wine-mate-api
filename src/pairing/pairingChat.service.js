const { spawn } = require("child_process");
const readline = require("readline");
const path = require("path");
const fs = require("fs");

const BACKEND_ROOT = path.resolve(__dirname, "../..");
const CHAT_SCRIPT_PATH = path.join(BACKEND_ROOT, "ai", "chat", "agent.py");
const VENV_PYTHON_PATH = path.join(BACKEND_ROOT, ".venv", "bin", "python");

function normalizeErrorMessage(error) {
  if (!error) return "";
  if (typeof error === "string") return error;
  return String(error.message || error);
}

function mapChatError(error) {
  const rawMessage = normalizeErrorMessage(error);
  const message = rawMessage.toLowerCase();

  if (
    message.includes("context length") ||
    message.includes("maximum context length") ||
    message.includes("too many tokens") ||
    message.includes("prompt is too long") ||
    message.includes("request too large") ||
    message.includes("tokens exceeded") ||
    message.includes("rate limit reached for tokens") ||
    (message.includes("token") && message.includes("limit"))
  ) {
    return {
      statusCode: 400,
      code: "CHAT_TOKEN_LIMIT",
      userMessage: "Sajnos elfogytak a tokenjeid, kerlek terj vissza kesobb.",
      rawMessage,
    };
  }

  if (message.includes("pass at least one")) {
    return {
      statusCode: 400,
      code: "CHAT_VALIDATION_ERROR",
      userMessage: "Legalabb egy uzenetet kuldeni kell a chathez.",
      rawMessage,
    };
  }

  if (message.includes("groq api key required") || message.includes("missing environment variable: groq_api_key")) {
    return {
      statusCode: 400,
      code: "CHAT_API_KEY_MISSING",
      userMessage: "Hianyzik az AI API kulcs. Add meg a kulcsot a profil beallitasoknal.",
      rawMessage,
    };
  }

  if (message.includes("401") || message.includes("403") || message.includes("unauthorized")) {
    return {
      statusCode: 401,
      code: "CHAT_AUTH_ERROR",
      userMessage: "Az AI szolgaltatas hitelesitese sikertelen volt. Ellenorizd az API kulcsot.",
      rawMessage,
    };
  }

  if (message.includes("429") || message.includes("rate limit")) {
    return {
      statusCode: 429,
      code: "CHAT_RATE_LIMIT",
      userMessage: "Az AI szolgaltatas most tulterhelt. Probald meg ujra nehany masodperc mulva.",
      rawMessage,
    };
  }

  return {
    statusCode: 500,
    code: "CHAT_ERROR",
    userMessage: "Hiba tortent, probald meg kesobb.",
    rawMessage,
  };
}

function resolvePythonExecutable() {
  return fs.existsSync(VENV_PYTHON_PATH) ? VENV_PYTHON_PATH : "python3";
}

function runPythonAgent(input) {
  return new Promise((resolve, reject) => {
    const python = resolvePythonExecutable();
    const proc = spawn(python, [CHAT_SCRIPT_PATH], {
      cwd: BACKEND_ROOT,
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    proc.on("close", (code) => {
      const raw = stdout.trim();
      if (!raw) {
        return reject(new Error(stderr.trim() || `Chat agent exited with code ${code}`));
      }
      try {
        const parsed = JSON.parse(raw);
        if (parsed.error) {
          return reject(new Error(parsed.error));
        }
        resolve(parsed);
      } catch {
        reject(new Error(`Chat agent returned non-JSON output: ${raw.slice(0, 200)}`));
      }
    });

    proc.on("error", reject);

    proc.stdin.write(JSON.stringify(input));
    proc.stdin.end();
  });
}

async function runConversationalChat({ messages, userId = null, topK = 4, image = null, mimeType = "image/jpeg", groqApiKey = null }) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("Pass at least one message.");
  }

  return runPythonAgent({ messages, userId, topK, image, mimeType, groqApiKey });
}

function streamConversationalChat({ messages, userId = null, topK = 4, image = null, mimeType = "image/jpeg", groqApiKey = null }, res) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const python = resolvePythonExecutable();
  const proc = spawn(python, [CHAT_SCRIPT_PATH], {
    cwd: BACKEND_ROOT,
    env: { ...process.env },
  });

  const rl = readline.createInterface({ input: proc.stdout });

  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const event = JSON.parse(trimmed);
      if (event.t === "ocr") {
        res.write(`data: ${JSON.stringify({ type: "ocr", content: event.c })}\n\n`);
      } else if (event.t === "chunk") {
        res.write(`data: ${JSON.stringify({ type: "chunk", content: event.c })}\n\n`);
      } else if (event.t === "done") {
        res.write(
          `data: ${JSON.stringify({
            type: "done",
            wines: event.wines,
            recipes: event.recipes,
            followUpSuggestions: event.followUps,
          })}\n\n`
        );
        res.write("data: [DONE]\n\n");
        res.end();
      }
    } catch {
      // ignore malformed lines from stderr leaking into stdout
    }
  });

  let stderr = "";
  proc.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  proc.on("close", (code) => {
    if (!res.writableEnded) {
      if (code !== 0) {
        const mappedError = mapChatError(stderr.trim() || `Agent exited with code ${code}`);
        res.write(
          `data: ${JSON.stringify({ type: "error", code: mappedError.code, message: mappedError.userMessage })}\n\n`
        );
      }
      res.end();
    }
  });

  proc.on("error", (err) => {
    if (!res.writableEnded) {
      const mappedError = mapChatError(err);
      res.write(`data: ${JSON.stringify({ type: "error", code: mappedError.code, message: mappedError.userMessage })}\n\n`);
      res.end();
    }
  });

  proc.stdin.write(JSON.stringify({ messages, userId, topK, stream: true, image, mimeType, groqApiKey }));
  proc.stdin.end();
}

module.exports = { runConversationalChat, streamConversationalChat, mapChatError };
