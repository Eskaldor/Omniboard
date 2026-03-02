from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException

from backend import state as app_state
from backend.paths import ENCOUNTERS_DIR


router = APIRouter(tags=["encounters"])


def _safe_system_dir(name: str) -> str:
    s = (name or "default").strip()
    for c in "/\\:*?\"<>|&":
        s = s.replace(c, "_")
    s = s.replace("..", "_").strip() or "default"
    return s[:100]


@router.get("/api/encounters/list")
async def list_encounters(system_name: str):
    safe_sys = _safe_system_dir(system_name)
    sys_dir = ENCOUNTERS_DIR / safe_sys
    if not sys_dir.exists():
        return []
    out = []
    for f in sys_dir.glob("enc_*.json"):
        try:
            data = json.loads(f.read_text())
            out.append({"name": data.get("name", f.stem), "filename": f.name})
        except Exception:
            out.append({"name": f.stem, "filename": f.name})
    return out


@router.post("/api/encounters/save")
async def save_encounter_body(payload: dict):
    system_name = (payload.get("system_name") or "").strip()
    name = (payload.get("name") or "Unnamed").strip()
    actors = payload.get("actors", [])
    safe_sys = _safe_system_dir(system_name)
    safe = "".join(c for c in name if c.isalnum() or c in " -_").strip() or "encounter"
    safe = safe.replace(" ", "_")[:80]
    sys_dir = ENCOUNTERS_DIR / safe_sys
    try:
        sys_dir.mkdir(parents=True, exist_ok=True)
        file_path = sys_dir / f"enc_{safe}.json"
        data = {
            "name": name,
            "actors": actors,
            "history": [h.model_dump() for h in app_state.state.history],
            "round": app_state.state.round,
            "turn_queue": app_state.state.turn_queue,
            "current_index": app_state.state.current_index,
            "is_active": app_state.state.is_active,
        }
        file_path.write_text(json.dumps(data, indent=2))
        return {"status": "ok", "filename": file_path.name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/encounters/get")
async def get_encounter_item(system_name: str, filename: str):
    if not filename.startswith("enc_") or not filename.endswith(".json"):
        raise HTTPException(status_code=400, detail="Invalid filename")
    safe_sys = _safe_system_dir(system_name)
    file_path = ENCOUNTERS_DIR / safe_sys / filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Encounter not found")
    return json.loads(file_path.read_text())


@router.delete("/api/encounters/delete")
async def delete_encounter_item(system_name: str, filename: str):
    if not filename.startswith("enc_") or not filename.endswith(".json"):
        raise HTTPException(status_code=400, detail="Invalid filename")
    safe_sys = _safe_system_dir(system_name)
    file_path = ENCOUNTERS_DIR / safe_sys / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Encounter not found")
    file_path.unlink()
    return {"status": "ok"}


# Legacy path-based routes (keep for compatibility)
@router.get("/api/systems/{system_name}/encounters")
async def get_saved_encounters(system_name: str):
    safe_sys = _safe_system_dir(system_name)
    sys_dir = ENCOUNTERS_DIR / safe_sys
    if not sys_dir.exists():
        return []
    out = []
    for f in sys_dir.glob("enc_*.json"):
        try:
            data = json.loads(f.read_text())
            out.append({"name": data.get("name", f.stem), "filename": f.name})
        except Exception:
            out.append({"name": f.stem, "filename": f.name})
    return out


@router.post("/api/systems/{system_name}/encounters")
async def save_encounter(system_name: str, payload: dict):
    name = (payload.get("name") or "Unnamed").strip()
    actors = payload.get("actors", [])
    safe_sys = _safe_system_dir(system_name)
    safe = "".join(c for c in name if c.isalnum() or c in " -_").strip() or "encounter"
    safe = safe.replace(" ", "_")[:80]
    sys_dir = ENCOUNTERS_DIR / safe_sys
    try:
        sys_dir.mkdir(parents=True, exist_ok=True)
        file_path = sys_dir / f"enc_{safe}.json"
        file_path.write_text(json.dumps({"name": name, "actors": actors}, indent=2))
        return {"status": "ok", "filename": file_path.name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/systems/{system_name}/encounters/{filename}")
async def get_encounter(system_name: str, filename: str):
    if not filename.startswith("enc_") or not filename.endswith(".json"):
        raise HTTPException(status_code=400, detail="Invalid filename")
    safe_sys = _safe_system_dir(system_name)
    file_path = ENCOUNTERS_DIR / safe_sys / filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Encounter not found")
    return json.loads(file_path.read_text())


@router.delete("/api/systems/{system_name}/encounters/{filename}")
async def delete_encounter(system_name: str, filename: str):
    if not filename.startswith("enc_") or not filename.endswith(".json"):
        raise HTTPException(status_code=400, detail="Invalid filename")
    safe_sys = _safe_system_dir(system_name)
    file_path = ENCOUNTERS_DIR / safe_sys / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Encounter not found")
    file_path.unlink()
    return {"status": "ok"}

