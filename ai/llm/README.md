# LLM Pairing Module

This folder contains the standalone Python-based LLM recommender for
wine <-> recipe pairings. The goal is to keep all LLM logic in one place,
similar to the existing XGBoost pipeline, while letting the backend call
it as a simple script.

## Files

- `llm_recommend_pairings.py`
  - Main entry point.
  - Accepts `--recipe-id` or `--wine-id` and returns JSON results.
  - Connects directly to MongoDB using the shared `pairing_common.py` helpers.

## Environment variables

- `MONGO_URI`
- `GROQ_API_KEY`
- `GROQ_MODEL` (default: `openai/gpt-oss-20b`)
- `GROQ_API_URL` (default: `https://api.groq.com/openai/v1/chat/completions`)

## Example

```bash
python ai/llm/llm_recommend_pairings.py --recipe-id <id> --top-k 5
python ai/llm/llm_recommend_pairings.py --wine-id <id> --top-k 5
```

The script prints JSON to stdout with the same `mode/results` structure
as the existing XGBoost recommender so the backend can swap between them.
