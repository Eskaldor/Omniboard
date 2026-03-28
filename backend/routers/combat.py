from __future__ import annotations

import json

from fastapi import APIRouter, Body, HTTPException

from backend import combat_engine
from backend import state as app_state
from backend.history import save_snapshot
from backend.models import CombatState, LegendConfig, LogEntry, LayoutProfile
from backend.paths import LOGS_DIR
from backend.routers.hardware import get_esp_manager
from backend.routers.ws import broadcast_state
from backend.services.logger import add_log


router = APIRouter(prefix="/api/combat", tags=["combat"])


@router.get("/state")
async def get_state():
    out = app_state.state.model_dump()
    out["can_undo"] = app_state.history_index > 0
    out["can_redo"] = app_state.history_index < len(app_state.history_stack) - 1
    # Обратная совместимость: фронт может ожидать единый layout (профиль default)
    default_layout = next(
        (p for p in app_state.state.layout_profiles if p.id == "default"),
        app_state.state.layout_profiles[0] if app_state.state.layout_profiles else None,
    )
    if default_layout is not None:
        out["layout"] = default_layout.model_dump()
    return out


@router.patch("/system")
async def update_combat_system(payload: dict):
    system_name = (payload.get("system") or "").strip()
    if not system_name:
        raise HTTPException(status_code=400, detail="system is required")
    await save_snapshot()
    app_state.state.system = system_name
    await save_snapshot()
    await broadcast_state()
    return {"system": app_state.state.system}


@router.post("/undo")
async def undo_combat():
    changed = combat_engine.undo()
    if changed:
        await broadcast_state()
    return app_state.state


@router.post("/redo")
async def redo_combat():
    changed = combat_engine.redo()
    if changed:
        await broadcast_state()
    return app_state.state


@router.post("/next-turn")
async def next_turn():
    await save_snapshot()
    if not app_state.state.turn_queue:
        return {"error": "Queue empty"}
    combat_engine.next_turn(add_log)
    await save_snapshot()
    await broadcast_state()
    return app_state.state


@router.post("/start")
async def start_combat():
    await save_snapshot()
    combat_engine.start_combat(add_log)
    await save_snapshot()
    await broadcast_state()
    return app_state.state


@router.post("/end")
async def end_combat():
    await save_snapshot()
    combat_engine.end_combat(add_log)
    await save_snapshot()
    await broadcast_state()
    return app_state.state


@router.post("/reset")
async def reset_combat():
    await save_snapshot()
    combat_engine.reset_combat_state()
    # Clear log files
    (LOGS_DIR / "latest_combat.json").write_text("[]", encoding="utf-8")
    (LOGS_DIR / "latest_combat.md").write_text("", encoding="utf-8")
    await save_snapshot()
    await broadcast_state()
    return app_state.state


@router.post("/clear")
async def clear_combat():
    """Fully clear the tracker: all actors, queue, round, history, log files."""
    await save_snapshot()
    combat_engine.clear_combat_state()
    (LOGS_DIR / "latest_combat.json").write_text("[]", encoding="utf-8")
    (LOGS_DIR / "latest_combat.md").write_text("", encoding="utf-8")
    await save_snapshot()
    await broadcast_state()
    await get_esp_manager().sleep_all()
    return app_state.state


@router.patch("/settings")
async def update_combat_settings(payload: dict):
    await save_snapshot()
    if "enable_logging" in payload:
        app_state.state.enable_logging = bool(payload["enable_logging"])
    if "autosave_enabled" in payload:
        app_state.state.autosave_enabled = bool(payload["autosave_enabled"])
    if "table_centered" in payload:
        app_state.state.table_centered = bool(payload["table_centered"])

    await save_snapshot()
    # Persist current state of settings immediately to disk (non-blocking)
    await app_state.save_state_async()
    await broadcast_state()
    return {
        "enable_logging": app_state.state.enable_logging,
        "autosave_enabled": app_state.state.autosave_enabled,
        "table_centered": app_state.state.table_centered,
    }


