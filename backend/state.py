from __future__ import annotations

from pathlib import Path
import json

from backend.models import CombatState


AUTOSAVE_PATH = Path("data/state_autosave.json")


def load_state() -> CombatState:
    if AUTOSAVE_PATH.exists():
        try:
            data = json.loads(AUTOSAVE_PATH.read_text(encoding="utf-8"))
            return CombatState(**data)
        except Exception:
            # If autosave is corrupted or incompatible, start with a fresh state
            pass
    return CombatState()


state: CombatState = load_state()

# Undo/redo snapshot stack lives only in memory (see ADR-3)
history_stack: list = []
history_index: int = -1

# Connected WebSocket clients
connected_clients: list = []


def save_state_sync() -> None:
    """Synchronously persist current state to AUTOSAVE_PATH if enabled."""
    # Allow per-encounter opt-out from autosave
    if not getattr(state, "autosave_enabled", True):
        return
    try:
        AUTOSAVE_PATH.parent.mkdir(parents=True, exist_ok=True)
        AUTOSAVE_PATH.write_text(state.model_dump_json(indent=2), encoding="utf-8")
    except Exception:
        # Autosave should never break main flow
        pass

