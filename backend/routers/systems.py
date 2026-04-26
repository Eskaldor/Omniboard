from __future__ import annotations

import json
import re
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.layout_profiles_store import read_layout_profiles, write_layout_profiles
from backend.led_profiles_store import read_led_profiles
from backend.models import HardwareTrigger, LayoutProfile, LedProfile
from backend.paths import ASSETS_DIR, DATA_DIR, LOCALES_DIR, get_actors_system_dir
from backend.utils.config_loader import is_safe_system_subdirectory, load_config_with_override


router = APIRouter(prefix="/api/systems", tags=["systems"])
SUPPORTED_LANGS = {"ru", "en"}


def _system_slug(system_name: str) -> str:
    """Normalize system name for locale filename, e.g. 'D&D 5e' -> 'd_d_5_e'."""
    s = re.sub(r"[^a-z0-9]+", "_", (system_name or "").lower().strip())
    return s.strip("_") or "system"


class SaveColumnsRequest(BaseModel):
    columns: list[Any]
    lang: Optional[str] = None


def _system_dir(system_name: str):
    """Return path to system folder under ``data/systems`` (validated segment)."""
    if not is_safe_system_subdirectory(system_name):
        return None
    return (DATA_DIR / system_name.strip()).resolve()


@router.get("/list")
async def list_systems():
    """Return list of system folder names from data/systems/ (one entry per subfolder)."""
    names = []
    for p in DATA_DIR.iterdir():
        if p.is_dir() and not p.name.startswith("."):
            names.append(p.name)
    return sorted(names)


@router.get("/{system_name}/layouts")
async def get_system_layout_profiles(system_name: str):
    if _system_dir(system_name) is None:
        raise HTTPException(status_code=400, detail="invalid system name")
    return read_layout_profiles(system_name)


@router.post("/{system_name}/layouts")
async def save_system_layout_profiles(system_name: str, profiles: list[LayoutProfile]):
    if _system_dir(system_name) is None:
        raise HTTPException(status_code=400, detail="invalid system name")
    write_layout_profiles(system_name, profiles)
    return profiles


@router.get("/{system_name}/led_profiles")
async def get_system_led_profiles(system_name: str):
    if _system_dir(system_name) is None:
        raise HTTPException(status_code=400, detail="invalid system name")
    return read_led_profiles(system_name)


