from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Body, HTTPException

from backend import combat_engine
from backend import state as app_state
from backend.engines.manager import get_engine_for_state, system_has_custom_logic_file
from backend.history import save_snapshot
from backend.models import CombatState, LegendConfig, LogEntry, LayoutProfile
from backend.paths import LOGS_DIR
from backend.routers.hardware import get_esp_manager
from backend.routers.ws import broadcast_state
from backend.services import led_interceptor
from backend.services.logger import add_log


router = APIRouter(prefix="/api/combat", tags=["combat"])


def _log_turn_progression(prev: CombatState, new: CombatState) -> None:
    """Mirror legacy combat_engine.next_turn logging (round, effects, turn starts)."""
    if new.round > prev.round:
        add_log("round_start")
    prev_by_id = {a.id: a for a in prev.actors}
    for a in new.actors:
        p = prev_by_id.get(a.id)
        if not p:
            continue
        new_eids = {e.id for e in a.effects}
        for e in p.effects:
            if e.id not in new_eids:
                add_log(
                    "effect_removed",
                    actor_id=a.id,
                    actor_name=a.name,
                    details={"effect_name": e.name},
                )
    for aid in combat_engine.current_turn_slot_actor_ids():
        actor = next((x for x in app_state.state.actors if x.id == aid), None)
        if actor:
            add_log("turn_start", actor_id=actor.id, actor_name=actor.name)


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
    out["initiative_engine_locked"] = system_has_custom_logic_file(app_state.state.system)
    return out


@router.patch("/system")
async def update_combat_system(payload: dict):
    system_name = (payload.get("system") or "").strip()
    if not system_name:
        raise HTTPException(status_code=400, detail="system is required")
    await save_snapshot()
    tq = list(app_state.state.turn_queue)
    idx = app_state.state.current_index
    current_actor_id = tq[idx] if tq and 0 <= idx < len(tq) else None
    app_state.state.system = system_name
    engine = get_engine_for_state(app_state.state)
    new_queue = engine.build_queue(app_state.state)
    app_state.state.turn_queue = new_queue
    if current_actor_id and current_actor_id in new_queue:
        app_state.state.current_index = new_queue.index(current_actor_id)
    else:
        app_state.state.current_index = (
            min(idx, len(new_queue) - 1) if new_queue else 0
        )
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
async def next_turn(payload: dict = Body(default_factory=dict)):
    raw_target = payload.get("target_actor_id")
    if isinstance(raw_target, str):
        target_actor_id = raw_target.strip() or None
    else:
        target_actor_id = None

    st = app_state.state
    # Classic next-turn needs a queue; manual mode uses the same endpoint for row clicks and "next round"
    if not st.turn_queue and not st.is_manual_mode:
        return {"error": "Queue empty"}

    await save_snapshot()
    prev_ids = combat_engine.current_turn_slot_actor_ids()
    await asyncio.gather(
        *[led_interceptor.reset_actor_led_to_default(aid) for aid in prev_ids],
        return_exceptions=True,
    )
    prev_snapshot = app_state.state.model_copy(deep=True)
    engine = get_engine_for_state(st)
    app_state.state = engine.next_turn(st, target_actor_id)
    _log_turn_progression(prev_snapshot, app_state.state)
    await save_snapshot()
    await broadcast_state()
    for aid in combat_engine.current_turn_slot_actor_ids():
        asyncio.create_task(led_interceptor.process_led_trigger(aid, "turn_start"))
    return app_state.state


@router.post("/start")
async def start_combat():
    await save_snapshot()
    engine = get_engine_for_state(app_state.state)
    app_state.state.is_active = True
    app_state.state.round = 1
    app_state.state.turn_queue = engine.build_queue(app_state.state)
    app_state.state.current_index = 0
    add_log("combat_start")
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
    bound_miniature_ids = {
        m
        for m in (str(a.miniature_id).strip() for a in app_state.state.actors if a.miniature_id)
        if m
    }
    combat_engine.clear_combat_state()
    (LOGS_DIR / "latest_combat.json").write_text("[]", encoding="utf-8")
    (LOGS_DIR / "latest_combat.md").write_text("", encoding="utf-8")
    await save_snapshot()
    await broadcast_state()
    await get_esp_manager().sleep_all(extra_ids=bound_miniature_ids)
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
    if "is_manual_mode" in payload:
        app_state.state.is_manual_mode = bool(payload["is_manual_mode"])
    if "engine_type" in payload and not system_has_custom_logic_file(app_state.state.system):
        raw = str(payload.get("engine_type") or "").strip().lower()
        if raw in ("standard", "phase", "popcorn"):
            app_state.state.engine_type = raw

    await save_snapshot()
    # Persist current state of settings immediately to disk (non-blocking)
    await app_state.save_state_async()
    await broadcast_state()
    return {
        "enable_logging": app_state.state.enable_logging,
        "autosave_enabled": app_state.state.autosave_enabled,
        "table_centered": app_state.state.table_centered,
        "is_manual_mode": app_state.state.is_manual_mode,
        "engine_type": app_state.state.engine_type,
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

