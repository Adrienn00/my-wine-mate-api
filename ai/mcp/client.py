from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any

CURRENT_DIR = Path(__file__).resolve().parent
SERVER_PATH = CURRENT_DIR / "server.py"


class MCPClient:
    def __init__(self) -> None:
        self._process: subprocess.Popen[bytes] | None = None
        self._message_id = 0

    def __enter__(self) -> "MCPClient":
        self.start()
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    def start(self) -> None:
        if self._process is not None:
            return

        self._process = subprocess.Popen(
            [sys.executable, str(SERVER_PATH)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        self._request("initialize", {"protocolVersion": "2024-11-05", "clientInfo": {"name": "llm-retriever", "version": "1.0.0"}})
        self._notify("notifications/initialized", {})

    def close(self) -> None:
        if self._process is None:
            return
        if self._process.stdin:
            self._process.stdin.close()
        if self._process.stdout:
            self._process.stdout.close()
        if self._process.stderr:
            self._process.stderr.close()
        self._process.terminate()
        self._process.wait(timeout=5)
        self._process = None

    def call_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        result = self._request("tools/call", {"name": name, "arguments": arguments})
        content = (result.get("content") or [{}])[0].get("text", "")
        if not content:
            return {}
        return json.loads(content)

    def _notify(self, method: str, params: dict[str, Any]) -> None:
        self._send({"jsonrpc": "2.0", "method": method, "params": params})

    def _request(self, method: str, params: dict[str, Any]) -> dict[str, Any]:
        self._message_id += 1
        message_id = self._message_id
        self._send({"jsonrpc": "2.0", "id": message_id, "method": method, "params": params})
        response = self._read()
        if response.get("id") != message_id:
            raise RuntimeError("MCP response id mismatch.")
        if "error" in response:
            raise RuntimeError(response["error"].get("message", "Unknown MCP error."))
        return response.get("result") or {}

    def _send(self, payload: dict[str, Any]) -> None:
        if self._process is None or self._process.stdin is None:
            raise RuntimeError("MCP client is not started.")
        body = json.dumps(payload).encode("utf-8")
        self._process.stdin.write(f"Content-Length: {len(body)}\r\n\r\n".encode("utf-8"))
        self._process.stdin.write(body)
        self._process.stdin.flush()

    def _read(self) -> dict[str, Any]:
        if self._process is None or self._process.stdout is None:
            raise RuntimeError("MCP client is not started.")

        headers: dict[str, str] = {}
        while True:
            line = self._process.stdout.readline()
            if not line:
                stderr_output = b""
                if self._process.stderr is not None:
                    stderr_output = self._process.stderr.read()
                raise RuntimeError(f"MCP server closed unexpectedly. {stderr_output.decode('utf-8', errors='ignore')}")
            if line in (b"\r\n", b"\n"):
                break
            key, value = line.decode("utf-8").split(":", 1)
            headers[key.strip().lower()] = value.strip()

        length = int(headers.get("content-length", "0"))
        if length <= 0:
            raise RuntimeError("MCP response missing Content-Length.")

        body = self._process.stdout.read(length)
        return json.loads(body.decode("utf-8"))
