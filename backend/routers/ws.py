from __future__ import annotations

import json
from typing import Optional

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from backend import state as app_state
from backend.engines.manager import system_has_custom_logic_file
from backend.models import combat_session_public_payload
from backend.services.player_state import get_player_public_state


router = APIRouter(tags=["ws"])

# Таблица socket → actor_id (None если клиент подключён без токена / токен не распознан).
# Используется для персонализированной рассылки: собственный актор игрока передаётся
# без фильтрации видимости.
_player_sockets: dict[WebSocket, str | None] = {}

async def broadcast_roll_event(*, actor_id: str | None, payload: dict) -> None:
    """Send a roll toast event to GM and (optionally) one player.

    `actor_id=None` means GM-only.
    """
    message = json.dumps({"type": "roll_event", "payload": payload})

    dead_master: list[WebSocket] = []
    for client in list(app_state.connected_clients):
        try:
            await client.send_text(message)
        except Exception:
            dead_master.append(client)
    for client in dead_master:
        try:
            app_state.connected_clients.remove(client)
        except ValueError:
            pass

    if not actor_id:
        return

    dead_player: list[WebSocket] = []
    for client, aid in list(_player_sockets.items()):
        if aid != actor_id:
            continue
        try:
            await client.send_text(message)
        except Exception:
            dead_player.append(client)
    for client in dead_player:
        _player_sockets.pop(client, None)
        try:
            app_state.player_clients.remove(client)
        except ValueError:
            pass


async def broadcast_roll_request_to_gm(*, payload: dict) -> None:
    """Send an out-of-turn roll request to GM only."""
    message = json.dumps({"type": "roll_request", "payload": payload})
    dead: list[WebSocket] = []
    for client in list(app_state.connected_clients):
        try:
            await client.send_text(message)
        except Exception:
            dead.append(client)
    for client in dead:
        try:
            app_state.connected_clients.remove(client)
        except ValueError:
            pass


async def broadcast_roll_request_status_to_player(*, actor_id: str, payload: dict) -> None:
    """Send roll request status to a specific player (by actor_id)."""
    message = json.dumps({"type": "roll_request_status", "payload": payload})
    dead_player: list[WebSocket] = []
    for client, aid in list(_player_sockets.items()):
        if aid != actor_id:
            continue
        try:
            await client.send_text(message)
        except Exception:
            dead_player.append(client)
    for client in dead_player:
        _player_sockets.pop(client, None)
        try:
            app_state.player_clients.remove(client)
        except ValueError:
            pass


async def broadcast_whisper_event(*, payload: dict) -> None:
    """Send a whisper toast event to GM only."""
    message = json.dumps({"type": "whisper_event", "payload": payload})
    dead: list[WebSocket] = []
    for client in list(app_state.connected_clients):
        try:
            await client.send_text(message)
        except Exception:
            dead.append(client)
    for client in dead:
        try:
            app_state.connected_clients.remove(client)
        except ValueError:
            pass


async def broadcast_ai_image_event(payload: dict) -> None:
    """Notify GM clients that an AI-generated library image is ready (or failed).

    Payload shape: ``{"type": "ai_image_ready", "job_id": str, "ok": bool,
    "path"?: str, "error"?: str}``. Consumed by LibraryModal to refresh
    thumbnails without polling. Sent as the full event (not wrapped in another
    ``payload`` key) since it's already a flat envelope.
    """
    message = json.dumps(payload)
    dead: list[WebSocket] = []
    for client in list(app_state.connected_clients):
        try:
            await client.send_text(message)
        except Exception:
            dead.append(client)
    for client in dead:
        try:
            app_state.connected_clients.remove(client)
        except ValueError:
            pass


async def broadcast_player_state() -> None:
    """Отправить персонализированный стейт каждому подключённому клиенту игрока."""
    if not _player_sockets:
        return
    dead: list[WebSocket] = []
    for client, actor_id in list(_player_sockets.items()):
        try:
            payload = get_player_public_state(app_state.state, actor_id)
            await client.send_text(json.dumps({"type": "state_update", "payload": payload}))
        except Exception:
            dead.append(client)
    for client in dead:
        _player_sockets.pop(client, None)
        try:
            app_state.player_clients.remove(client)
        except ValueError:
            pass


async def broadcast_state() -> None:
    payload = combat_session_public_payload(
        app_state.state,
        initiative_engine_locked=system_has_custom_logic_file(app_state.state.core.system),
    )
    message = json.dumps({"type": "state_update", "payload": payload})

    dead: list[WebSocket] = []
    for client in app_state.connected_clients:
        try:
            await client.send_text(message)
        except Exception:
            dead.append(client)
    for client in dead:
        try:
            app_state.connected_clients.remove(client)
        except ValueError:
            pass

    await broadcast_player_state()
    await app_state.save_state_async()


@router.websocket("/ws/player")
async def websocket_player(
    websocket: WebSocket,
    token: Optional[str] = Query(default=None),
):
    await websocket.accept()
    # Персонализация: определяем актора по токену (если передан).
    actor_id: str | None = app_state.token_to_actor.get(token) if token else None
    _player_sockets[websocket] = actor_id
    app_state.player_clients.append(websocket)

    payload = get_player_public_state(app_state.state, actor_id)
    await websocket.send_text(json.dumps({"type": "state_update", "payload": payload}))
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        _player_sockets.pop(websocket, None)
        try:
            app_state.player_clients.remove(websocket)
        except ValueError:
            pass


@router.websocket("/ws/master")
async def websocket_master(websocket: WebSocket):
    await websocket.accept()
    app_state.connected_clients.append(websocket)

    payload = combat_session_public_payload(
        app_state.state,
        initiative_engine_locked=system_has_custom_logic_file(app_state.state.core.system),
    )
    await websocket.send_text(json.dumps({"type": "state_update", "payload": payload}))

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        try:
            app_state.connected_clients.remove(websocket)
        except ValueError:
            pass
