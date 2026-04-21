from pydantic import BaseModel, ConfigDict, Field, model_validator
from typing import Any, ClassVar, Dict, List, Literal, Optional

class LedProfile(BaseModel):
    id: str
    name: str
    mode: Literal["static", "cycle", "blink", "breathe", "pulse", "rainbow"]
    speed: int
    brightness: int
    colors: list[str]  # e.g. ["#FF0000", "#000000"] or ["$ROLE_COLOR"]


class LedTriggerRule(BaseModel):
    id: str
    event_type: Literal["turn_start", "stat_change"]
    target_stat: Optional[str] = None  # e.g. "hp" or "mana"
    led_profile_id: str  # references LedProfile.id
    duration_type: Literal["time", "turn"]
    duration_ms: Optional[int] = 1000  # ms when duration_type == "time"


class Effect(BaseModel):
    id: str
    name: str
    duration: Optional[int] = None
    description: Optional[str] = None
    icon: str = ""
    led_profile_id: Optional[str] = None  # Omnimini LED profile from system led_profiles.json
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
    bar_bg_color: Optional[str] = None  # Цвет подложки бара (HEX)
    theme_id: Optional[str] = None  # Идентификатор темы/папки для текстурированных баров
    offset_x: int = 0
    offset_y: int = 0
    width: Optional[int] = None   # Переопределение ширины поля в рендере (пиксели)
    height: Optional[int] = None  # Переопределение высоты поля в рендере (пиксели)
    rotation: int = 0  # Угол поворота в градусах: 0, 90, 270 (для боковых слотов)
    show_text: bool = True   # Показывать текст поверх бара
    show_label: bool = True  # Показывать подпись (label)
    show_max: bool = True    # Показывать максимум (например в "10/20")
    font_id: Optional[str] = None      # Переопределение шрифта профиля
    font_size: Optional[int] = None    # Переопределение размера шрифта профиля
    bar_style: Literal["solid", "textured"] = "solid"  # solid = цветная заливка, textured = текстуры из theme_id

class BarProfileConfig(BaseModel):
    id: str
    name: str
    mode: Literal["solid", "textured"] = "solid"
    fg_color: str = "#00c800"
    fg_color_end: Optional[str] = None  # Для градиента (конец)
    fg_color_mid: Optional[str] = None  # Средняя точка градиента (опционально)
    gradient_stop: Optional[float] = None  # 0..1 — доля ширины, на которой заканчивается переход (по умолчанию 1)
    gradient_mid_stop: Optional[float] = None  # 0..1 — позиция средней точки (по умолчанию 0.5)
    bg_color: str = "#323232"
    border_color: str = "#000000"
    border_width: int = 1
    border_radius: int = 0

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
    led_profile_id: str = "default_static"
    led_color_source: Literal["role", "group", "custom"] = "role"
    led_custom_color: str = "#FFFFFF"


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
    has_acted: bool = False
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


class MiniatureEntry(BaseModel):
    """Глобальная запись об устройстве Omnimini (data/miniatures.json)."""

    id: str
    mac: Optional[str] = None
    name: str = ""
    notes: Optional[str] = None

    @model_validator(mode="after")
    def fill_mac_from_id(self) -> MiniatureEntry:
        if not (self.mac or "").strip():
            self.mac = self.id
        return self


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


class CombatCore(BaseModel):
    """Механика боя: акторы, очередь, раунд, движок, активность."""

    actors: List[Actor] = []
    turn_queue: List[str] = []
    current_index: int = 0
    current_pass: int = 1
    round: int = 1
    engine_type: str = "standard"
    is_manual_mode: bool = False
    system: str = "D&D 5e"
    is_active: bool = False
    active_reaction_actor_id: Optional[str] = None


class DisplayState(BaseModel):
    """Настройки отображения стола и карточек.

    Профили раскладки мини-экрана хранятся в data/systems/<system>/layout_profiles.json (см. systems API).
    """

    selected_layout_id: str = "default"
    legend: LegendConfig = Field(default_factory=LegendConfig)
    show_group_colors: bool = True
    show_faction_colors: bool = True
    table_centered: bool = True

    @model_validator(mode="before")
    @classmethod
    def strip_legacy_layout_payload(cls, data: Any) -> Any:
        """Не поднимать layout_profiles из автосейва/экспорта в доменную модель."""
        if not isinstance(data, dict):
            return data
        data.pop("layout_profiles", None)
        data.pop("layout", None)
        return data


