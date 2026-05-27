from __future__ import annotations

import json
import sys
from typing import Any
from pathlib import Path

CURRENT_DIR = Path(__file__).resolve().parent
AI_ROOT = CURRENT_DIR.parent
if str(AI_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_ROOT))

from mcp.tools import (
    get_recipe_by_id,
    get_user_preferences,
    get_wine_by_id,
    ocr_scan_label,
    search_recipes,
    search_wines,
)

SERVER_INFO = {
    "name": "my-wine-mate-mcp",
    "version": "1.0.0",
}


TOOLS = {
    "search_recipes": {
        "description": "Search confirmed recipes in the local MongoDB by sommelier-derived criteria.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "search_terms": {"type": "array", "items": {"type": "string"}},
                "must_have_categories": {"type": "array", "items": {"type": "string"}},
                "should_have_ingredients": {"type": "array", "items": {"type": "string"}},
                "exclude_terms": {"type": "array", "items": {"type": "string"}},
                "limit": {"type": "integer", "minimum": 1, "maximum": 50},
            },
        },
        "handler": search_recipes,
    },
    "search_wines": {
        "description": "Search confirmed wines in the local MongoDB by sommelier-derived criteria.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "search_terms": {"type": "array", "items": {"type": "string"}},
                "preferred_types": {"type": "array", "items": {"type": "string"}},
                "preferred_styles": {"type": "array", "items": {"type": "string"}},
                "preferred_flavors": {"type": "array", "items": {"type": "string"}},
                "preferred_pairing_targets": {"type": "array", "items": {"type": "string"}},
                "exclude_terms": {"type": "array", "items": {"type": "string"}},
                "limit": {"type": "integer", "minimum": 1, "maximum": 50},
            },
        },
        "handler": search_wines,
    },
    "get_user_preferences": {
        "description": "Fetch saved user preferences from the local MongoDB.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "user_id": {"type": "string"},
            },
            "required": ["user_id"],
        },
        "handler": get_user_preferences,
    },
    "get_recipe_by_id": {
        "description": "Fetch one recipe by id from the local MongoDB.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "recipe_id": {"type": "string"},
            },
            "required": ["recipe_id"],
        },
        "handler": get_recipe_by_id,
    },
    "get_wine_by_id": {
        "description": "Fetch one wine by id from the local MongoDB.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "wine_id": {"type": "string"},
            },
            "required": ["wine_id"],
        },
        "handler": get_wine_by_id,
    },
    "ocr_scan_label": {
        "description": "Read a wine bottle label from a base64-encoded image and extract structured wine data (name, winery, year, type, region, grape varieties, alcohol).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "base64_image": {"type": "string", "description": "Base64-encoded image data (without data URL prefix)"},
                "mime_type": {"type": "string", "description": "MIME type of the image, e.g. image/jpeg"},
            },
            "required": ["base64_image"],
        },
        "handler": ocr_scan_label,
    },
}


def _read_message() -> dict[str, Any] | None:
    headers: dict[str, str] = {}
    while True:
        line = sys.stdin.buffer.readline()
        if not line:
            return None
        if line in (b"\r\n", b"\n"):
            break
        key, value = line.decode("utf-8").split(":", 1)
        headers[key.strip().lower()] = value.strip()

    length = int(headers.get("content-length", "0"))
    if length <= 0:
        return None
    body = sys.stdin.buffer.read(length)
    return json.loads(body.decode("utf-8"))


def _write_message(payload: dict[str, Any]) -> None:
    body = json.dumps(payload).encode("utf-8")
    sys.stdout.buffer.write(f"Content-Length: {len(body)}\r\n\r\n".encode("utf-8"))
    sys.stdout.buffer.write(body)
    sys.stdout.buffer.flush()


def _response(message_id: Any, result: Any) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": message_id, "result": result}


def _error(message_id: Any, code: int, message: str) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": message_id, "error": {"code": code, "message": message}}


def handle_request(request: dict[str, Any]) -> dict[str, Any] | None:
    method = request.get("method")
    message_id = request.get("id")
    params = request.get("params") or {}

    if method == "initialize":
        return _response(
            message_id,
            {
                "protocolVersion": "2024-11-05",
                "serverInfo": SERVER_INFO,
                "capabilities": {"tools": {}},
            },
        )

    if method == "notifications/initialized":
        return None

    if method == "ping":
        return _response(message_id, {})

    if method == "tools/list":
        return _response(
            message_id,
            {
                "tools": [
                    {
                        "name": name,
                        "description": spec["description"],
                        "inputSchema": spec["inputSchema"],
                    }
                    for name, spec in TOOLS.items()
                ]
            },
        )

    if method == "tools/call":
        name = params.get("name")
        arguments = params.get("arguments") or {}
        if name not in TOOLS:
            return _error(message_id, -32602, f"Unknown tool: {name}")
        try:
            result = TOOLS[name]["handler"](**arguments)
            return _response(message_id, {"content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False)}]})
        except Exception as error:
            return _error(message_id, -32000, str(error))

    return _error(message_id, -32601, f"Method not found: {method}")


def main() -> None:
    while True:
        request = _read_message()
        if request is None:
            break
        response = handle_request(request)
        if response is not None:
            _write_message(response)


if __name__ == "__main__":
    main()
