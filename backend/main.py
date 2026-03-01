from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from backend.models import CombatState, Actor, Effect, LogEntry
from backend.compositor import render_miniature
import uuid
import json
import os
import shutil
import platform
import subprocess
import threading
from pathlib import Path

app = FastAPI()

DATA_DIR = Path("data/systems")
DATA_DIR.mkdir(parents=True, exist_ok=True)

ASSETS_DIR = Path("data/assets")
ASSETS_DIR.mkdir(parents=True, exist_ok=True)
DEFAULT_ASSETS_DIR = ASSETS_DIR / "default"
DEFAULT_ASSETS_DIR.mkdir(exist_ok=True)
(DEFAULT_ASSETS_DIR / "portraits").mkdir(exist_ok=True)
(DEFAULT_ASSETS_DIR / "frames").mkdir(exist_ok=True)
(DEFAULT_ASSETS_DIR / "effects").mkdir(exist_ok=True)
SYSTEMS_ASSETS_DIR = ASSETS_DIR / "systems"
SYSTEMS_ASSETS_DIR.mkdir(exist_ok=True)

ACTORS_DIR = Path("data/actors")
ACTORS_DIR.mkdir(parents=True, exist_ok=True)

ENCOUNTERS_DIR = Path("data/encounters")
ENCOUNTERS_DIR.mkdir(parents=True, exist_ok=True)

RENDER_DIR = Path("data/render")
RENDER_DIR.mkdir(parents=True, exist_ok=True)

LOCALES_DIR = Path("data/locales")
LOCALES_DIR.mkdir(parents=True, exist_ok=True)

LOGS_DIR = Path("data/logs")
LOGS_DIR.mkdir(parents=True, exist_ok=True)

app.mount("/assets", StaticFiles(directory="data/assets"), name="assets")
app.mount("/render", StaticFiles(directory="data/render"), name="render")
app.mount("/locales", StaticFiles(directory="data/locales"), name="locales")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

state = CombatState()


def add_log(
    entry_type: str,
    *,
    actor_id: str | None = None,
    actor_name: str | None = None,
    details: dict | None = None,
):
    global state
    if not state.enable_logging:
        return
    state.history.append(
        LogEntry(
            type=entry_type,
            round=state.round,
            actor_id=actor_id,
            actor_name=actor_name,
            details=details or {},
        )
    )
    # Write log file in background so request is not blocked
    history_snapshot = [h.model_dump() for h in state.history]
    def _write():
        try:
            path = LOGS_DIR / "latest_combat.json"
            path.write_text(json.dumps(history_snapshot, indent=2), encoding="utf-8")
        except Exception:
            pass
    threading.Thread(target=_write, daemon=True).start()


history_stack: list = []
history_index: int = -1

async def save_snapshot():
    global history_stack, history_index, state
    if history_index < len(history_stack) - 1:
        history_stack = history_stack[:history_index + 1]
    history_stack.append(state.model_dump())
    while len(history_stack) > 20:
        history_stack.pop(0)
        history_index -= 1
    history_index = len(history_stack) - 1

clients = []

async def broadcast_state():
    state_json = state.model_dump_json()
    message = json.dumps({"type": "state_update", "payload": json.loads(state_json)})
    dead = []
    for client in clients:
        try:
            await client.send_text(message)
        except Exception:
            dead.append(client)
    for client in dead:
        clients.remove(client)

def reorder_turn_queue():
    """Re-sort turn_queue by initiative (desc) while keeping the current actor's turn active."""
    if not state.is_active or not state.turn_queue:
        return
    active_id = state.turn_queue[state.current_index]
    initiative_by_id = {a.id: a.initiative for a in state.actors}
    state.turn_queue = sorted(
        state.turn_queue,
        key=lambda actor_id: initiative_by_id.get(actor_id, 0),
        reverse=True,
    )
    state.current_index = state.turn_queue.index(active_id)

@app.websocket("/ws/master")
async def websocket_master(websocket: WebSocket):
    await websocket.accept()
    clients.append(websocket)
    await websocket.send_text(json.dumps({"type": "state_update", "payload": json.loads(state.model_dump_json())}))
    try:
        while True:
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        clients.remove(websocket)

@app.get("/api/combat/state")
async def get_state():
    out = state.model_dump()
    out["can_undo"] = history_index > 0
    out["can_redo"] = history_index < len(history_stack) - 1
    return out

@app.patch("/api/combat/system")
async def update_combat_system(payload: dict):
    global state
    system_name = (payload.get("system") or "").strip()
    if not system_name:
        raise HTTPException(status_code=400, detail="system is required")
    state.system = system_name
    await save_snapshot()
    await broadcast_state()
    return {"system": state.system}

