from __future__ import annotations

import json

import httpx
from fastapi import APIRouter, HTTPException

from backend.models import AIChatAssistantReply, AIChatRequest, AIConfig
from backend.utils.ai_config import load_ai_config, save_ai_config


router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.get("/settings", response_model=AIConfig)
async def get_ai_settings() -> AIConfig:
    return load_ai_config()


@router.post("/settings", response_model=AIConfig)
async def post_ai_settings(payload: AIConfig) -> AIConfig:
    save_ai_config(payload)
    return payload


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


def _extract_assistant_content(data: dict) -> str:
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        raise ValueError("no choices in upstream response")
    first = choices[0]
    if not isinstance(first, dict):
        raise ValueError("invalid choice shape")
    msg = first.get("message")
    if not isinstance(msg, dict):
        raise ValueError("invalid message shape")
    content = msg.get("content")
    if content is None:
        raise ValueError("empty assistant content")
    if isinstance(content, str):
        return content
    # Some APIs return content as list of parts
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict) and isinstance(item.get("text"), str):
                parts.append(item["text"])
            elif isinstance(item, str):
                parts.append(item)
        return "".join(parts).strip() or ""
    return str(content)


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

    url = f"{base}/chat/completions"
    payload = {"model": model, "messages": request.messages}
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}

    timeout = httpx.Timeout(120.0, connect=10.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(url, headers=headers, json=payload)
    except httpx.TimeoutException:
        raise HTTPException(status_code=502, detail="AI provider request timed out") from None
    except (httpx.ConnectError, httpx.RequestError) as e:
        raise HTTPException(status_code=502, detail=f"AI provider connection failed: {e!s}") from None

    body_text = resp.text
    if resp.status_code >= 400:
        detail = _extract_upstream_error(body_text) or f"upstream HTTP {resp.status_code}"
        raise HTTPException(status_code=502, detail=_truncate_detail(detail))

    try:
        data = json.loads(body_text)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="Invalid JSON from AI provider") from None

    if not isinstance(data, dict):
        raise HTTPException(status_code=502, detail="Unexpected AI provider response shape")

    try:
        text = _extract_assistant_content(data)
    except ValueError as e:
        raise HTTPException(status_code=502, detail=str(e)) from None

    if not text.strip():
        raise HTTPException(status_code=502, detail="Assistant returned empty content")

    return AIChatAssistantReply(role="assistant", content=text)
