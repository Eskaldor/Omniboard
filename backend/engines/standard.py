from __future__ import annotations

from typing import Any, Literal, Optional

from backend.engines.base import BaseInitiativeEngine
from backend.models import Actor, CombatState, Effect


def _get_actor(state: CombatState, aid: str) -> Actor | None:
    return next((a for a in state.actors if a.id == aid), None)


def _slot_size_at(state: CombatState, idx: int) -> int:
    """Count of queue entries sharing the current initiative slot (simultaneous group or 1)."""
    if not state.turn_queue or idx < 0 or idx >= len(state.turn_queue):
        return 0
    current = _get_actor(state, state.turn_queue[idx])
    slot_size = 1
    if (
        current
        and getattr(current, "group_id", None)
        and getattr(current, "group_mode", None) == "simultaneous"
    ):
        gid = current.group_id
        while idx + slot_size < len(state.turn_queue):
            nxt = _get_actor(state, state.turn_queue[idx + slot_size])
            if (
                not nxt
                or getattr(nxt, "group_id", None) != gid
                or getattr(nxt, "group_mode", None) != "simultaneous"
            ):
                break
            slot_size += 1
    return slot_size


def _normalize_simultaneous_initiatives(actors: list[Actor]) -> list[Actor]:
    """Set each simultaneous-group member's initiative to the group's max (same as start_combat)."""
    groups: dict[str, list[tuple[str, int]]] = {}
    for a in actors:
        if getattr(a, "group_id", None) and getattr(a, "group_mode", None) == "simultaneous":
            groups.setdefault(a.group_id, []).append((a.id, a.initiative))
    max_by_gid: dict[str, int] = {}
    for gid, id_init_list in groups.items():
        if id_init_list:
            max_by_gid[gid] = max(init for _, init in id_init_list)
    out: list[Actor] = []
    for a in actors:
        gid = getattr(a, "group_id", None)
        if gid and getattr(a, "group_mode", None) == "simultaneous" and gid in max_by_gid:
            out.append(a.model_copy(update={"initiative": max_by_gid[gid]}))
        else:
            out.append(a)
    return out


def _sort_key_actor(a: Actor) -> tuple[int, str]:
    gid = getattr(a, "group_id", None) or ""
    return (-a.initiative, gid)


class StandardInitiativeEngine(BaseInitiativeEngine):
    """Classic descending initiative (D&D-style), including simultaneous groups as one slot."""

    def build_queue(self, state: CombatState) -> list[str]:
        normalized = _normalize_simultaneous_initiatives(list(state.actors))
        state.actors = normalized
        sorted_actors = sorted(normalized, key=_sort_key_actor)
        return [a.id for a in sorted_actors]

    def has_next_pass(self, state: CombatState) -> bool:
        return False

    def next_turn(
        self, state: CombatState, target_actor_id: Optional[str] = None
    ) -> CombatState:
        if state.is_manual_mode:
            if target_actor_id is not None:
                new_actors: list[Actor] = []
                for a in state.actors:
                    if a.id == target_actor_id:
                        new_actors.append(a.model_copy(update={"has_acted": True}))
                    else:
                        new_actors.append(a)
                updates: dict[str, Any] = {"actors": new_actors}
                try:
                    updates["current_index"] = state.turn_queue.index(target_actor_id)
                except ValueError:
                    pass
                s = state.model_copy(update=updates)
                return self._apply_turn_start_checkbox_resets(s)
            else:
                # Manual mode without target: "Next round" button
                s = self.on_round_lifecycle(state, "end")
                s = s.model_copy(
                    update={
                        "round": s.round + 1,
                        "current_index": 0,
                        "current_pass": 1,
                    }
                )
                s = self.on_round_lifecycle(s, "start")
                return self._apply_turn_start_checkbox_resets(s)

        if not state.turn_queue:
            return state

        idx = state.current_index
        if idx < 0 or idx >= len(state.turn_queue):
            return state

        slot_size = _slot_size_at(state, idx)
        if slot_size <= 0:
            return state

        n = len(state.turn_queue)
        new_index = (state.current_index + slot_size) % n

        if new_index == 0:
            s = self.on_round_lifecycle(state, "end")
            s = s.model_copy(
                update={
                    "round": s.round + 1,
                    "current_index": 0,
                    "current_pass": 1,
                }
            )
            s = self.on_round_lifecycle(s, "start")
            return self._apply_turn_start_checkbox_resets(s)

        s = state.model_copy(update={"current_index": new_index})
        return self._apply_turn_start_checkbox_resets(s)

    def on_round_lifecycle(
        self, state: CombatState, event: Literal["start", "end"]
    ) -> CombatState:
        if event == "end":
            return state

        new_actors: list[Actor] = []
        for actor in state.actors:
            updated_effects: list[Effect] = []
            for e in actor.effects:
                if e.duration is None:
                    updated_effects.append(e)
                else:
                    nd = e.duration - 1
                    if nd > 0:
                        updated_effects.append(e.model_copy(update={"duration": nd}))
            new_actors.append(
                actor.model_copy(update={"effects": updated_effects, "has_acted": False})
            )
        return state.model_copy(update={"actors": new_actors, "current_pass": 1})
