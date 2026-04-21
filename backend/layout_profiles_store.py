"""Layout profiles: ADR-4 merge (``utils.config_loader.load_config_with_override``) + system file write on POST."""
from __future__ import annotations

import json
from pathlib import Path

from backend.models import LayoutProfile
from backend.paths import DATA_DIR
from backend.utils.config_loader import load_config_with_override


def _default_layout_profile() -> LayoutProfile:
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


def default_layout_profiles() -> list[LayoutProfile]:
    return [_default_layout_profile()]


def layout_profiles_file_path(system_name: str) -> Path | None:
    name = (system_name or "").strip()
    if not name or ".." in name or "/" in name or "\\" in name:
        return None
    path = (DATA_DIR / name / "layout_profiles.json").resolve()
    try:
        path.relative_to(DATA_DIR.resolve())
    except ValueError:
        return None
    return path


def read_layout_profiles(system_name: str) -> list[LayoutProfile]:
    """Merged default/config + data/systems/<system>/layout_profiles.json → LayoutProfile."""
    raw = load_config_with_override((system_name or "").strip(), "layout_profiles.json")
    if not isinstance(raw, list) or not raw:
        return default_layout_profiles()
    try:
        out = [LayoutProfile.model_validate(item) for item in raw]
        if not any(p.id == "default" for p in out):
            out = [_default_layout_profile(), *out]
        return out
    except Exception:
        return default_layout_profiles()


def write_layout_profiles(system_name: str, profiles: list[LayoutProfile]) -> None:
    path = layout_profiles_file_path(system_name)
    if path is None:
        raise ValueError("invalid system name")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps([p.model_dump(mode="json") for p in profiles], indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
