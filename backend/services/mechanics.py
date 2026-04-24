from __future__ import annotations

import json
import logging
from typing import Union

from simpleeval import simple_eval

from backend.models import Actor, StatValue
from backend.paths import get_system_mechanics_path

_log = logging.getLogger("omniboard.mechanics")


def _to_float(x: Union[int, float]) -> float:
    return float(x)


def _coerce_final_value(raw: float, template: Union[int, float]) -> Union[int, float]:
    """Сохраняем int, если результат целый и шаблон был int."""
    if isinstance(template, int) and abs(raw - round(raw)) < 1e-9:
        return int(round(raw))
    if abs(raw - round(raw)) < 1e-9:
        return int(round(raw))
    return float(raw)


class MechanicsManager:
    """Загрузка mechanics.json и безопасный пересчёт StatValue через simpleeval."""

    def _load_formulas(self, system_name: str) -> dict[str, str]:
        path = get_system_mechanics_path(system_name or "")
        if path is None or not path.is_file():
            return {}
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as e:
            _log.warning("mechanics.json unreadable for system %r: %s", system_name, e)
            return {}
        formulas = data.get("formulas") if isinstance(data, dict) else None
        if not isinstance(formulas, dict):
            return {}
        out: dict[str, str] = {}
        for k, v in formulas.items():
            if isinstance(v, str) and v.strip():
                out[str(k)] = v
        return out

    def recalculate_actor_stats(self, actor: Actor, system_name: str) -> Actor:
        """
        Для каждого StatValue в actor.stats:
        контекст simpleeval — базы (base) всех StatValue;
        при наличии formula_id — выражение из mechanics.json (иначе ядро = base);
        value = ядро + сумма overrides.value.
        Ошибки формул не пробрасываются: warning и ядро = base.
        """
        formulas = self._load_formulas(system_name)
        stats = dict(actor.stats)

        bases: dict[str, float] = {}
        for k, v in stats.items():
            if isinstance(v, StatValue):
                bases[k] = _to_float(v.base)

        new_stats: dict = {}
        for k, v in stats.items():
            if not isinstance(v, StatValue):
                new_stats[k] = v
                continue

            base_num = _to_float(v.base)
            fid = (v.formula_id or "").strip()

            if fid and fid in formulas:
                expr = formulas[fid]
                try:
                    core = float(simple_eval(expr, names=dict(bases)))
                except Exception as e:
                    _log.warning(
                        "Formula %r (%r) failed for actor %s stat %r: %s; using base=%s",
                        fid,
                        expr,
                        getattr(actor, "id", "?"),
                        k,
                        e,
                        base_num,
                    )
                    core = base_num
            elif fid:
                _log.warning(
                    "Unknown formula_id %r for system %r (actor %s, stat %r); using base=%s",
                    fid,
                    system_name,
                    getattr(actor, "id", "?"),
                    k,
                    base_num,
                )
                core = base_num
            else:
                core = base_num

            ovr_sum = sum(_to_float(o.value) for o in v.overrides)
            raw_final = core + ovr_sum
            final_num = _coerce_final_value(raw_final, v.value)
            new_stats[k] = v.model_copy(update={"value": final_num})

        return actor.model_copy(update={"stats": new_stats})
