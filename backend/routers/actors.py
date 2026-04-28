from __future__ import annotations

import asyncio
import json
import uuid

from fastapi import APIRouter, BackgroundTasks

from backend import combat_engine
from backend import state as app_state
from backend.history import save_snapshot
from backend.models import Actor, stat_cell_effective_scalar
from backend.paths import get_system_columns_path
from backend.routers.ws import broadcast_state
from backend.services import led_interceptor
from backend.services.hardware_triggers import find_hardware_trigger
from backend.services.logger import add_log
from backend.services.mechanics import MechanicsManager
from backend.services.render_push import proactive_render_and_push


router = APIRouter(prefix="/api/actors", tags=["actors"])

_mechanics = MechanicsManager()


def _deep_merge_dict(base: dict, patch: dict) -> dict:
    """Recursive dict merge; patch values win. Used for ``stats`` PATCH bodies."""
    out = dict(base)
    for k, v in patch.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge_dict(out[k], v)  # type: ignore[arg-type]
        else:
            out[k] = v
    return out


def _load_system_columns(system_name: str) -> list[dict]:
    """Load column definitions from system's columns.json. Returns list of column dicts."""
    path = get_system_columns_path(system_name or "")
    if path is None or not path.is_file():
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


def _checkbox_effective_bool(sub: dict, item_id: str) -> bool:
    """Missing item id → available (True), same as the initiative table UI."""
    if item_id not in sub:
        return True
    v = sub.get(item_id)
    if isinstance(v, bool):
        return v
    return bool(v)


def _item_label_from_column(col: dict, item_id: str) -> str:
    for it in col.get("items") or []:
        if isinstance(it, dict) and str(it.get("id")) == str(item_id):
            return str(it.get("label") or item_id)
    return str(item_id)


def _log_checkbox_group_stat_changes(
    *,
    col: dict,
    stat_key: str,
    old_val,
    new_val,
    actor_id: str,
    actor_name: str,
) -> None:
    old_sub = old_val if isinstance(old_val, dict) else {}
    new_sub = new_val if isinstance(new_val, dict) else {}
    column_label = col.get("label") or col.get("name") or stat_key
    log_color = col.get("log_color") or "#a1a1aa"
    item_ids = set(old_sub.keys()) | set(new_sub.keys())
    for item_id in sorted(item_ids, key=str):
        before = _checkbox_effective_bool(old_sub, item_id)
        after = _checkbox_effective_bool(new_sub, item_id)
        if before == after:
            continue
        item_label = _item_label_from_column(col, item_id)
        symbol = "✅" if after else "❌"
        message = f"{column_label} [{item_label}]: {symbol}"
        add_log(
            "stat_change",
            actor_id=actor_id,
            actor_name=actor_name,
            details={
                "stat_key": stat_key,
                "stat_name": column_label,
                "item_key": item_id,
                "item_label": item_label,
                "message": message,
                "checkbox_value": after,
                "amount": 0,
                "color": log_color,
            },
        )


def _log_stat_changes_for_actor(
    *,
    old_stats: dict,
    new_stats: dict,
    columns: list[dict],
    actor_id: str,
    actor_name: str,
) -> None:
    all_keys = set(old_stats.keys()) | set(new_stats.keys())
    for stat_key in all_keys:
        old_val = old_stats.get(stat_key)
        new_val = new_stats.get(stat_key)
        if old_val == new_val:
            continue
        col = _column_by_key(columns, stat_key)
        if not col or not col.get("log_changes"):
            continue

        if col.get("type") == "checkbox_group":
            _log_checkbox_group_stat_changes(
                col=col,
                stat_key=stat_key,
                old_val=old_val,
                new_val=new_val,
                actor_id=actor_id,
                actor_name=actor_name,
            )
            continue

        col_type = str(col.get("type") or "number").strip().lower()
        if col_type in ("text", "string"):
            if str(old_val) != str(new_val):
                stat_name = col.get("label") or col.get("name") or stat_key
                log_color = col.get("log_color") or "#a1a1aa"
                add_log(
                    "stat_change",
                    actor_id=actor_id,
                    actor_name=actor_name,
                    details={
                        "stat_key": stat_key,
                        "stat_name": stat_name,
                        "message": f"{stat_name}: {old_val} -> {new_val}",
                        "color": log_color,
                        "amount": 0,
                    },
                )
            continue

        try:
            old_raw = stat_cell_effective_scalar(old_val)
            new_raw = stat_cell_effective_scalar(new_val)
            old_num = int(old_raw) if old_raw is not None else None
            new_num = int(new_raw) if new_raw is not None else None
        except (TypeError, ValueError):
            old_num = new_num = None
        if old_num is None and new_num is None:
            continue
        amount = (new_num or 0) - (old_num or 0)
        stat_name = col.get("label") or col.get("name") or stat_key
        log_color = col.get("log_color") or "#a1a1aa"
        add_log(
            "stat_change",
            actor_id=actor_id,
            actor_name=actor_name,
            details={
                "stat_key": stat_key,
                "stat_name": stat_name,
                "amount": amount,
                "color": log_color,
            },
        )


