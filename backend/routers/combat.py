from __future__ import annotations

import asyncio

from fastapi import APIRouter, Body, HTTPException

from backend import combat_engine
from backend import state as app_state
from backend.engines.manager import (
    build_queue_for_session,
    next_turn_for_session,
    system_has_custom_logic_file,
)
from backend.history import save_snapshot
from backend.models import (
    CombatSession,
    LegendConfig,
    LogEntry,
    combat_session_public_payload,
)
from backend.paths import LOGS_DIR
from backend.routers.hardware import get_esp_manager
from backend.routers.ws import broadcast_state
from backend.services import led_interceptor
from backend.services.logger import add_log


router = APIRouter(prefix="/api/combat", tags=["combat"])


def _log_turn_progression(
    prev_round: int, prev_effects_by_actor: dict[str, dict[str, str]]
) -> None:
    """Mirror legacy combat_engine.next_turn logging (round, effects, turn starts)."""
    st = app_state.state
    if st.core.round > prev_round:
        add_log("round_start")
    for a in st.core.actors:
        prev_by_id = prev_effects_by_actor.get(a.id, {})
        new_ids = {e.id for e in a.effects}
        removed_ids = set(prev_by_id.keys()) - new_ids
        for eid in removed_ids:
            eff_name = prev_by_id.get(eid) or eid
            add_log(
                "effect_removed",
                actor_id=a.id,
                actor_name=a.name,
                details={"effect_name": eff_name},
            )
    for aid in combat_engine.current_turn_slot_actor_ids():
        actor = next((x for x in app_state.state.core.actors if x.id == aid), None)
        if actor:
            add_log("turn_start", actor_id=actor.id, actor_name=actor.name)


@router.get("/state")
async def get_state():
    return combat_session_public_payload(
        app_state.state,
        initiative_engine_locked=system_has_custom_logic_file(app_state.state.core.system),
    )


@router.patch("/system")
async def update_combat_system(payload: dict):
    system_name = (payload.get("system") or "").strip()
    if not system_name:
        raise HTTPException(status_code=400, detail="system is required")
    await save_snapshot()
    tq = list(app_state.state.core.turn_queue)
    idx = app_state.state.core.current_index
    current_actor_id = tq[idx] if tq and 0 <= idx < len(tq) else None
    app_state.state.core.system = system_name
    new_queue = build_queue_for_session(app_state.state)
    app_state.state.core.turn_queue = new_queue
    if current_actor_id and current_actor_id in new_queue:
        app_state.state.core.current_index = new_queue.index(current_actor_id)
    else:
        app_state.state.core.current_index = (
            min(idx, len(new_queue) - 1) if new_queue else 0
        )
    await save_snapshot()
    await broadcast_state()
    return {"system": app_state.state.core.system}


@router.post("/undo")
async def undo_combat():
    changed = combat_engine.undo()
    if changed:
        await broadcast_state()
    return combat_session_public_payload(
        app_state.state,
        initiative_engine_locked=system_has_custom_logic_file(app_state.state.core.system),
    )


@router.post("/redo")
async def redo_combat():
    changed = combat_engine.redo()
    if changed:
        await broadcast_state()
    return combat_session_public_payload(
        app_state.state,
        initiative_engine_locked=system_has_custom_logic_file(app_state.state.core.system),
    )


@router.post("/next-turn")
async def next_turn(payload: dict = Body(default_factory=dict)):
    raw_target = payload.get("target_actor_id")
    if isinstance(raw_target, str):
        target_actor_id = raw_target.strip() or None
    else:
        target_actor_id = None

    st = app_state.state
    # Classic next-turn needs a queue; manual mode uses the same endpoint for row clicks and "next round"
    if not st.core.turn_queue and not st.core.is_manual_mode:
        return {"error": "Queue empty"}

    await save_snapshot()
    prev_ids = combat_engine.current_turn_slot_actor_ids()
    await asyncio.gather(
        *[led_interceptor.reset_actor_led_to_default(aid) for aid in prev_ids],
        return_exceptions=True,
    )
    prev_round = st.core.round
    prev_effects_by_actor: dict[str, dict[str, str]] = {
        a.id: {e.id: e.name for e in a.effects} for a in st.core.actors
    }
    app_state.state = next_turn_for_session(st, target_actor_id)
    _log_turn_progression(prev_round, prev_effects_by_actor)
    await save_snapshot()
    await broadcast_state()
    for aid in combat_engine.current_turn_slot_actor_ids():
        asyncio.create_task(led_interceptor.process_led_trigger(aid, "turn_start"))
    return combat_session_public_payload(
        app_state.state,
        initiative_engine_locked=system_has_custom_logic_file(app_state.state.core.system),
    )