@app.post("/api/combat/undo")
async def undo_combat():
    global state, history_index
    if history_index > 0:
        history_index -= 1
        state = CombatState(**history_stack[history_index])
        await broadcast_state()
    return state

@app.post("/api/combat/redo")
async def redo_combat():
    global state, history_index
    if history_index < len(history_stack) - 1:
        history_index += 1
        state = CombatState(**history_stack[history_index])
        await broadcast_state()
    return state

@app.post("/api/actors")
async def create_actor(actor: Actor):
    await save_snapshot()
    if not actor.id:
        actor.id = str(uuid.uuid4())
    state.actors.append(actor)
    if state.is_active:
        state.turn_queue.append(actor.id)
        reorder_turn_queue()
        add_log("actor_joined", actor_id=actor.id, actor_name=actor.name)
    await broadcast_state()
    await save_snapshot()
    return actor

@app.patch("/api/actors/{actor_id}")
async def update_actor(actor_id: str, updates: dict):
    await save_snapshot()
    for i, a in enumerate(state.actors):
        if a.id == actor_id:
            actor_dict = a.model_dump()
            old_hp = actor_dict.get("stats", {}).get("hp")
            if "stats" in updates:
                actor_dict["stats"].update(updates["stats"])
                del updates["stats"]
            actor_dict.update(updates)
            new_actor = Actor(**actor_dict)
            new_hp = new_actor.stats.get("hp")
            if old_hp is not None and new_hp is not None and old_hp != new_hp:
                delta = new_hp - old_hp
                add_log(
                    "hp_change",
                    actor_id=new_actor.id,
                    actor_name=new_actor.name,
                    details={"delta": delta, "is_damage": delta < 0},
                )
            state.actors[i] = new_actor
            reorder_turn_queue()
            await broadcast_state()
            await save_snapshot()
            return state.actors[i]
    return {"error": "not found"}

@app.post("/api/combat/next-turn")
async def next_turn():
    await save_snapshot()
    if not state.turn_queue:
        return {"error": "Queue empty"}
    
    state.current_index = (state.current_index + 1) % len(state.turn_queue)
    if state.current_index == 0:
        state.round += 1
        add_log("round_start")
        for actor in state.actors:
            for effect in actor.effects:
                if effect.duration is not None:
                    effect.duration -= 1
            actor.effects = [e for e in actor.effects if e.duration is None or e.duration > 0]
    
    current_actor_id = state.turn_queue[state.current_index]
    current_actor = next((a for a in state.actors if a.id == current_actor_id), None)
    if current_actor:
        add_log("turn_start", actor_id=current_actor.id, actor_name=current_actor.name)
    
    await broadcast_state()
    await save_snapshot()
    return state

@app.post("/api/combat/start")
async def start_combat():
    await save_snapshot()
    state.is_active = True
    state.round = 1
    sorted_actors = sorted(state.actors, key=lambda a: a.initiative, reverse=True)
    state.turn_queue = [a.id for a in sorted_actors]
    state.current_index = 0
    add_log("combat_start")
    await broadcast_state()
    await save_snapshot()
    return state

@app.post("/api/combat/end")
async def end_combat():
    await save_snapshot()
    state.is_active = False
    state.turn_queue = []
    state.current_index = 0
    add_log("combat_end")
    await broadcast_state()
    await save_snapshot()
    return state

@app.post("/api/combat/reset")
async def reset_combat():
    await save_snapshot()
    state.is_active = False
    state.round = 1
    state.turn_queue = []
    state.current_index = 0
    state.history = []
    for actor in state.actors:
        actor.effects = []
    await broadcast_state()
    await save_snapshot()
    return state


@app.patch("/api/combat/settings")
async def update_combat_settings(payload: dict):
    global state
    if "enable_logging" in payload:
        state.enable_logging = bool(payload["enable_logging"])
    await save_snapshot()
    await broadcast_state()
    return {"enable_logging": state.enable_logging}


@app.post("/api/combat/log/note")
async def add_log_note(payload: dict):
    message = (payload.get("message") or "").strip()
    add_log("text", details={"message": message, "is_gm_note": True})
    await broadcast_state()
    return {"status": "ok"}


@app.delete("/api/combat/log")
async def clear_combat_log():
    global state
    state.history = []
    path = LOGS_DIR / "latest_combat.json"
    if path.exists():
        path.unlink()
    await broadcast_state()
    return {"status": "ok"}


