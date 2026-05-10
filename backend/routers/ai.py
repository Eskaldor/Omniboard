from __future__ import annotations

import json
import time
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException

from backend import state as app_state
from backend.history import save_snapshot
from backend.models import (
    AIChatAssistantReply,
    AIChatRequest,
    AIChatUsage,
    AIConfig,
    AISystemPromptPayload,
    AISystemPromptResponse,
)
from backend.services.ai_context import (
    apply_ai_mutations,
    get_minimal_ai_context,
    get_mutations_tool_schema,
    load_ai_system_prompt,
    save_ai_system_prompt,
)
from backend.services.ai_chat_history import (
    clear_history as clear_chat_history,
    load_history as load_chat_history,
    save_history as save_chat_history,
)
from backend.services.ai_logger import (
    build_turn_record,
    get_usage_summary,
    log_chat_turn,
    make_request_id,
)
from backend.utils.ai_config import load_ai_config, save_ai_config


router = APIRouter(prefix="/api/ai", tags=["ai"])

# Synthetic completion text returned when the LLM emitted only tool_calls and no
# textual content. The frontend would otherwise need to send back ``content: ""``
# on the next turn, which violates the OpenAI message-content spec on some
# providers (Anthropic, Gemini) and causes re-trigger loops.
_SYNTHETIC_DONE_TEXT = "Действия применены."


@router.get("/settings", response_model=AIConfig)
async def get_ai_settings() -> AIConfig:
    return load_ai_config()


@router.post("/settings", response_model=AIConfig)
async def post_ai_settings(payload: AIConfig) -> AIConfig:
    save_ai_config(payload)
    return payload


@router.get("/usage/summary")
async def get_ai_usage_summary(days: int = 7) -> dict:
    """Aggregated token telemetry from local AI logs (today + windowed total)."""
    days = max(1, min(int(days or 7), 30))
    return get_usage_summary(window_days=days)


def _gemini_models_url(base: str) -> str:
    """Build the model-listing URL for native Gemini.

    The ``/models`` ListModels endpoint reliably exists under ``/v1beta``;
    older versions like ``/v1main`` may not. So we force ``/v1beta`` here even
    if the user pointed ``image_base_url`` somewhere else — generation calls
    keep using the user's chosen version, this listing call doesn't.
    """
    import re as _re
    s = (base or "").rstrip("/")
    s = _re.sub(r"/v1(beta|alpha|main)?$", "", s, flags=_re.IGNORECASE)
    return f"{s}/v1beta/models"


def _classify_image_model_name(name: str) -> bool:
    """Heuristic: does a model id look like an image-capable one?"""
    n = name.lower()
    if any(tag in n for tag in ("image", "imagen", "dall-e", "dalle", "sdxl", "flux", "stable-diffusion")):
        return True
    return False


# Substrings that disqualify a model from being a chat candidate. Embeddings,
# audio, TTS, moderation and image-only checkpoints all fall here.
_CHAT_EXCLUDE = (
    "embed",
    "embedding",
    "whisper",
    "tts",
    "speech",
    "audio",
    "moderation",
    "guard",
    "imagen",
    "dall-e",
    "dalle",
    "sdxl",
    "flux",
    "stable-diffusion",
)


def _classify_chat_model_name(name: str, methods: list[str], *, is_gemini: bool) -> bool:
    """Heuristic: does this model accept chat-style prompts?

    For Gemini we also require ``generateContent`` in the supported methods —
    that's the canonical chat method on Google's side. For OpenAI-shape catalogs
    methods aren't reported so we fall back to a name allowlist via exclusions.
    """
    n = name.lower()
    if any(tag in n for tag in _CHAT_EXCLUDE):
        return False
    # ``*-image-preview`` (e.g. gemini-2.5-flash-image-preview) emits images
    # alongside text; we don't classify it as chat to avoid steering GMs into
    # using an expensive image model for plain conversation.
    if "-image-" in n or n.endswith("-image"):
        return False
    if is_gemini:
        return "generateContent" in methods
    return True


