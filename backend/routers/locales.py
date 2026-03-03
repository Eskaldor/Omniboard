# backend/routers/locales.py
from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException
from pathlib import Path

router = APIRouter(prefix="/api/locales", tags=["locales"])

DATA_DIR = Path("data")
SUPPORTED_LANGS = {"ru", "en"}


@router.get("/{lang}/{namespace:path}")
async def get_locale(lang: str, namespace: str):
    if lang not in SUPPORTED_LANGS:
        raise HTTPException(status_code=400, detail=f"Unsupported language: {lang}")

    # Разбираем namespace: "core" или "systems/D&D 5e"
    if namespace == "core":
        locale_path = DATA_DIR / "locales" / lang / "core.json"
    elif namespace.startswith("systems/"):
        system_name = namespace.removeprefix("systems/")
        locale_path = DATA_DIR / "systems" / system_name / "locales" / f"{lang}.json"
    else:
        raise HTTPException(status_code=400, detail=f"Unknown namespace: {namespace}")

    if not locale_path.exists():
        # Отдаём пустой объект вместо 404 — i18next не ломается
        return {}

    with locale_path.open(encoding="utf-8") as f:
        return json.load(f)