@router.post("")
async def create_actor(actor: Actor):
    await save_snapshot()
    if not actor.id:
        actor.id = str(uuid.uuid4())
    system_name = getattr(app_state.state.core, "system", "") or ""
    actor = _mechanics.recalculate_actor_stats(actor, system_name)
    app_state.state.core.actors.append(actor)
    if app_state.state.core.is_active:
        app_state.state.core.turn_queue.append(actor.id)
        combat_engine.reorder_turn_queue()
        add_log("actor_joined", actor_id=actor.id, actor_name=actor.name)
    await save_snapshot()
    await broadcast_state()
    return actor


@router.patch("/{actor_id}")
async def update_actor(actor_id: str, updates: dict, background_tasks: BackgroundTasks):
    await save_snapshot()
    for i, a in enumerate(app_state.state.core.actors):
        if a.id == actor_id:
            old_actor = a
            actor_dict = a.model_dump()
            old_miniature_id = (old_actor.miniature_id or "").strip()
            old_stats = dict(actor_dict.get("stats") or {})
            changed_stat_keys: list[str] = []
            stats_patch = updates.get("stats")
            if isinstance(stats_patch, dict):
                for stat_key, new_val in stats_patch.items():
                    if old_stats.get(stat_key) != new_val:
                        changed_stat_keys.append(str(stat_key))
            if "stats" in updates:
                if actor_dict.get("stats") is None:
                    actor_dict["stats"] = {}
                sp = updates["stats"]
                if isinstance(sp, dict):
                    actor_dict["stats"] = _deep_merge_dict(
                        dict(actor_dict["stats"]), sp
                    )
                else:
                    actor_dict["stats"].update(sp)
                del updates["stats"]
            actor_dict.update(updates)
            new_actor = Actor(**actor_dict)
            system_name = getattr(app_state.state.core, "system", "") or ""
            new_actor = _mechanics.recalculate_actor_stats(new_actor, system_name)
            new_miniature_id = (new_actor.miniature_id or "").strip()
            new_stats = dict(new_actor.model_dump().get("stats") or {})

            # Dynamic stat change logging from column config (numbers + checkbox_group nests)
            columns = _load_system_columns(getattr(app_state.state.core, "system", "") or "D&D 5e")
            _log_stat_changes_for_actor(
                old_stats=old_stats,
                new_stats=new_stats,
                columns=columns,
                actor_id=new_actor.id,
                actor_name=new_actor.name,
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

            app_state.state.core.actors[i] = new_actor

            old_fx = [e.model_dump(mode="json") for e in old_actor.effects]
            new_fx = [e.model_dump(mode="json") for e in new_actor.effects]
            if old_fx != new_fx:
                asyncio.create_task(led_interceptor.sync_actor_led_to_device(actor_id))

            for sk in changed_stat_keys:
                asyncio.create_task(led_interceptor.process_led_trigger(actor_id, "stat_change", sk))

            # Proactively (re)render miniature PNG and push update to ESP (non-blocking for HTTP response).
            bind_rule = (
                find_hardware_trigger(system_name or "D&D 5e", "miniature_bind")
                if new_miniature_id and new_miniature_id != old_miniature_id
                else None
            )
            background_tasks.add_task(
                proactive_render_and_push,
                actor_id,
                transition=bind_rule.transition if bind_rule else None,
                transition_color=bind_rule.transition_color if bind_rule else None,
            )

            # Sync initiative to all actors in the same simultaneous group
            if (
                "initiative" in updates
                and new_actor.group_id
                and getattr(new_actor, "group_mode", None) == "simultaneous"
            ):
                val = new_actor.initiative
                for j, other in enumerate(app_state.state.core.actors):
                    if j != i and getattr(other, "group_id", None) == new_actor.group_id:
                        od = other.model_dump()
                        od["initiative"] = val
                        app_state.state.core.actors[j] = _mechanics.recalculate_actor_stats(
                            Actor(**od), system_name
                        )

            combat_engine.reorder_turn_queue()
            await save_snapshot()
            await broadcast_state()
            return app_state.state.core.actors[i]
    return {"error": "not found"}


@router.delete("/{actor_id}")
async def delete_actor(actor_id: str):
    await save_snapshot()
    deleted = next((a for a in app_state.state.core.actors if a.id == actor_id), None)
    if deleted and app_state.state.core.is_active:
        add_log("actor_left", actor_id=deleted.id, actor_name=deleted.name)
    app_state.state.core.actors = [a for a in app_state.state.core.actors if a.id != actor_id]
    if actor_id in app_state.state.core.turn_queue:
        app_state.state.core.turn_queue.remove(actor_id)
        if app_state.state.core.current_index >= len(app_state.state.core.turn_queue):
            app_state.state.core.current_index = max(0, len(app_state.state.core.turn_queue) - 1)
    await save_snapshot()
    await broadcast_state()
    return {"status": "success"}
