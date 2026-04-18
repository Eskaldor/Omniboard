from __future__ import annotations

from typing import Callable

from backend import state as app_state
from backend.models import CombatState, Actor


LogFn = Callable[..., None]


def current_turn_slot_actor_ids() -> list[str]:
    """Actor ids sharing the current initiative slot (one actor or a simultaneous group)."""
    st = app_state.state
    if not st.turn_queue:
        return []
    idx = st.current_index
    if idx < 0 or idx >= len(st.turn_queue):
        return []

    def get_actor(aid: str) -> Actor | None:
        return next((a for a in st.actors if a.id == aid), None)

    current_actor = get_actor(st.turn_queue[idx])
    slot_size = 1
    if (
        current_actor
        and getattr(current_actor, "group_id", None)
        and getattr(current_actor, "group_mode", None) == "simultaneous"
    ):
        gid = current_actor.group_id
        while idx + slot_size < len(st.turn_queue):
            next_actor = get_actor(st.turn_queue[idx + slot_size])
            if (
                not next_actor
                or getattr(next_actor, "group_id", None) != gid
                or getattr(next_actor, "group_mode", None) != "simultaneous"
            ):
                break
            slot_size += 1
    out: list[str] = []
    for i in range(slot_size):
        aid = st.turn_queue[idx + i]
        if aid:
            out.append(aid)
    return out


def reorder_turn_queue() -> None:
    """Re-sort turn_queue by initiative (desc) while keeping the current actor's turn active."""
    if not app_state.state.is_active or not app_state.state.turn_queue:
        return
    active_id = app_state.state.turn_queue[app_state.state.current_index]
    initiative_by_id = {a.id: a.initiative for a in app_state.state.actors}
    group_by_id = {a.id: (getattr(a, "group_id", None) or "") for a in app_state.state.actors}
    app_state.state.turn_queue = sorted(
        app_state.state.turn_queue,
        key=lambda actor_id: (-initiative_by_id.get(actor_id, 0), group_by_id.get(actor_id, "")),
    )
    app_state.state.current_index = app_state.state.turn_queue.index(active_id)


def undo() -> bool:
    """Step one snapshot back in history_stack if possible."""
    if app_state.history_index > 0:
        app_state.history_index -= 1
        app_state.state = CombatState(**app_state.history_stack[app_state.history_index])
        return True
    return False


def redo() -> bool:
    """Step one snapshot forward in history_stack if possible."""
    if app_state.history_index < len(app_state.history_stack) - 1:
        app_state.history_index += 1
        app_state.state = CombatState(**app_state.history_stack[app_state.history_index])
        return True
    return False


def start_combat(log: LogFn) -> None:
    """Initialize combat: normalize initiatives and build initial turn queue."""
    app_state.state.is_active = True
    app_state.state.round = 1

    # For each simultaneous group, set all members' initiative to the max in the group
    groups: dict[str, list[tuple[str, int]]] = {}
    for a in app_state.state.actors:
        if getattr(a, "group_id", None) and getattr(a, "group_mode", None) == "simultaneous":
            groups.setdefault(a.group_id, []).append((a.id, a.initiative))
    for gid, id_init_list in groups.items():
        if not id_init_list:
            continue
        max_init = max(init for _, init in id_init_list)
        for i, actor in enumerate(app_state.state.actors):
            if getattr(actor, "group_id", None) == gid:
                ad = actor.model_dump()
                ad["initiative"] = max_init
                app_state.state.actors[i] = Actor(**ad)

    # Sort by initiative desc, then by group_id so simultaneous groups stay consecutive
    def sort_key(a: Actor):
        gid = getattr(a, "group_id", None) or ""
        return (-a.initiative, gid)

    sorted_actors = sorted(app_state.state.actors, key=sort_key)
    app_state.state.turn_queue = [a.id for a in sorted_actors]
    app_state.state.current_index = 0
    log("combat_start")


def end_combat(log: LogFn) -> None:
    """Finish combat: clear queue while preserving actors."""
    app_state.state.is_active = False
    app_state.state.turn_queue = []
    app_state.state.current_index = 0
    log("combat_end")


def reset_combat_state() -> None:
    """Reset combat data but keep actors."""
    app_state.state.is_active = False
    app_state.state.round = 1
    app_state.state.turn_queue = []
    app_state.state.current_index = 0
    app_state.state.history = []
    for actor in app_state.state.actors:
        actor.effects = []


def clear_combat_state() -> None:
    """Fully clear tracker: remove only non-pinned actors; keep queue, round and history cleared."""
    app_state.state.actors = [a for a in app_state.state.actors if getattr(a, "is_pinned", False)]
    app_state.state.turn_queue = []
    app_state.state.current_index = 0
    app_state.state.round = 1
    app_state.state.history = []
    app_state.state.is_active = False


def next_turn(log: LogFn) -> None:
    """Advance to next turn, handling simultaneous groups and effect durations."""

    def get_actor(aid: str) -> Actor | None:
        return next((a for a in app_state.state.actors if a.id == aid), None)

    # Slot size at current position: 1 or count of consecutive same simultaneous group
    idx = app_state.state.current_index
    current_actor = get_actor(app_state.state.turn_queue[idx])
    slot_size = 1
    if current_actor and getattr(current_actor, "group_id", None) and getattr(current_actor, "group_mode", None) == "simultaneous":
        gid = current_actor.group_id
        while idx + slot_size < len(app_state.state.turn_queue):
            next_actor = get_actor(app_state.state.turn_queue[idx + slot_size])
            if not next_actor or getattr(next_actor, "group_id", None) != gid or getattr(next_actor, "group_mode", None) != "simultaneous":
                break
            slot_size += 1

    app_state.state.current_index = (app_state.state.current_index + slot_size) % len(app_state.state.turn_queue)
    if app_state.state.current_index == 0:
        app_state.state.round += 1
        log("round_start")
        for actor in app_state.state.actors:
            for effect in actor.effects:
                if effect.duration is not None:
                    effect.duration -= 1
            for effect in actor.effects:
                if effect.duration is not None and effect.duration <= 0:
                    log(
                        "effect_removed",
                        actor_id=actor.id,
                        actor_name=actor.name,
                        details={"effect_name": effect.name},
                    )
            actor.effects = [e for e in actor.effects if e.duration is None or e.duration > 0]

    # Log turn_start for each actor in the new slot
    idx = app_state.state.current_index
    new_actor = get_actor(app_state.state.turn_queue[idx])
    slot_size = 1
    if new_actor and getattr(new_actor, "group_id", None) and getattr(new_actor, "group_mode", None) == "simultaneous":
        gid = new_actor.group_id
        while idx + slot_size < len(app_state.state.turn_queue):
            next_actor = get_actor(app_state.state.turn_queue[idx + slot_size])
            if not next_actor or getattr(next_actor, "group_id", None) != gid or getattr(next_actor, "group_mode", None) != "simultaneous":
                break
            slot_size += 1
    for i in range(slot_size):
        a = get_actor(app_state.state.turn_queue[idx + i])
        if a:
            log("turn_start", actor_id=a.id, actor_name=a.name)

