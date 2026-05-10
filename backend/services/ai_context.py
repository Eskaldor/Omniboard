"""AI Co-GM helpers: contract loader, condensed combat context, mutation tool.

Phase 2 makes the AI chat context-aware:
- Per-system contract markdown (Asset Override pattern, ADR-4)
- Minimal JSON snapshot of CombatSession injected as system message
- ``apply_combat_mutations`` tool dispatch with stat-id validation against ``columns.json``

The backend stays the source of truth: the LLM cannot create actors, invent stat ids,
or mutate fields it isn't told about. Every change is validated against the live state.
"""
from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any, Literal

from backend.models import (
    Actor,
    CombatSession,
    StatValue,
    stat_cell_effective_scalar,
)
from backend.paths import DATA_DIR, DEFAULT_ASSETS_DIR
from backend.utils.config_loader import is_safe_system_subdirectory, load_config_with_override

_log = logging.getLogger(__name__)

# Some tables keep prone/downed actors at 0 HP rather than removing them.
# Flip to True (or thread a per-session setting later) to keep them in the AI context.
INCLUDE_DOWNED_ACTORS = False

# Soft guardrails so a 200-actor session doesn't blow the prompt budget.
_MAX_VISIBLE_ACTORS = 60
_HIDDEN_FIRST_DROP_THRESHOLD = _MAX_VISIBLE_ACTORS

_ROLE_TO_FACTION = {
    "character": "hero",
    "enemy": "enemy",
    "ally": "ally",
    "neutral": "neutral",
}

_GROUP_TARGETS = {
    "all_heroes": "hero",
    "all_enemies": "enemy",
    "all_allies": "ally",
    "all_neutrals": "neutral",
}


# ---------------------------------------------------------------------------
# System contract (markdown) loader
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT_FILENAME = "ai_system_prompt.md"
_DEFAULT_PROMPT_PATH = DEFAULT_ASSETS_DIR / "config" / _SYSTEM_PROMPT_FILENAME


def system_prompt_override_path(system_name: str) -> Path | None:
    """``data/systems/<system>/config/ai_system_prompt.md`` if name is safe."""
    if not is_safe_system_subdirectory(system_name):
        return None
    return DATA_DIR / system_name.strip() / "config" / _SYSTEM_PROMPT_FILENAME


def load_ai_system_prompt(system_name: str) -> tuple[str, Literal["system", "default", "missing"]]:
    """Resolve contract markdown via Asset Override.

    Returns ``(content, source)``: ``source="system"`` if the override exists,
    otherwise ``"default"``, otherwise ``"missing"`` with empty content.
    """
    override = system_prompt_override_path(system_name)
    if override is not None and override.is_file():
        try:
            return override.read_text(encoding="utf-8"), "system"
        except OSError:
            _log.warning("ai_system_prompt.md unreadable for system %r", system_name)

    if _DEFAULT_PROMPT_PATH.is_file():
        try:
            return _DEFAULT_PROMPT_PATH.read_text(encoding="utf-8"), "default"
        except OSError:
            _log.warning("default ai_system_prompt.md unreadable")

    return "", "missing"


def save_ai_system_prompt(system_name: str, content: str) -> Path:
    """Write contract markdown to ``data/systems/<system>/config/ai_system_prompt.md``."""
    target = system_prompt_override_path(system_name)
    if target is None:
        raise ValueError("invalid system name")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return target


# ---------------------------------------------------------------------------
# Stat schema discovery
# ---------------------------------------------------------------------------


def resolve_combat_stat_ids(system_name: str) -> dict[str, Any]:
    """Discover numeric stat ids and max-pairs from ``columns.json`` for ``system_name``.

    Falls back to ``{"numeric_stats": ["hp"], "max_pairs": {}}`` when columns.json is
    missing, malformed, or contains nothing numeric. ``max_pairs`` records both explicit
    ``max_key`` references and auto-detected ``max_<key>`` siblings.
    """
    try:
        merged = load_config_with_override(system_name, "columns.json")
    except (ValueError, OSError):
        merged = {}

    columns: list[dict] = []
    if isinstance(merged, list):
        columns = [c for c in merged if isinstance(c, dict)]
    elif isinstance(merged, dict):
        raw = merged.get("columns")
        if isinstance(raw, list):
            columns = [c for c in raw if isinstance(c, dict)]

    numeric_keys: list[str] = []
    explicit_max: dict[str, str] = {}

    for col in columns:
        # ``ColumnDef.id`` is the Pydantic field, but on-disk JSON uses ``key``. Honour both.
        key = col.get("key") or col.get("id")
        if not isinstance(key, str) or not key.strip():
            continue
        ctype = col.get("type", "number")
        if ctype != "number":
            continue
        numeric_keys.append(key)
        max_key = col.get("max_key")
        if isinstance(max_key, str) and max_key.strip():
            explicit_max[key] = max_key.strip()

    if not numeric_keys:
        return {"numeric_stats": ["hp"], "max_pairs": {}}

    # Auto-detect max_<key> siblings when no explicit max_key was set.
    keyset = set(numeric_keys)
    auto_max: dict[str, str] = {}
    for key in numeric_keys:
        if key in explicit_max:
            continue
        candidate = f"max_{key}"
        if candidate in keyset:
            auto_max[key] = candidate

    return {"numeric_stats": numeric_keys, "max_pairs": {**auto_max, **explicit_max}}


