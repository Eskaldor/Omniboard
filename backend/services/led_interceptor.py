"""
Hardware trigger rules: react to combat events and push Omnimini /update payloads.
"""
from __future__ import annotations

import asyncio

from backend import state as app_state
from backend.led_resolver import ACTIVE_OVERRIDES, resolve_led_payload, resolve_led_payload_for_profile
from backend.routers.hardware import _esp
from backend.services.hardware_triggers import find_hardware_trigger


async def sync_actor_led_to_device(actor_id: str) -> None:
    """Push current ``resolve_led_payload`` (effects, overrides, layout) to bound Omnimini if online."""
    actor = next((a for a in app_state.state.core.actors if a.id == actor_id), None)
    if not actor or not actor.miniature_id:
        return
    mid = str(actor.miniature_id).strip()
    if not mid or mid not in _esp.get_active_minis():
        return
    led = resolve_led_payload(actor_id)
    if not led:
        return
    await _esp.send_update(mid, {"led": led})


async def reset_actor_led_to_default(actor_id: str) -> None:
    """Restore layout default LED for an actor's bound miniature if it is online."""
    if actor_id in ACTIVE_OVERRIDES:
        ACTIVE_OVERRIDES[actor_id].pop("turn", None)
        if not ACTIVE_OVERRIDES[actor_id]:
            del ACTIVE_OVERRIDES[actor_id]
    actor = next((a for a in app_state.state.core.actors if a.id == actor_id), None)
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
    actor = next((a for a in app_state.state.core.actors if a.id == actor_id), None)
    if not actor or not actor.miniature_id:
        return
    mid = str(actor.miniature_id).strip()
    if not mid or mid not in _esp.get_active_minis():
        return

    system = (getattr(app_state.state.core, "system", None) or "").strip() or "D&D 5e"
    rule = find_hardware_trigger(system, event_type, target_stat)
    if rule is None:
        return

    led = resolve_led_payload_for_profile(actor_id, rule.led_profile_id)
    if not led:
        return

    ACTIVE_OVERRIDES[actor_id][rule.duration_type] = rule.led_profile_id
    payload = {"led": led}
    if rule.transition and rule.transition != "none":
        payload["transition"] = rule.transition
        if rule.transition_color:
            payload["transition_params"] = {"color": rule.transition_color}
    await _esp.send_update(mid, payload)

    if rule.duration_type == "time":
        ms = rule.duration_ms if rule.duration_ms is not None else 1000
        if ms > 0:
            asyncio.create_task(_revert_led_after_delay(actor_id, mid, ms / 1000.0))
