# AI Pairing Overview

This document summarizes how the wine-recipe pairing module evolved, what the original idea was, what we changed later, and why.

## Goal

The pairing module should recommend:

- wines for a selected recipe
- recipes for a selected wine

Later, the goal was expanded with two important requirements:

- support a general "best match" recommendation
- support a second recommendation path that also uses the user's saved preferences

The long-term goal is also to support a more conversational sommelier-style flow, where the model can reason about a wine or recipe first, then search the application's own database for the most relevant items.

## Original Idea

The original project idea was mainly based on a structured `XGBoost` recommendation pipeline.

The reasoning was:

- extract signals from wines and recipes
- convert them into structured features
- train a classifier on wine-recipe pairs
- use the trained model at runtime to rank recommendations

This gave the project:

- a deterministic and testable recommendation engine
- a clear machine-learning component for the thesis/project
- a way to incorporate expert rules and user feedback into training data

## Original XGBoost Pipeline

The original `XGBoost` flow is now grouped under:

- [ai/xgboost/recommend_pairings.py](/home/adrienn/allamvizsga/backend/my-wine-mate-api/ai/xgboost/recommend_pairings.py)
- [ai/xgboost/train_pairing_model.py](/home/adrienn/allamvizsga/backend/my-wine-mate-api/ai/xgboost/train_pairing_model.py)
- [ai/xgboost/generate_pairing_dataset.py](/home/adrienn/allamvizsga/backend/my-wine-mate-api/ai/xgboost/generate_pairing_dataset.py)
- [ai/xgboost/generate_silver_labels.py](/home/adrienn/allamvizsga/backend/my-wine-mate-api/ai/xgboost/generate_silver_labels.py)
- [ai/xgboost/seed_pairing_knowledge.py](/home/adrienn/allamvizsga/backend/my-wine-mate-api/ai/xgboost/seed_pairing_knowledge.py)

### 1. Shared signal extraction

Implemented in:

- [pairing_common.py](/home/adrienn/allamvizsga/backend/my-wine-mate-api/ai/pairing_common.py)

This file extracts structured culinary and wine signals such as:

- wine type
- wine style
- sweetness
- body
- acidity
- tannin
- flavour notes
- pairing targets
- recipe categories
- main ingredients
- meat types
- spice level
- cooking methods
- textures
- sauce types

These signals were used both for:

- building ML feature rows
- heuristic pairing logic

### 2. Knowledge base

Implemented in:

- [pairing_knowledge_base.json](/home/adrienn/allamvizsga/backend/my-wine-mate-api/ai/pairing_knowledge_base.json)
- [ai/xgboost/seed_pairing_knowledge.py](/home/adrienn/allamvizsga/backend/my-wine-mate-api/ai/xgboost/seed_pairing_knowledge.py)

The knowledge base stores expert pairing rules such as:

- good pairings
- bad pairings
- confidence level
- score
- wine-side criteria
- food-side criteria

These rules are inserted into MongoDB and were used to bootstrap the training data.

### 3. Dataset generation

Implemented in:

- [ai/xgboost/generate_pairing_dataset.py](/home/adrienn/allamvizsga/backend/my-wine-mate-api/ai/xgboost/generate_pairing_dataset.py)

This script:

- reads confirmed wines and recipes from MongoDB
- matches them against expert pairing rules
- builds labeled wine-recipe pairs
- can merge saved user feedback

Generated artifacts:

- `pairing_kb_dataset.csv`
- `pairing_kb_dataset.json`
- `pairing_kb_dataset_summary.json`

### 4. Model training

Implemented in:

- [ai/xgboost/train_pairing_model.py](/home/adrienn/allamvizsga/backend/my-wine-mate-api/ai/xgboost/train_pairing_model.py)

This script:

- builds or loads the dataset
- vectorizes feature dictionaries
- trains an `XGBoost` classifier
- evaluates the model
- saves the trained model and metrics

Generated artifacts:

- `xgboost_pairing_model.joblib`
- `training_metrics.json`
- `test_predictions_preview.json`

### 5. Runtime inference

Implemented in:

- [ai/xgboost/recommend_pairings.py](/home/adrienn/allamvizsga/backend/my-wine-mate-api/ai/xgboost/recommend_pairings.py)

This script loads the trained model and returns:

