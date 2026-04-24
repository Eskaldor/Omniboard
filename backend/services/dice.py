from __future__ import annotations

import random
import re
from abc import ABC, abstractmethod
from typing import Optional

import d20
from pydantic import BaseModel
from simpleeval import simple_eval

from backend.models import Actor, stat_cell_effective_scalar


class RollResult(BaseModel):
    total: int
    formula: str
    details: str
    is_glitch: bool = False
    is_crit_glitch: bool = False


_STAT_PLACEHOLDER = re.compile(r"\[([a-zA-Z0-9_]+)\]")


def _stat_numeric_for_dice(actor: Actor, key: str) -> int:
    raw = actor.stats.get(key)
    v = stat_cell_effective_scalar(raw)
    try:
        if v is None:
            return 0
        return int(float(v))
    except (TypeError, ValueError):
        return 0


class BaseDiceEngine(ABC):
    """Подстановка [stat_key] из актора; движки реализуют roll."""

    def interpolate_stats(self, expression: str, actor: Actor) -> str:
        def repl(match: re.Match[str]) -> str:
            return str(_stat_numeric_for_dice(actor, match.group(1)))

        return _STAT_PLACEHOLDER.sub(repl, expression)

    @abstractmethod
    def roll(self, expression: str, actor: Optional[Actor] = None) -> RollResult:
        raise NotImplementedError


class D20Engine(BaseDiceEngine):
    """D&D и прочие системы на d20-нотации (библиотека d20)."""

    def roll(self, expression: str, actor: Optional[Actor] = None) -> RollResult:
        expr = expression.strip()
        if actor is not None:
            expr = self.interpolate_stats(expr, actor)
        rolled = d20.roll(expr)
        total = int(rolled.total)
        details = str(rolled.result).strip()
        return RollResult(total=total, formula=expr, details=details)


class ShadowrunEngine(BaseDiceEngine):
    """Пул d6: успехи на 5–6, глитч при единицах > половины пула."""

    def roll(self, expression: str, actor: Optional[Actor] = None) -> RollResult:
        expr = expression.strip()
        if actor is not None:
            expr = self.interpolate_stats(expr, actor)
        try:
            pool_size = int(simple_eval(expr, names={}))
        except Exception:
            pool_size = 0

        if pool_size < 1:
            return RollResult(
                total=0,
                formula=expr,
                details="[]",
                is_glitch=False,
                is_crit_glitch=False,
            )

        rolls = [random.randint(1, 6) for _ in range(pool_size)]
        hits = sum(1 for x in rolls if x >= 5)
        ones = sum(1 for x in rolls if x == 1)
        is_glitch = ones > (pool_size / 2)
        is_crit_glitch = is_glitch and hits == 0

        ordered = sorted(rolls, reverse=True)
        detail_body = str(ordered)
        if is_crit_glitch:
            detail_body += " (Critical Glitch!)"
        elif is_glitch:
            detail_body += " (Glitch!)"

        return RollResult(
            total=hits,
            formula=expr,
            details=detail_body,
            is_glitch=is_glitch,
            is_crit_glitch=is_crit_glitch,
        )


class DiceManager:
    """Выбор движка по имени системы и единая точка входа для бросков."""

    @staticmethod
    def get_engine(system_name: str) -> BaseDiceEngine:
        name = (system_name or "").lower()
        if "shadowrun" in name:
            return ShadowrunEngine()
        return D20Engine()

    def execute_roll(self, expression: str, system_name: str, actor: Actor) -> RollResult:
        engine = self.get_engine(system_name)
        return engine.roll(expression, actor)