@app.post("/api/logs/open_folder")
async def open_logs_folder():
    path = str(LOGS_DIR.absolute())
    if platform.system() == "Windows":
        os.startfile(path)
    elif platform.system() == "Darwin":
        subprocess.Popen(["open", path])
    else:
        subprocess.Popen(["xdg-open", path])
    return {"status": "ok"}


@app.delete("/api/actors/{actor_id}")
async def delete_actor(actor_id: str):
    await save_snapshot()
    deleted = next((a for a in state.actors if a.id == actor_id), None)
    if deleted and state.is_active:
        add_log("actor_left", actor_id=deleted.id, actor_name=deleted.name)
    state.actors = [a for a in state.actors if a.id != actor_id]
    if actor_id in state.turn_queue:
        state.turn_queue.remove(actor_id)
        if state.current_index >= len(state.turn_queue):
            state.current_index = max(0, len(state.turn_queue) - 1)
    await broadcast_state()
    await save_snapshot()
    return {"status": "success"}

@app.patch("/api/combat/layout")
async def update_layout(layout: dict):
    await save_snapshot()
    from backend.models import MiniatureLayout
    state.layout = MiniatureLayout(**layout)
    await broadcast_state()
    await save_snapshot()
    return state.layout

@app.get("/api/systems/{system_name}/effects")
async def get_system_effects(system_name: str):
    file_path = DATA_DIR / f"{system_name}_effects.json"
    if file_path.exists():
        return json.loads(file_path.read_text())
    return []

@app.post("/api/systems/{system_name}/effects")
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

@app.get("/api/systems/list")
async def list_systems():
    """Scan data/systems for *_columns.json files and return unique system display names."""
    names = set()
    for f in DATA_DIR.glob("*_columns.json"):
        stem = f.stem
        prefix = stem[:- len("_columns")] if stem.endswith("_columns") else stem
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            if isinstance(data, dict) and "displayName" in data:
                names.add(data["displayName"])
            else:
                names.add(prefix)
        except Exception:
            names.add(prefix)
    return sorted(names)


def _safe_columns_filename(system_name: str) -> str:
    """Filesystem-safe name for columns file (used for both save and get)."""
    s = (system_name or "default").strip()
    for c in "/\\:*?\"<>|&":
        s = s.replace(c, "_")
    s = s.replace("..", "_").strip() or "default"
    return s[:100]


@app.get("/api/systems/{system_name}/columns")
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


@app.post("/api/systems/{system_name}/columns")
async def save_system_columns(system_name: str, columns: list = Body(...)):
    system_name = (system_name or "").strip()
    if not system_name:
        raise HTTPException(status_code=400, detail="system name is required")
    safe = _safe_columns_filename(system_name)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    file_path = DATA_DIR / f"{safe}_columns.json"
    payload = {"displayName": system_name, "columns": columns}
    file_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return {"status": "ok"}

@app.get("/api/systems/{system_name}/actors")
async def get_saved_actors(system_name: str):
    sys_dir = ACTORS_DIR / system_name
    if not sys_dir.exists():
        return []
    actors = []
    for f in sys_dir.glob("*.json"):
        try:
            actors.append(json.loads(f.read_text()))
        except:
            pass
    return actors

@app.post("/api/systems/{system_name}/actors")
async def save_actor(system_name: str, actor: dict):
    sys_dir = ACTORS_DIR / system_name
    sys_dir.mkdir(parents=True, exist_ok=True)
    safe_name = "".join([c for c in actor.get("name", "Unnamed") if c.isalnum() or c in " -_"]).strip()
    if not safe_name: safe_name = "Unnamed"
    file_path = sys_dir / f"{safe_name}.json"
    file_path.write_text(json.dumps(actor, indent=2))
    return {"status": "ok"}

def _safe_system_dir(name: str) -> str:
    s = (name or "default").strip()
    for c in "/\\:*?\"<>|&":
        s = s.replace(c, "_")
    s = s.replace("..", "_").strip() or "default"
    return s[:100]

# Encounters: unique paths to avoid any route conflict
@app.get("/api/encounters/list")
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

