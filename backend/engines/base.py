from __future__ import annotations

import json
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Literal, Optional

from backend.models import Actor, CombatState
from backend.paths import get_system_columns_path


def _get_actor(state: CombatState, aid: str) -> Actor | None:
    return next((a for a in state.actors if a.id == aid), None)


def turn_slot_actor_ids(state: CombatState, queue_index: int) -> list[str]:
    """Actor ids sharing the initiative slot at ``queue_index`` (simultaneous group or one)."""
    if not state.turn_queue or queue_index < 0 or queue_index >= len(state.turn_queue):
        return []
    current = _get_actor(state, state.turn_queue[queue_index])
    slot_size = 1
    if (
        current
        and getattr(current, "group_id", None)
        and getattr(current, "group_mode", None) == "simultaneous"
    ):
        gid = current.group_id
        while queue_index + slot_size < len(state.turn_queue):
            nxt = _get_actor(state, state.turn_queue[queue_index + slot_size])
            if (
                not nxt
                or getattr(nxt, "group_id", None) != gid
                or getattr(nxt, "group_mode", None) != "simultaneous"
            ):
                break
            slot_size += 1
    out: list[str] = []
    for i in range(slot_size):
        aid = state.turn_queue[queue_index + i]
        if aid:
            out.append(aid)
    return out


def _load_columns_json(path: Path | None) -> list[dict]:
    if path is None or not path.is_file():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, list):
            return [c for c in data if isinstance(c, dict)]
        cols = data.get("columns")
        if isinstance(cols, list):
            return [c for c in cols if isinstance(c, dict)]
    except Exception:
        return []
    return []


class BaseInitiativeEngine(ABC):
    """Abstract base for system-specific initiative engines (ADR-12)."""

    @abstractmethod
    def build_queue(self, state: CombatState) -> list[str]:
        """Return ordered actor IDs for the current pass/round queue."""

    @abstractmethod
    def next_turn(
        self, state: CombatState, target_actor_id: Optional[str] = None
    ) -> CombatState:
        """Advance or assign turn; ``target_actor_id`` for popcorn / manual mode."""

    @abstractmethod
    def has_next_pass(self, state: CombatState) -> bool:
        """Whether another pass is required in the current round."""

    @abstractmethod
    def on_round_lifecycle(
        self, state: CombatState, event: Literal["start", "end"]
    ) -> CombatState:
        """Round start/end hook (reactions, effect ticks, etc.)."""

    def _reset_actor_resources(
        self, state: CombatState, actor_id: str, trigger: str
    ) -> CombatState:
        """
        Set ``True`` for configured checkbox_group item keys when ``reset_policy`` matches
        ``trigger`` (e.g. ``turn_start`` at the beginning of the actor's turn).
        """
        path = get_system_columns_path(state.system or "")
        columns = _load_columns_json(path)
        targets: list[tuple[str, list[dict]]] = []
        for col in columns:
            if col.get("type") != "checkbox_group":
                continue
            policy = col.get("reset_policy") or "manual"
            if policy != trigger:
                continue
            col_key = col.get("key") or col.get("id")
            if not col_key:
                continue
            raw_items = col.get("items") or []
            items = [x for x in raw_items if isinstance(x, dict) and x.get("id")]
            if not items:
                continue
            targets.append((str(col_key), items))

        if not targets:
            return state

        new_actors: list[Actor] = []
        for a in state.actors:
            if a.id != actor_id:
                new_actors.append(a)
                continue
            stats: dict = dict(a.stats or {})
            for col_key, items in targets:
                prev_sub = stats.get(col_key)
                sub: dict = dict(prev_sub) if isinstance(prev_sub, dict) else {}
                for it in items:
                    iid = it.get("id")
                    if iid:
                        sub[str(iid)] = True
                stats[col_key] = sub
            new_actors.append(a.model_copy(update={"stats": stats}))
        return state.model_copy(update={"actors": new_actors})

    def _apply_turn_start_checkbox_resets(self, state: CombatState) -> CombatState:
        """After turn changes: reset ``turn_start`` checkbox groups for the current slot."""
        if not state.turn_queue:
            return state
        idx = state.current_index
        if idx < 0 or idx >= len(state.turn_queue):
            return state
        out = state
        for aid in turn_slot_actor_ids(out, idx):
            out = self._reset_actor_resources(out, aid, "turn_start")
        return out
