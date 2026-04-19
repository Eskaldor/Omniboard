from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Literal, Optional

from backend.models import CombatState


class BaseInitiativeEngine(ABC):
    """Abstract base for system-specific initiative engines (ADR-12)."""

    @abstractmethod
    def build_queue(self, state: CombatState) -> list[str]:
        """Return ordered actor IDs for the current pass/round queue."""

    @abstractmethod
    def next_turn(
        self, state: CombatState, target_actor_id: Optional[str] = None
    ) -> CombatState:
        """Advance or assign turn; ``target_actor_id`` for popcorn / manual mode."""

    @abstractmethod
    def has_next_pass(self, state: CombatState) -> bool:
        """Whether another pass is required in the current round."""

    @abstractmethod
    def on_round_lifecycle(
        self, state: CombatState, event: Literal["start", "end"]
    ) -> CombatState:
        """Round start/end hook (reactions, effect ticks, etc.)."""