def _normalize_models_response(data: object, *, is_gemini: bool, sort_by: str = "image") -> list[dict]:
    """Flatten a Gemini or OpenAI-style models list to a uniform record.

    ``sort_by``:
      - ``"image"``: image-capable models float to the top.
      - ``"chat"``:  chat-capable models float to the top.
    """
    out: list[dict] = []
    if not isinstance(data, dict):
        return out

    if is_gemini:
        for m in data.get("models") or []:
            if not isinstance(m, dict):
                continue
            full_name = m.get("name") or ""
            if not isinstance(full_name, str) or not full_name:
                continue
            short = full_name.split("/")[-1] if "/" in full_name else full_name
            methods_raw = m.get("supportedGenerationMethods") or m.get("supported_generation_methods") or []
            methods: list[str] = [str(x) for x in methods_raw if isinstance(x, str)]
            # Gemini's image-output models advertise generateContent (multimodal output);
            # the canonical signal that a model can output images is its name pattern,
            # because Gemini doesn't expose an explicit "responseModalities" capability list.
            supports_image = _classify_image_model_name(short) and (
                "generateContent" in methods
                or "predict" in methods  # Imagen via Vertex-style endpoint
                or not methods  # be lenient if the field is missing
            )
            supports_chat = _classify_chat_model_name(short, methods, is_gemini=True)
            out.append(
                {
                    "id": short,
                    "display_name": (m.get("displayName") if isinstance(m.get("displayName"), str) else short),
                    "description": (m.get("description") if isinstance(m.get("description"), str) else ""),
                    "supports_image": supports_image,
                    "supports_chat": supports_chat,
                    "methods": methods,
                }
            )
    else:
        items = data.get("data")
        if not isinstance(items, list):
            return out
        for m in items:
            if not isinstance(m, dict):
                continue
            mid = m.get("id")
            if not isinstance(mid, str) or not mid:
                continue
            out.append(
                {
                    "id": mid,
                    "display_name": str(m.get("display_name") or mid),
                    "description": "",
                    "supports_image": _classify_image_model_name(mid),
                    "supports_chat": _classify_chat_model_name(mid, [], is_gemini=False),
                    "methods": [],
                }
            )
    # Selected capability floats up; alphabetical by id within each group.
    primary_key = "supports_chat" if sort_by == "chat" else "supports_image"
    out.sort(key=lambda x: (not x[primary_key], x["id"].lower()))
    return out