@router.post("/start")
async def start_combat():
    await save_snapshot()
    app_state.state.core.is_active = True
    app_state.state.core.round = 1
    app_state.state.core.turn_queue = build_queue_for_session(app_state.state)
    app_state.state.core.current_index = 0
    add_log("combat_start")
    await save_snapshot()
    await broadcast_state()
    return combat_session_public_payload(
        app_state.state,
        initiative_engine_locked=system_has_custom_logic_file(app_state.state.core.system),
    )


@router.post("/end")
async def end_combat():
    await save_snapshot()
    combat_engine.end_combat(add_log)
    await save_snapshot()
    await broadcast_state()
    return combat_session_public_payload(
        app_state.state,
        initiative_engine_locked=system_has_custom_logic_file(app_state.state.core.system),
    )


@router.post("/reset")
async def reset_combat():
    await save_snapshot()
    combat_engine.reset_combat_state()
    # Clear log files
    (LOGS_DIR / "latest_combat.json").write_text("[]", encoding="utf-8")
    (LOGS_DIR / "latest_combat.md").write_text("", encoding="utf-8")
    await save_snapshot()
    await broadcast_state()
    return combat_session_public_payload(
        app_state.state,
        initiative_engine_locked=system_has_custom_logic_file(app_state.state.core.system),
    )


@router.post("/clear")
async def clear_combat():
    """Fully clear the tracker: all actors, queue, round, history, log files."""
    await save_snapshot()
    bound_miniature_ids = {
        m
        for m in (
            str(a.miniature_id).strip()
            for a in app_state.state.core.actors
            if a.miniature_id
        )
        if m
    }
    combat_engine.clear_combat_state()
    (LOGS_DIR / "latest_combat.json").write_text("[]", encoding="utf-8")
    (LOGS_DIR / "latest_combat.md").write_text("", encoding="utf-8")
    await save_snapshot()
    await broadcast_state()
    await get_esp_manager().sleep_all(extra_ids=bound_miniature_ids)
    return combat_session_public_payload(
        app_state.state,
        initiative_engine_locked=system_has_custom_logic_file(app_state.state.core.system),
    )


@router.patch("/settings")
async def update_combat_settings(payload: dict):
    await save_snapshot()
    if "enable_logging" in payload:
        app_state.state.session.enable_logging = bool(payload["enable_logging"])
    if "autosave_enabled" in payload:
        app_state.state.session.autosave_enabled = bool(payload["autosave_enabled"])
    if "table_centered" in payload:
        app_state.state.display.table_centered = bool(payload["table_centered"])
    if "selected_layout_id" in payload:
        sid = str(payload.get("selected_layout_id") or "").strip()
        if sid:
            app_state.state.display.selected_layout_id = sid
    if "is_manual_mode" in payload:
        app_state.state.core.is_manual_mode = bool(payload["is_manual_mode"])
    if "engine_type" in payload and not system_has_custom_logic_file(app_state.state.core.system):
        raw = str(payload.get("engine_type") or "").strip().lower()
        if raw in ("standard", "phase", "popcorn"):
            app_state.state.core.engine_type = raw

    await save_snapshot()
    # Persist current state of settings immediately to disk (non-blocking)
    await app_state.save_state_async()
    await broadcast_state()
    return {
        "enable_logging": app_state.state.session.enable_logging,
        "autosave_enabled": app_state.state.session.autosave_enabled,
        "table_centered": app_state.state.display.table_centered,
        "selected_layout_id": app_state.state.display.selected_layout_id,
        "is_manual_mode": app_state.state.core.is_manual_mode,
        "engine_type": app_state.state.core.engine_type,
    }


