from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import joblib
import pandas as pd
from sklearn.feature_extraction import DictVectorizer
from sklearn.metrics import accuracy_score, classification_report, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from xgboost import XGBClassifier

CURRENT_DIR = Path(__file__).resolve().parent
AI_ROOT = CURRENT_DIR.parent
if str(AI_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_ROOT))

from generate_pairing_dataset import build_dataset
from pairing_common import ARTIFACTS_DIR


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train an XGBoost model for wine and recipe pairing recommendations."
    )
    parser.add_argument(
        "--input-csv",
        type=Path,
        default=ARTIFACTS_DIR / "pairing_kb_dataset.csv",
        help="Path to an existing exported dataset CSV.",
    )
    parser.add_argument(
        "--use-existing-dataset",
        action=argparse.BooleanOptionalAction,
        default=False,
        help="Train from the existing dataset CSV when available instead of rebuilding it from MongoDB.",
    )
    parser.add_argument("--limit-wines", type=int, default=600)
    parser.add_argument("--limit-recipes", type=int, default=300)
    parser.add_argument(
        "--include-feedback",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Include saved pairing feedback when rebuilding the training dataset from MongoDB.",
    )
    parser.add_argument(
        "--include-heuristics",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Include heuristic bootstrap rows when rebuilding the training dataset from MongoDB.",
    )
    parser.add_argument("--random-seed", type=int, default=42)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=ARTIFACTS_DIR,
        help="Where the trained model and metrics should be saved.",
    )
    return parser.parse_args()


def load_existing_dataset(dataset_path: Path) -> tuple[pd.DataFrame, dict]:
    if not dataset_path.exists():
        raise FileNotFoundError(f"Dataset file not found: {dataset_path}")

    dataframe = pd.read_csv(dataset_path)
    summary_path = dataset_path.with_name("pairing_kb_dataset_summary.json")

    metadata = {
        "rows": int(len(dataframe)),
        "recipes_used": int(dataframe["recipe_id"].nunique()) if "recipe_id" in dataframe else 0,
        "wines_used": int(dataframe["wine_id"].nunique()) if "wine_id" in dataframe else 0,
        "rules_used": 0,
        "heuristic_rows_used": 0,
        "feedback_rows_used": 0,
        "label_breakdown": {
            "good": int((dataframe["label"] == 1).sum()) if "label" in dataframe else 0,
            "bad": int((dataframe["label"] == 0).sum()) if "label" in dataframe else 0,
        },
    }

    if summary_path.exists():
        metadata.update(json.loads(summary_path.read_text(encoding="utf-8")))

    return dataframe, metadata


def build_pipeline(random_seed: int) -> Pipeline:
    return Pipeline(
        steps=[
            ("vectorizer", DictVectorizer(sparse=True)),
            (
                "model",
                XGBClassifier(
                    n_estimators=260,
                    max_depth=6,
                    learning_rate=0.06,
                    subsample=0.9,
                    colsample_bytree=0.9,
                    objective="binary:logistic",
                    eval_metric="logloss",
                    random_state=random_seed,
                    n_jobs=1,
                    tree_method="hist",
                ),
            ),
        ]
    )