async def _fetch_provider_models(
    base: str, key: str, *, kind: str
) -> dict:
    """Shared list-models call used by both ``/chat/models`` and ``/image/models``.

    The two endpoints differ only in the source config fields and the
    capability heuristic to highlight. Provider detection (Gemini vs OpenAI)
    and the upstream HTTP shape are identical between them.
    """
    label = kind.capitalize()
    if not base:
        raise HTTPException(status_code=400, detail=f"{label} API base URL is not configured")
    if not key:
        raise HTTPException(status_code=400, detail=f"{label} API key is not configured")

    from backend.services.ai_composer import _is_gemini_native

    is_gemini = _is_gemini_native(base)
    if is_gemini:
        url = _gemini_models_url(base)
        headers = {"x-goog-api-key": key}
    else:
        url = f"{base.rstrip('/')}/models"
        headers = {"Authorization": f"Bearer {key}"}

    timeout = httpx.Timeout(30.0, connect=10.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(url, headers=headers)
    except httpx.TimeoutException:
        raise HTTPException(status_code=502, detail=f"{label} API request timed out") from None
    except (httpx.ConnectError, httpx.RequestError) as e:
        raise HTTPException(
            status_code=502, detail=f"{label} API connection failed: {e!s}"
        ) from None

    if resp.status_code >= 400:
        detail = _extract_upstream_error(resp.text) or f"upstream HTTP {resp.status_code}"
        raise HTTPException(status_code=resp.status_code, detail=_truncate_detail(detail))

    try:
        data = resp.json()
    except ValueError:
        raise HTTPException(status_code=502, detail=f"{label} API returned non-JSON") from None

    return {
        "provider": "gemini" if is_gemini else "openai",
        "endpoint": url,
        "kind": kind,
        "models": _normalize_models_response(data, is_gemini=is_gemini, sort_by=kind),
    }


@router.get("/image/models")
async def list_image_models() -> dict:
    """Diagnostic: ask the configured image provider for its model catalogue.

    Equivalent to ``genai.list_models()`` filtered to image-capable entries.
    Auto-detects Gemini vs OpenAI from the base URL — same logic the generator
    uses. The API key never leaves the backend; the frontend just sees the
    resulting model list.
    """
    cfg = load_ai_config()
    base = (cfg.image_base_url or cfg.chat_base_url or "").strip().rstrip("/")
    key = (cfg.image_api_key or cfg.chat_api_key or "").strip()
    return await _fetch_provider_models(base, key, kind="image")


@router.get("/chat/models")
async def list_chat_models() -> dict:
    """Diagnostic mirror of ``/image/models`` for the chat provider.

    Same provider-detection (Gemini native vs OpenAI-compat). Uses the chat
    config (``chat_base_url`` / ``chat_api_key``) and sorts chat-capable
    models to the top. Useful when picking a model id without typing it by
    hand and to verify a key is alive separately from generation.
    """
    cfg = load_ai_config()
    base = (cfg.chat_base_url or "").strip().rstrip("/")
    key = (cfg.chat_api_key or "").strip()
    return await _fetch_provider_models(base, key, kind="chat")


@router.get("/chat/history")
async def get_ai_chat_history() -> dict:
    """Hydrate the GM chat after a page refresh. Lives outside the combat snapshot
    (``data/state_ai_chat.json``) so it doesn't bloat undo or autosave."""
    return {"messages": load_chat_history()}


@router.delete("/chat/history")
async def delete_ai_chat_history() -> dict:
    """Wipe persisted chat history. Idempotent."""
    clear_chat_history()
    return {"status": "ok"}


@router.get("/system_prompt", response_model=AISystemPromptResponse)
async def get_ai_system_prompt(system: str = "") -> AISystemPromptResponse:
    """Resolve ai_system_prompt.md via Asset Override (system → default)."""
    sys_name = (system or app_state.state.core.system or "").strip()
    content, source = load_ai_system_prompt(sys_name)
    return AISystemPromptResponse(content=content, source=source)


@router.post("/system_prompt", response_model=AISystemPromptResponse)
async def post_ai_system_prompt(payload: AISystemPromptPayload) -> AISystemPromptResponse:
    """Write override markdown to ``data/systems/<system>/config/ai_system_prompt.md``."""
    try:
        save_ai_system_prompt(payload.system, payload.content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from None
    except OSError as e:
        raise HTTPException(status_code=500, detail=f"Failed to write contract: {e!s}") from None
    content, source = load_ai_system_prompt(payload.system)
    return AISystemPromptResponse(content=content, source=source)


def _truncate_detail(text: str, max_len: int = 800) -> str:
    t = (text or "").strip()
    if len(t) <= max_len:
        return t
    return t[: max_len - 3] + "..."


def _extract_upstream_error(body: str) -> str:
    """Best-effort message from provider error bodies (OpenAI-style dict, Gemini quirks, JSON list)."""
    try:
        data = json.loads(body)
    except (json.JSONDecodeError, TypeError):
        return _truncate_detail(body)

    try:
        if isinstance(data, list):
            parts: list[str] = []
            for item in data:
                if isinstance(item, dict):
                    m = item.get("message")
                    if isinstance(m, str):
                        parts.append(m)
                        continue
                    nested = item.get("error")
                    if isinstance(nested, dict) and isinstance(nested.get("message"), str):
                        parts.append(nested["message"])
                    elif isinstance(nested, str):
                        parts.append(nested)
                elif isinstance(item, str):
                    parts.append(item)
            if parts:
                return "; ".join(parts)
            return _truncate_detail(json.dumps(data, ensure_ascii=False))

        if not isinstance(data, dict):
            return _truncate_detail(str(data))

        err = data.get("error")
        if isinstance(err, dict) and isinstance(err.get("message"), str):
            return err["message"]
        if isinstance(err, str):
            return err
        if isinstance(err, list):
            msgs: list[str] = []
            for item in err:
                if isinstance(item, dict) and isinstance(item.get("message"), str):
                    msgs.append(item["message"])
                elif isinstance(item, str):
                    msgs.append(item)
            if msgs:
                return "; ".join(msgs)

        top_msg = data.get("message")
        if isinstance(top_msg, str):
            return top_msg
    except Exception:
        pass

    return _truncate_detail(body)


def _extract_assistant_message(data: dict) -> dict:
    """Return ``choices[0].message`` (a dict). Returns ``{}`` on any malformation —
    the caller treats missing content / tool_calls as empty rather than raising."""
    if not isinstance(data, dict):
        return {}
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        return {}
    first = choices[0]
    if not isinstance(first, dict):
        return {}
    msg = first.get("message")
    if not isinstance(msg, dict):
        return {}
    return msg


def _content_to_str(content: object) -> str:
    """Normalize OpenAI/anthropic-style content into a plain string. ``None`` → ``""``."""
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict):
                # OpenAI-style ``{"type":"text","text":"..."}`` and Anthropic-style
                # ``{"type":"text","text":"..."}`` share the ``text`` key.
                txt = item.get("text")
                if isinstance(txt, str):
                    parts.append(txt)
                    continue
                # Some providers nest under ``content`` recursively.
                nested = item.get("content")
                if isinstance(nested, str):
                    parts.append(nested)
            elif isinstance(item, str):
                parts.append(item)
        return "".join(parts)
    return str(content)


def _extract_usage(data: dict) -> AIChatUsage | None:
    """Pull token telemetry from the upstream response. Tolerant to missing/odd shapes."""
    if not isinstance(data, dict):
        return None
    raw = data.get("usage")
    if not isinstance(raw, dict):
        return None

    def _maybe_int(v: object) -> int | None:
        if isinstance(v, bool):
            return None
        if isinstance(v, int):
            return v
        if isinstance(v, float) and v.is_integer():
            return int(v)
        return None

    pt = _maybe_int(raw.get("prompt_tokens"))
    ct = _maybe_int(raw.get("completion_tokens"))
    tt = _maybe_int(raw.get("total_tokens"))
    if pt is None and ct is None and tt is None:
        return None
    return AIChatUsage(prompt_tokens=pt, completion_tokens=ct, total_tokens=tt)


def _build_co_gm_system_message() -> dict:
    """Compose the system message: contract markdown + minimal combat context.

    Caller MUST hold ``app_state.lock`` so the snapshot is consistent with whatever
    state the next mutation block will see.
    """
    sys_name = (app_state.state.core.system or "").strip()
    contract, _src = load_ai_system_prompt(sys_name)
    ctx_json = get_minimal_ai_context(app_state.state)
    sys_content = (contract.rstrip() + "\n\nCURRENT COMBAT STATE:\n" + ctx_json).strip()
    return {"role": "system", "content": sys_content}


async def _execute_tool_calls(tool_calls: list[dict]) -> list[str]:
    """Run all ``apply_combat_mutations`` calls under the state lock.

    Returns concatenated summary lines. Calls to unknown tool names are reported
    as warnings (still useful so the GM sees what the model attempted).
    """
    summary: list[str] = []
    any_applied = False

    async with app_state.lock:
        for call in tool_calls:
            if not isinstance(call, dict):
                continue
            fn = call.get("function") or {}
            name = fn.get("name") if isinstance(fn, dict) else None
            if name != "apply_combat_mutations":
                if isinstance(name, str) and name:
                    summary.append(f"⚠ Unknown tool ignored: {name}")
                continue

            raw_args = fn.get("arguments") if isinstance(fn, dict) else None
            try:
                args = json.loads(raw_args) if isinstance(raw_args, str) else (raw_args or {})
            except json.JSONDecodeError:
                summary.append("⚠ Tool args invalid JSON")
                continue
            if not isinstance(args, dict):
                summary.append("⚠ Tool args were not an object")
                continue

            actions = args.get("actions")
            if not isinstance(actions, list) or not actions:
                summary.append("⚠ apply_combat_mutations called with empty actions")
                continue

            lines = apply_ai_mutations(app_state.state, actions)
            summary.extend(lines)
            if any(not ln.startswith("⚠") for ln in lines):
                any_applied = True

        if any_applied:
            await save_snapshot()
            # Local import keeps this module importable while ws router builds.
            from backend.routers.ws import broadcast_state

            await broadcast_state()

    return summary


@router.post("/chat", response_model=AIChatAssistantReply)
async def post_ai_chat(request: AIChatRequest) -> AIChatAssistantReply:
    cfg = load_ai_config()
    base = (cfg.chat_base_url or "").strip().rstrip("/")
    key = (cfg.chat_api_key or "").strip()
    model = (cfg.chat_model or "").strip()

    if not base or not key:
        raise HTTPException(status_code=400, detail="AI chat configuration is missing")
    if not model:
        raise HTTPException(status_code=400, detail="AI chat model is not configured")

    # Mode semantics:
    # ``standard``     — natural-language app control. Injects the per-system contract
    #                    and offers the ``apply_combat_mutations`` tool. Backed only by
    #                    the model's pre-trained knowledge plus the live combat snapshot.
    # ``red_knight``   — placeholder for the future stand-alone agent (RAG / vector DB
    #                    of past sessions, rulebooks, Home Assistant control, etc.). Until
    #                    that infra ships, this mode behaves as a minimal passthrough so
    #                    the chat is still usable, but with NO contract and NO tools —
    #                    those will live inside the Red Knight agent's own routing logic.
    is_co_gm_standard = cfg.ai_mode == "standard"

    if is_co_gm_standard:
        # Build the outgoing payload under a brief read lock so the system snapshot
        # is consistent with whatever state we'll mutate later if the LLM uses the
        # tool. The HTTP call stays outside the lock for parallelism.
        async with app_state.lock:
            sys_msg = _build_co_gm_system_message()
            tool_schema = get_mutations_tool_schema(app_state.state.core.system or "")
        outgoing_messages: list[dict] = [sys_msg, *request.messages]
        payload: dict = {
            "model": model,
            "messages": outgoing_messages,
            "tools": [tool_schema],
            "tool_choice": "auto",
        }
    else:
        # red_knight stub: pure passthrough until the real agent lands.
        outgoing_messages = list(request.messages)
        payload = {"model": model, "messages": outgoing_messages}

    url = f"{base}/chat/completions"
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}

    request_id = make_request_id()
    started = time.monotonic()
    system_name_at_send = (app_state.state.core.system or "").strip()
    payload_tools: list[dict[str, Any]] | None = payload.get("tools") if isinstance(payload.get("tools"), list) else None  # type: ignore[assignment]

    def _emit_log(
        *,
        status: int,
        data: dict | None,
        text_out: str,
        tool_calls_out: list[dict] | None,
        mutations_summary: list[str] | None,
        error: str | None,
    ) -> None:
        record = build_turn_record(
            request_id=request_id,
            mode=cfg.ai_mode,
            model=model,
            system=system_name_at_send,
            sent_messages=outgoing_messages,
            payload_tools=payload_tools,
            response_status=status,
            response_data=data,
            response_text=text_out,
            tool_calls=tool_calls_out,
            mutations_summary=mutations_summary,
            latency_ms=int((time.monotonic() - started) * 1000),
            error=error,
        )
        log_chat_turn(record)

    timeout = httpx.Timeout(120.0, connect=10.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(url, headers=headers, json=payload)
    except httpx.TimeoutException:
        _emit_log(
            status=0, data=None, text_out="", tool_calls_out=None,
            mutations_summary=None, error="timeout",
        )
        raise HTTPException(status_code=502, detail="AI provider request timed out") from None
    except (httpx.ConnectError, httpx.RequestError) as e:
        _emit_log(
            status=0, data=None, text_out="", tool_calls_out=None,
            mutations_summary=None, error=f"connect: {e!s}",
        )
        raise HTTPException(status_code=502, detail=f"AI provider connection failed: {e!s}") from None

    body_text = resp.text
    if resp.status_code >= 400:
        detail = _extract_upstream_error(body_text) or f"upstream HTTP {resp.status_code}"
        _emit_log(
            status=resp.status_code, data=None, text_out="",
            tool_calls_out=None, mutations_summary=None, error=detail[:300],
        )
        raise HTTPException(status_code=502, detail=_truncate_detail(detail))

    try:
        data = json.loads(body_text)
    except json.JSONDecodeError:
        _emit_log(
            status=resp.status_code, data=None, text_out="",
            tool_calls_out=None, mutations_summary=None, error="invalid_json",
        )
        raise HTTPException(status_code=502, detail="Invalid JSON from AI provider") from None

    if not isinstance(data, dict):
        _emit_log(
            status=resp.status_code, data=None, text_out="",
            tool_calls_out=None, mutations_summary=None, error="bad_shape",
        )
        raise HTTPException(status_code=502, detail="Unexpected AI provider response shape")

    msg = _extract_assistant_message(data)
    text = _content_to_str(msg.get("content"))
    usage = _extract_usage(data)

    raw_tool_calls = msg.get("tool_calls")
    tool_calls: list[dict] = (
        [tc for tc in raw_tool_calls if isinstance(tc, dict)]
        if isinstance(raw_tool_calls, list)
        else []
    )

    system_report: list[str] | None = None
    if is_co_gm_standard and tool_calls:
        report = await _execute_tool_calls(tool_calls)
        if report:
            system_report = report

    # If the LLM ran tools but returned empty text, inject a synthetic completion
    # so the next turn carries a non-empty assistant message (OpenAI spec) and
    # avoids re-trigger loops on stricter providers.
    any_mutation_applied = bool(system_report and any(not ln.startswith("⚠") for ln in system_report))
    synthetic = False
    if not text.strip() and any_mutation_applied:
        text = _SYNTHETIC_DONE_TEXT
        synthetic = True

    # Empty reply with no tool calls + no synthetic text → upstream issue (Phase 1 behavior).
    if not text.strip() and not system_report:
        _emit_log(
            status=resp.status_code, data=data, text_out="",
            tool_calls_out=tool_calls, mutations_summary=None, error="empty_content",
        )
        raise HTTPException(status_code=502, detail="Assistant returned empty content")

    _emit_log(
        status=resp.status_code, data=data,
        text_out=text, tool_calls_out=tool_calls,
        mutations_summary=system_report,
        error="synthetic_content" if synthetic else None,
    )

    # Persist the GM-visible conversation so a page refresh restores it.
    # We save what the user/GM is about to see: the messages they sent us PLUS
    # the assistant turn we're returning. ``isLocal`` UI placeholders never
    # reach this codepath (frontend filters them on the way out).
    assistant_turn: dict[str, Any] = {"role": "assistant", "content": text}
    if system_report:
        assistant_turn["system_report"] = system_report
    if usage is not None:
        assistant_turn["usage"] = usage.model_dump(exclude_none=True)
    persisted_messages: list[dict[str, Any]] = [
        m for m in request.messages if isinstance(m, dict)
    ] + [assistant_turn]
    try:
        save_chat_history(persisted_messages)
    except Exception as e:  # never let persistence break the chat response
        # Logged via the ai_logger record above; keep the user-facing path clean.
        import logging as _logging
        _logging.getLogger(__name__).warning("save_chat_history failed: %s", e)

    return AIChatAssistantReply(
        role="assistant",
        content=text,
        system_report=system_report,
        usage=usage,
    )
