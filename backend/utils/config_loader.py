"""
ADR-4 Asset Override: merge default config with per-system overrides.

Base (read-only foundation): data/assets/default/config/{file_name}
Override: data/systems/{system_name}/{file_name}

Lists of objects with string ``id``: override entries replace base entries with the same id;
new ids are appended (order: base order, then override-only items in override file order).
Dicts: deep merge with override winning on leaf conflicts.

Missing files never raise; missing base yields empty container before merge.
"""
from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

from backend.paths import ASSETS_DIR, DATA_DIR

DEFAULT_CONFIG_DIR = ASSETS_DIR / "default" / "config"


def _safe_system_segment(name: str) -> bool:
    s = (name or "").strip()
    if not s or ".." in s or "/" in s or "\\" in s:
        return False
    try:
        (DATA_DIR / s).resolve().relative_to(DATA_DIR.resolve())
    except ValueError:
        return False
    return True


def is_safe_system_subdirectory(name: str) -> bool:
    """True if ``name`` is a single safe segment under ``data/systems`` (no traversal)."""
    return _safe_system_segment(name)


def _read_json(path: Path) -> Any | None:
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError, json.JSONDecodeError):
        return None


def _default_config_path(file_name: str) -> Path:
    return DEFAULT_CONFIG_DIR / file_name


def _system_override_path(system_name: str, file_name: str) -> Path | None:
    if not _safe_system_segment(system_name):
        return None
    return (DATA_DIR / system_name.strip() / file_name).resolve()


def _merge_id_object_lists(base: list[Any], override: list[Any]) -> list[dict[str, Any]]:
    """Merge two lists of dict items with string ``id`` (other items skipped)."""
    merged: list[dict[str, Any]] = []
    by_id: dict[str, int] = {}

    for item in base:
        if not isinstance(item, dict):
            continue
        eid = item.get("id")
        if not isinstance(eid, str) or not eid.strip():
            continue
        d = copy.deepcopy(item)
        merged.append(d)
        by_id[eid.strip()] = len(merged) - 1

    for item in override:
        if not isinstance(item, dict):
            continue
        eid = item.get("id")
        if not isinstance(eid, str) or not eid.strip():
            continue
        key = eid.strip()
        d = copy.deepcopy(item)
        if key in by_id:
            merged[by_id[key]] = d
        else:
            by_id[key] = len(merged)
            merged.append(d)

    return merged


def _deep_merge_dicts(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    out = copy.deepcopy(base)
    for k, v in override.items():
        if k in out and isinstance(out[k], dict) and isinstance(v, dict):
            out[k] = _deep_merge_dicts(out[k], v)
        else:
            out[k] = copy.deepcopy(v)
    return out


def load_config_with_override(system_name: str, file_name: str) -> list | dict:
    """
    Load merged configuration for ``system_name`` and ``file_name``.

    Returns a ``list`` or ``dict``. If either side is a JSON array, list-merge by ``id`` applies.
    Otherwise shallow/deep dict merge is used. If both files are absent, returns ``[]``.
    """
    if not file_name or ".." in file_name or "/" in file_name or "\\" in file_name:
        raise ValueError("invalid file_name")

    base_raw = _read_json(_default_config_path(file_name))
    sys_path = _system_override_path(system_name, file_name)
    override_raw = _read_json(sys_path) if sys_path is not None else None

    if base_raw is None and override_raw is None:
        return []

    if isinstance(base_raw, list) or isinstance(override_raw, list):
        b_list = base_raw if isinstance(base_raw, list) else []
        o_list = override_raw if isinstance(override_raw, list) else []
        return _merge_id_object_lists(b_list, o_list)

    b = base_raw if isinstance(base_raw, dict) else {}
    o = override_raw if isinstance(override_raw, dict) else {}
    return _deep_merge_dicts(b, o)