@router.patch("/legend")
async def update_legend(payload: dict):
    await save_snapshot()
    legend_keys = {"player", "enemy", "ally", "neutral"}
    if any(k in payload for k in legend_keys):
        app_state.state.legend = LegendConfig(
            **{k: payload.get(k, getattr(app_state.state.legend, k)) for k in legend_keys}
        )
    if "show_group_colors" in payload:
        app_state.state.show_group_colors = bool(payload["show_group_colors"])
    if "show_faction_colors" in payload:
        app_state.state.show_faction_colors = bool(payload["show_faction_colors"])
    await save_snapshot()
    await broadcast_state()
    return {
        "legend": app_state.state.legend,
        "show_group_colors": app_state.state.show_group_colors,
        "show_faction_colors": app_state.state.show_faction_colors,
    }


@router.post("/log/note")
async def add_log_note(payload: dict):
    message = (payload.get("message") or "").strip()
    add_log("text", details={"message": message, "is_gm_note": True})
    await broadcast_state()
    return {"status": "ok"}


@router.delete("/log")
async def clear_combat_log():
    app_state.state.history = []
    (LOGS_DIR / "latest_combat.json").write_text("[]", encoding="utf-8")
    (LOGS_DIR / "latest_combat.md").write_text("", encoding="utf-8")
    await broadcast_state()
    return {"status": "ok"}


@router.patch("/layout")
async def update_layout(layout: dict):
    await save_snapshot()
    profile_id = layout.get("id", "default")
    profile_name = layout.get("name", "Default")
    profile_data = {**layout, "id": profile_id, "name": profile_name}
    new_profile = LayoutProfile(**profile_data)
    profiles = list(app_state.state.layout_profiles)
    idx = next((i for i, p in enumerate(profiles) if p.id == profile_id), None)
    if idx is not None:
        profiles[idx] = new_profile
    else:
        profiles.append(new_profile)
    app_state.state.layout_profiles = profiles
    await save_snapshot()
    await broadcast_state()
    return new_profile


@router.post("/load")
async def load_combat(payload: dict):
    await save_snapshot()

    actors_data = payload.get("actors", [])
    from backend.models import Actor  # local import: avoid bloating module import graph

    # Keep pinned actors; they are not replaced by the loaded encounter
    pinned_actors = [a for a in app_state.state.actors if getattr(a, "is_pinned", False)]
    pinned_ids = {a.id for a in pinned_actors}

    try:
        new_actors = [
            Actor(**a) if isinstance(a, dict) else a
            for a in actors_data
            if (a.get("id") if isinstance(a, dict) else getattr(a, "id", None)) not in pinned_ids
        ]
        app_state.state.actors = pinned_actors + new_actors
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

    history_data = payload.get("history", [])
    try:
        app_state.state.history = [LogEntry(**h) for h in history_data]
    except Exception:
        app_state.state.history = []

    round_val = payload.get("round")
    if round_val is not None and isinstance(round_val, (int, float)):
        app_state.state.round = max(1, int(round_val))
    elif app_state.state.history:
        app_state.state.round = max((e.round for e in app_state.state.history), default=1)
    else:
        app_state.state.round = 1

    actor_ids = {a.id for a in app_state.state.actors}
    turn_queue = payload.get("turn_queue")
    if isinstance(turn_queue, list) and len(turn_queue) > 0:
        app_state.state.turn_queue = [aid for aid in turn_queue if aid in actor_ids]
        app_state.state.current_index = max(
            0, min(int(payload.get("current_index", 0)), len(app_state.state.turn_queue) - 1)
        )
        app_state.state.is_active = bool(payload.get("is_active", False))
    else:
        app_state.state.turn_queue = []
        app_state.state.current_index = 0
        app_state.state.is_active = False

    await save_snapshot()
    await broadcast_state()
    return app_state.state

