from __future__ import annotations

import json

from fastapi import APIRouter, Body, HTTPException

from backend.paths import ACTORS_DIR, DATA_DIR


router = APIRouter(prefix="/api/systems", tags=["systems"])


def _safe_columns_filename(system_name: str) -> str:
    """Filesystem-safe name for columns file (used for both save and get)."""
    s = (system_name or "default").strip()
    for c in "/\\:*?\"<>|&":
        s = s.replace(c, "_")
    s = s.replace("..", "_").strip() or "default"
    return s[:100]


@router.get("/list")
async def list_systems():
    """Scan data/systems for *_columns.json files and return unique system display names."""
    names = set()
    for f in DATA_DIR.glob("*_columns.json"):
        stem = f.stem
        prefix = stem[: -len("_columns")] if stem.endswith("_columns") else stem
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            if isinstance(data, dict) and "displayName" in data:
                names.add(data["displayName"])
            else:
                names.add(prefix)
        except Exception:
            names.add(prefix)
    return sorted(names)


@router.get("/{system_name}/effects")
async def get_system_effects(system_name: str):
    file_path = DATA_DIR / f"{system_name}_effects.json"
    if file_path.exists():
        return json.loads(file_path.read_text())
    return []


@router.post("/{system_name}/effects")
async def save_system_effect(system_name: str, effect: dict):
    file_path = DATA_DIR / f"{system_name}_effects.json"
    effects = []
    if file_path.exists():
        effects = json.loads(file_path.read_text())

    # Update or append
    for i, e in enumerate(effects):
        if e.get("id") == effect.get("id"):
            effects[i] = effect
            file_path.write_text(json.dumps(effects, indent=2))
            return effects

    effects.append(effect)
    file_path.write_text(json.dumps(effects, indent=2))
    return effects


@router.get("/{system_name}/columns")
async def get_system_columns(system_name: str):
    # Try raw name first (backward compat), then safe filename
    for name in (system_name.strip(), _safe_columns_filename(system_name)):
        file_path = DATA_DIR / f"{name}_columns.json"
        if not file_path.exists():
            continue
        try:
            data = json.loads(file_path.read_text(encoding="utf-8"))
            if isinstance(data, list):
                return data
            return data.get("columns", [])
        except Exception:
            pass
    return []


@router.post("/{system_name}/columns")
async def save_system_columns(system_name: str, columns: list = Body(...)):
    system_name = (system_name or "").strip()
    if not system_name:
        raise HTTPException(status_code=400, detail="system name is required")
    safe = _safe_columns_filename(system_name)
    file_path = DATA_DIR / f"{safe}_columns.json"
    payload = {"displayName": system_name, "columns": columns}
    file_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return {"status": "ok"}


@router.get("/{system_name}/actors")
async def get_saved_actors(system_name: str):
    sys_dir = ACTORS_DIR / system_name
    if not sys_dir.exists():
        return []
    actors = []
    for f in sys_dir.glob("*.json"):
        try:
            actors.append(json.loads(f.read_text()))
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
    file_path.write_text(json.dumps(actor, indent=2))
    return {"status": "ok"}

