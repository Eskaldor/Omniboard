from __future__ import annotations

import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend import state as app_state
from backend.engines.manager import system_has_custom_logic_file
from backend.models import combat_session_public_payload


router = APIRouter(tags=["ws"])


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

    await app_state.save_state_async()


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