- top wines for a recipe
- top recipes for a wine

## Why We Started Changing It

As the project requirements became more ambitious, the pure `XGBoost` pipeline became less flexible for some use cases.

The key new requirement was:

- the system should behave more like a sommelier
- it should support saved user preferences more naturally
- and later it should support a conversational flow such as:
  "Today I feel like drinking a dry, fruity wine and I want a recipe with it too."

At that point, a purely structured ranking model was no longer enough on its own.

The project needed:

- stronger reasoning over wine style and dish style
- better personalization
- the ability to search the application's own database more dynamically

## Intermediate Stage

There was an intermediate stage where we experimented with:

- backend-built candidate lists
- heuristic ranking formulas
- preference-based score boosts
- LLM ranking over preselected candidates

That approach worked, but it had a limitation:

- too much of the pairing reasoning was still hardcoded in backend logic
- the LLM was choosing only from what the backend had already "decided" was relevant

This was useful as a stepping stone, but it was not the final sommelier-style direction.

## Current LLM-Based Direction

The current LLM pairing logic lives under:

- [ai/llm/llm_recommend_pairings.py](/home/adrienn/allamvizsga/backend/my-wine-mate-api/ai/llm/llm_recommend_pairings.py)
- [ai/llm/recommender.py](/home/adrienn/allamvizsga/backend/my-wine-mate-api/ai/llm/recommender.py)
- [ai/llm/serializers.py](/home/adrienn/allamvizsga/backend/my-wine-mate-api/ai/llm/serializers.py)
- [ai/llm/client.py](/home/adrienn/allamvizsga/backend/my-wine-mate-api/ai/llm/client.py)
- [ai/llm/common.py](/home/adrienn/allamvizsga/backend/my-wine-mate-api/ai/llm/common.py)
- [ai/llm/preferences.py](/home/adrienn/allamvizsga/backend/my-wine-mate-api/ai/llm/preferences.py)
- [ai/llm/candidates.py](/home/adrienn/allamvizsga/backend/my-wine-mate-api/ai/llm/candidates.py)

### Current idea

The system now treats the LLM more like an expert sommelier:

- the LLM receives the selected wine or recipe
- it can also receive user preferences
- it first reasons about what kinds of matches make sense
- then it helps build a retrieval plan
- then it chooses from real items in the application's own MongoDB

So the LLM is no longer used only as a final scorer.

It is increasingly used as:

- a planner
- a sommelier-style reasoning layer
- a final selector

## MCP Retrieval Layer

To support this more agent-like approach, we introduced a real local MCP layer under:

- [ai/mcp/server.py](/home/adrienn/allamvizsga/backend/my-wine-mate-api/ai/mcp/server.py)
- [ai/mcp/tools.py](/home/adrienn/allamvizsga/backend/my-wine-mate-api/ai/mcp/tools.py)
- [ai/mcp/client.py](/home/adrienn/allamvizsga/backend/my-wine-mate-api/ai/mcp/client.py)
- [ai/mcp/retrieval.py](/home/adrienn/allamvizsga/backend/my-wine-mate-api/ai/mcp/retrieval.py)

The MCP layer now contains:

- a local MCP server that speaks the MCP JSON-RPC style protocol over stdio
- Mongo-backed tools for fetching wines, recipes, and user preferences
- a small MCP client used by the LLM retrieval flow
- a retrieval orchestrator that converts LLM search plans into MCP tool calls

### What changed here

At first, the project only had an MCP-style idea:

- the LLM would decide what should be searched
- backend code would still do most of the actual filtering

That was useful as an intermediate step, but it still kept too much logic in the backend.

The newer direction is:

- the LLM first receives the wine or recipe
- the LLM reasons like a sommelier about what should pair well
- the LLM creates a search plan
- that search plan is executed through MCP tools against the application's own MongoDB
- the LLM then chooses final recommendations from real retrieved items

### Current MCP tools

The local MCP server currently exposes these tools:

- `search_recipes`
- `search_wines`
- `get_user_preferences`
- `get_recipe_by_id`
- `get_wine_by_id`

### Why this was introduced

This shift was made because the original backend-heavy filtering was too rigid.

The intended sommelier behavior is:

- for a wine, the model should infer what kinds of dishes fit it
- for a recipe, the model should infer what kinds of wines fit it
- user preferences should influence what gets searched for
- the system should search the real application database, not hallucinate recommendations

