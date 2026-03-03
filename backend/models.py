from pydantic import BaseModel, Field
from typing import Literal, Optional, List, Dict, Any

class Effect(BaseModel):
    id: str
    name: str
    duration: Optional[int] = None
    description: Optional[str] = None
    show_on_miniature: bool = False

class Visibility(BaseModel):
    hp: bool = True
    stats: bool = True
    effects: bool = True
    name: bool = True

class HotbarAction(BaseModel):
    label: str
    type: Literal["damage", "heal", "effect", "note"]
    value: Optional[int] = None
    effect_id: Optional[str] = None
    effect_duration: Optional[int] = None
    source: Optional[str] = None
    targets: Literal["self", "selected", "all_enemies", "all_allies"] = "selected"

class DisplayField(BaseModel):
    type: Literal["text", "bar"]
    label: Optional[str] = None
    value_path: str
    max_value_path: Optional[str] = None
    color: Optional[str] = None

class MiniatureLayout(BaseModel):
    show_portrait: bool = True
    top1: Optional[DisplayField] = None
    top2: Optional[DisplayField] = None
    bottom1: Optional[DisplayField] = None
    bottom2: Optional[DisplayField] = None


class ColumnDef(BaseModel):
    id: str
    name: str  # Default name (can be overridden by i18n)
    type: Literal["number", "text", "string"] = "number"  # "text" for comments/notes
    group: Optional[str] = None
    min_value: Optional[int] = None
    max_value: Optional[int] = None
    min_key: Optional[str] = None  # References another stat key for dynamic min
    max_key: Optional[str] = None  # References another stat key for dynamic max (e.g. max_hp)
    width: Optional[str] = "80px"  # e.g., "80px" or "1fr"

    # Logging configuration
    log_changes: bool = False
    log_color: Optional[str] = None  # HEX color, e.g., "#eab308"

    # Visibility and UI configuration
    show_in_mini_sheet: bool = False
    is_advanced: bool = False
    display_as_fraction: bool = False  # If true, render as "Value / Max" in table


class Actor(BaseModel):
    id: str
    name: str
    role: Literal["character", "enemy", "ally", "neutral"]
    is_revealed: bool = True
    group_id: Optional[str] = None
    group_mode: Optional[Literal["sequential", "simultaneous"]] = None
    group_color: Optional[str] = None
    initiative: int = 0
    portrait: str
    miniature_id: Optional[str] = None
    stats: Dict[str, Any] = {}
    effects: List[Effect] = []
    visibility: Visibility = Visibility()
    hotbar: List[HotbarAction] = []


class LegendConfig(BaseModel):
    player: str = "#10b981"   # emerald
    enemy: str = "#ef4444"    # red
    ally: str = "#3b82f6"    # blue
    neutral: str = "#a1a1aa"  # zinc


class LogEntry(BaseModel):
    type: Literal[
        "combat_start", "combat_end", "round_start", "turn_start",
        "hp_change", "stat_change",
        "effect_added", "effect_removed", "actor_joined", "actor_left", "text"
    ]
    round: int
    actor_id: Optional[str] = None
    actor_name: Optional[str] = None
    details: Dict[str, Any] = {}

class CombatState(BaseModel):
    actors: List[Actor] = []
    turn_queue: List[str] = []
    current_index: int = 0
    round: int = 1
    system: str = "D&D 5e"
    layout: MiniatureLayout = MiniatureLayout(show_portrait=True)
    legend: LegendConfig = Field(default_factory=LegendConfig)
    show_group_colors: bool = True
    show_faction_colors: bool = True
    sync_led_to_ui: bool = True
    history: List[LogEntry] = []
    history_cursor: int = -1
    is_active: bool = False
    active_reaction_actor_id: Optional[str] = None
    enable_logging: bool = True
    autosave_enabled: bool = True
    table_centered: bool = True