# ---------------------------------------------------------------------------
# Combat state serialization
# ---------------------------------------------------------------------------


def _scalar_or_none(actor: Actor, stat_id: str) -> float | None:
    cell = actor.stats.get(stat_id) if actor.stats else None
    if cell is None:
        return None
    val = stat_cell_effective_scalar(cell)
    if isinstance(val, bool):
        return float(int(val))
    if isinstance(val, (int, float)):
        return float(val)
    return None


# Markdown / control characters that the LLM could try to weaponize via an actor name
# ("[", "]", backticks, asterisks, underscores, angle brackets — also any newlines).
_NAME_STRIP_PATTERN = re.compile(r"[\r\n\t\x00-\x1f`*_\[\]<>#~|\\]")
_NAME_MAX_LEN = 50


def _sanitize_actor_name(name: Any) -> str:
    """Strip control chars / markdown specials and clamp length so a hostile actor
    name can't break out of the system message JSON or smuggle prompt directives."""
    s = str(name or "")
    s = _NAME_STRIP_PATTERN.sub(" ", s)
    s = " ".join(s.split())  # collapse runs of whitespace
    if len(s) > _NAME_MAX_LEN:
        s = s[: _NAME_MAX_LEN - 1].rstrip() + "…"
    return s or "(unnamed)"


def _is_alive(actor: Actor, numeric_stats: list[str] | None = None) -> bool:
    """System-agnostic liveness check.

    A genuine ``status`` field on Actor wins when present (for future-compat). Otherwise:
    if ANY tracked numeric stat has a value > 0, the actor is alive. If the actor has
    none of the system's numeric stats present at all, treat as alive (we don't know
    enough to claim otherwise — better to over-include than to silently drop a valid
    NPC). The flag ``INCLUDE_DOWNED_ACTORS`` short-circuits the check.
    """
    if INCLUDE_DOWNED_ACTORS:
        return True

    # Forward-compatible: Actor has no `status` field today, but check if one was
    # added without breaking us.
    status = getattr(actor, "status", None)
    if isinstance(status, str) and status.lower() in {"dead", "defeated", "removed"}:
        return False

    if not numeric_stats:
        return True

    seen_any = False
    for sid in numeric_stats:
        v = _scalar_or_none(actor, sid)
        if v is None:
            continue
        seen_any = True
        if v > 0:
            return True
    # Tracked but every numeric stat is exactly 0 -> downed/inert.
    # No numeric stats present at all -> alive (insufficient signal).
    return not seen_any


