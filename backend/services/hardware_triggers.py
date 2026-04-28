"""Shared helpers for system hardware trigger rules."""
from __future__ import annotations

import json

from backend.models import HardwareTrigger
from backend.paths import DATA_DIR


def _safe_system_dir(system_name: str) -> bool:
    s = (system_name or "").strip()
    if not s or ".." in s or "/" in s or "\\" in s:
        return False
    try:
        (DATA_DIR / s).resolve().relative_to(DATA_DIR.resolve())
    except ValueError:
        return False
    return True


def load_hardware_triggers(system_name: str) -> list[HardwareTrigger]:
    if not _safe_system_dir(system_name):
        return []
    path = (DATA_DIR / system_name.strip() / "led_triggers.json").resolve()
    try:
        path.relative_to(DATA_DIR.resolve())
    except ValueError:
        return []
    if not path.is_file():
        return []
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(raw, list):
            return []
        return [HardwareTrigger.model_validate(item) for item in raw]
    except (OSError, ValueError):
        return []


def find_hardware_trigger(
    system_name: str,
    event_type: str,
    target_stat: str | None = None,
) -> HardwareTrigger | None:
    for rule in load_hardware_triggers(system_name):
        if rule.event_type != event_type:
            continue
        if event_type == "stat_change":
            rkey = (rule.target_stat or "").strip()
            tkey = (target_stat or "").strip()
            if rkey != tkey:
                continue
        return rule
