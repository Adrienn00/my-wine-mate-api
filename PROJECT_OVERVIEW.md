# MyWineMate Project Overview

This file is the main living project document for MyWineMate.
It should be updated continuously as the project evolves, so later formal documentation can be written from a single source.

## Project Goal

MyWineMate is a wine and recipe recommendation web application.

Its main goal is to connect:

- wine discovery
- recipe discovery
- user preferences
- AI-based wine-food pairing

The system allows users to browse wines and recipes, save favorites, manage profiles, and receive pairing recommendations between food and wine.

## Main Project Parts

The project consists of two main application layers:

### 1. Frontend

The frontend is the user-facing web application.

Its responsibilities include:

- navigation and page rendering
- wine and recipe browsing
- search and filtering
- user profile management
- favorites and ratings
- admin-facing UI flows
- displaying AI-generated pairing recommendations
- collecting pairing feedback from users

### 2. Backend

The backend is a REST API built with `Node.js`, `Express`, and `MongoDB`.

Its responsibilities include:

- serving wine, recipe, user, and pairing data
- authentication and authorization
- profile handling
- favorites and ratings management
- admin approval flows
- integrating the AI pairing module
- storing user pairing feedback

## Backend Structure

The main backend modules are:

- [src/wine](/home/adrienn/allamvizsga/backend/my-wine-mate-api/src/wine)
- [src/recipe](/home/adrienn/allamvizsga/backend/my-wine-mate-api/src/recipe)
- [src/user](/home/adrienn/allamvizsga/backend/my-wine-mate-api/src/user)
- [src/pairing](/home/adrienn/allamvizsga/backend/my-wine-mate-api/src/pairing)
- [src/database](/home/adrienn/allamvizsga/backend/my-wine-mate-api/src/database)

### Wine module

The wine module handles:

- wine storage
- wine metadata
- approval status
- ratings
- live offer integration
- wine-related API endpoints

Main files:

- [wine.model.js](/home/adrienn/allamvizsga/backend/my-wine-mate-api/src/wine/wine.model.js)
- [wine.service.js](/home/adrienn/allamvizsga/backend/my-wine-mate-api/src/wine/wine.service.js)
- [wine.controller.js](/home/adrienn/allamvizsga/backend/my-wine-mate-api/src/wine/wine.controller.js)

### Recipe module

The recipe module handles:

- recipe storage
- recipe categories
- ingredients and instructions
- confirmation and approval state
- recipe-related API endpoints

Main files:

- [recipe.model.js](/home/adrienn/allamvizsga/backend/my-wine-mate-api/src/recipe/recipe.model.js)
- [recipe.service.js](/home/adrienn/allamvizsga/backend/my-wine-mate-api/src/recipe/recipe.service.js)
- [recipe.controller.js](/home/adrienn/allamvizsga/backend/my-wine-mate-api/src/recipe/recipe.controller.js)

### User module

The user module handles:

- registration
- login
- JWT-based authentication
- profile management
- role and admin checks
- user-specific preferences and actions

Main files:

- [user.model.js](/home/adrienn/allamvizsga/backend/my-wine-mate-api/src/user/user.model.js)
- [user.service.js](/home/adrienn/allamvizsga/backend/my-wine-mate-api/src/user/user.service.js)
- [user.middleware.js](/home/adrienn/allamvizsga/backend/my-wine-mate-api/src/user/user.middleware.js)

### Pairing module

The pairing module handles:

- pairing rule storage
- AI recommendation requests
- pairing feedback storage
- pairing feedback review workflow
- admin-triggered model retraining
- communication between the backend and the Python AI scripts

Main files:

- [pairing.model.js](/home/adrienn/allamvizsga/backend/my-wine-mate-api/src/pairing/pairing.model.js)
- [pairingFeedback.model.js](/home/adrienn/allamvizsga/backend/my-wine-mate-api/src/pairing/pairingFeedback.model.js)
- [pairing.service.js](/home/adrienn/allamvizsga/backend/my-wine-mate-api/src/pairing/pairing.service.js)
- [pairing.controller.js](/home/adrienn/allamvizsga/backend/my-wine-mate-api/src/pairing/pairing.controller.js)

## Database

The application uses MongoDB.

The main collections are:

- `wines`
- `recipes`
- `users`
- `pairingrules`
- `pairingfeedbacks`

The pairing-related collections are especially important for the AI system:

- `pairingrules` stores structured expert knowledge
- `pairingfeedbacks` stores user feedback on generated recommendations
- `pairingtrainingruns` stores admin-triggered retraining history and outcomes

## AI Pairing Module

The AI pairing part is implemented in Python.

At a high level, it works like this:

1. wines and recipes are read from MongoDB
2. structured features are extracted from both sides
3. training pairs are generated from expert rules
4. user feedback can override or enrich labels
5. an `XGBoost` model is trained
6. the backend calls the trained model to generate recommendations

### AI pairing files

Main AI files:

- [ai/pairing_common.py](/home/adrienn/allamvizsga/backend/my-wine-mate-api/ai/pairing_common.py)
- [ai/generate_pairing_dataset.py](/home/adrienn/allamvizsga/backend/my-wine-mate-api/ai/generate_pairing_dataset.py)
- [ai/generate_silver_labels.py](/home/adrienn/allamvizsga/backend/my-wine-mate-api/ai/generate_silver_labels.py)
- [ai/seed_pairing_knowledge.py](/home/adrienn/allamvizsga/backend/my-wine-mate-api/ai/seed_pairing_knowledge.py)
- [ai/train_pairing_model.py](/home/adrienn/allamvizsga/backend/my-wine-mate-api/ai/train_pairing_model.py)
- [ai/recommend_pairings.py](/home/adrienn/allamvizsga/backend/my-wine-mate-api/ai/recommend_pairings.py)
- [ai/pairing_knowledge_base.json](/home/adrienn/allamvizsga/backend/my-wine-mate-api/ai/pairing_knowledge_base.json)

### AI pairing feature scope

The model currently uses structured wine and recipe features such as:

- wine type
- wine style
- alcohol bucket
- sweetness
- body
- acidity
- tannin
- grape varieties
- flavour notes
- recipe category
- main ingredients
- meat type
- spice level
- spices
- cooking method
- texture
- sauce type

### AI pairing data sources

The current training dataset is built from:

- expert pairing rules in `pairingrules`
- high-confidence heuristic bootstrap labels for uncovered pairs
- admin-approved user feedback in `pairingfeedbacks`

If approved feedback exists for the same wine-recipe pair, it can override the rule-based label during dataset generation.

### AI pairing outputs

The AI pipeline can generate these local artifacts:

- `ai/artifacts/pairing_kb_dataset.csv`
- `ai/artifacts/pairing_kb_dataset.json`
- `ai/artifacts/pairing_kb_dataset_summary.json`
- `ai/artifacts/training_metrics.json`
- `ai/artifacts/test_predictions_preview.json`
- `ai/artifacts/xgboost_pairing_model.joblib`

These are generated files, not primary source files.

## Main API Areas

The backend exposes these main route groups:

- `/api/wines`
- `/api/recipes`
- `/api/users`
- `/api/pairings`

Important pairing-related endpoints:

- `GET /api/pairings/recommend`
- `POST /api/pairings/feedback`
- `GET /api/pairings/admin/feedback`
- `PUT /api/pairings/admin/feedback/:id/status`
- `POST /api/pairings/admin/feedback/approve-pending`
- `GET /api/pairings/admin/training-summary`
- `POST /api/pairings/admin/train`

Important wine recommendation endpoint:

- `POST /api/wines/recommendations`

## Current Recommendation Flow

The current recommendation flow is:

