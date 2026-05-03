"""Фильтрация CombatSession для публичного WebSocket-канала игроков."""
from __future__ import annotations

from typing import Any

from backend.models import CombatSession

# Поля актора, которые GM не должен показывать игрокам других персонажей
_ACTOR_GM_FIELDS = ("hotbar", "actions", "actions_panel_override", "miniature_id", "layout_profile_id")


def _apply_actor_visibility(actor: dict[str, Any]) -> dict[str, Any] | None:
    """Вернуть отфильтрованный словарь актора или None если актор скрыт."""
    if not actor.get("is_revealed", True):
        return None

    vis: dict[str, Any] = actor.get("visibility") or {}

    if not vis.get("name", True):
        actor["name"] = "???"

    if not vis.get("hp", True):
        # Обнуляем hp-подобные ключи, не трогая тип StatValue
        stats: dict[str, Any] = actor.get("stats") or {}
        for key in list(stats.keys()):
            if "hp" in key.lower():
                stats[key] = {"base": 0, "value": 0}

    if not vis.get("stats", True):
        actor["stats"] = {}

    if not vis.get("effects", True):
        actor["effects"] = []

    for field in _ACTOR_GM_FIELDS:
        actor.pop(field, None)

    return actor


def get_player_public_state(session: CombatSession) -> dict[str, Any]:
    """
    Срез CombatSession для клиентов игроков:
    - скрытые акторы (is_revealed=False) удалены
    - поля visibility применены (маскировка имени/хп/статов/эффектов)
    - GM-only данные удалены (hotbar, prerolls, undo-стек, hardware)
    """
    data = session.model_dump(
        mode="json",
        exclude={
            "session": {
                "history_stack": True,
                "history_index": True,
                "prerolls": True,
            }
        },
    )

    filtered_actors: list[dict[str, Any]] = []
    for actor in data["core"]["actors"]:
        result = _apply_actor_visibility(actor)
        if result is not None:
            filtered_actors.append(result)
    data["core"]["actors"] = filtered_actors

    # Убираем информацию о железе — не нужна игрокам
    data["hardware"] = {}

    # active_campaign_id нужен клиенту, чтобы знать, открыто ли лобби
    data["active_campaign_id"] = session.session.active_campaign_id

    return data
