from __future__ import annotations

import asyncio
import json
import uuid

from fastapi import APIRouter

from backend import combat_engine
from backend import state as app_state
from backend.history import save_snapshot
from backend.models import Actor
from backend.paths import DATA_DIR
from backend.routers.ws import broadcast_state
from backend.services import led_interceptor
from backend.services.logger import add_log


router = APIRouter(prefix="/api/actors", tags=["actors"])


def _load_system_columns(system_name: str) -> list[dict]:
    """Load column definitions from system's columns.json. Returns list of column dicts."""
    if not (system_name and system_name.strip()):
        return []
    name = system_name.strip()
    if ".." in name or "/" in name or "\\" in name:
        return []
    path = (DATA_DIR / name / "columns.json").resolve()
    try:
        path.relative_to(DATA_DIR.resolve())
    except ValueError:
        return []
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, list):
            return data
        return data.get("columns") or []
    except Exception:
        return []


def _column_by_key(columns: list[dict], stat_key: str) -> dict | None:
    """Return column that matches stat_key (column 'key' or 'id')."""
    for col in columns:
        if isinstance(col, dict) and (col.get("key") == stat_key or col.get("id") == stat_key):
            return col
    return None


@router.post("")
async def create_actor(actor: Actor):
    await save_snapshot()
    if not actor.id:
        actor.id = str(uuid.uuid4())
    app_state.state.actors.append(actor)
    if app_state.state.is_active:
        app_state.state.turn_queue.append(actor.id)
        combat_engine.reorder_turn_queue()
        add_log("actor_joined", actor_id=actor.id, actor_name=actor.name)
    await save_snapshot()
    await broadcast_state()
    return actor


@router.patch("/{actor_id}")
async def update_actor(actor_id: str, updates: dict):
    await save_snapshot()
    for i, a in enumerate(app_state.state.actors):
        if a.id == actor_id:
            old_actor = a
            actor_dict = a.model_dump()
            old_stats = dict(actor_dict.get("stats") or {})
            changed_stat_keys: list[str] = []
            stats_patch = updates.get("stats")
            if isinstance(stats_patch, dict):
                for stat_key, new_val in stats_patch.items():
                    if old_stats.get(stat_key) != new_val:
                        changed_stat_keys.append(str(stat_key))
            if "stats" in updates:
                actor_dict["stats"].update(updates["stats"])
                del updates["stats"]
            actor_dict.update(updates)
            new_actor = Actor(**actor_dict)
            new_stats = dict(new_actor.stats or {})

            # Dynamic stat change logging from column config
            columns = _load_system_columns(getattr(app_state.state, "system", "") or "D&D 5e")
            all_keys = set(old_stats.keys()) | set(new_stats.keys())
            for stat_key in all_keys:
                old_val = old_stats.get(stat_key)
                new_val = new_stats.get(stat_key)
                if old_val == new_val:
                    continue
                try:
                    old_num = int(old_val) if old_val is not None else None
                    new_num = int(new_val) if new_val is not None else None
                except (TypeError, ValueError):
                    old_num = new_num = None
                if old_num is None and new_num is None:
                    continue
                amount = (new_num or 0) - (old_num or 0)
                col = _column_by_key(columns, stat_key)
                if not col or not col.get("log_changes"):
                    continue
                stat_name = col.get("label") or col.get("name") or stat_key
                log_color = col.get("log_color") or "#a1a1aa"
                add_log(
                    "stat_change",
                    actor_id=new_actor.id,
                    actor_name=new_actor.name,
                    details={
                        "stat_key": stat_key,
                        "stat_name": stat_name,
                        "amount": amount,
                        "color": log_color,
                    },
                )

            # Effect diff: added and removed
            def _effect_key(e):
                return getattr(e, "id", None) or getattr(e, "name", "")

            old_keys = {_effect_key(e) for e in old_actor.effects}
            new_keys = {_effect_key(e) for e in new_actor.effects}
            for e in new_actor.effects:
                if _effect_key(e) not in old_keys:
                    add_log(
                        "effect_added",
                        actor_id=new_actor.id,
                        actor_name=new_actor.name,
                        details={"effect_name": e.name},
                    )
            for e in old_actor.effects:
                if _effect_key(e) not in new_keys:
                    add_log(
                        "effect_removed",
                        actor_id=new_actor.id,
                        actor_name=new_actor.name,
                        details={"effect_name": e.name},
                    )

            app_state.state.actors[i] = new_actor

            for sk in changed_stat_keys:
                asyncio.create_task(led_interceptor.process_led_trigger(actor_id, "stat_change", sk))

            # Sync initiative to all actors in the same simultaneous group
            if (
                "initiative" in updates
                and new_actor.group_id
                and getattr(new_actor, "group_mode", None) == "simultaneous"
            ):
                val = new_actor.initiative
                for j, other in enumerate(app_state.state.actors):
                    if j != i and getattr(other, "group_id", None) == new_actor.group_id:
                        od = other.model_dump()
                        od["initiative"] = val
                        app_state.state.actors[j] = Actor(**od)

            combat_engine.reorder_turn_queue()
            await save_snapshot()
            await broadcast_state()
            return app_state.state.actors[i]
    return {"error": "not found"}


@router.delete("/{actor_id}")
async def delete_actor(actor_id: str):
    await save_snapshot()
    deleted = next((a for a in app_state.state.actors if a.id == actor_id), None)
    if deleted and app_state.state.is_active:
        add_log("actor_left", actor_id=deleted.id, actor_name=deleted.name)
    app_state.state.actors = [a for a in app_state.state.actors if a.id != actor_id]
    if actor_id in app_state.state.turn_queue:
        app_state.state.turn_queue.remove(actor_id)
        if app_state.state.current_index >= len(app_state.state.turn_queue):
            app_state.state.current_index = max(0, len(app_state.state.turn_queue) - 1)
    await save_snapshot()
    await broadcast_state()
    return {"status": "success"}

