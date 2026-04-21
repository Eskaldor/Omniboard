"""LED profiles: ADR-4 merge via ``load_config_with_override`` (default/config + data/systems)."""
from __future__ import annotations

from backend.models import LedProfile
from backend.utils.config_loader import load_config_with_override


def _fallback_led_profiles() -> list[LedProfile]:
    return [
        LedProfile(
            id="default_static",
            name="Basic Static",
            mode="static",
            speed=0,
            brightness=255,
            colors=["$ROLE_COLOR"],
        ),
        LedProfile(
            id="default_blink",
            name="Fast Blink",
            mode="blink",
            speed=200,
            brightness=255,
            colors=["$ROLE_COLOR", "#000000"],
        ),
        LedProfile(
            id="default_pulse",
            name="Smooth Pulse",
            mode="pulse",
            speed=1000,
            brightness=255,
            colors=["$ROLE_COLOR", "#000000"],
        ),
    ]


def read_led_profiles(system_name: str) -> list[LedProfile]:
    raw = load_config_with_override((system_name or "").strip(), "led_profiles.json")
    if not isinstance(raw, list) or not raw:
        return _fallback_led_profiles()
    try:
        return [LedProfile.model_validate(item) for item in raw]
    except Exception:
        return _fallback_led_profiles()
