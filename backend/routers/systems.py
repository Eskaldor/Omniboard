from __future__ import annotations

import json

from fastapi import APIRouter, Body, HTTPException

from backend.paths import ACTORS_DIR, DATA_DIR


router = APIRouter(prefix="/api/systems", tags=["systems"])


def _system_dir(system_name: str):
    """Return path to system folder; ensure it stays under DATA_DIR (no path traversal)."""
    name = (system_name or "").strip()
    if not name or ".." in name or "/" in name or "\\" in name:
        return None
    path = (DATA_DIR / name).resolve()
    try:
        path.relative_to(DATA_DIR.resolve())
    except ValueError:
        return None
    return path


@router.get("/list")
async def list_systems():
    """Return list of system folder names from data/systems/ (one entry per subfolder)."""
    names = []
    for p in DATA_DIR.iterdir():
        if p.is_dir() and not p.name.startswith("."):
            names.append(p.name)
    return sorted(names)


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
            effects[i] = effect
            file_path.write_text(json.dumps(effects, indent=2, ensure_ascii=False), encoding="utf-8")
            return effects

    effects.append(effect)
    file_path.write_text(json.dumps(effects, indent=2, ensure_ascii=False), encoding="utf-8")
    return effects


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


@router.post("/{system_name}/columns")
async def save_system_columns(system_name: str, columns: list = Body(...)):
    system_name = (system_name or "").strip()
    if not system_name:
        raise HTTPException(status_code=400, detail="system name is required")
    sys_dir = _system_dir(system_name)
    if not sys_dir:
        raise HTTPException(status_code=400, detail="invalid system name")
    sys_dir.mkdir(parents=True, exist_ok=True)
    file_path = sys_dir / "columns.json"
    payload = {"displayName": system_name, "columns": columns}
    file_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return {"status": "ok"}


@router.get("/{system_name}/actors")
async def get_saved_actors(system_name: str):
    sys_dir = ACTORS_DIR / system_name
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
    sys_dir = ACTORS_DIR / system_name
    sys_dir.mkdir(parents=True, exist_ok=True)
    safe_name = "".join([c for c in actor.get("name", "Unnamed") if c.isalnum() or c in " -_"]).strip()
    if not safe_name:
        safe_name = "Unnamed"
    file_path = sys_dir / f"{safe_name}.json"
    file_path.write_text(json.dumps(actor, indent=2, ensure_ascii=False), encoding="utf-8")
    return {"status": "ok"}
