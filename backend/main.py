from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from backend.models import CombatState, Actor, Effect
from backend.compositor import render_miniature
import uuid
import json
import os
import shutil
from pathlib import Path

app = FastAPI()

DATA_DIR = Path("data/systems")
DATA_DIR.mkdir(parents=True, exist_ok=True)

ASSETS_DIR = Path("data/assets")
ASSETS_DIR.mkdir(parents=True, exist_ok=True)
(ASSETS_DIR / "portraits").mkdir(exist_ok=True)
(ASSETS_DIR / "frames").mkdir(exist_ok=True)
(ASSETS_DIR / "effects").mkdir(exist_ok=True)

ACTORS_DIR = Path("data/actors")
ACTORS_DIR.mkdir(parents=True, exist_ok=True)

RENDER_DIR = Path("data/render")
RENDER_DIR.mkdir(parents=True, exist_ok=True)

app.mount("/assets", StaticFiles(directory="data/assets"), name="assets")
app.mount("/render", StaticFiles(directory="data/render"), name="render")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

state = CombatState()

# Add some mock data for the MVP
mock_actor = Actor(
    id=str(uuid.uuid4()),
    name="Goblin",
    role="enemy",
    portrait="https://picsum.photos/seed/goblin/100/100",
    stats={"hp": 7, "ac": 15, "speed": 30},
    initiative=12
)
state.actors.append(mock_actor)

clients = []

async def broadcast_state():
    state_json = state.model_dump_json()
    message = json.dumps({"type": "state_update", "payload": json.loads(state_json)})
    for client in clients:
        try:
            await client.send_text(message)
        except:
            pass

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
    return state

@app.post("/api/actors")
async def create_actor(actor: Actor):
    if not actor.id:
        actor.id = str(uuid.uuid4())
    state.actors.append(actor)
    await broadcast_state()
    return actor

@app.patch("/api/actors/{actor_id}")
async def update_actor(actor_id: str, updates: dict):
    for i, a in enumerate(state.actors):
        if a.id == actor_id:
            actor_dict = a.model_dump()
            if "stats" in updates:
                actor_dict["stats"].update(updates["stats"])
                del updates["stats"]
            actor_dict.update(updates)
            state.actors[i] = Actor(**actor_dict)
            await broadcast_state()
            return state.actors[i]
    return {"error": "not found"}

@app.post("/api/combat/next-turn")
async def next_turn():
    if not state.turn_queue:
        return {"error": "Queue empty"}
    
    state.current_index = (state.current_index + 1) % len(state.turn_queue)
    if state.current_index == 0:
        state.round += 1
        for actor in state.actors:
            for effect in actor.effects:
                if effect.duration is not None:
                    effect.duration -= 1
            actor.effects = [e for e in actor.effects if e.duration is None or e.duration > 0]
    
    await broadcast_state()
    return state

@app.post("/api/combat/start")
async def start_combat():
    state.is_active = True
    state.round = 1
    sorted_actors = sorted(state.actors, key=lambda a: a.initiative, reverse=True)
    state.turn_queue = [a.id for a in sorted_actors]
    state.current_index = 0
    await broadcast_state()
    return state

@app.post("/api/combat/end")
async def end_combat():
    state.is_active = False
    state.turn_queue = []
    state.current_index = 0
    await broadcast_state()
    return state

@app.post("/api/combat/reset")
async def reset_combat():
    state.is_active = False
    state.round = 1
    state.turn_queue = []
    state.current_index = 0
    for actor in state.actors:
        actor.effects = []
    await broadcast_state()
    return state

@app.patch("/api/combat/layout")
async def update_layout(layout: dict):
    from backend.models import MiniatureLayout
    state.layout = MiniatureLayout(**layout)
    await broadcast_state()
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
        if e.get("name") == effect.get("name"):
            effects[i] = effect
            file_path.write_text(json.dumps(effects, indent=2))
            return effects
            
    effects.append(effect)
    file_path.write_text(json.dumps(effects, indent=2))
    return effects

@app.get("/api/systems/{system_name}/columns")
async def get_system_columns(system_name: str):
    file_path = DATA_DIR / f"{system_name}_columns.json"
    if file_path.exists():
        return json.loads(file_path.read_text())
    return []

@app.post("/api/systems/{system_name}/columns")
async def save_system_columns(system_name: str, columns: list):
    file_path = DATA_DIR / f"{system_name}_columns.json"
    file_path.write_text(json.dumps(columns, indent=2))
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

@app.get("/api/render/{actor_id}")
async def get_rendered_miniature(actor_id: str):
    actor = next((a for a in state.actors if a.id == actor_id), None)
    if not actor:
        return {"error": "Actor not found"}
    
    output_path = render_miniature(actor, state.layout)
    return FileResponse(output_path)

@app.get("/api/assets/{category}")
async def list_assets(category: str):
    if category not in ["portraits", "frames", "effects"]:
        raise HTTPException(status_code=400, detail="Invalid category")
    
    dir_path = ASSETS_DIR / category
    files = []
    if dir_path.exists():
        for f in dir_path.iterdir():
            if f.is_file() and f.suffix.lower() in ['.png', '.jpg', '.jpeg', '.gif', '.webp']:
                files.append(f"/assets/{category}/{f.name}")
    return files

@app.post("/api/assets/{category}")
async def upload_asset(category: str, file: UploadFile = File(...)):
    if category not in ["portraits", "frames", "effects"]:
        raise HTTPException(status_code=400, detail="Invalid category")
    
    file_path = ASSETS_DIR / category / file.filename
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    return {"url": f"/assets/{category}/{file.filename}"}

@app.delete("/api/assets/{category}/{filename}")
async def delete_asset(category: str, filename: str):
    if category not in ["portraits", "frames", "effects"]:
        raise HTTPException(status_code=400, detail="Invalid category")
    
    file_path = ASSETS_DIR / category / filename
    if file_path.exists():
        file_path.unlink()
        return {"status": "ok"}
    raise HTTPException(status_code=404, detail="File not found")

# Serve Vite frontend in production
if os.path.isdir("dist"):
    app.mount("/assets", StaticFiles(directory="dist/assets"), name="assets")
    @app.get("/{full_path:path}")
    async def catch_all(full_path: str):
        # Serve index.html for SPA routing, or specific files if they exist
        file_path = os.path.join("dist", full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse("dist/index.html")