class HardwareState(BaseModel):
    """Глобальные флаги железа (LED и т.п.)."""

    sync_led_to_ui: bool = True


class SessionMeta(BaseModel):
    """Нарративный лог, автосохранение, технический стек undo/redo."""

    history: List[LogEntry] = []
    history_cursor: int = -1
    enable_logging: bool = True
    autosave_enabled: bool = True
    history_stack: List[Dict[str, Any]] = Field(default_factory=list)
    history_index: int = -1


class CombatSession(BaseModel):
    """Корневой агрегат сессии боя (доменная декомпозиция ADR-18)."""

    model_config = ConfigDict(extra="ignore")

    core: CombatCore = Field(default_factory=CombatCore)
    display: DisplayState = Field(default_factory=DisplayState)
    hardware: HardwareState = Field(default_factory=HardwareState)
    session: SessionMeta = Field(default_factory=SessionMeta)

    LEGACY_CORE_KEYS: ClassVar[frozenset[str]] = frozenset(
        {
            "actors",
            "turn_queue",
            "current_index",
            "current_pass",
            "round",
            "engine_type",
            "is_manual_mode",
            "system",
            "is_active",
            "active_reaction_actor_id",
        }
    )
    LEGACY_DISPLAY_KEYS: ClassVar[frozenset[str]] = frozenset(
        {
            "selected_layout_id",
            "legend",
            "show_group_colors",
            "show_faction_colors",
            "table_centered",
            "layout",
            "layout_profiles",
        }
    )
    LEGACY_HARDWARE_KEYS: ClassVar[frozenset[str]] = frozenset({"sync_led_to_ui"})
    LEGACY_SESSION_KEYS: ClassVar[frozenset[str]] = frozenset(
        {
            "history",
            "history_cursor",
            "enable_logging",
            "autosave_enabled",
            "history_stack",
            "history_index",
        }
    )

    @model_validator(mode="before")
    @classmethod
    def nest_legacy_flat_payload(cls, data: Any) -> Any:
        """Плоский legacy CombatState -> вложенные core / display / hardware / session."""
        if not isinstance(data, dict):
            return data

        def _domain_as_dict(val: Any) -> Dict[str, Any]:
            """JSON dict или уже собранный под-модельный объект из kwargs конструктора."""
            if val is None:
                return {}
            if isinstance(val, dict):
                return dict(val)
            if isinstance(val, BaseModel):
                return val.model_dump()
            return {}

        # Важно: при CombatSession(core=CombatCore(...), ...) значения доменов — BaseModel, не dict.
        # Если считать это «не вложено», срабатывает ветка legacy и core собирается пустым → обнуление боя.
        has_nested = any(
            k in data
            and (
                isinstance(data.get(k), dict)
                or isinstance(data.get(k), BaseModel)
            )
            for k in ("core", "display", "hardware", "session")
        )
        if has_nested:
            out = dict(data)
            core = _domain_as_dict(out.get("core"))
            display = _domain_as_dict(out.get("display"))
            hardware = _domain_as_dict(out.get("hardware"))
            session = _domain_as_dict(out.get("session"))

            # If payload is partially nested (some domains still flat at root), fold leftovers in.
            for k in list(data.keys()):
                if k in ("core", "display", "hardware", "session"):
                    continue
                if k in cls.LEGACY_CORE_KEYS:
                    core.setdefault(k, data[k])
                elif k in cls.LEGACY_DISPLAY_KEYS:
                    display.setdefault(k, data[k])
                elif k in cls.LEGACY_HARDWARE_KEYS:
                    hardware.setdefault(k, data[k])
                elif k in cls.LEGACY_SESSION_KEYS:
                    session.setdefault(k, data[k])

            out["core"] = core
            out["display"] = display
            out["hardware"] = hardware
            out["session"] = session
            return out

        core = {k: data[k] for k in cls.LEGACY_CORE_KEYS if k in data}
        display = {k: data[k] for k in cls.LEGACY_DISPLAY_KEYS if k in data}
        hardware = {k: data[k] for k in cls.LEGACY_HARDWARE_KEYS if k in data}
        session = {k: data[k] for k in cls.LEGACY_SESSION_KEYS if k in data}
        return {"core": core, "display": display, "hardware": hardware, "session": session}