def get_minimal_ai_context(state: CombatSession) -> str:
    """Return condensed combat-state JSON suitable for an LLM system message.

    Output fields: ``round``, ``phase`` (is_active/current_index/current_pass),
    ``active_actor_id``, ``stat_schema`` (from columns.json), ``actors`` (id/name/
    faction/stats — numeric stats only). Non-numeric stats, formulas, portraits,
    effects, IPs, MACs are intentionally excluded.
    """
    core = state.core
    schema = resolve_combat_stat_ids(core.system or "")
    numeric_stats = schema["numeric_stats"]

    active_actor_id: str | None = None
    if core.turn_queue and 0 <= core.current_index < len(core.turn_queue):
        active_actor_id = core.turn_queue[core.current_index]

    candidates: list[Actor] = [a for a in core.actors if _is_alive(a, numeric_stats)]
    truncated = False
    if len(candidates) > _MAX_VISIBLE_ACTORS:
        # First, drop hidden actors. The LLM doesn't need to plan for unrevealed cards.
        visible = [a for a in candidates if a.is_revealed]
        if len(visible) <= _MAX_VISIBLE_ACTORS:
            candidates = visible
        else:
            candidates = visible[:_MAX_VISIBLE_ACTORS]
            truncated = True
        _log.info(
            "ai_context truncated actors: %d -> %d (system=%r)",
            len([a for a in core.actors if _is_alive(a, numeric_stats)]),
            len(candidates),
            core.system,
        )

    actors_payload: list[dict[str, Any]] = []
    for a in candidates:
        stats: dict[str, Any] = {}
        for sid in numeric_stats:
            v = _scalar_or_none(a, sid)
            if v is None:
                continue
            # Render integer-valued floats as ints for cleaner prompts.
            stats[sid] = int(v) if v.is_integer() else v
        actors_payload.append(
            {
                "id": a.id,
                "name": _sanitize_actor_name(a.name),
                "faction": _ROLE_TO_FACTION.get(a.role, a.role),
                "stats": stats,
            }
        )

    payload: dict[str, Any] = {
        "round": core.round,
        "phase": {
            "is_active": core.is_active,
            "current_index": core.current_index,
            "current_pass": core.current_pass,
        },
        "active_actor_id": active_actor_id,
        "stat_schema": schema,
        "actors": actors_payload,
    }
    if truncated:
        payload["_truncated_"] = True

    return json.dumps(payload, ensure_ascii=False)


# ---------------------------------------------------------------------------
# Tool schema
# ---------------------------------------------------------------------------


def get_mutations_tool_schema(system_name: str) -> dict[str, Any]:
    """Build the ``apply_combat_mutations`` tool schema for ``system_name``.

    The ``stat_id`` parameter is constrained to the system's resolved numeric stats
    via JSON Schema ``enum`` — this lets the LLM auto-complete from a closed set
    instead of guessing keys that the backend would later reject. Values are also
    clamped server-side; the schema is a hint, not a security boundary.
    """
    schema = resolve_combat_stat_ids(system_name or "")
    numeric_stats = schema["numeric_stats"]
    stat_id_property: dict[str, Any] = {
        "type": "string",
        "description": (
            "Stat id from stat_schema.numeric_stats in CURRENT COMBAT STATE."
        ),
    }
    if numeric_stats:
        stat_id_property["enum"] = list(numeric_stats)

    return {
        "type": "function",
        "function": {
            "name": "apply_combat_mutations",
            "description": (
                "Apply numeric stat changes to actors in the current combat session. "
                "Targets must come from CURRENT COMBAT STATE."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "actions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "required": ["target_id", "stat_id", "operation", "value"],
                            "properties": {
                                "target_id": {
                                    "type": "string",
                                    "description": (
                                        "Actor id from CURRENT COMBAT STATE.actors[].id, "
                                        "or one of: all_enemies, all_heroes, all_allies, all_neutrals."
                                    ),
                                },
                                "stat_id": stat_id_property,
                                "operation": {
                                    "type": "string",
                                    "enum": ["add", "subtract", "set"],
                                },
                                "value": {
                                    "type": "number",
                                    "minimum": 0,
                                    "description": (
                                        "Magnitude (always non-negative). Use 'subtract' for damage, 'add' for healing."
                                    ),
                                },
                            },
                        },
                    }
                },
                "required": ["actions"],
            },
        },
    }


# Backwards-compat alias for any caller that imported the old constant. Resolves
# against an empty system name (no enum). Prefer get_mutations_tool_schema(system).
APPLY_MUTATIONS_TOOL: dict[str, Any] = get_mutations_tool_schema("")


# ---------------------------------------------------------------------------
# Mutation executor
# ---------------------------------------------------------------------------


def _resolve_targets(
    state: CombatSession, target_id: str, numeric_stats: list[str]
) -> tuple[list[Actor], str | None]:
    """Resolve a target_id (specific actor id or group keyword) to a list of actors.

    Returns ``(actors, error_message)``: error_message is set if nothing matched.
    Group keywords return only alive actors of that faction.
    """
    if target_id in _GROUP_TARGETS:
        faction = _GROUP_TARGETS[target_id]
        matches = [
            a
            for a in state.core.actors
            if _ROLE_TO_FACTION.get(a.role, a.role) == faction and _is_alive(a, numeric_stats)
        ]
        if not matches:
            return [], f"⚠ No live actors for {target_id}"
        return matches, None

    actor = next((a for a in state.core.actors if a.id == target_id), None)
    if actor is None:
        return [], f"⚠ Unknown target: {target_id}"
    return [actor], None


