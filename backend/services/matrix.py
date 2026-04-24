from __future__ import annotations

from typing import Any

from backend.models import CombatSession
from backend.services.dice import DiceManager
from backend.utils.config_loader import load_config_with_override

_DEFAULT_RULE: dict[str, Any] = {
    "id": "default_pool",
    "label": "d20",
    "expression": "1d20",
    "count": 1,
    "display": "single",
}


class MatrixManager:
    @staticmethod
    def load_matrix(system_name: str) -> dict[str, Any]:
        raw = load_config_with_override((system_name or "").strip(), "matrix.json")
        if not isinstance(raw, dict):
            return {"generation_rules": [_DEFAULT_RULE]}
        rules = raw.get("generation_rules")
        if not isinstance(rules, list) or len(rules) == 0:
            return {"generation_rules": [_DEFAULT_RULE]}
        return raw

    @staticmethod
    def build_prerolls(session: CombatSession, dice: DiceManager) -> dict[str, list[Any]]:
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
