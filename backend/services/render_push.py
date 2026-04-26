from __future__ import annotations

import asyncio
import os
import shutil
import uuid
from pathlib import Path

from backend import state as app_state
from backend.compositor import render_miniature
from backend.layout_profiles_store import read_layout_profiles
from backend.led_resolver import resolve_led_payload
from backend.models import LayoutProfile
from backend.paths import RENDER_DIR
from backend.services.esp_manager import sanitize_mac_for_filename


_render_locks: dict[str, asyncio.Lock] = {}
_render_dirty: set[str] = set()


def _get_lock(actor_id: str) -> asyncio.Lock:
    lock = _render_locks.get(actor_id)
    if lock is None:
        lock = asyncio.Lock()
        _render_locks[actor_id] = lock
    return lock


def _atomic_copy(src: str | Path, dst: str | Path) -> None:
    src_p = Path(src)
    dst_p = Path(dst)
    dst_p.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst_p.parent / f".{dst_p.stem}.{uuid.uuid4().hex}.tmp{dst_p.suffix}"
    try:
        shutil.copy2(src_p, tmp)
        os.replace(tmp, dst_p)
    finally:
        try:
            if tmp.exists():
                tmp.unlink()
        except OSError:
            pass


def _actor_screen_transition(actor_id: str) -> tuple[str | None, str | None]:
    actor = next((a for a in app_state.state.core.actors if a.id == actor_id), None)
    if not actor:
        return None, None
    for effect in actor.effects:
        transition = (getattr(effect, "screen_transition", None) or "").strip()
        if transition:
            color = (getattr(effect, "screen_transition_color", None) or "").strip() or None
            return transition, color
    return None, None


async def proactive_render_and_push(
    actor_id: str,
    mac: str | None = None,
    led_payload: dict | None = None,
    transition: str | None = None,
    transition_color: str | None = None,
) -> None:
    """
    Proactively (re)render miniature PNG and, if a device is bound/targeted, push an image update to ESP.

    Runs safely in background: expensive CPU/file work is moved to threads via ``asyncio.to_thread``.
    """
    lock = _get_lock(actor_id)
    if lock.locked():
        # Spam guard: collapse bursts (e.g. -1 HP x3) into a single extra render pass.
        _render_dirty.add(actor_id)
        return

    async with lock:
        # Coalesce: if updates happened while we were rendering, do one more pass.
        # (Prevents missing the final state when spam occurs.)
        for _ in range(2):
            _render_dirty.discard(actor_id)

            actor = next((a for a in app_state.state.core.actors if a.id == actor_id), None)
            if not actor:
                return

            # Resolve layout profile similarly to /api/render
            system_name = app_state.state.core.system
            layout_profiles = read_layout_profiles(system_name)
            target_profile_id = actor.layout_profile_id or "default"
            profile = next((p for p in layout_profiles if p.id == target_profile_id), None)
            if not profile:
                profile = next((p for p in layout_profiles if p.id == "default"), None)
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

            # Ensure a fresh PNG exists on disk (Pillow is sync + heavy → thread).
            output_path = await asyncio.to_thread(render_miniature, actor, profile, system_name)

            # If no miniature is involved, we're done.
            # (UI will still fetch /api/render/{actor_id} reactively when needed.)
            from backend.routers import hardware  # local import to avoid import cycles at module load

            devices = hardware._esp.devices
            target_mac = (mac if (mac and mac in devices) else None) or (
                actor.miniature_id if (actor.miniature_id and actor.miniature_id in devices) else None
            )
            if not target_mac:
                # Nothing to push to hardware, but keep coalescing semantics for the render itself.
                if actor_id in _render_dirty:
                    continue
                return

            safe_name = sanitize_mac_for_filename(target_mac) + ".png"
            dest_path = RENDER_DIR / safe_name
            try:
                await asyncio.to_thread(_atomic_copy, output_path, dest_path)
            except OSError:
                return

            push_led_payload = led_payload if led_payload is not None else resolve_led_payload(actor_id)
            resolved_transition, resolved_transition_color = _actor_screen_transition(actor_id)
            push_transition = transition if transition is not None else resolved_transition
            push_transition_color = (
                transition_color if transition_color is not None else resolved_transition_color
            )
            try:
                await hardware._esp.announce_image_update(
                    target_mac,
                    safe_name,
                    screen_bri=200,
                    led_payload=push_led_payload,
                    transition=push_transition,
                    transition_color=push_transition_color,
                )
            except Exception:
                # announce_image_update must be best-effort; never fail the background task.
                pass

            if actor_id not in _render_dirty:
                return