1. the frontend opens a wine or recipe page
2. the user launches the pairing view
3. the frontend sends a request to the backend
4. the backend calls the Python recommender
5. the recommender returns ranked results
6. the frontend displays recommendations
7. the user can submit `Good match` or `Bad match` feedback
8. admin users can review feedback, approve it for learning, then trigger retraining

## Recent Development Notes

This section should be extended over time with short notes whenever important project work is completed.

Current notable implementation state:

- backend food pairing now uses the Python AI recommender instead of frontend-only weighted scoring
- a dedicated pairing module exists in the backend
- pairing feedback is now stored through `POST /api/pairings/feedback`
- pairing feedback entries now support `pending`, `approved`, and `rejected` review states
- a new admin review flow was added so feedback can be approved before it is used for learning
- the XGBoost retraining flow now rebuilds its dataset from MongoDB by default, so the newest approved feedback can be learned without relying on stale CSV exports
- the LLM pairing pipeline now uses approved feedback as a soft ranking signal when preparing candidate lists and building the final prompt
- an admin-triggered retraining flow now exists through pairing admin endpoints and training runs are recorded in `pairingtrainingruns`
- the training dataset generator can merge user feedback into the labeled training data
- the training dataset generator can also add high-confidence heuristic positive and negative pairs to create a richer training set
- the pairing knowledge base includes both positive and negative rules
- the pairing knowledge base was expanded with more detailed grape, sauce, spice, texture, body, acidity, tannin, and cooking-method rules
- the active MongoDB pairing rule set currently contains 140 rules
- a confirmed training run completed on a 20 wine / 20 recipe sample with 400 labeled rows and 4 heuristic bootstrap rows
- the training script now includes progress logging to make long Mongo-backed runs easier to monitor
- the training flow can now be split into two steps: dataset export first, then model training from the exported CSV
- the recommendation layer now includes backend-side post-filtering and reranking for obvious domain-specific pairing mistakes
- null-name recommendation items are now filtered out from the AI response before reaching the frontend
- fried and crispy savory dishes now receive a stronger backend reranking preference toward sparkling and crisp white wines, with extra penalties for red wines
- noisy imported metadata is now partially corrected during feature extraction, for example by removing false dessert labels from clearly savory meat or seafood recipes
- a one-time database cleanup was run directly on the live recipe collection to remove clearly wrong `Dessert` tags at the source instead of masking them in the frontend
- that cleanup removed the false `Dessert` category from 114 recipes
- preference-based wine recommendations were also moved to the backend, so the frontend no longer contains a separate wine scoring engine
- the `Recommended Wines for You` page now calls the backend recommendation endpoint instead of scoring wines locally in the browser
- the project has been cleaned toward English-only user-facing text

## Strengths of the Current System

- modular backend structure
- clear separation between API logic and AI logic
- trainable machine learning recommendation model
- expert knowledge base for initial pairing quality
- richer pseudo-labeled training data through heuristic bootstrap
- backend reranking to reduce obvious recommendation mistakes
- cleaner recommendation payloads without empty-name items
- more robust feature extraction against noisy imported recipe categories
- cleaner recipe category data now comes from database correction instead of frontend-only symptom filtering
- simpler frontend architecture because both pairing recommendations and preference-based wine recommendations now come from the backend
- feedback collection for future retraining
- bilingual cleanup already completed toward English-only project consistency

## Current Limitations

- recommendation quality still needs fine-tuning
- the AI model still depends heavily on expert rules
- user feedback volume is still low
- the pairing module would benefit from more retraining cycles
- larger Mongo-backed training runs are less stable in the current environment than smaller confirmed runs
- documentation can still be expanded into a more formal project report

## Recommended Next Steps

- improve overall project documentation
- continue collecting pairing feedback
- retrain the model with more real data
- expand pairing knowledge with more ingredients, spices, and grape-specific rules
- add more validation and testing around the AI pipeline
