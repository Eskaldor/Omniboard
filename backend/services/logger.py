from __future__ import annotations

import json
import logging
import threading

from backend import state as app_state
from backend.models import LogEntry
from backend.paths import LOGS_DIR

_esp_logger = logging.getLogger("omniboard.esp")


def log_esp_warning(message: str, *args: object) -> None:
    """Structured warnings for ESP / Omnimini hardware (combat log is separate)."""
    _esp_logger.warning(message, *args)


def add_log(
    entry_type: str,
    *,
    actor_id: str | None = None,
    actor_name: str | None = None,
    details: dict | None = None,
) -> None:
    if not app_state.state.session.enable_logging:
        return
    app_state.state.session.history.append(
        LogEntry(
            type=entry_type,
            round=app_state.state.core.round,
            actor_id=actor_id,
            actor_name=actor_name,
            details=details or {},
        )
    )

    # Write log file in background so request is not blocked
    history_snapshot = [h.model_dump() for h in app_state.state.session.history]

    def _entry_to_md_line(entry: dict) -> str:
        t = entry.get("type", "")
        r = entry.get("round", 1)
        name = entry.get("actor_name") or "Unknown"
        det = entry.get("details") or {}
        if t == "turn_start":
            return f"\n### Round {r} ###\n▶ Turn: {name}"
        if t == "round_start":
            return f"\n### Round {r} ###"
        if t == "hp_change":
            delta = det.get("delta", 0)
            return f"{name} HP changed ({delta})."
        if t == "stat_change":
            msg = det.get("message")
            if isinstance(msg, str) and msg.strip():
                return f"{name} {msg.strip()}"
            stat_name = det.get("stat_name", det.get("stat_key", "?"))
            amount = det.get("amount", 0)
            return f"{name} {stat_name}: {'+' if amount >= 0 else ''}{amount}."
        if t == "effect_added":
            effect_name = det.get("effect_name", "?")
            return f"{name} gained effect: {effect_name}."
        if t == "effect_removed":
            effect_name = det.get("effect_name", "?")
            return f"{name} lost effect: {effect_name}."
        if t == "text" and det.get("is_matrix_use"):
            msg = det.get("message", "")
            if isinstance(msg, str) and msg.strip():
                return f"{name} {msg.strip()}"
            return f"{name} matrix slot used."
        if t == "text" and det.get("is_gm_note"):
            msg = det.get("message", "")
            return f"*GM Note: {msg}*"
        if t == "combat_start":
            return "Combat started."
        if t == "combat_end":
            return "Combat ended."
        if t == "actor_joined":
            return f"{name} joined the battle."
        if t == "actor_left":
            return f"{name} left the battle."
        if t == "roll":
            expr = det.get("expression", "")
            tot = det.get("total", "?")
            det_str = det.get("details", "")
            return f"{name} roll: {expr} → **{tot}** ({det_str})"
        return f"[{t}]"

    def _write() -> None:
        try:
            path_json = LOGS_DIR / "latest_combat.json"
            path_json.write_text(json.dumps(history_snapshot, indent=2), encoding="utf-8")
            md_lines = [_entry_to_md_line(e) for e in history_snapshot]
            path_md = LOGS_DIR / "latest_combat.md"
            path_md.write_text("\n".join(md_lines).strip() + "\n", encoding="utf-8")
        except Exception:
            pass

    threading.Thread(target=_write, daemon=True).start()

