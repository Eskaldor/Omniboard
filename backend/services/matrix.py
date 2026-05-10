from __future__ import annotations

from typing import Any

from backend.models import Actor, CombatSession
from backend.services.dice import DiceManager
from backend.utils.config_loader import load_config_with_override

_DEFAULT_RULE: dict[str, Any] = {
    "id": "default_pool",
    "label": "d20",
    "expression": "1d20",
    "count": 1,
    "display": "single",
}


def _parse_system_actions(raw: Any) -> dict[str, dict[str, str]]:
    """Mirror frontend ``useSystemActions`` / ``parseSystemActions``."""
    if not isinstance(raw, dict):
        return {}
    out: dict[str, dict[str, str]] = {}
    for k, v in raw.items():
        key = (k or "").strip()
        if not key or not isinstance(v, dict):
            continue
        name = str(v.get("name") or "").strip() or key
        formula = str(v.get("formula") or "").strip()
        if not formula:
            continue
        out[key] = {"name": name, "formula": formula}
    return out


def merge_actor_action_defs_for_matrix(
    system_actions: dict[str, dict[str, str]], actor: Actor
) -> dict[str, dict[str, str]]:
    """Mirror ``mergeActorActionDefs``: system defs + actor-only ``custom_formula`` keys."""
    merged = dict(system_actions)
    for key, ov in (actor.actions or {}).items():
        if ov is None:
            continue
        cf = getattr(ov, "custom_formula", None)
        if cf is None:
            continue
        cfs = str(cf).strip()
        if not cfs:
            continue
        nm = getattr(ov, "custom_name", None)
        name = str(nm).strip() if nm else key
        merged[key] = {"name": name, "formula": cfs}
    return merged


def resolved_macro_formula(actor: Actor, macro_key: str, merged: dict[str, dict[str, str]]) -> str:
    """Effective roll formula for ``macro_key`` (``formula_override`` wins over merged/base)."""
    key = (macro_key or "").strip()
    if not key:
        return ""
    base = merged.get(key)
    formula = str(base.get("formula") or "").strip() if base else ""
    ao = (actor.actions or {}).get(key)
    if ao is not None:
        fo = getattr(ao, "formula_override", None)
        if fo is not None:
            fos = str(fo).strip()
            if fos:
                formula = fos
    return formula


def _macro_display_name(actor: Actor, macro_key: str, merged: dict[str, dict[str, str]]) -> str:
    key = (macro_key or "").strip()
    ao = (actor.actions or {}).get(key)
    if ao is not None:
        cn = getattr(ao, "custom_name", None)
        if cn is not None and str(cn).strip():
            return str(cn).strip()
    ent = merged.get(key)
    if ent and str(ent.get("name") or "").strip():
        return str(ent["name"]).strip()
    return key or macro_key


def _actor_passes_filter(actor: Actor, filt: dict[str, Any]) -> bool:
    role = str(actor.role or "")
    inc = filt.get("include_roles")
    exc = filt.get("exclude_roles")
    if isinstance(inc, list) and len(inc) > 0:
        allowed = {str(x).strip() for x in inc if str(x).strip()}
        return role in allowed if allowed else True
    if isinstance(exc, list) and len(exc) > 0:
        blocked = {str(x).strip() for x in exc if str(x).strip()}
        return role not in blocked if blocked else True
    return True


def _roll_parts_for_cell(
    *,
    parts: list[Any],
    dice: DiceManager,
    system: str,
    actor: Actor,
    merged_macros: dict[str, dict[str, str]],
) -> tuple[list[dict[str, Any]], list[str]]:
    """Returns rolled results and parallel ``part_label`` strings (possibly empty)."""
    results: list[dict[str, Any]] = []
    labels: list[str] = []
    for part in parts:
        if not isinstance(part, dict):
            continue
        kind = str(part.get("kind") or "").strip().lower()
        expr = ""
        label = str(part.get("part_label") or "").strip()
        if kind == "expression":
            expr = str(part.get("expression") or "").strip()
        elif kind == "macro":
            mk = str(part.get("macro_key") or "").strip()
            expr = resolved_macro_formula(actor, mk, merged_macros)
            if not expr:
                continue
        else:
            continue
        # Same wrapping semantics as roll terminal for macros (parentheses).
        if kind == "macro":
            expr = f"({expr})" if expr else expr
        r = dice.execute_roll(expr, system, actor)
        results.append(r.model_dump())
        labels.append(label)
    return results, labels


