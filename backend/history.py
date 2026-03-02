from __future__ import annotations

from backend import state as app_state


async def save_snapshot() -> None:
    """Save current state snapshot for Undo/Redo (RAM only)."""
    if app_state.history_index < len(app_state.history_stack) - 1:
        app_state.history_stack = app_state.history_stack[: app_state.history_index + 1]
    app_state.history_stack.append(app_state.state.model_dump())
    while len(app_state.history_stack) > 20:
        app_state.history_stack.pop(0)
        app_state.history_index -= 1
    app_state.history_index = len(app_state.history_stack) - 1

