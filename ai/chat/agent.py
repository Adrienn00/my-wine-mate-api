#!/usr/bin/env python3
"""Conversational sommelier chat agent using Groq tool calling + MCP."""

from __future__ import annotations

import base64
import json
import logging
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

CURRENT_DIR = Path(__file__).resolve().parent
AI_ROOT = CURRENT_DIR.parent
if str(AI_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_ROOT))

from llm.client import call_llm_chat, call_llm_chat_stream
from mcp.client import MCPClient

log = logging.getLogger(__name__)

LARGE_MODEL = "llama-3.3-70b-versatile"
SMALL_MODEL = "llama-3.1-8b-instant"

_COMPLEX_KEYWORDS = {
    "recommend", "suggest", "find", "search", "look up", "show me",
    "pair", "pairing", "goes with", "match", "compare", "difference",
    "explain", "tell me about", "what wine", "which wine", "best wine",
    "similar", "alternative", "based on", "prefer", "preference",
    "ajánl", "keres", "talál", "párosít", "hasonló", "magyarázz",
}

def _pick_tool_model(messages: list[dict]) -> str:
    """Use small model for short greetings/knowledge questions, large for everything that likely needs tool calls."""
    last_user = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
    if not isinstance(last_user, str):
        return LARGE_MODEL
    words = last_user.lower().split()
    if len(words) > 25:
        return LARGE_MODEL
    if any(kw in last_user.lower() for kw in _COMPLEX_KEYWORDS):
        return LARGE_MODEL
    return SMALL_MODEL

SYSTEM_PROMPT = """You are a friendly, knowledgeable sommelier assistant for My Wine Mate, a personal wine and recipe app.

Your role is to help users discover wines and recipes from THEIR OWN database, and to inform them about any wine they ask about or scan.
Use the provided search tools to find relevant wines and recipes, then explain your recommendations naturally.

Rules:
- Use search_wines to find wines, search_recipes to find recipes from the user's collection.
- If a user_id is mentioned in context, call get_user_preferences first to personalize your search.
- After searching, explain in a friendly, conversational tone WHY each result fits the user's request.
- Be specific: mention wine types, styles, flavors, or recipe ingredients from the actual results.
- If a recipe search returns no results, suggest 2-3 food pairing ideas from your own knowledge that suit the wine's style.
- Respond in the same language the user writes in (English or Hungarian).
- Keep responses warm, helpful, and concise — like a real sommelier at a wine bar.
- If the conversation starts with a wine label scan result:
  1. FIRST call search_wines with the exact wine name and winery to check if it is in the user's database. If found, show it prominently.
  2. If NOT found in the database, call enrich_wine_web to look up detailed information about this wine from your knowledge (characteristics, flavor profile, origin, food pairings).
  3. THEN search for similar wines (same region, type, or grape variety) to offer alternatives from the database.
  4. Summarize what you found: the info about the scanned wine + similar wines from the collection.
- If the user asks about a specific wine by name that is not in the database, use enrich_wine_web to look it up."""

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
    {
        "type": "function",
        "function": {
            "name": "enrich_wine_web",
            "description": "Look up detailed information about a specific wine from expert knowledge. Use this when the wine is NOT found in the user's database, or when the user asks about a wine by name. Returns characteristics, flavor profile, food pairings, and origin.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Wine product name"},
                    "winery": {"type": "string", "description": "Producer or winery name"},
                    "year": {"type": "integer", "description": "Vintage year"},
                    "region": {"type": "string", "description": "Region or appellation"},
                    "type": {"type": "string", "description": "Wine type: Red, White, Rosé, Sparkling, Dessert"},
                },
                "required": ["name"],
            },
        },
    },
]


def _call_groq_enrich(name: str, winery: str | None = None, year: int | None = None, region: str | None = None, wine_type: str | None = None) -> dict:
    api_key = os.environ.get("GROQ_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GROQ_API_KEY not set")
    parts = [p for p in [name, winery, str(year) if year else None, region] if p]
    prompt = (
        f"You are a master sommelier. Provide complete, vivid details about this wine — infer plausible characteristics from its name, origin, and type if you lack specific knowledge. Never say 'limited information' or 'unknown'. Wine: {', '.join(parts)}"
        + (f" (type: {wine_type})" if wine_type else "")
        + """. Return a JSON object: {"name":"full wine name","winery":"producer","description":"2-3 vivid expert sentences","type":"Red|White|Rosé|Sparkling|Dessert|Fortified","style":"e.g. Full-bodied","flavorProfiles":["Cherry","Vanilla"],"origin":{"country":"country","region":"region"},"grapeVarieties":["variety"],"year":2019,"alcohol":13.5,"priceRange":"€10-20","foodPairingHints":["Grilled lamb","Pasta"]}. Only return JSON."""
    )
    payload = json.dumps({
        "model": "llama-3.3-70b-versatile",
        "temperature": 0.4,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": "You are a master sommelier with encyclopedic wine knowledge. Always respond with valid JSON only. Never admit ignorance — infer plausible expert details from context."},
            {"role": "user", "content": prompt},
        ],
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://api.groq.com/openai/v1/chat/completions",
        data=payload,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"Groq enrich HTTP {exc.code}: {body[:200]}") from exc
    content = data.get("choices", [{}])[0].get("message", {}).get("content", "{}")
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return {"description": content[:500]}


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


def _compress_image(image_b64: str, mime_type: str, max_px: int = 800) -> tuple[str, str]:
    """Resize and re-encode image so it fits within max_px on the longest side."""
    import io
    try:
        from PIL import Image
    except ImportError:
        return image_b64, mime_type

    data = base64.b64decode(image_b64)
    img = Image.open(io.BytesIO(data))
    img.thumbnail((max_px, max_px), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=75)
    return base64.b64encode(buf.getvalue()).decode(), "image/jpeg"