def _build_legacy_prerolls(session: CombatSession, dice: DiceManager) -> dict[str, list[Any]]:
    matrix = MatrixManager.load_matrix(session.core.system or "")
    rules = matrix.get("generation_rules") or []
    if not isinstance(rules, list):
        rules = []
    system = (session.core.system or "").strip()
    out: dict[str, list[Any]] = {}
    for actor in session.core.actors:
        groups: list[Any] = []
        for rule in rules:
            if not isinstance(rule, dict):
                continue
            rid = str(rule.get("id") or "").strip() or "rule"
            label = str(rule.get("label") or rid).strip()
            expr = str(rule.get("expression") or "1d20").strip() or "1d20"
            try:
                count = max(1, int(rule.get("count") or 1))
            except (TypeError, ValueError):
                count = 1
            display = str(rule.get("display") or "single").lower()
            if display not in ("single", "pair"):
                display = "single"
            slots: list[dict[str, Any]] = []
            for idx in range(count):
                if display == "pair":
                    r1 = dice.execute_roll(expr, system, actor)
                    r2 = dice.execute_roll(expr, system, actor)
                    results = [r1.model_dump(), r2.model_dump()]
                else:
                    r = dice.execute_roll(expr, system, actor)
                    results = [r.model_dump()]
                slots.append({"index": idx, "used": False, "results": results})
            groups.append(
                {
                    "rule_id": rid,
                    "label": label,
                    "display": display,
                    "slots": slots,
                }
            )
        out[actor.id] = groups
    return out


