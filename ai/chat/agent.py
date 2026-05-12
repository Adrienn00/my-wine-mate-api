#!/usr/bin/env python3
"""Conversational sommelier chat agent using Groq tool calling + MCP."""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path
from typing import Any

CURRENT_DIR = Path(__file__).resolve().parent
AI_ROOT = CURRENT_DIR.parent
if str(AI_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_ROOT))

from llm.client import call_llm_chat, call_llm_chat_stream
from mcp.client import MCPClient

log = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a friendly, knowledgeable sommelier assistant for My Wine Mate, a personal wine and recipe app.

Your role is to help users discover wines and recipes from THEIR OWN database.
Use the provided search tools to find relevant wines and recipes, then explain your recommendations naturally.

Rules:
- ONLY recommend wines and recipes found via search tools. Never invent or fabricate items.
- Use search_wines to find wines, search_recipes to find recipes.
- If a user_id is mentioned in context, call get_user_preferences first to personalize your search.
- After searching, explain in a friendly, conversational tone WHY each result fits the user's request.
- Be specific: mention wine types, styles, flavors, or recipe ingredients from the actual results.
- If search returns no results, say so honestly and suggest the user try different terms.
- Respond in the same language the user writes in (English or Hungarian).
- Keep responses warm, helpful, and concise — like a real sommelier at a wine bar.
- If the conversation starts with a wine label scan result, use those details to search for the wine and suggest similar ones or food pairings."""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_user_preferences",
            "description": "Fetch the user's saved wine and food preferences from the database. Call this first when a user_id is available to personalize recommendations.",
            "parameters": {
                "type": "object",
                "properties": {
                    "user_id": {"type": "string", "description": "The user's MongoDB ID"},
                },
                "required": ["user_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_wines",
            "description": "Search confirmed wines in the user's database by sommelier-derived criteria.",
            "parameters": {
                "type": "object",
                "properties": {
                    "search_terms": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Keywords to match against wine name, description, grape varieties, region, etc.",
                    },
                    "preferred_types": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Wine types: red, white, rosé, sparkling, dessert",
                    },
                    "preferred_styles": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Wine styles: dry, off-dry, sweet, crisp, bold, light, etc.",
                    },
                    "preferred_flavors": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Flavor profiles: fruity, oaky, tannic, mineral, floral, etc.",
                    },
                    "preferred_pairing_targets": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Food pairing targets: fish, grilled meat, cheese, pasta, seafood, etc.",
                    },
                    "exclude_terms": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Terms to exclude from results",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max results to return (1-20)",
                        "minimum": 1,
                        "maximum": 20,
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_recipes",
            "description": "Search confirmed recipes in the user's database by sommelier-derived criteria.",
            "parameters": {
                "type": "object",
                "properties": {
                    "search_terms": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Keywords to match against recipe name, ingredients, categories, etc.",
                    },
                    "must_have_categories": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Required recipe categories (e.g. pasta, seafood, vegetarian)",
                    },
                    "should_have_ingredients": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Preferred ingredients to match",
                    },
                    "exclude_terms": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Terms to exclude from results",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max results to return (1-20)",
                        "minimum": 1,
                        "maximum": 20,
                    },
                },
            },
        },
    },
]


def _format_wine(wine: dict[str, Any]) -> dict[str, Any]:
    raw_score = wine.get("retrieval_score", 0.5)
    return {
        "wine_id": wine.get("wine_id", ""),
        "wine_name": wine.get("wine_name", ""),
        "type": wine.get("type", ""),
        "style": wine.get("style", ""),
        "foodPairingHints": wine.get("foodPairingHints", []),
        "flavorProfiles": wine.get("flavorProfiles", []),
        "imageUrl": wine.get("imageUrl", ""),
        "reason": "",
        "match_score": round(min(max(float(raw_score), 0.5), 0.99), 4),
    }


def _format_recipe(recipe: dict[str, Any]) -> dict[str, Any]:
    raw_score = recipe.get("retrieval_score", 0.5)
    return {
        "recipe_id": recipe.get("recipe_id", ""),
        "recipe_name": recipe.get("recipe_name", ""),
        "categories": recipe.get("categories", []),
        "ingredients": recipe.get("ingredients", [])[:8],
        "winePairingHints": recipe.get("winePairingHints", []),
        "imageUrl": recipe.get("imageUrl", ""),
        "reason": "",
        "match_score": round(min(max(float(raw_score), 0.5), 0.99), 4),
    }


def _generate_follow_ups(wines: list[dict], recipes: list[dict]) -> list[str]:
    suggestions = []
    if wines:
        wine_name = wines[0].get("wine_name", "")
        if wine_name:
            suggestions.append(f"What food goes well with {wine_name}?")
    if recipes:
        recipe_name = recipes[0].get("recipe_name", "")
        if recipe_name:
            suggestions.append(f"Which wine pairs best with {recipe_name}?")
    if len(suggestions) < 2:
        fallbacks = [
            "Show me a bold red wine for grilled red meat.",
            "Suggest a light white wine for seafood.",
            "What sparkling wine works for a celebration dinner?",
        ]
        for fb in fallbacks:
            if fb not in suggestions:
                suggestions.append(fb)
            if len(suggestions) >= 3:
                break
    return suggestions[:3]


def _ocr_context_message(image: str, mime_type: str) -> str:
    """Run OCR via MCP and return a text summary to inject into the conversation."""
    try:
        with MCPClient() as mcp:
            result = mcp.call_tool("ocr_scan_label", {"base64_image": image, "mime_type": mime_type})
        parts = []
        if result.get("name"):
            parts.append(f"Name: {result['name']}")
        if result.get("winery"):
            parts.append(f"Winery: {result['winery']}")
        if result.get("year"):
            parts.append(f"Year: {result['year']}")
        if result.get("type"):
            parts.append(f"Type: {result['type']}")
        if result.get("region"):
            parts.append(f"Region: {result['region']}")
        if result.get("country"):
            parts.append(f"Country: {result['country']}")
        if result.get("grapeVarieties"):
            grapes = result["grapeVarieties"]
            if isinstance(grapes, list):
                grapes = ", ".join(grapes)
            parts.append(f"Grapes: {grapes}")
        if result.get("alcohol"):
            parts.append(f"Alcohol: {result['alcohol']}%")
        if parts:
            return "📸 Wine label scanned. Identified: " + " | ".join(parts)
        raw = result.get("rawText", "")
        return f"📸 Wine label scanned. Raw text: {raw}" if raw else "📸 Wine label scanned but no details could be extracted."
    except Exception as exc:
        log.warning("OCR via MCP failed: %s", exc)
        return "📸 Wine label scan failed. Please describe the wine in text."


def run_agent(messages: list[dict], user_id: str | None, top_k: int, image: str | None = None, mime_type: str = "image/jpeg") -> dict[str, Any]:
    llm_messages = [{"role": m["role"], "content": m["content"]} for m in messages]

    if image:
        ocr_text = _ocr_context_message(image, mime_type)
        if llm_messages and llm_messages[-1]["role"] == "user":
            llm_messages[-1] = {
                "role": "user",
                "content": f"{ocr_text}\n\n{llm_messages[-1]['content']}".strip(),
            }
        else:
            llm_messages.append({"role": "user", "content": ocr_text})

    system = SYSTEM_PROMPT
    if user_id:
        system += f"\n\nCurrent user ID: {user_id}. Call get_user_preferences to personalize recommendations."

    collected_wines: dict[str, dict] = {}
    collected_recipes: dict[str, dict] = {}
    response_msg: dict[str, Any] = {"role": "assistant", "content": ""}

    for _ in range(4):
        response_msg = call_llm_chat(llm_messages, system_prompt=system, tools=TOOLS)

        tool_calls = response_msg.get("tool_calls") or []
        if not tool_calls:
            break

        llm_messages.append(response_msg)

        for tool_call in tool_calls:
            fn_name = tool_call["function"]["name"]
            try:
                fn_args = json.loads(tool_call["function"]["arguments"])
            except (json.JSONDecodeError, KeyError):
                fn_args = {}

            try:
                with MCPClient() as mcp:
                    result = mcp.call_tool(fn_name, fn_args)
            except Exception as exc:
                log.warning("MCP tool %s failed: %s", fn_name, exc)
                result = {"error": str(exc), "results": []}

            if fn_name == "search_wines":
                for wine in result.get("results", []):
                    wid = wine.get("wine_id")
                    if wid and wid not in collected_wines:
                        collected_wines[wid] = wine
            elif fn_name == "search_recipes":
                for recipe in result.get("results", []):
                    rid = recipe.get("recipe_id")
                    if rid and rid not in collected_recipes:
                        collected_recipes[rid] = recipe

            llm_messages.append({
                "role": "tool",
                "tool_call_id": tool_call["id"],
                "content": json.dumps(result, ensure_ascii=False),
            })

    reply = response_msg.get("content") or ""
    wines = [_format_wine(w) for w in list(collected_wines.values())[:top_k]]
    recipes = [_format_recipe(r) for r in list(collected_recipes.values())[:top_k]]

    return {
        "mode": "llm_chat",
        "source": "groq+mcp",
        "reply": reply,
        "wines": wines,
        "recipes": recipes,
        "followUpSuggestions": _generate_follow_ups(wines, recipes),
    }


def run_agent_stream(messages: list[dict], user_id: str | None, top_k: int, image: str | None = None, mime_type: str = "image/jpeg") -> None:
    """
    Streaming variant: tool calls run synchronously, then the final LLM
    response is streamed as JSON lines to stdout:
      {"t": "chunk", "c": "<text>"}  — one per content chunk
      {"t": "done", "wines": [...], "recipes": [...], "followUps": [...]}
    """
    llm_messages = [{"role": m["role"], "content": m["content"]} for m in messages]

    if image:
        ocr_text = _ocr_context_message(image, mime_type)
        sys.stdout.write(json.dumps({"t": "ocr", "c": ocr_text}, ensure_ascii=False) + "\n")
        sys.stdout.flush()
        if llm_messages and llm_messages[-1]["role"] == "user":
            llm_messages[-1] = {
                "role": "user",
                "content": f"{ocr_text}\n\n{llm_messages[-1]['content']}".strip(),
            }
        else:
            llm_messages.append({"role": "user", "content": ocr_text})

    system = SYSTEM_PROMPT
    if user_id:
        system += f"\n\nCurrent user ID: {user_id}. Call get_user_preferences to personalize recommendations."

    collected_wines: dict[str, dict] = {}
    collected_recipes: dict[str, dict] = {}

    # Phase 1: tool-call loop (synchronous, max 3 iterations)
    for _ in range(3):
        response_msg = call_llm_chat(llm_messages, system_prompt=system, tools=TOOLS)
        tool_calls = response_msg.get("tool_calls") or []
        if not tool_calls:
            break

        llm_messages.append(response_msg)

        for tool_call in tool_calls:
            fn_name = tool_call["function"]["name"]
            try:
                fn_args = json.loads(tool_call["function"]["arguments"])
            except (json.JSONDecodeError, KeyError):
                fn_args = {}

            try:
                with MCPClient() as mcp:
                    result = mcp.call_tool(fn_name, fn_args)
            except Exception as exc:
                log.warning("MCP tool %s failed: %s", fn_name, exc)
                result = {"error": str(exc), "results": []}

            if fn_name == "search_wines":
                for wine in result.get("results", []):
                    wid = wine.get("wine_id")
                    if wid and wid not in collected_wines:
                        collected_wines[wid] = wine
            elif fn_name == "search_recipes":
                for recipe in result.get("results", []):
                    rid = recipe.get("recipe_id")
                    if rid and rid not in collected_recipes:
                        collected_recipes[rid] = recipe

            llm_messages.append({
                "role": "tool",
                "tool_call_id": tool_call["id"],
                "content": json.dumps(result, ensure_ascii=False),
            })

    # Phase 2: stream the final text response (no tools → forced prose)
    for chunk in call_llm_chat_stream(llm_messages, system_prompt=system):
        sys.stdout.write(json.dumps({"t": "chunk", "c": chunk}, ensure_ascii=False) + "\n")
        sys.stdout.flush()

    wines = [_format_wine(w) for w in list(collected_wines.values())[:top_k]]
    recipes = [_format_recipe(r) for r in list(collected_recipes.values())[:top_k]]

    sys.stdout.write(
        json.dumps(
            {"t": "done", "wines": wines, "recipes": recipes, "followUps": _generate_follow_ups(wines, recipes)},
            ensure_ascii=False,
        )
        + "\n"
    )
    sys.stdout.flush()


def main() -> None:
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(json.dumps({"error": f"Invalid JSON input: {exc}"}))
        sys.exit(1)

    messages = payload.get("messages", [])
    user_id = payload.get("userId") or None
    top_k = int(payload.get("topK", 4))
    stream = bool(payload.get("stream", False))
    image = payload.get("image") or None
    mime_type = payload.get("mimeType") or "image/jpeg"

    if not messages:
        print(json.dumps({"error": "No messages provided."}))
        sys.exit(1)

    try:
        if stream:
            run_agent_stream(messages, user_id, top_k, image=image, mime_type=mime_type)
        else:
            result = run_agent(messages, user_id, top_k, image=image, mime_type=mime_type)
            print(json.dumps(result, ensure_ascii=False))
    except Exception as exc:
        log.exception("Chat agent error")
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
