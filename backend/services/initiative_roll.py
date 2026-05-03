"""Системный шаблон initiative_roll из mechanics.json и бросок только через D20Engine (сумма кубиков)."""

from __future__ import annotations

from typing import Optional

from backend.models import Actor
from backend.services.dice import D20Engine, RollResult
from backend.utils.config_loader import load_config_with_override

_FALLBACK_EXPR = "1d20"


def normalize_simultaneous_actor_initiatives(actors: list[Actor]) -> list[Actor]:
    """Выравнивает initiative у членов simultaneous-группы до максимума в группе."""
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


def raw_initiative_roll_value(system_name: str) -> Optional[str]:
    """Сырое значение ключа initiative_roll из mechanics.json (может быть none)."""
    data = load_config_with_override(system_name or "", "mechanics.json")
    if not isinstance(data, dict):
        return None
    raw = data.get("initiative_roll")
    if raw is None:
        return None
    if isinstance(raw, str):
        return raw.strip()
    return None


def resolve_initiative_expression(system_name: str) -> Optional[str]:
    """
    None — бросок отключён (явный none).
    Иначе строка выражения (fallback 1d20 при пустом/отсутствующем ключе).
    """
    raw = raw_initiative_roll_value(system_name)
    if raw is None:
        return _FALLBACK_EXPR
    if raw.lower() == "none":
        return None
    if raw == "":
        return _FALLBACK_EXPR
    return raw


def initiative_roll_available(system_name: str) -> bool:
    return resolve_initiative_expression(system_name) is not None


def roll_initiative_for_actor(actor: Actor, expr: str) -> RollResult:
    return D20Engine().roll(expr.strip(), actor)


def actor_matches_initiative_role_filter(
    actor: Actor,
    *,
    include_character: bool,
    include_enemy: bool,
    include_ally: bool,
    include_neutral: bool,
) -> bool:
    r = actor.role
    if r == "character":
        return include_character
    if r == "enemy":
        return include_enemy
    if r == "ally":
        return include_ally
    if r == "neutral":
        return include_neutral
    return False


def apply_initiative_rolls_to_actor_list(
    actors: list[Actor],
    expr: str,
    *,
    only_actor_ids: Optional[set[str]] = None,
    include_character: bool = False,
    include_enemy: bool = True,
    include_ally: bool = True,
    include_neutral: bool = True,
) -> tuple[list[Actor], list[tuple[str, str, RollResult]]]:
    """
    Бросок initiative по expr для подмножества актёров; затем normalize simultaneous groups.
    Порядок списка сохраняется. Второй элемент — (actor_id, actor_name, RollResult) по каждому броску.
    """
    out_map = {a.id: a for a in actors}
    if only_actor_ids is not None:
        targets = [aid for aid in only_actor_ids if aid in out_map]
    else:
        targets = [
            a.id
            for a in actors
            if actor_matches_initiative_role_filter(
                a,
                include_character=include_character,
                include_enemy=include_enemy,
                include_ally=include_ally,
                include_neutral=include_neutral,
            )
        ]
    rolls_log: list[tuple[str, str, RollResult]] = []
    for aid in targets:
        a = out_map[aid]
        res = roll_initiative_for_actor(a, expr)
        rolls_log.append((a.id, a.name, res))
        out_map[aid] = a.model_copy(update={"initiative": res.total})
    ordered = [out_map[a.id] for a in actors]
    normalized = normalize_simultaneous_actor_initiatives(ordered)
    return normalized, rolls_log
