from __future__ import annotations

import runpy
from pathlib import Path


if __name__ == "__main__":
    runpy.run_path(
        str(Path(__file__).resolve().parent.parent / "xgboost" / "recommend_pairings.py"),
        run_name="__main__",
    )