@router.post("/{system_name}/led_profiles")
async def save_system_led_profiles(system_name: str, profiles: list[LedProfile]):
    sys_dir = _system_dir(system_name)
    if not sys_dir:
        raise HTTPException(status_code=400, detail="invalid system name")
    sys_dir.mkdir(parents=True, exist_ok=True)
    file_path = sys_dir / "led_profiles.json"
    serialized = [p.model_dump(mode="json") for p in profiles]
    file_path.write_text(
        json.dumps(serialized, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return profiles


@router.get("/{system_name}/led_triggers")
async def get_system_led_triggers(system_name: str):
    sys_dir = _system_dir(system_name)
    if not sys_dir:
        raise HTTPException(status_code=400, detail="invalid system name")
    file_path = sys_dir / "led_triggers.json"
    if not file_path.exists():
        return []
    try:
        raw = json.loads(file_path.read_text(encoding="utf-8"))
        if not isinstance(raw, list):
            return []
        return [HardwareTrigger.model_validate(item) for item in raw]
    except Exception:
        return []


@router.post("/{system_name}/led_triggers")
async def save_system_led_triggers(system_name: str, rules: list[HardwareTrigger]):
    sys_dir = _system_dir(system_name)
    if not sys_dir:
        raise HTTPException(status_code=400, detail="invalid system name")
    sys_dir.mkdir(parents=True, exist_ok=True)
    file_path = sys_dir / "led_triggers.json"
    serialized = [r.model_dump(mode="json") for r in rules]
    file_path.write_text(
        json.dumps(serialized, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return rules


@router.get("/{system_name}/effects")
async def get_system_effects(system_name: str):
    sys_dir = _system_dir(system_name)
    if not sys_dir:
        raise HTTPException(status_code=400, detail="invalid system name")
    file_path = sys_dir / "effects.json"
    if file_path.exists():
        return json.loads(file_path.read_text(encoding="utf-8"))
    return []


@router.post("/{system_name}/effects")
async def save_system_effect(system_name: str, effect: dict):
    sys_dir = _system_dir(system_name)
    if not sys_dir:
        raise HTTPException(status_code=400, detail="invalid system name")
    sys_dir.mkdir(parents=True, exist_ok=True)
    file_path = sys_dir / "effects.json"
    effects = []
    if file_path.exists():
        effects = json.loads(file_path.read_text(encoding="utf-8"))

    for i, e in enumerate(effects):
        if e.get("id") == effect.get("id"):
            if e.get("is_base"):
                raise HTTPException(status_code=403, detail="Cannot edit base effect; create a copy with a new id")
            effects[i] = effect
            file_path.write_text(json.dumps(effects, indent=2, ensure_ascii=False), encoding="utf-8")
            _add_effect_to_locales(system_name, effect.get("id"), effect.get("name"))
            return effects

    effects.append(effect)
    file_path.write_text(json.dumps(effects, indent=2, ensure_ascii=False), encoding="utf-8")
    _add_effect_to_locales(system_name, effect.get("id"), effect.get("name"))
    return effects


def _add_effect_to_locales(system_name: str, effect_id: str, effect_name: str) -> None:
    """If effect_id is not in system locale file yet, add it to data/locales/{lang}/system_{slug}.json."""
    if not effect_id or not effect_name:
        return
    slug = _system_slug(system_name)
    for lang in SUPPORTED_LANGS:
        locale_path = LOCALES_DIR / lang / f"system_{slug}.json"
        locale_path.parent.mkdir(parents=True, exist_ok=True)
        existing: dict = {}
        if locale_path.exists():
            try:
                existing = json.loads(locale_path.read_text(encoding="utf-8"))
            except Exception:
                pass
        if effect_id not in existing:
            existing[effect_id] = effect_name
            locale_path.write_text(json.dumps(existing, indent=2, ensure_ascii=False), encoding="utf-8")


@router.get("/{system_name}/columns")
async def get_system_columns(system_name: str):
    sys_dir = _system_dir(system_name)
    if not sys_dir:
        raise HTTPException(status_code=400, detail="invalid system name")
    file_path = sys_dir / "columns.json"
    if not file_path.exists():
        return []
    try:
        data = json.loads(file_path.read_text(encoding="utf-8"))
        if isinstance(data, list):
            return data
        return data.get("columns", [])
    except Exception:
        return []


@router.get("/{system_name}/mechanics")
async def get_system_mechanics(system_name: str):
    if not is_safe_system_subdirectory(system_name):
        raise HTTPException(status_code=400, detail="invalid system name")
    data = load_config_with_override(system_name, "mechanics.json")
    return data if isinstance(data, dict) else {"system_dice": "1d20", "formulas": {}}


@router.post("/{system_name}/columns")
async def save_system_columns(system_name: str, body: SaveColumnsRequest):
    system_name = (system_name or "").strip()
    if not system_name:
        raise HTTPException(status_code=400, detail="system name is required")
    sys_dir = _system_dir(system_name)
    if not sys_dir:
        raise HTTPException(status_code=400, detail="invalid system name")
    sys_dir.mkdir(parents=True, exist_ok=True)
    # Папка для кастомных стилей баров системы (Asset Override)
    (ASSETS_DIR / "systems" / system_name.strip() / "bars").mkdir(parents=True, exist_ok=True)

    file_path = sys_dir / "columns.json"
    payload = {"displayName": system_name, "columns": body.columns}
    file_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    if body.lang and body.lang in SUPPORTED_LANGS:
        locale_path = sys_dir / "locales" / f"{body.lang}.json"
        locale_path.parent.mkdir(parents=True, exist_ok=True)
        existing: dict = {}
        if locale_path.exists():
            try:
                existing = json.loads(locale_path.read_text(encoding="utf-8"))
            except Exception:
                pass
        for col in body.columns:
            key = col.get("key") if isinstance(col, dict) else None
            label = col.get("label", key) if isinstance(col, dict) else key
            if not key:
                continue
            if key not in existing:
                existing[key] = {"name": label, "short": label}
            else:
                entry = existing[key]
                if isinstance(entry, dict):
                    entry["name"] = label
                    entry["short"] = label
                else:
                    existing[key] = {"name": label, "short": label}
        locale_path.write_text(json.dumps(existing, indent=2, ensure_ascii=False), encoding="utf-8")

    return {"status": "ok"}


@router.get("/{system_name}/actors")
async def get_saved_actors(system_name: str):
    sys_dir = get_actors_system_dir(system_name)
    if sys_dir is None:
        raise HTTPException(status_code=400, detail="invalid system name")
    if not sys_dir.exists():
        return []
    actors = []
    for f in sys_dir.glob("*.json"):
        try:
            actors.append(json.loads(f.read_text(encoding="utf-8")))
        except Exception:
            pass
    return actors


@router.post("/{system_name}/actors")
async def save_actor(system_name: str, actor: dict):
    sys_dir = get_actors_system_dir(system_name)
    if sys_dir is None:
        raise HTTPException(status_code=400, detail="invalid system name")
    sys_dir.mkdir(parents=True, exist_ok=True)
    safe_name = "".join([c for c in actor.get("name", "Unnamed") if c.isalnum() or c in " -_"]).strip()
    if not safe_name:
        safe_name = "Unnamed"
    file_path = sys_dir / f"{safe_name}.json"
    file_path.write_text(json.dumps(actor, indent=2, ensure_ascii=False), encoding="utf-8")
    return {"status": "ok"}
