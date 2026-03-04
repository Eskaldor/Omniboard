# backend/routers/locales.py
from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, HTTPException
from pathlib import Path

router = APIRouter(prefix="/api/locales", tags=["locales"])

DATA_DIR = Path("data")

# Глобальный кеш для списка языков (инициализируется при старте)
_SUPPORTED_LANGS_CACHE: Optional[set[str]] = None


def _scan_available_languages() -> set[str]:
    """Сканирует data/locales/ и возвращает список доступных языков."""
    locales_dir = DATA_DIR / "locales"
    if not locales_dir.exists():
        return set()
    langs = set()
    for item in locales_dir.iterdir():
        if item.is_dir() and (item / "core.json").exists():
            langs.add(item.name)
    return langs


def get_supported_langs() -> set[str]:
    """Возвращает закешированный список языков (или инициализирует кеш)."""
    global _SUPPORTED_LANGS_CACHE
    if _SUPPORTED_LANGS_CACHE is None:
        _SUPPORTED_LANGS_CACHE = _scan_available_languages()
    return _SUPPORTED_LANGS_CACHE


@router.get("/languages")
async def get_supported_languages():
    """Return list of supported languages with metadata (name + flag)."""
    supported = get_supported_langs()
    languages = []
    for lang in sorted(supported):
        core_path = DATA_DIR / "locales" / lang / "core.json"
        if core_path.exists():
            try:
                with core_path.open(encoding="utf-8") as f:
                    data = json.load(f)
                    meta = data.get("_meta", {})
                    languages.append({
                        "code": lang,
                        "name": meta.get("language_name", lang.upper()),
                        "flag": meta.get("flag", "🌐")
                    })
            except Exception:
                # Если core.json битый — пропускаем
                continue
    return languages


@router.post("/languages/refresh")
async def refresh_languages():
    """Пересканирует data/locales/ и обновляет кеш языков."""
    global _SUPPORTED_LANGS_CACHE
    _SUPPORTED_LANGS_CACHE = _scan_available_languages()
    return {"status": "ok", "languages": sorted(_SUPPORTED_LANGS_CACHE)}


@router.post("/systems/{system_name}/entry")
async def set_system_locale_entry(system_name: str, body: dict):
    """
    Save or update a single key in the system locale file.
    Body: {"key": str, "value": str, "lang": str}.
    Key is the technical id (e.g. asset filename without extension), value is the display name.
    """
    if ".." in system_name or "/" in system_name or "\\" in system_name:
        raise HTTPException(status_code=400, detail="Invalid system name")
    key = body.get("key")
    value = body.get("value")
    lang = (body.get("lang") or "en").split("-")[0]
    if not key or not isinstance(key, str):
        raise HTTPException(status_code=400, detail="Missing or invalid 'key'")
    if value is None or (isinstance(value, str) and value.strip() == ""):
        raise HTTPException(status_code=400, detail="Missing or empty 'value'")
    locale_path = DATA_DIR / "systems" / system_name / "locales" / f"{lang}.json"
    locale_path.parent.mkdir(parents=True, exist_ok=True)
    data = {}
    if locale_path.exists():
        try:
            with locale_path.open(encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            data = {}
    if not isinstance(data, dict):
        data = {}
    data[str(key).strip()] = value if isinstance(value, str) else str(value)
    with locale_path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return {"status": "ok", "key": key, "lang": lang}


@router.get("/{lang}/{namespace:path}")
async def get_locale(lang: str, namespace: str):
    supported = get_supported_langs()
    if lang not in supported:
        raise HTTPException(status_code=400, detail=f"Unsupported language: {lang}")

    # Разбираем namespace: "core" или "systems/D&D 5e"
    if namespace == "core":
        locale_path = DATA_DIR / "locales" / lang / "core.json"
    elif namespace.startswith("systems/"):
        system_name = namespace.removeprefix("systems/")
        # Защита от path traversal
        if ".." in system_name or "/" in system_name or "\\" in system_name:
            raise HTTPException(status_code=400, detail="Invalid system name")
        locale_path = DATA_DIR / "systems" / system_name / "locales" / f"{lang}.json"
    else:
        raise HTTPException(status_code=400, detail=f"Unknown namespace: {namespace}")

    if not locale_path.exists():
        # Отдаём пустой объект вместо 404 — i18next не ломается
        return {}

    try:
        with locale_path.open(encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}
