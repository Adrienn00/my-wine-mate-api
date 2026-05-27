const { spawn } = require("child_process");
const readline = require("readline");
const path = require("path");
const fs = require("fs");

const BACKEND_ROOT = path.resolve(__dirname, "../..");
const CHAT_SCRIPT_PATH = path.join(BACKEND_ROOT, "ai", "chat", "agent.py");
const VENV_PYTHON_PATH = path.join(BACKEND_ROOT, ".venv", "bin", "python");

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
        res.write(
          `data: ${JSON.stringify({ type: "error", message: stderr.trim() || `Agent exited with code ${code}` })}\n\n`
        );
      }
      res.end();
    }
  });

  proc.on("error", (err) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`);
      res.end();
    }
  });

  proc.stdin.write(JSON.stringify({ messages, userId, topK, stream: true, image, mimeType, groqApiKey }));
  proc.stdin.end();
}

module.exports = { runConversationalChat, streamConversationalChat };
