"""AI Phase 3 — image (portrait) composer.

Two flows live here:
  1. **Actor portrait regeneration** — fired when an effect with ``ai_prompt`` is
     applied. Updates ``actor.portrait`` in place and rides on the regular WS
     ``state_update`` so the tracker re-renders. Hardware push is best-effort.
  2. **Library generation** — backed by an async job registry. ``POST
     /api/assets/generate`` returns a ``job_id`` immediately; this module runs
     the pipeline in the background and broadcasts ``ai_image_ready`` over WS
     so the LibraryModal can swap in the preview without holding the request
     open through a 10-30s DALL-E call.

Provider contract — auto-detected by hostname:
  * **OpenAI / DALL-E 3 / gpt-image-1 / OpenRouter / LiteLLM** (default):
      - txt2img: ``POST {image_base_url}/images/generations`` with the OpenAI
        JSON shape. ``response_format=b64_json`` so we don't need a second
        HTTP fetch for the bytes.
      - img2img: ``POST {image_base_url}/images/edits`` (multipart) with the
        source PNG converted to a 1024x1024 RGBA PNG (OpenAI /edits constraint).
  * **Native Gemini** (host = ``generativelanguage.googleapis.com`` and the
    URL is NOT pointing at ``/openai`` compat shim): native multimodal API at
    ``POST {base}/v1beta/models/{model}:generateContent`` with
    ``responseModalities: ["IMAGE"]``. Img2img is the same call with the source
    image inlined as a part — Gemini's ``gemini-2.5-flash-image-preview`` and
    successors handle text+image input → image output natively.

Provider HTTP failures never raise into the request; they get logged and the
``is_generating_portrait`` flag is reset so the UI doesn't get stuck spinning.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import io
import logging
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlparse

import httpx
from PIL import Image

from backend import state as app_state
from backend.history import save_snapshot
from backend.paths import GENERATED_ASSETS_DIR
from backend.services.image_utils import TARGET_H, TARGET_W, smart_crop_and_resize
from backend.utils.ai_config import load_ai_config

_log = logging.getLogger(__name__)

# Total budget for one generation (network + processing). DALL-E 3 typically
# resolves under 30s; gpt-image-1 quality runs can stretch to ~60s. We give a
# generous ceiling but cap so a stuck provider can't hold a thread forever.
_GENERATION_TIMEOUT = 90.0

# OpenAI /images/edits requires square RGBA PNG. Keep the helper's intermediate
# at 1024 so we don't lose detail before the final 172x320 crop.
_EDIT_INTERMEDIATE = 1024


# ---------------------------------------------------------------------------
# Provider detection
# ---------------------------------------------------------------------------


def _is_gemini_native(base_url: str) -> bool:
    """Auto-detect native Gemini hosts.

    Native Gemini lives at ``generativelanguage.googleapis.com``. Google also
    exposes an OpenAI-compat shim under the same host at the ``/openai`` path
    prefix — when that prefix is present we keep using the OpenAI flow.
    """
    try:
        parsed = urlparse(base_url)
    except (ValueError, TypeError):
        return False
    host = (parsed.hostname or "").lower()
    if host != "generativelanguage.googleapis.com" and not host.endswith(
        ".generativelanguage.googleapis.com"
    ):
        return False
    # ``…/v1beta/openai`` is Google's OpenAI-compat layer — let the default
    # branch handle it via /images/generations like any other OpenAI provider.
    if "/openai" in (parsed.path or "").lower():
        return False
    return True


# Trailing API-version segment that we strip before re-adding ``/v1beta``.
# Google's image-output capability (``responseModalities`` + the
# ``*-image-preview`` family) is documented and supported only under v1beta;
# other versions (``v1`` / ``v1main`` / ``v1alpha``) reject the same payload
# with 400 "Unknown name 'responseModalities'" because their proto schema
# doesn't include that field. So whatever the user typed in image_base_url,
# for the actual generation call we force /v1beta.
_GEMINI_VERSION_RE = re.compile(r"/v1(beta|alpha|main)?/?$", re.IGNORECASE)


def _gemini_endpoint(base_url: str, model: str) -> str:
    """Build the canonical native-Gemini URL for a model + ``:generateContent``.

    Always normalizes to ``/v1beta`` regardless of the version the user pasted —
    see the comment above ``_GEMINI_VERSION_RE`` for why.
    """
    base = (base_url or "").rstrip("/")
    base = _GEMINI_VERSION_RE.sub("", base)
    return f"{base}/v1beta/models/{model}:generateContent"


def _decode_gemini_image(data: dict) -> bytes:
    """Pull the first inline image out of a Gemini ``generateContent`` response.

    Walks ``candidates[].content.parts[]`` looking for an ``inline_data`` (or
    camelCase ``inlineData``) entry whose ``data`` is base64 image bytes. The
    same shape is used for both txt2img and img2img output on
    ``gemini-*-image-preview`` models.
    """
    if not isinstance(data, dict):
        raise ValueError("Gemini response is not an object")
    candidates = data.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        # If safety filters blocked the prompt, Gemini reports it via promptFeedback.
        feedback = data.get("promptFeedback") or data.get("prompt_feedback")
        if isinstance(feedback, dict):
            reason = feedback.get("blockReason") or feedback.get("block_reason")
            if reason:
                raise ValueError(f"Gemini blocked prompt: {reason}")
        raise ValueError("Gemini returned no candidates")

    for cand in candidates:
        if not isinstance(cand, dict):
            continue
        content = cand.get("content")
        if not isinstance(content, dict):
            continue
        parts = content.get("parts")
        if not isinstance(parts, list):
            continue
        for part in parts:
            if not isinstance(part, dict):
                continue
            inline = part.get("inline_data") or part.get("inlineData")
            if not isinstance(inline, dict):
                continue
            payload = inline.get("data")
            if isinstance(payload, str) and payload:
                try:
                    return base64.b64decode(payload, validate=False)
                except (ValueError, TypeError) as e:
                    raise ValueError(f"invalid base64 in Gemini inline_data: {e}") from None
        # Surface the model's text (often a refusal explanation) when there's no image.
        finish = cand.get("finishReason") or cand.get("finish_reason")
        if finish and finish != "STOP":
            raise ValueError(f"Gemini finished with {finish} and no image")

    raise ValueError("Gemini response has no image part")


# ---------------------------------------------------------------------------
# Provider call (OpenAI DALL-E 3 / gpt-image-1 compatible)
# ---------------------------------------------------------------------------


def _decode_b64_image(data: dict) -> bytes:
    """Pull the first b64-encoded image out of an OpenAI-style response.

    Accepts ``{"data": [{"b64_json": "..."}, ...]}`` (OpenAI canonical) and a
    couple of common variants (``image_b64``, ``b64``) that some compat layers
    emit. Raises ``ValueError`` on shapes we don't recognize.
    """
    if not isinstance(data, dict):
        raise ValueError("provider response is not an object")
    items = data.get("data")
    if not isinstance(items, list) or not items:
        raise ValueError("no data[] in provider response")
    first = items[0]
    if not isinstance(first, dict):
        raise ValueError("invalid data[0] shape")
    for key in ("b64_json", "image_b64", "b64"):
        v = first.get(key)
        if isinstance(v, str) and v:
            try:
                return base64.b64decode(v, validate=False)
            except (ValueError, TypeError) as e:
                raise ValueError(f"invalid base64 in {key}: {e}") from None
    # Some providers return a URL — not great for us, but support fall-through.
    url = first.get("url")
    if isinstance(url, str) and url:
        raise ValueError(
            "provider returned a URL instead of b64_json; configure response_format=b64_json"
        )
    raise ValueError("no b64_json / image_b64 / url in provider response")


def _prepare_edit_source(image_bytes: bytes) -> bytes:
    """Convert any source bytes into a 1024x1024 RGBA PNG (OpenAI /edits constraint)."""
    with Image.open(io.BytesIO(image_bytes)) as src:
        src = src.convert("RGBA")
        # Square pad without distortion — pad to the longest side, then resize.
        sw, sh = src.size
        side = max(sw, sh)
        canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        canvas.paste(src, ((side - sw) // 2, (side - sh) // 2))
        canvas = canvas.resize(
            (_EDIT_INTERMEDIATE, _EDIT_INTERMEDIATE), resample=Image.Resampling.LANCZOS
        )
        out = io.BytesIO()
        canvas.save(out, format="PNG")
        return out.getvalue()


async def generate_image(prompt: str, base_image_path: str | None = None) -> bytes:
    """Send an image-generation request to the configured OpenAI-compatible API.

    Returns raw image bytes (PNG or whatever the provider returned — the caller
    is expected to pipe the result through ``smart_crop_and_resize`` which is
    format-tolerant).
    """
    cfg = load_ai_config()
    base = (cfg.image_base_url or cfg.chat_base_url or "").strip().rstrip("/")
    key = (cfg.image_api_key or cfg.chat_api_key or "").strip()
    model = (cfg.image_model or "").strip()

    if not base or not key:
        raise RuntimeError("Image API is not configured (image_base_url / image_api_key missing)")
    if not model:
        raise RuntimeError("Image API model is not configured")
    prompt = (prompt or "").strip()
    if not prompt:
        raise RuntimeError("empty prompt")

    timeout = httpx.Timeout(_GENERATION_TIMEOUT, connect=10.0)

    # Resolve a possible relative portrait path against the project root.
    src_bytes: bytes | None = None
    if base_image_path:
        candidate = _resolve_local_image(base_image_path)
        if candidate is not None:
            try:
                src_bytes = candidate.read_bytes()
            except OSError as e:
                _log.warning("ai_composer: cannot read base image %r: %s", str(candidate), e)
                src_bytes = None

    use_gemini = _is_gemini_native(base)

    async with httpx.AsyncClient(timeout=timeout) as client:
        if use_gemini:
            # Native Gemini: multimodal generateContent. Same call shape for
            # txt2img and img2img — img2img just adds the source image as an
            # additional ``inline_data`` part inside the same ``contents`` array.
            url = _gemini_endpoint(base, model)
            parts: list[dict[str, Any]] = [{"text": prompt}]
            if src_bytes is not None:
                parts.append(
                    {
                        "inline_data": {
                            "mime_type": "image/png",
                            "data": base64.b64encode(src_bytes).decode("ascii"),
                        }
                    }
                )
            # ``responseModalities`` MUST include both TEXT and IMAGE for
            # ``gemini-*-image-preview`` — Google's docs are explicit, and
            # IMAGE-only is rejected by some checkpoints. We accept whatever
            # text the model emits alongside the image; the parser picks the
            # first inline_data part and ignores text noise.
            gemini_body: dict[str, Any] = {
                "contents": [{"parts": parts}],
                "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]},
            }
            # ``x-goog-api-key`` keeps the key out of URL logs / telemetry.
            resp = await client.post(
                url,
                headers={
                    "x-goog-api-key": key,
                    "Content-Type": "application/json",
                },
                json=gemini_body,
            )
        elif src_bytes is None:
            # OpenAI text-to-image
            url = f"{base}/images/generations"
            payload: dict[str, Any] = {
                "model": model,
                "prompt": prompt,
                # Closest aspect to 172:320 OpenAI/DALL-E supports natively
                # is 1024x1792 (portrait). gpt-image-1 also accepts that.
                "size": "1024x1792",
                "n": 1,
                "response_format": "b64_json",
            }
            resp = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        else:
            # OpenAI image-to-image (edits). Multipart per OpenAI spec.
            url = f"{base}/images/edits"
            edit_src = await asyncio.to_thread(_prepare_edit_source, src_bytes)
            files = {"image": ("source.png", edit_src, "image/png")}
            data = {
                "model": model,
                "prompt": prompt,
                "size": "1024x1024",  # /edits historically only supports square
                "n": "1",
                "response_format": "b64_json",
            }
            resp = await client.post(
                url,
                headers={"Authorization": f"Bearer {key}"},
                files=files,
                data=data,
            )

    if resp.status_code >= 400:
        raise RuntimeError(
            f"Image API HTTP {resp.status_code}: {resp.text[:300]}"
        )

    try:
        body = resp.json()
    except ValueError as e:
        raise RuntimeError(f"Image API returned non-JSON: {e}") from None

    return _decode_gemini_image(body) if use_gemini else _decode_b64_image(body)


def _resolve_local_image(path: str) -> Path | None:
    """Return a filesystem ``Path`` for a portrait reference if it exists locally.

    Frontend portraits are typically stored under ``data/assets/...`` and served
    as ``/assets/...``; we accept both forms. Anything that resolves outside of
    ``data/assets`` is ignored to avoid path-traversal exploits where a hostile
    actor.portrait field tries to read e.g. ``../../etc/passwd``.
    """
    from backend.paths import ASSETS_DIR

    if not isinstance(path, str) or not path.strip():
        return None
    s = path.strip().lstrip("/")
    if s.startswith("assets/"):
        s = s[len("assets/") :]
    candidate = (ASSETS_DIR / s).resolve()
    try:
        candidate.relative_to(ASSETS_DIR.resolve())
    except ValueError:
        return None
    if not candidate.is_file():
        return None
    return candidate


# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------


def _hash_prompt(prompt: str) -> str:
    """Short content hash so the same actor + same prompt collapses to one file."""
    return hashlib.sha1(prompt.encode("utf-8"), usedforsecurity=False).hexdigest()[:10]


def _save_generated_png(*, prefix: str, content_hash: str, png_bytes: bytes) -> Path:
    GENERATED_ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    target = GENERATED_ASSETS_DIR / f"{prefix}_{content_hash}.png"
    target.write_bytes(png_bytes)
    return target


def _portrait_url_for(path: Path) -> str:
    """``/assets/generated/foo.png`` — what the frontend & ESP can fetch."""
    return f"/assets/generated/{path.name}"


# ---------------------------------------------------------------------------
# Flow 1 — actor portrait task (triggered by effect.ai_prompt)
# ---------------------------------------------------------------------------


async def process_actor_portrait_task(
    actor_id: str,
    prompt: str,
    base_image_path: str | None,
) -> None:
    """Generate, crop, and assign a new portrait for an actor.

    Idempotent on failure: if anything raises (provider down, decode error,
    disk full), we reset ``is_generating_portrait`` and log; the UI sees the
    spinner clear without the portrait changing.
    """
    actor_name_for_log = actor_id
    started = time.monotonic()
    try:
        raw = await generate_image(prompt, base_image_path)
        png = await asyncio.to_thread(smart_crop_and_resize, raw, TARGET_W, TARGET_H)
        path = await asyncio.to_thread(
            _save_generated_png,
            prefix=f"actor_{actor_id}",
            content_hash=_hash_prompt(prompt),
            png_bytes=png,
        )
        url = _portrait_url_for(path)

        async with app_state.lock:
            for i, a in enumerate(app_state.state.core.actors):
                if a.id == actor_id:
                    actor_name_for_log = a.name or actor_id
                    updated = a.model_copy(
                        update={"portrait": url, "is_generating_portrait": False}
                    )
                    app_state.state.core.actors[i] = updated
                    break
            await save_snapshot()

        # Local imports keep the module importable while routers build at startup.
        from backend.routers.ws import broadcast_state
        from backend.services.render_push import proactive_render_and_push

        await broadcast_state()
        # Best-effort: re-render + push to a bound miniature so the ESP screen
        # follows. Failure is non-fatal — portrait still landed in the UI.
        try:
            await proactive_render_and_push(actor_id)
        except Exception as e:  # pragma: no cover - hardware-side
            _log.warning(
                "ai_composer: proactive_render_and_push failed for %r: %s",
                actor_id, e,
            )

        _log.info(
            "ai_composer: actor %r portrait ready in %.1fs -> %s",
            actor_name_for_log, time.monotonic() - started, url,
        )

    except Exception as e:
        _log.error(
            "ai_composer: portrait generation failed for actor %r: %s",
            actor_name_for_log, e, exc_info=False,
        )
        # Clear the spinner so the UI doesn't get stuck.
        try:
            async with app_state.lock:
                for i, a in enumerate(app_state.state.core.actors):
                    if a.id == actor_id and a.is_generating_portrait:
                        app_state.state.core.actors[i] = a.model_copy(
                            update={"is_generating_portrait": False}
                        )
                        break
                await save_snapshot()
            from backend.routers.ws import broadcast_state
            await broadcast_state()
        except Exception as inner:
            _log.warning(
                "ai_composer: failed to clear is_generating_portrait: %s", inner
            )


# ---------------------------------------------------------------------------
# Flow 2 — library generation jobs (async + WS notification)
# ---------------------------------------------------------------------------


JobStatus = Literal["queued", "running", "done", "failed"]


@dataclass
class GenerationJob:
    job_id: str
    prompt: str
    status: JobStatus = "queued"
    path: str | None = None  # ``/assets/generated/lib_<hash>.png`` once done
    error: str | None = None
    created_at: float = field(default_factory=time.time)
    finished_at: float | None = None


# In-memory job registry. The library flow is short-lived — refresh-tolerance is
# already handled by the on-disk PNG: even if the GM reloads mid-job and loses
# the registry, the library refetch shows the file once it lands. Sized cap
# prevents unbounded growth across a long campaign session.
_JOBS: dict[str, GenerationJob] = {}
_JOB_LOCK = asyncio.Lock()
_MAX_JOBS = 200


def get_job(job_id: str) -> GenerationJob | None:
    return _JOBS.get(job_id)


async def _register_job(job: GenerationJob) -> None:
    async with _JOB_LOCK:
        _JOBS[job.job_id] = job
        if len(_JOBS) > _MAX_JOBS:
            # Drop the oldest finished jobs first.
            stale = sorted(
                (j for j in _JOBS.values() if j.status in ("done", "failed")),
                key=lambda j: j.finished_at or j.created_at,
            )
            for old in stale:
                if len(_JOBS) <= _MAX_JOBS:
                    break
                _JOBS.pop(old.job_id, None)


def make_job_id() -> str:
    """16-char hex job id (collision-resistant for in-memory short-lived jobs)."""
    import uuid

    return uuid.uuid4().hex[:16]


async def process_library_portrait_task(job_id: str, prompt: str) -> None:
    """Generate a library asset and broadcast completion over WS.

    ``ai_image_ready`` payload: ``{type, job_id, ok, path?, error?}`` —
    consumed by ``LibraryModal`` to refresh thumbnails without polling.
    """
    job = _JOBS.get(job_id)
    if job is None:
        return

    job.status = "running"

    try:
        raw = await generate_image(prompt, base_image_path=None)
        png = await asyncio.to_thread(smart_crop_and_resize, raw, TARGET_W, TARGET_H)
        path = await asyncio.to_thread(
            _save_generated_png,
            prefix="lib",
            content_hash=_hash_prompt(prompt + "|" + str(time.time_ns())),
            png_bytes=png,
        )
        url = _portrait_url_for(path)
        job.path = url
        job.status = "done"
        job.finished_at = time.time()

        from backend.routers.ws import broadcast_ai_image_event

        await broadcast_ai_image_event(
            {"type": "ai_image_ready", "job_id": job_id, "ok": True, "path": url}
        )
        _log.info("ai_composer: library job %s -> %s", job_id, url)

    except Exception as e:
        job.status = "failed"
        job.error = str(e)[:300]
        job.finished_at = time.time()

        try:
            from backend.routers.ws import broadcast_ai_image_event
            await broadcast_ai_image_event(
                {
                    "type": "ai_image_ready",
                    "job_id": job_id,
                    "ok": False,
                    "error": job.error,
                }
            )
        except Exception:
            pass
        _log.error("ai_composer: library job %s failed: %s", job_id, e)


async def submit_library_job(prompt: str) -> GenerationJob:
    """Create + register a library job; the caller dispatches the task."""
    job = GenerationJob(job_id=make_job_id(), prompt=prompt)
    await _register_job(job)
    return job
