from __future__ import annotations

import json
import logging
import os
import shutil

from fastapi import APIRouter, Query
from fastapi.responses import FileResponse

from backend import state as app_state
from backend.compositor import render_miniature
from backend.led_resolver import resolve_led_payload
from backend.models import Effect, LayoutProfile
from backend.paths import DATA_DIR, RENDER_DIR
from backend.routers import hardware
from backend.services.esp_manager import sanitize_mac_for_filename


router = APIRouter(prefix="/api/render", tags=["render"])
_log = logging.getLogger(__name__)


def _load_system_effects(system_name: str) -> list[dict]:
    """Загружает data/systems/{system_name}/effects.json. Возвращает список эффектов или []."""
    if not system_name:
        return []
    path = DATA_DIR / system_name / "effects.json"
    if not path.is_file():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except (OSError, ValueError):
        return []


@router.get("/{actor_id}")
async def get_rendered_miniature(
    actor_id: str,
    test_effects: str | None = Query(None, alias="test_effects"),
    profile_id: str | None = Query(None, description="Override profile for preview (e.g. in layout editor)"),
    mac: str | None = Query(None, description="MAC миньки: после сохранения PNG отправить уведомление на устройство"),
):
    actor = next((a for a in app_state.state.actors if a.id == actor_id), None)
    if not actor:
        return {"error": "Actor not found"}

    state = app_state.state
    # 1. Для превью можно переопределить профиль (profile_id); иначе берём из актора
    target_profile_id = profile_id or actor.layout_profile_id or "default"

    # 2. Ищем его в state.layout_profiles
    profile = next((p for p in state.layout_profiles if p.id == target_profile_id), None)

    # 3. Если даже такого нет (например, удалили), фоллбэк на жесткий default
    if not profile:
        profile = next((p for p in state.layout_profiles if p.id == "default"), None)

    # Если state.layout_profiles пуст, создаем базовый в памяти (пустой — только портрет)
    if not profile:
        profile = LayoutProfile(
            id="default",
            name="Default",
            frame_asset="",
            top1=None,
            top2=None,
            bottom1=None,
            bottom2=None,
            left1=None,
            right1=None,
        )

    system_name = state.system

    if test_effects and test_effects.strip():
        render_actor = actor.model_copy(deep=True)
        effects_list = _load_system_effects(system_name)
        effects_by_id = {e.get("id"): e for e in effects_list if e.get("id")}
        for eff_id in (s.strip() for s in test_effects.split(",") if s.strip()):
            eff_def = effects_by_id.get(eff_id)
            if eff_def:
                icon = eff_def.get("icon") or ""
                name = eff_def.get("name") or eff_id
                render_actor.effects.append(
                    Effect(id=eff_id, name=name, icon=icon, render_on_mini=True)
                )
            else:
                render_actor.effects.append(
                    Effect(id=eff_id, name=eff_id, icon="", render_on_mini=True)
                )
        output_path = render_miniature(render_actor, profile, system_name)
    else:
        output_path = render_miniature(actor, profile, system_name)

    filename = os.path.basename(output_path)
    devices = hardware._esp.devices
    target_mac = (mac if (mac and mac in devices) else None) or (actor.miniature_id if (actor.miniature_id and actor.miniature_id in devices) else None)
    if (mac or actor.miniature_id) and not target_mac:
        _log.warning("ESP device not in list (run Discover in Device manager): mac=%s miniature_id=%s", mac, actor.miniature_id)
    if target_mac:
        try:
            safe_name = sanitize_mac_for_filename(target_mac) + ".png"
            dest_path = RENDER_DIR / safe_name
            shutil.copy2(output_path, dest_path)
            led_payload = resolve_led_payload(actor_id)
            await hardware._esp.announce_image_update(
                target_mac, safe_name, screen_bri=200, led_payload=led_payload
            )
        except OSError:
            pass

    return FileResponse(output_path)

