from pydantic import BaseModel, Field, model_validator
from typing import Literal, Optional, List, Dict, Any

class Effect(BaseModel):
    id: str
    name: str
    duration: Optional[int] = None
    description: Optional[str] = None
    icon: str = ""
    is_base: bool = False
    show_on_miniature: bool = False  # deprecated, use render_on_mini
    render_on_mini: bool = True
    render_on_panel: bool = True
    experimental_ai: bool = False
    ai_prompt: str = ""
    ai_variations: dict[str, str] = Field(default_factory=dict)

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
    theme_id: Optional[str] = None  # Идентификатор темы/папки для текстурированных баров
    rotation: int = 0  # Угол поворота в градусах: 0, 90, 270 (для боковых слотов)
    show_text: bool = True   # Показывать текст поверх бара
    show_label: bool = True  # Показывать подпись (label)
    show_max: bool = True    # Показывать максимум (например в "10/20")

class LayoutProfile(BaseModel):
    id: str
    name: str
    frame_asset: str = "default_frame.png"  # Кастомная рамка
    show_portrait: bool = True
    top1: Optional[DisplayField] = None
    top2: Optional[DisplayField] = None
    bottom1: Optional[DisplayField] = None
    bottom2: Optional[DisplayField] = None
    left1: Optional[DisplayField] = None   # Левый вертикальный слот
    right1: Optional[DisplayField] = None  # Правый вертикальный слот
    font_id: str = "default.ttf"   # Идентификатор/путь к шрифту
    font_size: int = 18             # Размер шрифта по умолчанию
    bar_height: int = 16            # Толщина баров


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
    is_pinned: bool = False
    group_id: Optional[str] = None
    group_name: Optional[str] = None
    group_mode: Optional[Literal["sequential", "simultaneous"]] = None
    group_color: Optional[str] = None
    initiative: int = 0
    portrait: str
    show_portrait: bool = False
    miniature_id: Optional[str] = None
    layout_profile_id: Optional[str] = None  # Привязка к профилю отображения
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
    layout_profiles: List[LayoutProfile] = Field(
        default_factory=lambda: [LayoutProfile(id="default", name="Default")]
    )
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

    @model_validator(mode="before")
    @classmethod
    def migrate_layout_to_profiles(cls, data: Any) -> Any:
        """Миграция: старый layout -> layout_profiles с профилем default."""
        if not isinstance(data, dict):
            return data
        if "layout" in data and "layout_profiles" not in data:
            old = data.pop("layout")
            if isinstance(old, dict):
                old.setdefault("id", "default")
                old.setdefault("name", "Default")
                data["layout_profiles"] = [old]
        return data
