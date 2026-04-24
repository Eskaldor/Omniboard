from __future__ import annotations

import asyncio
import json
import os
import tempfile
import threading

from backend.models import CombatSession
from backend.paths import AUTOSAVE_PATH
_AUTOSAVE_LOCK = threading.Lock()


def load_state() -> CombatSession:
    if AUTOSAVE_PATH.exists():
        try:
            data = json.loads(AUTOSAVE_PATH.read_text(encoding="utf-8"))
            return CombatSession.model_validate(data)
        except Exception:
            # If autosave is corrupted or incompatible, start with a fresh state
            pass
    return CombatSession()


state: CombatSession = load_state()

# Connected WebSocket clients
connected_clients: list = []


def save_state_sync() -> None:
    """Synchronously persist current state to AUTOSAVE_PATH if enabled."""
    if not state.session.autosave_enabled:
        return
    try:
        with _AUTOSAVE_LOCK:
            # Snapshot JSON on the calling thread to avoid races with concurrent mutations.
            payload = state.model_dump_json(indent=2)
            AUTOSAVE_PATH.parent.mkdir(parents=True, exist_ok=True)
            fd, tmp_name = tempfile.mkstemp(
                prefix="state_autosave_", suffix=".json", dir=str(AUTOSAVE_PATH.parent)
            )
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as f:
                    f.write(payload)
                os.replace(tmp_name, AUTOSAVE_PATH)
            except Exception:
                try:
                    os.unlink(tmp_name)
                except OSError:
                    pass
                raise
    except Exception:
        # Autosave should never break main flow
        pass


async def save_state_async() -> None:
    """Persist state to disk in a worker thread to avoid blocking the event loop."""
    await asyncio.to_thread(save_state_sync)
