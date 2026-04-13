# my-wine-mate-api

## Pairing recommendation engines

The pairing endpoint now supports two engines:

- `llm`: primary recommendation engine using the Groq API with MongoDB-backed context
- `xgboost`: legacy backup engine using the existing Python model

Default behavior:

- `GET /api/pairings/recommend` uses `engine=auto`
- `auto` tries the LLM first
- if the LLM is not configured or fails, the backend falls back to `xgboost`

Optional environment variables:

- `GROQ_API_KEY`
- `GROQ_MODEL`
- `GROQ_API_URL`

Examples:

```bash
GET /api/pairings/recommend?recipeId=<recipeId>&topK=5
GET /api/pairings/recommend?recipeId=<recipeId>&topK=5&engine=llm
GET /api/pairings/recommend?recipeId=<recipeId>&topK=5&engine=xgboost
```
