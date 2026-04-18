"""
LED trigger rules: react to combat events and push Omnimini /update LED payloads.
"""
from __future__ import annotations

import asyncio
import json

from backend import state as app_state
from backend.led_resolver import ACTIVE_OVERRIDES, resolve_led_payload, resolve_led_payload_for_profile
from backend.models import LedTriggerRule
from backend.paths import DATA_DIR
from backend.routers.hardware import _esp


def _safe_system_dir(system_name: str) -> bool:
    s = (system_name or "").strip()
    if not s or ".." in s or "/" in s or "\\" in s:
        return False
    try:
        (DATA_DIR / s).resolve().relative_to(DATA_DIR.resolve())
    except ValueError:
        return False
    return True


def _load_triggers(system_name: str) -> list[LedTriggerRule]:
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
        return [LedTriggerRule.model_validate(item) for item in raw]
    except (OSError, ValueError):
        return []


def _find_matching_rule(
    rules: list[LedTriggerRule],
    event_type: str,
    target_stat: str | None,
) -> LedTriggerRule | None:
    for rule in rules:
        if rule.event_type != event_type:
            continue
        if event_type == "stat_change":
            rkey = (rule.target_stat or "").strip()
            tkey = (target_stat or "").strip()
            if rkey != tkey:
                continue
        return rule
    return None


async def reset_actor_led_to_default(actor_id: str) -> None:
    """Restore layout default LED for an actor's bound miniature if it is online."""
    if actor_id in ACTIVE_OVERRIDES:
        ACTIVE_OVERRIDES[actor_id].pop("turn", None)
        if not ACTIVE_OVERRIDES[actor_id]:
            del ACTIVE_OVERRIDES[actor_id]
    actor = next((a for a in app_state.state.actors if a.id == actor_id), None)
    if not actor or not actor.miniature_id:
        return
    mid = str(actor.miniature_id).strip()
    if not mid or mid not in _esp.get_active_minis():
        return
    led = resolve_led_payload(actor_id)
    if not led:
        return
    await _esp.send_update(mid, {"led": led})


async def _revert_led_after_delay(actor_id: str, miniature_id: str, delay_s: float) -> None:
    try:
        await asyncio.sleep(delay_s)
        if actor_id in ACTIVE_OVERRIDES:
            ACTIVE_OVERRIDES[actor_id].pop("time", None)
            if not ACTIVE_OVERRIDES[actor_id]:
                del ACTIVE_OVERRIDES[actor_id]
        led = resolve_led_payload(actor_id)
        if led:
            await _esp.send_update(miniature_id, {"led": led})
    except asyncio.CancelledError:
        raise
    except Exception:
        pass


async def process_led_trigger(actor_id: str, event_type: str, target_stat: str | None = None) -> None:
    actor = next((a for a in app_state.state.actors if a.id == actor_id), None)
    if not actor or not actor.miniature_id:
        return
    mid = str(actor.miniature_id).strip()
    if not mid or mid not in _esp.get_active_minis():
        return

    system = (getattr(app_state.state, "system", None) or "").strip() or "D&D 5e"
    rules = _load_triggers(system)
    rule = _find_matching_rule(rules, event_type, target_stat)
    if rule is None:
        return

    led = resolve_led_payload_for_profile(actor_id, rule.led_profile_id)
    if not led:
        return

    ACTIVE_OVERRIDES[actor_id][rule.duration_type] = rule.led_profile_id
    await _esp.send_update(mid, {"led": led})

    if rule.duration_type == "time":
        ms = rule.duration_ms if rule.duration_ms is not None else 1000
        if ms > 0:
            asyncio.create_task(_revert_led_after_delay(actor_id, mid, ms / 1000.0))