def main() -> None:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    print("Starting pairing model training...", flush=True)
    print(
        f"Requested limits -> wines: {args.limit_wines}, recipes: {args.limit_recipes}",
        flush=True,
    )

    if args.use_existing_dataset and args.input_csv.exists():
        print(f"Loading dataset from CSV -> {args.input_csv}", flush=True)
        df, source_metadata = load_existing_dataset(args.input_csv)
    else:
        print("Building dataset from MongoDB...", flush=True)
        df, source_metadata = build_dataset(
            args.limit_wines,
            args.limit_recipes,
            include_feedback=args.include_feedback,
            include_heuristics=args.include_heuristics,
        )
    print(
        "Dataset ready -> "
        f"rows: {len(df)}, "
        f"rules: {source_metadata['rules_used']}, "
        f"heuristic rows: {source_metadata.get('heuristic_rows_used', 0)}, "
        f"feedback rows: {source_metadata.get('feedback_rows_used', 0)}",
        flush=True,
    )
    if df["label"].nunique() < 2:
        raise RuntimeError("Training data must contain both positive and negative examples.")

    target = df.pop("label")
    metadata = df[
        ["recipe_id", "wine_id", "rule_name", "rule_confidence", "rule_score", "label_name"]
    ].copy()
    feature_records = df.drop(
        columns=[
            "recipe_id",
            "recipe_name",
            "wine_id",
            "wine_name",
            "label_name",
            "rule_name",
            "rule_confidence",
            "rule_score",
            "data_source",
            "feedback_direction",
            "feedback_user_id",
            "feedback_created_at",
        ],
        errors="ignore",
    ).to_dict("records")

    x_train, x_test, y_train, y_test, meta_train, meta_test = train_test_split(
        feature_records,
        target,
        metadata,
        test_size=0.2,
        random_state=args.random_seed,
        stratify=target,
    )
    print(
        f"Split ready -> train rows: {len(x_train)}, test rows: {len(x_test)}",
        flush=True,
    )

    pipeline = build_pipeline(args.random_seed)
    print("Fitting XGBoost pipeline...", flush=True)
    pipeline.fit(x_train, y_train)
    print("Model fit completed.", flush=True)

    probabilities = pipeline.predict_proba(x_test)[:, 1]
    predictions = (probabilities >= 0.5).astype(int)

    metrics = {
        "rows": int(len(df)),
        "wines_used": int(source_metadata["wines_used"]),
        "recipes_used": int(source_metadata["recipes_used"]),
        "rules_used": int(source_metadata["rules_used"]),
        "heuristic_rows_used": int(source_metadata.get("heuristic_rows_used", 0)),
        "feedback_rows_used": int(source_metadata.get("feedback_rows_used", 0)),
        "label_breakdown": source_metadata["label_breakdown"],
        "train_rows": int(len(x_train)),
        "test_rows": int(len(x_test)),
        "positive_ratio": round(float(target.mean()), 4),
        "accuracy": round(float(accuracy_score(y_test, predictions)), 4),
        "roc_auc": round(float(roc_auc_score(y_test, probabilities)), 4),
        "classification_report": classification_report(y_test, predictions, output_dict=True),
    }

    model_path = args.output_dir / "xgboost_pairing_model.joblib"
    metrics_path = args.output_dir / "training_metrics.json"
    preview_path = args.output_dir / "test_predictions_preview.json"

    print("Writing model artifacts...", flush=True)
    joblib.dump(pipeline, model_path)
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    preview = []
    for index, probability in enumerate(probabilities[:25]):
        preview.append(
            {
                "recipe_id": meta_test.iloc[index]["recipe_id"],
                "wine_id": meta_test.iloc[index]["wine_id"],
                "rule_name": meta_test.iloc[index]["rule_name"],
                "rule_confidence": meta_test.iloc[index]["rule_confidence"],
                "rule_score": float(meta_test.iloc[index]["rule_score"]),
                "predicted_probability": round(float(probability), 4),
                "predicted_label": int(predictions[index]),
                "actual_label": int(y_test.iloc[index]),
            }
        )

    preview_path.write_text(json.dumps(preview, indent=2), encoding="utf-8")

    print(f"Training rows: {metrics['rows']}")
    print(f"Wines used: {metrics['wines_used']}")
    print(f"Recipes used: {metrics['recipes_used']}")
    print(f"Accuracy: {metrics['accuracy']}")
    print(f"ROC AUC: {metrics['roc_auc']}")
    print(f"Model saved to: {model_path}")
    print(f"Metrics saved to: {metrics_path}")


if __name__ == "__main__":
    main()