@router.patch("/legend")
async def update_legend(payload: dict):
    await save_snapshot()
    legend_keys = {"player", "enemy", "ally", "neutral"}
    if any(k in payload for k in legend_keys):
        app_state.state.display.legend = LegendConfig(
            **{k: payload.get(k, getattr(app_state.state.display.legend, k)) for k in legend_keys}
        )
    if "show_group_colors" in payload:
        app_state.state.display.show_group_colors = bool(payload["show_group_colors"])
    if "show_faction_colors" in payload:
        app_state.state.display.show_faction_colors = bool(payload["show_faction_colors"])
    await save_snapshot()
    await broadcast_state()
    return {
        "legend": app_state.state.display.legend,
        "show_group_colors": app_state.state.display.show_group_colors,
        "show_faction_colors": app_state.state.display.show_faction_colors,
    }


@router.post("/log/note")
async def add_log_note(payload: dict):
    message = (payload.get("message") or "").strip()
    add_log("text", details={"message": message, "is_gm_note": True})
    await broadcast_state()
    return {"status": "ok"}


@router.delete("/log")
async def clear_combat_log():
    app_state.state.session.history = []
    (LOGS_DIR / "latest_combat.json").write_text("[]", encoding="utf-8")
    (LOGS_DIR / "latest_combat.md").write_text("", encoding="utf-8")
    await broadcast_state()
    return {"status": "ok"}


@router.post("/load")
async def load_combat(payload: dict):
    await save_snapshot()

    # Полный вложенный снимок (экспорт / автосейв); иначе — плоский legacy-энкаунтер.
    if isinstance(payload, dict) and isinstance(payload.get("core"), dict):
        pinned_actors = [a for a in app_state.state.core.actors if getattr(a, "is_pinned", False)]
        pinned_ids = {a.id for a in pinned_actors}
        try:
            loaded = CombatSession.model_validate(payload)
        except Exception as e:
            raise HTTPException(status_code=422, detail=str(e))
        new_actors = [a for a in loaded.core.actors if a.id not in pinned_ids]
        app_state.state = loaded.model_copy(
            update={
                "core": loaded.core.model_copy(
                    update={"actors": pinned_actors + new_actors}
                )
            }
        )
        await save_snapshot()
        await broadcast_state()
        return combat_session_public_payload(
            app_state.state,
            initiative_engine_locked=system_has_custom_logic_file(app_state.state.core.system),
        )

    actors_data = payload.get("actors", [])
    from backend.models import Actor  # local import: avoid bloating module import graph

    # Keep pinned actors; they are not replaced by the loaded encounter
    pinned_actors = [a for a in app_state.state.core.actors if getattr(a, "is_pinned", False)]
    pinned_ids = {a.id for a in pinned_actors}

    try:
        new_actors = [
            Actor(**a) if isinstance(a, dict) else a
            for a in actors_data
            if (a.get("id") if isinstance(a, dict) else getattr(a, "id", None)) not in pinned_ids
        ]
        app_state.state.core.actors = pinned_actors + new_actors
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

    history_data = payload.get("history", [])
    try:
        app_state.state.session.history = [LogEntry(**h) for h in history_data]
    except Exception:
        app_state.state.session.history = []

    round_val = payload.get("round")
    if round_val is not None and isinstance(round_val, (int, float)):
        app_state.state.core.round = max(1, int(round_val))
    elif app_state.state.session.history:
        app_state.state.core.round = max(
            (e.round for e in app_state.state.session.history), default=1
        )
    else:
        app_state.state.core.round = 1

    actor_ids = {a.id for a in app_state.state.core.actors}
    turn_queue = payload.get("turn_queue")
    if isinstance(turn_queue, list) and len(turn_queue) > 0:
        app_state.state.core.turn_queue = [aid for aid in turn_queue if aid in actor_ids]
        app_state.state.core.current_index = max(
            0,
            min(int(payload.get("current_index", 0)), len(app_state.state.core.turn_queue) - 1),
        )
        app_state.state.core.is_active = bool(payload.get("is_active", False))
    else:
        app_state.state.core.turn_queue = []
        app_state.state.core.current_index = 0
        app_state.state.core.is_active = False

    await save_snapshot()
    await broadcast_state()
    return combat_session_public_payload(
        app_state.state,
        initiative_engine_locked=system_has_custom_logic_file(app_state.state.core.system),
    )