def _apply_one(
    actor: Actor,
    stat_id: str,
    operation: str,
    value: float,
    max_pairs: dict[str, str],
) -> tuple[float, float] | None:
    """Mutate a single actor's stat. Returns ``(prev, new)`` or ``None`` if skipped.

    Math rules:
    - ``value`` is always taken as a magnitude — ``abs(value)`` is forced before any
      arithmetic so the LLM cannot smuggle a negative number through ``add`` to
      cause hidden damage (or through ``subtract`` to cause hidden healing).
    - ``add``: ``prev + value`` clamped to ``max_<stat>`` when known.
    - ``subtract``: ``prev - value`` clamped at 0 (no negative HP).
    - ``set``: clamped to ``[0, max_<stat>]``.
    """
    cell = actor.stats.get(stat_id)
    if not isinstance(cell, StatValue):
        return None

    # Force magnitude semantics regardless of what the LLM submitted.
    value = abs(float(value))

    prev = float(cell.value) if isinstance(cell.value, (int, float)) else 0.0

    # Resolve the clamp bound (if any) once so all operations see the same ceiling.
    max_bound: float | None = None
    max_id = max_pairs.get(stat_id)
    if max_id:
        max_v = stat_cell_effective_scalar(actor.stats.get(max_id))
        if isinstance(max_v, (int, float)) and not isinstance(max_v, bool):
            max_bound = float(max_v)

    if operation == "add":
        new = prev + value
        if max_bound is not None:
            new = min(new, max_bound)
    elif operation == "subtract":
        new = prev - value
        new = max(0.0, new)
    elif operation == "set":
        new = max(0.0, value)
        if max_bound is not None:
            new = min(new, max_bound)
    else:
        return None

    # Preserve int-ness when both sides are integers.
    if isinstance(cell.value, int) and float(int(new)) == new:
        cell.value = int(new)
    else:
        cell.value = new

    return prev, new


def apply_ai_mutations(state: CombatSession, actions: list[dict[str, Any]]) -> list[str]:
    """Validate and apply LLM-issued mutations. Returns human-readable summary lines.

    Never raises — invalid entries become warning lines so the GM sees what was rejected.
    Writes a ``stat_change`` log entry for each successful mutation so AI changes show up
    in ``data/logs/latest_combat.md`` next to manual GM edits.
    """
    # Imported here to avoid a circular import at module-load time
    # (logger -> state -> models is fine, but keep the dependency local).
    from backend.services.logger import add_log

    if not isinstance(actions, list) or not actions:
        return []

    schema = resolve_combat_stat_ids(state.core.system or "")
    numeric_stats_list: list[str] = list(schema["numeric_stats"])
    numeric_stats: set[str] = set(numeric_stats_list)
    max_pairs: dict[str, str] = schema["max_pairs"]

    summary: list[str] = []

    for raw in actions:
        if not isinstance(raw, dict):
            summary.append("⚠ Skipped: action is not an object")
            continue
        target_id = raw.get("target_id")
        stat_id = raw.get("stat_id")
        operation = raw.get("operation")
        value = raw.get("value")

        if not isinstance(target_id, str) or not target_id.strip():
            summary.append("⚠ Skipped: missing target_id")
            continue
        if not isinstance(stat_id, str) or not stat_id.strip():
            summary.append("⚠ Skipped: missing stat_id")
            continue
        if operation not in ("add", "subtract", "set"):
            summary.append(f"⚠ Skipped: invalid operation {operation!r}")
            continue
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            summary.append(f"⚠ Skipped: value must be a number ({value!r})")
            continue

        if stat_id not in numeric_stats:
            summary.append(f"⚠ Stat '{stat_id}' is not a numeric stat for this system")
            continue

        actors, err = _resolve_targets(state, target_id.strip(), numeric_stats_list)
        if err:
            summary.append(err)
            continue

        for actor in actors:
            result = _apply_one(actor, stat_id, operation, float(value), max_pairs)
            if result is None:
                summary.append(f"⚠ {actor.name}: stat '{stat_id}' not applicable")
                continue
            prev, new = result
            delta = new - prev
            sign = "+" if delta > 0 else ""
            line = f"{actor.name} {stat_id}: {prev:g} → {new:g} ({sign}{delta:g} from AI)"
            summary.append(line)
            add_log(
                "stat_change",
                actor_id=actor.id,
                actor_name=actor.name,
                details={
                    "stat_key": stat_id,
                    "amount": delta,
                    "message": f"{stat_id} {sign}{delta:g} (AI)",
                    "source": "ai",
                },
            )

    return summary
