from __future__ import annotations

import json
from pathlib import Path

from pairing_common import ROOT_DIR, mongo_database


KNOWLEDGE_PATH = ROOT_DIR / "ai" / "pairing_knowledge_base.json"


def main() -> None:
    db = mongo_database()
    payload = json.loads(KNOWLEDGE_PATH.read_text(encoding="utf-8"))
    collection = db["pairingrules"]

    inserted = 0
    updated = 0

    for entry in payload:
        document = {
            "active": True,
            "source": "expert",
            "confidence": "medium",
            "score": 1,
            **entry,
        }
        result = collection.update_one(
            {"name": entry["name"]},
            {"$set": document},
            upsert=True,
        )
        inserted += int(result.upserted_id is not None)
        updated += int(result.upserted_id is None and result.modified_count > 0)

    print(f"Knowledge rules processed: {len(payload)}")
    print(f"Inserted: {inserted}")
    print(f"Updated: {updated}")


if __name__ == "__main__":
    main()