### Current MCP usage in the pairing flow

The current `LLM -> MCP -> LLM` flow works like this:

1. The model receives the selected wine or recipe.
2. The model produces a structured search specification.
3. [ai/mcp/retrieval.py](/home/adrienn/allamvizsga/backend/my-wine-mate-api/ai/mcp/retrieval.py) sends that search request through the local MCP client.
4. The MCP server calls the appropriate Mongo-backed tool.
5. The retrieved real recipes or wines are returned to the LLM flow.
6. The LLM selects the best final matches from those retrieved candidates.

## Two Recommendation Modes

The frontend now needs two recommendation blocks:

1. `Good recommendations`
   This is the general sommelier-style recommendation for the selected wine or recipe.

2. `Based on your preferences`
   This uses the same sommelier-style flow, but also incorporates saved user preferences.

The important design decision is:

- both lists should come from LLM-based sommelier reasoning
- the preference-based list should not be a completely different rule engine
- it should be the same conceptual flow, just with additional personal context

## Folder Structure After Refactor

The AI code is now split more clearly:

- `ai/xgboost/`
  original ML training and inference pipeline

- `ai/llm/`
  LLM-based pairing orchestration

- `ai/mcp/`
  actual MCP server, tools, client, and retrieval integration used by the LLM-based flow

- `ai/compat/`
  temporary compatibility wrappers kept after the folder split

This was done to make the codebase easier to reason about:

- model training logic should not live next to LLM orchestration
- retrieval logic should be isolated from prompt orchestration
- compatibility wrappers should not clutter the main AI root

## Backend Integration

Implemented in:

- [pairing.service.js](/home/adrienn/allamvizsga/backend/my-wine-mate-api/src/pairing/pairing.service.js)
- [pairing.controller.js](/home/adrienn/allamvizsga/backend/my-wine-mate-api/src/pairing/pairing.controller.js)
- [pairing.router.js](/home/adrienn/allamvizsga/backend/my-wine-mate-api/src/pairing/pairing.router.js)

Important endpoints:

- `GET /api/pairings/recommend`
- `GET /api/pairings/recommend-tabs` (older tab-based UI support)
- `POST /api/pairings/feedback`
- `POST /api/pairings/agent-search` (new conversational search direction)

## User Feedback Loop

Implemented in:

- [pairingFeedback.model.js](/home/adrienn/allamvizsga/backend/my-wine-mate-api/src/pairing/pairingFeedback.model.js)

Users can mark a recommendation as:

- `Good match`
- `Bad match`

This feedback remains useful for:

- future `XGBoost` retraining
- future ranking calibration
- analysis of recommendation quality

## Why This Still Counts as AI

This project now contains multiple AI approaches:

- structured machine learning with `XGBoost`
- LLM-based reasoning for sommelier-style recommendation
- retrieval-guided recommendation over the project's own MongoDB

So the AI element is stronger now than in the original version, not weaker.

## Original vs Current Architecture

### Original

- expert rules + feedback
- generated dataset
- `XGBoost` training
- `XGBoost` inference

### Current

- same shared signal extraction base
- original `XGBoost` pipeline preserved as a separate module
- LLM-based sommelier recommendation layer added
- MCP retrieval layer added
- two recommendation variants supported:
  - general
  - preference-aware

## Why We Switched

We switched because the original ML-only approach was not expressive enough for the newer goals.

The newer design supports:

- more natural pairing reasoning
- stronger personalization
- conversational expansion later
- better explanation of recommendations
- a cleaner separation between:
  - training
  - retrieval
  - orchestration
  - runtime recommendation

## Current Limitations

- the MCP layer is local to this project, not a separately deployed external service
- the LLM flow still needs more real-world evaluation on many wines and recipes
- the documentation and wrapper cleanup can still be simplified further
- the old tab-based UI path is no longer central to the architecture

## Recommended Next Steps

- evaluate the general and preference-aware LLM recommendation quality on multiple wines and recipes
- decide whether the `ai/compat/` wrappers should be kept or removed
- decide whether the old tab-based route should stay or be removed
- later add a full conversational sommelier UI on top of `agent-search`
- if needed, reintroduce `XGBoost` as an explicit fallback, not as the main path