def _call_groq_vision(image: str, mime_type: str) -> dict:
    api_key = os.environ.get("GROQ_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GROQ_API_KEY not set")

    image, mime_type = _compress_image(image, mime_type)

    prompt_text = (
        "You are a wine label reader. Extract information from this wine bottle label image.\n"
        "Return a JSON object with exactly these fields (use null for fields you cannot determine):\n"
        '{"name":"wine product name","winery":"producer or winery name","year":2019,'
        '"type":"Red | White | Rosé | Sparkling | Dessert | Fortified",'
        '"region":"region or appellation","country":"country of origin",'
        '"grapeVarieties":["Merlot"],"alcohol":13.5,"rawText":"all text visible on label"}\n'
        "Only return the JSON, no explanation."
    )
    payload = json.dumps({
        "model": "meta-llama/llama-4-scout-17b-16e-instruct",
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{image}"}},
                {"type": "text", "text": prompt_text},
            ],
        }],
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://api.groq.com/openai/v1/chat/completions",
        data=payload,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}", "User-Agent": "my-wine-mate/1.0"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"Groq vision HTTP {exc.code}: {body[:300]}") from exc

    text = data.get("choices", [{}])[0].get("message", {}).get("content", "{}")
    json_match = re.search(r"```json\s*([\s\S]*?)```", text) or re.search(r"(\{[\s\S]*\})", text)
    json_str = json_match.group(1) if json_match else text
    try:
        return json.loads(json_str.strip())
    except json.JSONDecodeError:
        return {"rawText": text}


def _ocr_context_message(image: str, mime_type: str) -> tuple[bool, str]:
    """Call Groq vision and return (success, text) to inject into the conversation."""
    try:
        result = _call_groq_vision(image, mime_type)
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
            return True, "📸 Wine label scanned. Identified: " + " | ".join(parts)
        raw = result.get("rawText", "")
        if raw:
            return True, f"📸 Wine label scanned. Raw text: {raw}"
        return False, "📸 Wine label scanned but no details could be extracted. Please describe the wine in text."
    except Exception as exc:
        log.warning("OCR failed: %s", exc)
        return False, f"📸 Wine label scan failed: {exc}"


def run_agent(messages: list[dict], user_id: str | None, top_k: int, image: str | None = None, mime_type: str = "image/jpeg") -> dict[str, Any]:
    llm_messages = [{"role": m["role"], "content": m["content"]} for m in messages]

    if image:
        ocr_ok, ocr_text = _ocr_context_message(image, mime_type)
        if not ocr_ok:
            return {
                "mode": "llm_chat",
                "source": "groq+mcp",
                "reply": ocr_text,
                "wines": [],
                "recipes": [],
                "followUpSuggestions": [],
            }
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

    tool_model = _pick_tool_model(llm_messages)

    # Phase 1: tool calling loop
    for _ in range(4):
        response_msg = call_llm_chat(llm_messages, system_prompt=system, tools=TOOLS, model_override=tool_model)

        tool_calls = response_msg.get("tool_calls") or []
        if not tool_calls:
            llm_messages.append(response_msg)
            break

        llm_messages.append(response_msg)

        for tool_call in tool_calls:
            fn_name = tool_call["function"]["name"]
            try:
                fn_args = json.loads(tool_call["function"]["arguments"])
            except (json.JSONDecodeError, KeyError):
                fn_args = {}

            if fn_name == "enrich_wine_web":
                try:
                    result = _call_groq_enrich(
                        name=fn_args.get("name", ""),
                        winery=fn_args.get("winery"),
                        year=fn_args.get("year"),
                        region=fn_args.get("region"),
                        wine_type=fn_args.get("type"),
                    )
                except Exception as exc:
                    log.warning("Groq enrich failed: %s", exc)
                    result = {"error": str(exc)}
            else:
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

    # Phase 2: one clean prose call without tools (small model is enough for presenting results)
    final_msg = call_llm_chat(llm_messages, system_prompt=system, tools=None, model_override=SMALL_MODEL)
    reply = (final_msg.get("content") or "").strip()

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
        ocr_ok, ocr_text = _ocr_context_message(image, mime_type)
        sys.stdout.write(json.dumps({"t": "ocr", "c": ocr_text}, ensure_ascii=False) + "\n")
        sys.stdout.flush()
        if not ocr_ok:
            sys.stdout.write(json.dumps({"t": "done", "wines": [], "recipes": [], "followUps": []}, ensure_ascii=False) + "\n")
            sys.stdout.flush()
            return
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

    tool_model = _pick_tool_model(llm_messages)

    # Phase 1: tool-call loop (synchronous, max 3 iterations)
    for _ in range(3):
        response_msg = call_llm_chat(llm_messages, system_prompt=system, tools=TOOLS, model_override=tool_model)
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

            if fn_name == "enrich_wine_web":
                try:
                    result = _call_groq_enrich(
                        name=fn_args.get("name", ""),
                        winery=fn_args.get("winery"),
                        year=fn_args.get("year"),
                        region=fn_args.get("region"),
                        wine_type=fn_args.get("type"),
                    )
                except Exception as exc:
                    log.warning("Groq enrich failed: %s", exc)
                    result = {"error": str(exc)}
            else:
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

    # Phase 2: stream the final text response (small model sufficient for presenting results)
    for chunk in call_llm_chat_stream(llm_messages, system_prompt=system, model_override=SMALL_MODEL):
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

    groq_api_key = (payload.get("groqApiKey") or "").strip()
    if groq_api_key:
        os.environ["GROQ_API_KEY"] = groq_api_key
    else:
        print(json.dumps({"error": "Groq API key required. Add your key in Profile → API Settings."}))
        sys.exit(1)

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
