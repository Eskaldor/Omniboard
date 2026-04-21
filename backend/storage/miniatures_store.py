from __future__ import annotations

import json

from backend.models import MiniatureEntry
from backend.paths import MINIATURES_PATH


def load_all() -> list[MiniatureEntry]:
    if not MINIATURES_PATH.is_file():
        return []
    try:
        raw = json.loads(MINIATURES_PATH.read_text(encoding="utf-8"))
        if isinstance(raw, list):
            return [MiniatureEntry.model_validate(x) for x in raw]
    except Exception:
        pass
    return []


def save_all(items: list[MiniatureEntry]) -> None:
    MINIATURES_PATH.parent.mkdir(parents=True, exist_ok=True)
    serialized = [
        m.model_dump(mode="json", exclude_none=False, exclude_unset=False) for m in items
    ]
    MINIATURES_PATH.write_text(
        json.dumps(serialized, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
