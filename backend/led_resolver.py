"""
Resolve Omnimini LED payload from combat state, layout profile, and system LED presets.
"""
from __future__ import annotations

import json
from typing import Any

from backend import state as app_state
from backend.models import Actor, LayoutProfile, LedProfile, LegendConfig
from backend.paths import DATA_DIR

_DEFAULT_LED_FALLBACK = LedProfile(
    id="default_static",
    name="Basic Static",
    mode="static",
    speed=0,
    brightness=255,
    colors=["$ROLE_COLOR"],
)


def _safe_system_dir_name(system_name: str) -> bool:
    s = (system_name or "").strip()
    if not s or ".." in s or "/" in s or "\\" in s:
        return False
    try:
        (DATA_DIR / s).resolve().relative_to(DATA_DIR.resolve())
    except ValueError:
        return False
    return True


def _load_system_led_profiles(system_name: str) -> list[LedProfile]:
    if not _safe_system_dir_name(system_name):
        return []
    path = DATA_DIR / system_name.strip() / "led_profiles.json"
    if not path.is_file():
        return []
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(raw, list):
            return []
        return [LedProfile.model_validate(item) for item in raw]
    except (OSError, ValueError):
        return []


def _find_led_profile(system_name: str, led_profile_id: str) -> LedProfile:
    profiles = _load_system_led_profiles(system_name)
    for p in profiles:
        if p.id == led_profile_id:
            return p
    return _DEFAULT_LED_FALLBACK


def _layout_for_actor(actor: Actor, layout_profiles: list[LayoutProfile]) -> LayoutProfile:
    target_id = (actor.layout_profile_id or "").strip() or "default"
    prof = next((p for p in layout_profiles if p.id == target_id), None)
    if prof is not None:
        return prof
    prof = next((p for p in layout_profiles if p.id == "default"), None)
    if prof is not None:
        return prof
    if layout_profiles:
        return layout_profiles[0]
    return LayoutProfile(
        id="default",
        name="Default",
        frame_asset="",
        show_portrait=True,
        top1=None,
        top2=None,
        bottom1=None,
        bottom2=None,
        left1=None,
        right1=None,
    )


def _role_hex(legend: LegendConfig, role: str) -> str:
    key_map: dict[str, str] = {
        "character": legend.player,
        "enemy": legend.enemy,
        "ally": legend.ally,
        "neutral": legend.neutral,
    }
    return (key_map.get(role) or legend.enemy or "#ef4444").strip()


def _normalize_hex(color: str | None, fallback: str) -> str:
    if not color or not isinstance(color, str):
        return fallback
    s = color.strip()
    if s.startswith("#") and len(s) in (4, 7, 9):
        return s
    if not s.startswith("#") and len(s) in (3, 6, 8) and all(c in "0123456789abcdefABCDEF" for c in s):
        return "#" + s
    return fallback


def _base_color_for_layout(
    layout: LayoutProfile,
    actor: Actor,
    legend: LegendConfig,
) -> str:
    source = layout.led_color_source or "role"
    role_c = _role_hex(legend, actor.role)
    group_c_raw = (actor.group_color or "").strip()
    custom = _normalize_hex(layout.led_custom_color, "#FFFFFF")

    if source == "custom":
        return custom
    if source == "group":
        if group_c_raw:
            return _normalize_hex(group_c_raw, role_c)
        return role_c
    return role_c


def _resolve_color_tokens(colors: list[str], base_color: str) -> list[str]:
    out: list[str] = []
    for c in colors:
        raw = (c or "").strip()
        if raw in ("$ROLE_COLOR", "$GROUP_COLOR"):
            out.append(base_color)
        else:
            out.append(raw if raw else base_color)
    return out if out else [base_color]


def resolve_led_payload_for_profile(actor_id: str, led_profile_id: str) -> dict[str, Any] | None:
    """
    Build ESP32 ``led`` dict using a specific system LED profile id (e.g. LED triggers),
    with faction / layout color resolution like ``resolve_led_payload``.
    """
    st = app_state.state
    actor = next((a for a in st.actors if a.id == actor_id), None)
    if actor is None:
        return None

    layout = _layout_for_actor(actor, st.layout_profiles)
    pid = (led_profile_id or "").strip() or "default_static"
    led_prof = _find_led_profile(st.system, pid)

    base = _base_color_for_layout(layout, actor, st.legend)
    resolved_colors = _resolve_color_tokens(list(led_prof.colors), base)

    speed = int(led_prof.speed) if led_prof.speed is not None else 0
    brightness = int(led_prof.brightness) if led_prof.brightness is not None else 255
    speed = max(0, min(2000, speed))
    brightness = max(0, min(255, brightness))
    mode = (led_prof.mode or "static").strip() or "static"

    return {
        "mode": mode,
        "colors": resolved_colors,
        "speed": speed,
        "brightness": brightness,
    }


def resolve_led_payload(actor_id: str) -> dict[str, Any] | None:
    """
    Build ESP32 ``led`` object dict for ``announce_image_update``.
    Returns None if the actor is missing (caller uses hardcoded off state).
    """
    st = app_state.state
    actor = next((a for a in st.actors if a.id == actor_id), None)
    if actor is None:
        return None

    layout = _layout_for_actor(actor, st.layout_profiles)
    led_profile_id = (layout.led_profile_id or "default_static").strip() or "default_static"
    led_prof = _find_led_profile(st.system, led_profile_id)

    base = _base_color_for_layout(layout, actor, st.legend)
    resolved_colors = _resolve_color_tokens(list(led_prof.colors), base)

    speed = int(led_prof.speed) if led_prof.speed is not None else 0
    brightness = int(led_prof.brightness) if led_prof.brightness is not None else 255
    speed = max(0, min(2000, speed))
    brightness = max(0, min(255, brightness))
    mode = (led_prof.mode or "static").strip() or "static"

    return {
        "mode": mode,
        "colors": resolved_colors,
        "speed": speed,
        "brightness": brightness,
    }
