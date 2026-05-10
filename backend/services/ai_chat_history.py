"""Per-combat AI chat-history store.

Lives at ``data/state_ai_chat.json`` — deliberately separate from
``state_autosave.json`` so the combat snapshot doesn't get bloated by potentially
long chat transcripts and we don't burn undo-stack memory on text history.

Lifecycle:
- Append on every successful ``POST /api/ai/chat`` (full conversation as the GM
  sees it, including ``system_report`` and ``usage`` on assistant turns).
- Hydrate on frontend mount via ``GET /api/ai/chat/history`` so a page refresh
  doesn't blow away the conversation.
- Cleared automatically when the GM clears combat (``POST /api/combat/clear``).

Storage format::

    {
        "version": 1,
        "updated_at": "<iso8601 utc>",
        "messages": [
            {"role": "user", "content": "..."},
            {
                "role": "assistant",
                "content": "...",
                "system_report": ["..."],
                "usage": {"prompt_tokens": ..., "completion_tokens": ..., "total_tokens": ...}
            }
        ]
    }

Hard cap on persisted messages keeps the file bounded; oldest entries drop first.
"""
from __future__ import annotations

import json
import logging
import os
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.paths import BASE_DIR

_log = logging.getLogger(__name__)

CHAT_HISTORY_PATH: Path = BASE_DIR / "data" / "state_ai_chat.json"

_FILE_LOCK = threading.Lock()
_VERSION = 1
# Soft cap: ~500 turns. Each chat record is small, but let's keep the file from
# growing unbounded over a long campaign session.
_MAX_PERSISTED_MESSAGES = 500
_ALLOWED_ROLES = {"user", "assistant", "system"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _coerce_message(raw: Any) -> dict[str, Any] | None:
    """Whitelist the fields we persist. Returns ``None`` for invalid entries."""
    if not isinstance(raw, dict):
        return None
    role = raw.get("role")
    if not isinstance(role, str) or role not in _ALLOWED_ROLES:
        return None
    content = raw.get("content")
    if isinstance(content, str):
        clean_content = content
    elif content is None:
        clean_content = ""
    else:
        # Force to string — frontend should be the only producer of these, and it
        # always sends string content.
        clean_content = str(content)

    out: dict[str, Any] = {"role": role, "content": clean_content}

    # Only assistant turns may carry system_report / usage.
    if role == "assistant":
        sr = raw.get("system_report")
        if isinstance(sr, list):
            lines = [s for s in sr if isinstance(s, str)]
            if lines:
                out["system_report"] = lines
        usage = raw.get("usage")
        if isinstance(usage, dict):
            picked: dict[str, int] = {}
            for k in ("prompt_tokens", "completion_tokens", "total_tokens"):
                v = usage.get(k)
                if isinstance(v, bool):
                    continue
                if isinstance(v, int):
                    picked[k] = v
                elif isinstance(v, float) and v.is_integer():
                    picked[k] = int(v)
            if picked:
                out["usage"] = picked
    return out


def load_history() -> list[dict[str, Any]]:
    """Return the persisted message list (empty list when nothing saved)."""
    with _FILE_LOCK:
        try:
            if not CHAT_HISTORY_PATH.is_file():
                return []
            raw = json.loads(CHAT_HISTORY_PATH.read_text(encoding="utf-8"))
        except (OSError, ValueError, json.JSONDecodeError) as e:
            _log.warning("ai_chat_history unreadable: %s", e)
            return []

    if not isinstance(raw, dict):
        return []
    msgs = raw.get("messages")
    if not isinstance(msgs, list):
        return []
    cleaned = [m for m in (_coerce_message(x) for x in msgs) if m is not None]
    return cleaned


def save_history(messages: list[dict[str, Any]]) -> None:
    """Atomically replace the on-disk history with ``messages``.

    Tolerant: invalid entries are dropped. The newest ``_MAX_PERSISTED_MESSAGES``
    entries are kept (oldest drop first) so the file stays bounded.
    """
    cleaned = [m for m in (_coerce_message(x) for x in messages) if m is not None]
    if len(cleaned) > _MAX_PERSISTED_MESSAGES:
        cleaned = cleaned[-_MAX_PERSISTED_MESSAGES:]

    payload = {
        "version": _VERSION,
        "updated_at": _now_iso(),
        "messages": cleaned,
    }
    body = json.dumps(payload, ensure_ascii=False, indent=2)
    target = CHAT_HISTORY_PATH

    with _FILE_LOCK:
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            fd, tmp_name = tempfile.mkstemp(
                prefix="state_ai_chat_", suffix=".json", dir=str(target.parent)
            )
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as f:
                    f.write(body)
                os.replace(tmp_name, target)
            except Exception:
                try:
                    os.unlink(tmp_name)
                except OSError:
                    pass
                raise
        except OSError as e:
            _log.warning("ai_chat_history write failed: %s", e)


def clear_history() -> None:
    """Delete the history file. Idempotent."""
    with _FILE_LOCK:
        try:
            CHAT_HISTORY_PATH.unlink(missing_ok=True)
        except OSError as e:
            _log.warning("ai_chat_history unlink failed: %s", e)