class MatrixManager:
    @staticmethod
    def load_matrix(system_name: str) -> dict[str, Any]:
        raw = load_config_with_override((system_name or "").strip(), "matrix.json")
        if not isinstance(raw, dict):
            return {"generation_rules": [_DEFAULT_RULE]}
        rules = raw.get("generation_rules")
        if not isinstance(rules, list):
            rules = []
        if len(rules) == 0 and not MatrixManager._matrix_has_groups(raw):
            merged = dict(raw)
            merged["generation_rules"] = [_DEFAULT_RULE]
            return merged
        return raw

    @staticmethod
    def find_slot(
        groups: list[Any], cell_id: str, slot_index: int
    ) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
        """
        Locate a preroll slot. Legacy groups use ``rule_id`` + ``slots``;
        v2 uses nested ``columns`` with ``cell_id``.
        Returns ``(container_dict, slot_dict)`` — container holds ``label`` / ``rule_id`` / ``cell_id``.
        """
        cid = (cell_id or "").strip()
        if not cid:
            return None, None
        for g in groups:
            if not isinstance(g, dict):
                continue
            # Legacy flat rule row (tracker / old matrix)
            if "columns" not in g and g.get("rule_id") == cid:
                slots = g.get("slots")
                if isinstance(slots, list):
                    for s in slots:
                        if isinstance(s, dict) and int(s.get("index", -1)) == int(slot_index):
                            return g, s
                return None, None
            cols = g.get("columns")
            if isinstance(cols, list):
                for col in cols:
                    if not isinstance(col, dict):
                        continue
                    if col.get("cell_id") != cid:
                        continue
                    slots = col.get("slots")
                    if isinstance(slots, list):
                        for s in slots:
                            if isinstance(s, dict) and int(s.get("index", -1)) == int(slot_index):
                                return col, s
                    return None, None
        return None, None

    @staticmethod
    def _matrix_has_groups(matrix: dict[str, Any]) -> bool:
        g = matrix.get("groups")
        return isinstance(g, list) and len(g) > 0

    @staticmethod
    def build_prerolls(session: CombatSession, dice: DiceManager) -> dict[str, list[Any]]:
        matrix = MatrixManager.load_matrix(session.core.system or "")
        if MatrixManager._matrix_has_groups(matrix):
            return MatrixManager._build_v2_prerolls(session, dice, matrix)
        return _build_legacy_prerolls(session, dice)

    @staticmethod
    def _build_v2_prerolls(
        session: CombatSession, dice: DiceManager, matrix: dict[str, Any]
    ) -> dict[str, list[Any]]:
        filt_raw = matrix.get("actor_filter")
        filt: dict[str, Any] = filt_raw if isinstance(filt_raw, dict) else {}
        system_name = (session.core.system or "").strip()
        raw_actions = load_config_with_override(system_name, "actions.json")
        system_actions = _parse_system_actions(raw_actions)

        out: dict[str, list[Any]] = {}
        for actor in session.core.actors:
            if not _actor_passes_filter(actor, filt):
                continue
            merged_macros = merge_actor_action_defs_for_matrix(system_actions, actor)
            groups_out: list[dict[str, Any]] = []
            groups_cfg = matrix.get("groups")
            if not isinstance(groups_cfg, list):
                groups_cfg = []

            for grp in groups_cfg:
                if not isinstance(grp, dict):
                    continue
                gid = str(grp.get("id") or "").strip() or "group"
                glabel = str(grp.get("label") or gid).strip()
                cols_cfg = grp.get("columns")
                if not isinstance(cols_cfg, list):
                    cols_cfg = []
                columns_out: list[dict[str, Any]] = []

                for col in cols_cfg:
                    if not isinstance(col, dict):
                        continue
                    cid = str(col.get("id") or "").strip() or "col"
                    clabel = str(col.get("label") or cid).strip()
                    cell_id = f"{gid}:{cid}"
                    kind = str(col.get("kind") or "").strip().lower()

                    if kind == "composite":
                        parts_raw = col.get("parts")
                        parts = parts_raw if isinstance(parts_raw, list) else []
                        results, part_labels = _roll_parts_for_cell(
                            parts=parts,
                            dice=dice,
                            system=system_name,
                            actor=actor,
                            merged_macros=merged_macros,
                        )
                        slots = [
                            {
                                "index": 0,
                                "used": False,
                                "results": results,
                                "part_labels": part_labels,
                            }
                        ]
                        columns_out.append(
                            {
                                "column_id": cid,
                                "label": clabel,
                                "cell_id": cell_id,
                                "display": "single",
                                "slots": slots,
                            }
                        )
                        continue

                    if kind == "macro":
                        mk = str(col.get("macro_key") or "").strip()
                        expr = resolved_macro_formula(actor, mk, merged_macros)
                        if not expr:
                            columns_out.append(
                                {
                                    "column_id": cid,
                                    "label": clabel,
                                    "cell_id": cell_id,
                                    "display": "single",
                                    "slots": [],
                                    "skipped": True,
                                    "skip_reason": "missing_macro",
                                }
                            )
                            continue
                        expr_wrapped = f"({expr})"
                        try:
                            count = max(1, int(col.get("count") or 1))
                        except (TypeError, ValueError):
                            count = 1
                        display = str(col.get("display") or "single").lower()
                        if display not in ("single", "pair"):
                            display = "single"
                        slots = MatrixManager._slots_from_expression(
                            dice, system_name, actor, expr_wrapped, count, display
                        )
                        columns_out.append(
                            {
                                "column_id": cid,
                                "label": clabel,
                                "cell_id": cell_id,
                                "display": display,
                                "slots": slots,
                            }
                        )
                        continue

                    # expression (default)
                    expr = str(col.get("expression") or "1d20").strip() or "1d20"
                    try:
                        count = max(1, int(col.get("count") or 1))
                    except (TypeError, ValueError):
                        count = 1
                    display = str(col.get("display") or "single").lower()
                    if display not in ("single", "pair"):
                        display = "single"
                    slots = MatrixManager._slots_from_expression(
                        dice, system_name, actor, expr, count, display
                    )
                    columns_out.append(
                        {
                            "column_id": cid,
                            "label": clabel,
                            "cell_id": cell_id,
                            "display": display,
                            "slots": slots,
                        }
                    )

                if columns_out:
                    groups_out.append(
                        {
                            "group_id": gid,
                            "label": glabel,
                            "columns": columns_out,
                        }
                    )

            out[actor.id] = groups_out
        return out

    @staticmethod
    def _slots_from_expression(
        dice: DiceManager,
        system: str,
        actor: Actor,
        expr: str,
        count: int,
        display: str,
    ) -> list[dict[str, Any]]:
        slots: list[dict[str, Any]] = []
        for idx in range(count):
            if display == "pair":
                r1 = dice.execute_roll(expr, system, actor)
                r2 = dice.execute_roll(expr, system, actor)
                results = [r1.model_dump(), r2.model_dump()]
            else:
                r = dice.execute_roll(expr, system, actor)
                results = [r.model_dump()]
            slots.append({"index": idx, "used": False, "results": results})
        return slots
