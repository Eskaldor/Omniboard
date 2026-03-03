from __future__ import annotations

import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend import state as app_state


router = APIRouter(tags=["ws"])


async def broadcast_state() -> None:
    payload = json.loads(app_state.state.model_dump_json())
    payload["can_undo"] = app_state.history_index > 0
    payload["can_redo"] = app_state.history_index < len(app_state.history_stack) - 1
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

    # Persist latest visible state for crash/restart recovery (offloaded to thread)
    await app_state.save_state_async()


@router.websocket("/ws/master")
async def websocket_master(websocket: WebSocket):
    await websocket.accept()
    app_state.connected_clients.append(websocket)

    payload = json.loads(app_state.state.model_dump_json())
    payload["can_undo"] = app_state.history_index > 0
    payload["can_redo"] = app_state.history_index < len(app_state.history_stack) - 1
    await websocket.send_text(json.dumps({"type": "state_update", "payload": payload}))

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        try:
            app_state.connected_clients.remove(websocket)
        except ValueError:
            pass

