from __future__ import annotations

from pathlib import Path

from backend.engines.base import BaseInitiativeEngine
from backend.engines.phase import PhaseInitiativeEngine
from backend.engines.popcorn import PopcornInitiativeEngine
from backend.engines.standard import StandardInitiativeEngine
from backend.models import CombatState
from backend.paths import DATA_DIR

# Stateless default engine; one instance shared until Phase engines exist.
_standard_singleton = StandardInitiativeEngine()
_popcorn_singleton = PopcornInitiativeEngine()
_phase_singleton = PhaseInitiativeEngine()


def _logic_path(system_name: str) -> Path:
    return DATA_DIR / system_name.strip() / "logic.py"


def system_has_custom_logic_file(system_name: str) -> bool:
    """True when ``data/systems/<system>/logic.py`` exists (system-defined initiative)."""
    return _logic_path((system_name or "").strip() or "D&D 5e").is_file()


def _try_load_custom_engine(system_name: str) -> BaseInitiativeEngine | None:
    """
    Icebox (ADR-12): if ``logic.py`` exists, load a custom ``BaseInitiativeEngine`` via importlib.
    Until implemented, return None and fall back to typed engines below.
    """
    path = _logic_path(system_name)
    if not path.is_file():
        return None
    # Future: spec = importlib.util.spec_from_file_location(...); module = ...
    #         return module.INITIATIVE_ENGINE()  # type: ignore[attr-defined]
    return None


def get_engine_for_state(state: CombatState) -> BaseInitiativeEngine:
    """
    Resolve initiative engine: custom ``logic.py`` wins; otherwise map ``engine_type``.
    """
    sys_name = (state.system or "").strip() or "D&D 5e"
    custom = _try_load_custom_engine(sys_name)
    if custom is not None:
        return custom
    et = (state.engine_type or "standard").strip().lower()
    if et == "popcorn":
        return _popcorn_singleton
    if et == "phase":
        return _phase_singleton
    if et == "standard":
        return _standard_singleton
    return _standard_singleton
