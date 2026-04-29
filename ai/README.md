# AI Pairing Pipeline

This folder contains a first trainable AI pipeline for wine and recipe pairing based on XGBoost decision trees.

## What it does

- connects to the same MongoDB database as the backend
- reads confirmed wines and confirmed recipes
- can read a separate pairing knowledge base collection from MongoDB
- builds structured pairing features from both sides
- generates pseudo-labeled training pairs from the existing pairing rules
- merges saved pairing feedback into the training dataset when available
- trains an `XGBoost` classifier
- saves the trained model and metrics under `ai/artifacts`

## Pairing knowledge base

The project can now use a dedicated `pairingrules` collection as a structured expert pairing database.

Each rule stores:

- wine-side criteria
- food-side criteria
- label: `good` or `bad`
- confidence
- score
- source

Seed the expert knowledge base:

```bash
cd /home/adrienn/allamvizsga/backend/my-wine-mate-api
.venv/bin/python ai/seed_pairing_knowledge.py
```

Generate a labeled dataset from the knowledge base:

```bash
.venv/bin/python ai/generate_pairing_dataset.py
```

Include feedback explicitly:

```bash
.venv/bin/python ai/generate_pairing_dataset.py --include-feedback
```

Generated files:

- `ai/artifacts/pairing_kb_dataset.csv`
- `ai/artifacts/pairing_kb_dataset.json`
- `ai/artifacts/pairing_kb_dataset_summary.json`

## Why this is still valid AI

The recommendation is produced by a trained model, not by a fixed score formula at inference time.
The current heuristic logic is only used to bootstrap the first training dataset until real user feedback is available.

That means the project already has:

- a real machine learning training step
- a real trained model artifact
- model-based recommendation output

Later, the same pipeline can be retrained with real labels such as favorites, clicks, ratings, and accepted pairings.
Saved `Good match / Bad match` feedback now overrides the rule-based label for the same wine-recipe pair during dataset generation.

## Install Python dependencies

```bash
cd /home/adrienn/allamvizsga/backend/my-wine-mate-api
python3 -m venv .venv
source .venv/bin/activate
pip install -r ai/requirements.txt
```

## Train the model

```bash
cd /home/adrienn/allamvizsga/backend/my-wine-mate-api
python3 ai/train_pairing_model.py
```

Optional example:

```bash
python3 ai/train_pairing_model.py --limit-wines 800 --limit-recipes 500
```

## Generate automatic labels

This exports pre-labeled wine and recipe pairs into three groups:

- `good`: strong automatic positive label
- `bad`: strong automatic negative label
- `review`: uncertain pair that should be checked manually

```bash
cd /home/adrienn/allamvizsga/backend/my-wine-mate-api
python3 ai/generate_silver_labels.py
```

Example with custom thresholds:

```bash
python3 ai/generate_silver_labels.py --limit-wines 250 --limit-recipes 180 --positive-threshold 4.5 --negative-threshold 1.0
```

Generated files:

- `ai/artifacts/silver_pair_labels.csv`
- `ai/artifacts/silver_pair_labels.json`
- `ai/artifacts/silver_pair_labels_summary.json`

Artifacts written after training:

- `ai/artifacts/xgboost_pairing_model.joblib`
- `ai/artifacts/training_metrics.json`
- `ai/artifacts/test_predictions_preview.json`

## Run recommendations with the trained model

Recommend wines for a recipe:

```bash
python3 ai/recommend_pairings.py --recipe-id RECIPE_ID --top-k 5
```

Recommend recipes for a wine:

```bash
python3 ai/recommend_pairings.py --wine-id WINE_ID --top-k 5
```

## Notes

- The scripts load `MONGO_URI` from the backend `.env`.
- The first version uses pseudo-labels derived from your existing pairing knowledge.
- Once user interaction data is available, replace the pseudo-label generation with real supervised labels.
