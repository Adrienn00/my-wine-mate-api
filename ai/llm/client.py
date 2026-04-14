from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request

log = logging.getLogger(__name__)


DEFAULT_SYSTEM_PROMPT = (
    "You are an expert sommelier. "
    "Select only from the provided candidates. "
    "If user preferences are provided, prioritize them in the ranking. "
    "Return JSON only."
)


def call_llm(prompt: str, system_prompt: str | None = None) -> dict:
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("Missing environment variable: GROQ_API_KEY")

    api_url = os.getenv("GROQ_API_URL", "https://api.groq.com/openai/v1/chat/completions").strip()
    preferred_model = os.getenv("GROQ_MODEL", "").strip()
    fallback_models_raw = os.getenv(
        "GROQ_FALLBACK_MODELS", "llama-3.3-70b-versatile,llama-3.1-8b-instant"
    )
    candidate_models = []
    for model_name in [preferred_model, *fallback_models_raw.split(",")]:
        clean = model_name.strip()
        if clean and clean not in candidate_models:
            candidate_models.append(clean)

    base_payload = {
        "temperature": 0.2,
        "messages": [
            {
                "role": "system",
                "content": system_prompt or DEFAULT_SYSTEM_PROMPT,
            },
            {"role": "user", "content": prompt},
        ],
    }

    last_error_message = "Unknown LLM error."

    for model in candidate_models:
        payload = {
            **base_payload,
            "model": model,
        }
        data = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            api_url,
            data=data,
            method="POST",
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
                "User-Agent": "my-wine-mate/1.0",
            },
        )

        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                body = response.read().decode("utf-8")
        except urllib.error.HTTPError as error:
            error_body = error.read().decode("utf-8", errors="ignore")
            try:
                parsed_error = json.loads(error_body) if error_body else {}
            except json.JSONDecodeError:
                parsed_error = {}

            provider_message = (
                parsed_error.get("error", {}).get("message")
                or parsed_error.get("message")
                or error_body
                or str(error)
            )
            last_error_message = f"{error.code} for model '{model}': {provider_message}"
            log.warning(last_error_message)

            if error.code in {401, 403, 404, 429} and model != candidate_models[-1]:
                continue
            raise RuntimeError(f"LLM request failed: {last_error_message}") from error
        except Exception as error:
            last_error_message = f"model '{model}': {error}"
            log.warning("LLM call error: %s", last_error_message)
            if model != candidate_models[-1]:
                continue
            raise RuntimeError(f"LLM request failed: {last_error_message}") from error

        response_json = json.loads(body)
        raw_text = (response_json.get("choices") or [{}])[0].get("message", {}).get("content", "")
        if not raw_text:
            last_error_message = f"LLM returned empty content for model '{model}'."
            if model != candidate_models[-1]:
                continue
            raise RuntimeError(last_error_message)

        try:
            return json.loads(raw_text)
        except json.JSONDecodeError as error:
            trimmed = raw_text.strip()
            if trimmed.startswith("```"):
                lines = [line for line in trimmed.splitlines() if not line.strip().startswith("```")]
                trimmed = "\n".join(lines).strip()
                try:
                    return json.loads(trimmed)
                except json.JSONDecodeError:
                    pass
            last_error_message = f"LLM returned non-JSON content for model '{model}'."
            if model != candidate_models[-1]:
                continue
            raise RuntimeError(last_error_message) from error

    raise RuntimeError(f"LLM request failed: {last_error_message}")
