from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import FileResponse

from backend import state as app_state
from backend.compositor import render_miniature


router = APIRouter(prefix="/api/render", tags=["render"])


@router.get("/{actor_id}")
async def get_rendered_miniature(actor_id: str):
    actor = next((a for a in app_state.state.actors if a.id == actor_id), None)
    if not actor:
        return {"error": "Actor not found"}

    output_path = render_miniature(actor, app_state.state.layout)
    return FileResponse(output_path)

