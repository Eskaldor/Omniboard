from __future__ import annotations

from fastapi import APIRouter, Query
from fastapi.responses import FileResponse

from backend import state as app_state
from backend.compositor import render_miniature
from backend.models import Effect


router = APIRouter(prefix="/api/render", tags=["render"])


@router.get("/{actor_id}")
async def get_rendered_miniature(actor_id: str, test_effects: str | None = Query(None, alias="test_effects")):
    actor = next((a for a in app_state.state.actors if a.id == actor_id), None)
    if not actor:
        return {"error": "Actor not found"}

    profile_id = actor.layout_profile_id or "default"
    profile = next(
        (p for p in app_state.state.layout_profiles if p.id == profile_id),
        app_state.state.layout_profiles[0] if app_state.state.layout_profiles else None,
    )
    if not profile:
        return {"error": "No layout profile"}

    system_name = app_state.state.system

    if test_effects and test_effects.strip():
        render_actor = actor.model_copy(deep=True)
        for eff_id in (s.strip() for s in test_effects.split(",") if s.strip()):
            render_actor.effects.append(
                Effect(id=eff_id, name=eff_id, render_on_mini=True)
            )
        output_path = render_miniature(render_actor, profile, system_name)
    else:
        output_path = render_miniature(actor, profile, system_name)

    return FileResponse(output_path)

