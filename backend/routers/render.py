from __future__ import annotations

import json

from fastapi import APIRouter, Query
from fastapi.responses import FileResponse

from backend import state as app_state
from backend.compositor import render_miniature
from backend.models import Effect, LayoutProfile
from backend.paths import DATA_DIR


router = APIRouter(prefix="/api/render", tags=["render"])


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

    # Если state.layout_profiles пуст, создаем базовый в памяти
    if not profile:
        profile = LayoutProfile(id="default", name="Default")

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

    return FileResponse(output_path)

