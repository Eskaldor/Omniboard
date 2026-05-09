from __future__ import annotations

import json
from typing import Any

from backend.models import AIConfig
from backend.paths import AI_SETTINGS_PATH


def _read_json(path) -> Any | None:
    try:
        if not path.is_file():
            return None
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, json.JSONDecodeError):
        return None


def _migrate_legacy_ai_settings(raw: dict[str, Any]) -> dict[str, Any]:
    """
    Backward-compatible migration from vendor-specific keys to provider-agnostic keys.

    Old keys (v1):
    - openrouter_api_key -> chat_api_key
    - openrouter_base_url -> chat_base_url
    - default_text_model -> chat_model
    - google_api_key -> image_api_key
    """
    out = dict(raw)

    if "chat_api_key" not in out and isinstance(out.get("openrouter_api_key"), str):
        out["chat_api_key"] = out.get("openrouter_api_key")
    if "chat_base_url" not in out and isinstance(out.get("openrouter_base_url"), str):
        out["chat_base_url"] = out.get("openrouter_base_url")
    if "chat_model" not in out and isinstance(out.get("default_text_model"), str):
        out["chat_model"] = out.get("default_text_model")

    if "image_api_key" not in out and isinstance(out.get("google_api_key"), str):
        out["image_api_key"] = out.get("google_api_key")

    return out


def load_ai_config() -> AIConfig:
    raw = _read_json(AI_SETTINGS_PATH)
    if not isinstance(raw, dict):
        return AIConfig()
    raw = _migrate_legacy_ai_settings(raw)
    try:
        return AIConfig.model_validate(raw)
    except Exception:
        return AIConfig()


def save_ai_config(config: AIConfig) -> None:
    AI_SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    AI_SETTINGS_PATH.write_text(
        json.dumps(config.model_dump(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