@app.post("/api/encounters/save")
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
        data = {"name": name, "actors": actors, "history": [h.model_dump() for h in state.history]}
        file_path.write_text(json.dumps(data, indent=2))
        return {"status": "ok", "filename": file_path.name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/encounters/get")
async def get_encounter_item(system_name: str, filename: str):
    if not filename.startswith("enc_") or not filename.endswith(".json"):
        raise HTTPException(status_code=400, detail="Invalid filename")
    safe_sys = _safe_system_dir(system_name)
    file_path = ENCOUNTERS_DIR / safe_sys / filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Encounter not found")
    return json.loads(file_path.read_text())

@app.delete("/api/encounters/delete")
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
@app.get("/api/systems/{system_name}/encounters")
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

@app.post("/api/systems/{system_name}/encounters")
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

@app.get("/api/systems/{system_name}/encounters/{filename}")
async def get_encounter(system_name: str, filename: str):
    if not filename.startswith("enc_") or not filename.endswith(".json"):
        raise HTTPException(status_code=400, detail="Invalid filename")
    safe_sys = _safe_system_dir(system_name)
    file_path = ENCOUNTERS_DIR / safe_sys / filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Encounter not found")
    return json.loads(file_path.read_text())

@app.delete("/api/systems/{system_name}/encounters/{filename}")
async def delete_encounter(system_name: str, filename: str):
    if not filename.startswith("enc_") or not filename.endswith(".json"):
        raise HTTPException(status_code=400, detail="Invalid filename")
    safe_sys = _safe_system_dir(system_name)
    file_path = ENCOUNTERS_DIR / safe_sys / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Encounter not found")
    file_path.unlink()
    return {"status": "ok"}

@app.post("/api/combat/load")
async def load_combat(payload: dict):
    await save_snapshot()
    actors_data = payload.get("actors", [])
    try:
        state.actors = [Actor(**a) if isinstance(a, dict) else a for a in actors_data]
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))
    state.turn_queue = []
    state.current_index = 0
    state.is_active = False
    state.round = 1
    history_data = payload.get("history", [])
    try:
        state.history = [LogEntry(**h) for h in history_data]
    except Exception:
        state.history = []
    await broadcast_state()
    await save_snapshot()
    return state

@app.get("/api/render/{actor_id}")
async def get_rendered_miniature(actor_id: str):
    actor = next((a for a in state.actors if a.id == actor_id), None)
    if not actor:
        return {"error": "Actor not found"}
    
    output_path = render_miniature(actor, state.layout)
    return FileResponse(output_path)

@app.get("/api/assets/{category}")
async def list_assets(category: str, system: str = None):
    if category not in ["portraits", "frames", "effects"]:
        raise HTTPException(status_code=400, detail="Invalid category")
    
    files_dict = {}
    
    # Default assets
    default_dir = ASSETS_DIR / "default" / category
    if default_dir.exists():
        for f in default_dir.iterdir():
            if f.is_file() and f.suffix.lower() in ['.png', '.jpg', '.jpeg', '.gif', '.webp']:
                files_dict[f.name] = f"/assets/default/{category}/{f.name}"
                
    # System assets
    if system:
        system_dir = ASSETS_DIR / "systems" / system / category
        if system_dir.exists():
            for f in system_dir.iterdir():
                if f.is_file() and f.suffix.lower() in ['.png', '.jpg', '.jpeg', '.gif', '.webp']:
                    files_dict[f.name] = f"/assets/systems/{system}/{category}/{f.name}"
                    
    return list(files_dict.values())

@app.post("/api/assets/{category}")
async def upload_asset(category: str, system: str = None, file: UploadFile = File(...)):
    if category not in ["portraits", "frames", "effects"]:
        raise HTTPException(status_code=400, detail="Invalid category")
    
    if system:
        target_dir = ASSETS_DIR / "systems" / system / category
        url_prefix = f"/assets/systems/{system}/{category}"
    else:
        target_dir = ASSETS_DIR / "default" / category
        url_prefix = f"/assets/default/{category}"
        
    target_dir.mkdir(parents=True, exist_ok=True)
    file_path = target_dir / file.filename
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    return {"url": f"{url_prefix}/{file.filename}"}

@app.delete("/api/assets/{category}/{filename}")
async def delete_asset(category: str, filename: str, system: str = None):
    if category not in ["portraits", "frames", "effects"]:
        raise HTTPException(status_code=400, detail="Invalid category")
    
    if system:
        file_path = ASSETS_DIR / "systems" / system / category / filename
    else:
        file_path = ASSETS_DIR / "default" / category / filename
        
    if file_path.exists():
        file_path.unlink()
        return {"status": "ok"}
    raise HTTPException(status_code=404, detail="File not found")

# Serve Vite frontend in production (only when SERVE_DIST=1 to avoid catch-all in dev)
if os.path.isdir("dist") and os.environ.get("SERVE_DIST") == "1":
    app.mount("/assets", StaticFiles(directory="dist/assets"), name="assets")
    @app.get("/{full_path:path}")
    async def catch_all(full_path: str):
        # Serve index.html for SPA routing, or specific files if they exist
        file_path = os.path.join("dist", full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse("dist/index.html")
