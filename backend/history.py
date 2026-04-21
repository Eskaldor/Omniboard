from __future__ import annotations

from backend import state as app_state
from backend.models import combat_session_flat_undo_snapshot


async def save_snapshot() -> None:
    """Save current state snapshot for Undo/Redo (RAM only, in session.session)."""
    sess = app_state.state.session
    if sess.history_index < len(sess.history_stack) - 1:
        sess.history_stack = sess.history_stack[: sess.history_index + 1]
    sess.history_stack.append(combat_session_flat_undo_snapshot(app_state.state))
    while len(sess.history_stack) > 20:
        sess.history_stack.pop(0)
        if sess.history_index > 0:
            sess.history_index -= 1
    sess.history_index = len(sess.history_stack) - 1