class CombatState(BaseModel):
    actors: List[Actor] = []
    turn_queue: List[str] = []
    current_index: int = 0
    current_pass: int = 1
    round: int = 1
    is_manual_mode: bool = False
    engine_type: str = "standard"
    system: str = "D&D 5e"
    layout_profiles: List[LayoutProfile] = Field(default_factory=list)
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


def combat_session_flat_undo_snapshot(session: CombatSession) -> Dict[str, Any]:
    """
    Плоский словарь полей боя для RAM-стека undo/redo (как legacy CombatState.model_dump),
    без history_stack / history_index.
    """
    d: Dict[str, Any] = {}
    d.update(session.core.model_dump())
    d.update(session.display.model_dump())
    d.update(session.hardware.model_dump())
    d.update(session.session.model_dump(exclude={"history_stack", "history_index"}))
    return d


def combat_session_to_combat_state(session: CombatSession) -> CombatState:
    """Собрать монолитный CombatState для движков и ответов API в прежнем формате."""
    c = session.core
    disp = session.display
    hw = session.hardware
    sess = session.session
    return CombatState(
        actors=list(c.actors),
        turn_queue=list(c.turn_queue),
        current_index=c.current_index,
        current_pass=c.current_pass,
        round=c.round,
        is_manual_mode=c.is_manual_mode,
        engine_type=c.engine_type,
        system=c.system,
        layout_profiles=[],
        legend=disp.legend,
        show_group_colors=disp.show_group_colors,
        show_faction_colors=disp.show_faction_colors,
        table_centered=disp.table_centered,
        sync_led_to_ui=hw.sync_led_to_ui,
        history=list(sess.history),
        history_cursor=sess.history_cursor,
        is_active=c.is_active,
        active_reaction_actor_id=c.active_reaction_actor_id,
        enable_logging=sess.enable_logging,
        autosave_enabled=sess.autosave_enabled,
    )


def combat_session_merged_with_combat_state(
    session: CombatSession, cs: CombatState
) -> CombatSession:
    """Обновить поля сессии из результата движка, сохранив стек undo/redo."""
    stack = session.session.history_stack
    idx = session.session.history_index
    return CombatSession(
        core=CombatCore(
            actors=list(cs.actors),
            turn_queue=list(cs.turn_queue),
            current_index=cs.current_index,
            current_pass=cs.current_pass,
            round=cs.round,
            engine_type=cs.engine_type,
            is_manual_mode=cs.is_manual_mode,
            system=cs.system,
            is_active=cs.is_active,
            active_reaction_actor_id=cs.active_reaction_actor_id,
        ),
        display=session.display,
        hardware=HardwareState(sync_led_to_ui=cs.sync_led_to_ui),
        session=SessionMeta(
            history=list(cs.history),
            history_cursor=cs.history_cursor,
            enable_logging=cs.enable_logging,
            autosave_enabled=cs.autosave_enabled,
            history_stack=stack,
            history_index=idx,
        ),
    )


def combat_session_public_payload(
    session: CombatSession, *, initiative_engine_locked: bool
) -> Dict[str, Any]:
    """JSON для API/WebSocket: вложенный CombatSession + служебные поля UI."""
    # Технический стек undo/redo не уходит на клиент — только can_undo / can_redo.
    data = session.model_dump(
        mode="json",
        exclude={"session": {"history_stack": True, "history_index": True}},
    )
    sess = session.session
    data["can_undo"] = sess.history_index > 0
    data["can_redo"] = sess.history_index < len(sess.history_stack) - 1
    data["initiative_engine_locked"] = initiative_engine_locked
    return data
