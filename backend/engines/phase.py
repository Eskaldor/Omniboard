from __future__ import annotations

from typing import Any, Literal, Optional

from backend.engines.base import BaseInitiativeEngine
from backend.engines.standard import _normalize_simultaneous_initiatives, _sort_key_actor
from backend.models import Actor, CombatState, Effect


def _get_actor(state: CombatState, aid: str) -> Actor | None:
    return next((a for a in state.actors if a.id == aid), None)


class PhaseInitiativeEngine(BaseInitiativeEngine):
    """Phase initiative: queue sorted by initiative (desc); only the current phase row is clickable."""

    def build_queue(self, state: CombatState) -> list[str]:
        normalized = _normalize_simultaneous_initiatives(list(state.actors))
        state.actors = normalized
        sorted_actors = sorted(normalized, key=_sort_key_actor)
        return [a.id for a in sorted_actors]

    def has_next_pass(self, state: CombatState) -> bool:
        return False

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

    def next_turn(
        self, state: CombatState, target_actor_id: Optional[str] = None
    ) -> CombatState:
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

            all_acted = True
            for aid in s.turn_queue:
                act = _get_actor(s, aid)
                if act is None or not act.has_acted:
                    all_acted = False
                    break
            if all_acted and s.turn_queue:
                s = self.on_round_lifecycle(s, "end")
                s = s.model_copy(
                    update={
                        "round": s.round + 1,
                        "current_index": 0,
                        "current_pass": 1,
                    }
                )
                return self.on_round_lifecycle(s, "start")
            return s

        s = self.on_round_lifecycle(state, "end")
        s = s.model_copy(
            update={
                "round": s.round + 1,
                "current_index": 0,
                "current_pass": 1,
            }
        )
        return self.on_round_lifecycle(s, "start")
