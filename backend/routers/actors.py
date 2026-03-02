from __future__ import annotations

import uuid

from fastapi import APIRouter

from backend import combat_engine
from backend import state as app_state
from backend.history import save_snapshot
from backend.models import Actor
from backend.routers.ws import broadcast_state
from backend.services.logger import add_log


router = APIRouter(prefix="/api/actors", tags=["actors"])


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

