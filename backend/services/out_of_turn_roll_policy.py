"""Правила: может ли игрок сейчас бросать от имени актора (включая вне своего хода)."""
from __future__ import annotations

from backend.models import CombatSession


def is_actors_turn(cs: CombatSession, actor_id: str) -> bool:
    core = cs.core
    if not bool(core.is_active) or not core.turn_queue:
        return False
    idx = int(core.current_index or 0)
    if idx < 0 or idx >= len(core.turn_queue):
        return False
    return core.turn_queue[idx] == actor_id


def player_may_roll_now(cs: CombatSession, actor_id: str) -> bool:
    """GM всегда может через этот же эндпоинт без токена игрока — проверка только для player rolls."""
    if is_actors_turn(cs, actor_id):
        return True
    if bool(cs.session.allow_out_of_turn_rolls):
        return True
    r_pass = cs.session.actor_out_of_turn_round_pass.get(actor_id)
    return r_pass is not None and int(r_pass) == int(cs.core.round)
