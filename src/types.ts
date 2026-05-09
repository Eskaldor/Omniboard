export interface Effect {
  id: string;
  name: string;
  duration: number | null;
  description?: string;
  icon?: string;
  /** Optional Omnimini LED profile id (system led_profiles.json) */
  led_profile_id?: string | null;
  screen_transition?: string;
  screen_transition_color?: string;
  is_base?: boolean;
  show_on_miniature?: boolean;
  render_on_mini?: boolean;
  render_on_panel?: boolean;
  experimental_ai?: boolean;
  ai_prompt?: string;
  ai_variations?: Record<string, string>;
}

export interface AISettings {
  chat_api_key: string;
  chat_base_url: string;
  chat_model: string;
  image_api_key: string;
  image_base_url: string;
  image_model: string;
}

export interface Visibility {
  hp: boolean;
  stats: boolean;
  effects: boolean;
  name: boolean;
}

export interface HotbarAction {
  label: string;
  type: "damage" | "heal" | "effect" | "note";
  value: number | null;
  effect_id: string | null;
  effect_duration: number | null;
  source: string | null;
  targets: "self" | "selected" | "all_enemies" | "all_allies";
}

export interface Actor {
  id: string;
  name: string;
  role: "character" | "enemy" | "ally" | "neutral";
  is_revealed: boolean;
  is_pinned?: boolean;
  group_id: string | null;
  group_name?: string | null;
  group_mode: "sequential" | "simultaneous" | null;
  group_color: string | null;
  initiative: number;
  /** Popcorn / manual initiative: GM marked actor as having acted this round */
  has_acted?: boolean;
  portrait: string;
  show_portrait?: boolean;
  miniature_id: string | null;
  /** Привязка к профилю отображения миниатюры */
  layout_profile_id?: string | null;
  /** Mini-sheet template id (`sheet_profiles.json`) */
  sheet_profile_id?: string | null;
  stats: Record<string, any>;
  effects: Effect[];
  visibility: Visibility;
  hotbar: HotbarAction[];
  /** Per-action overrides for system macros (mini-sheet / rolls). */
  actions?: Record<
    string,
    {
      show_on_panel?: boolean;
      /** When true, macro chip appears in initiative tracker column. */
      show_in_tracker?: boolean;
      formula_override?: string | null;
      comment?: string | null;
      /** Display name for an actor-only macro (when `custom_formula` is set). */
      custom_name?: string | null;
      /** When set, defines a macro that exists only on this actor (merged into the action panel). */
      custom_formula?: string | null;
    }
  >;
  /**
   * When set, replaces the sheet profile's Actions-tab grouping for this actor.
   * When omitted, the active sheet template's actions tab is used.
   */
  actions_panel_override?: ActorActionsPanelOverride;
}

/** Per-actor Actions panel layout (same shape as the actions tab in `sheet_profiles`). */
export interface ActorActionsPanelOverride {
  accordions: Array<{
    name: string;
    columns: string[];
    display?: 'accordion' | 'open';
  }>;
}

/** PATCH fragment for `Actor.actions`: `null` removes a macro key (server + client merge). */
export type ActorActionsMergePatch = Partial<
  Record<string, NonNullable<Actor['actions']>[string] | null>
>;

export interface LegendConfig {
  player: string;
  enemy: string;
  ally: string;
  neutral: string;
}

export interface DisplayField {
  type: 'text' | 'bar';
  label?: string;
  value_path: string;
  max_value_path?: string;
  color?: string;
  text_color?: string;
  label_color?: string;
  bar_bg_color?: string;
  theme_id?: string;
  offset_x?: number;
  offset_y?: number;
  /** Переопределение ширины поля в рендере (пиксели) */
  width?: number;
  /** Переопределение высоты поля в рендере (пиксели) */
  height?: number;
  rotation?: number;
  /** Показывать текст поверх бара (по умолчанию true) */
  show_text?: boolean;
  /** Показывать подпись / ярлык (по умолчанию true) */
  show_label?: boolean;
  /** Показывать максимум в формате "val / max" (по умолчанию true) */
  show_max?: boolean;
  /** Переопределение шрифта профиля для этого поля */
  font_id?: string;
  /** Переопределение размера шрифта для этого поля */
  font_size?: number;
  /** Стиль бара: сплошной цвет или текстура */
  bar_style?: 'solid' | 'textured';
}

export type LedProfileMode = 'static' | 'cycle' | 'blink' | 'breathe' | 'pulse' | 'rainbow';

export interface LedProfile {
  id: string;
  name: string;
  mode: LedProfileMode;
  speed: number;
  brightness: number;
  colors: string[];
}

export interface HardwareTrigger {
  id: string;
  event_type: 'turn_start' | 'stat_change' | 'miniature_bind' | 'initiative_shift';
  target_stat?: string | null;
  led_profile_id: string;
  transition?: string | null;
  transition_color?: string | null;
  duration_type: 'time' | 'turn';
  duration_ms?: number | null;
}

export interface BarProfileConfig {
  id: string;
  name: string;
  mode: 'solid' | 'textured';
  fg_color: string;
  fg_color_end?: string | null;
  fg_color_mid?: string | null;
  gradient_stop?: number | null;
  gradient_mid_stop?: number | null;
  bg_color: string;
  border_color: string;
  border_width: number;
  border_radius?: number;
}

export interface LayoutProfile {
  id: string;
  name: string;
  frame_asset?: string;
  show_portrait: boolean;
  top1: DisplayField | null;
  top2: DisplayField | null;
  bottom1: DisplayField | null;
  bottom2: DisplayField | null;
  left1?: DisplayField | null;
  right1?: DisplayField | null;
  font_id?: string;
  font_size?: number;
  bar_height?: number;
  /** Default Omnimini LED profile id (from system led_profiles.json) */
  led_profile_id?: string;
  led_color_source?: 'role' | 'group' | 'custom';
  led_custom_color?: string;
}

export type CombatLogEntryType =
  | 'combat_start'
  | 'combat_end'
  | 'round_start'
  | 'turn_start'
  | 'hp_change'
  | 'stat_change'
  | 'effect_added'
  | 'effect_removed'
  | 'actor_joined'
  | 'actor_left'
  | 'text'
  | 'roll';

export interface CombatLogEntry {
  type: CombatLogEntryType;
  round: number;
  actor_id?: string | null;
  actor_name?: string | null;
  details: Record<string, unknown>;
  is_secret?: boolean;
}

/** Боевая механика (ADR-18 / backend CombatCore). */
export interface CombatCore {
  actors: Actor[];
  turn_queue: string[];
  current_index: number;
  current_pass: number;
  round: number;
  engine_type: string;
  is_manual_mode: boolean;
  system: string;
  is_active: boolean;
  active_reaction_actor_id: string | null;
}

/** Настройки отображения стола (ADR-18 / backend DisplayState). */
export interface DisplayState {
  /** Профиль по умолчанию для UI; акторы резолвят `layout_profile_id` через GET /api/systems/.../layouts */
  selected_layout_id?: string;
  legend: LegendConfig;
  show_group_colors: boolean;
  show_faction_colors: boolean;
  table_centered: boolean;
  /** Sticky first column in initiative table (UI). */
  sticky_first_column?: boolean;
  /** Sticky last column in initiative table (UI). */
  sticky_last_column?: boolean;
  /** Initiative table column for actor macro rolls (GM toggle). */
  show_macros_column?: boolean;
  /** Mini-sheet layout mode (config only; rendering uses this in later phases). */
  sheet_mode?: 'raw' | 'universal' | 'system';
}

/** Запись в глобальном списке Omnimini (data/miniatures.json). */
export interface MiniatureEntry {
  id: string;
  mac?: string | null;
  name: string;
  notes?: string | null;
  binding_mode: 'actor' | 'slot';
  slot_index: number;
  slot_led_mode: 'actor' | 'custom';
  slot_led_profile_id?: string | null;
  ip?: string | null;
  status?: string;
  last_seen?: string | null;
}

export interface Miniature extends MiniatureEntry {}

/** Глобальные флаги железа (ADR-18 / backend HardwareState). */
export interface HardwareState {
  sync_led_to_ui: boolean;
  /** Яркость экрана Omnimini, 1–100 (%). */
  screen_brightness?: number;
  miniatures?: Miniature[];
}

/** Результат одного броска в слоте матрицы (как RollResult с бэка). */
export interface MatrixRollResult {
  total: number;
  formula: string;
  details: string;
  is_glitch?: boolean;
  is_crit_glitch?: boolean;
}

export interface MatrixPrerollSlot {
  index: number;
  used: boolean;
  results: MatrixRollResult[];
}

/** Одно правило из matrix.json со сгенерированными слотами для актора. */
export interface MatrixRuleGroup {
  rule_id: string;
  label: string;
  display: 'single' | 'pair';
  slots: MatrixPrerollSlot[];
}

/** Лог, автосохранение, стек undo/redo (ADR-18 / backend SessionMeta). */
export interface SessionMeta {
  history: CombatLogEntry[];
  history_cursor: number;
  enable_logging: boolean;
  autosave_enabled: boolean;
  /** Не приходит в публичном API/WebSocket payload (см. combat_session_public_payload). */
  history_stack?: Record<string, unknown>[];
  history_index?: number;
  /** Предброски матрицы: actor_id → группы правил (POST /api/combat/matrix/generate). */
  prerolls?: Record<string, MatrixRuleGroup[]>;
  /** Массовый бросок инициативы (фильтры ролей). */
  initiative_include_character?: boolean;
  initiative_include_enemy?: boolean;
  initiative_include_ally?: boolean;
  initiative_include_neutral?: boolean;
  /** Переброс инициативы в начале нового раунда (не popcorn). */
  initiative_reroll_locked?: boolean;
  /** Показывать кубик у ячейки инициативы в трекере. */
  initiative_show_per_actor_dice?: boolean;
  /** ID активной кампании игроков (Player View лобби). */
  active_campaign_id?: string | null;
  /** Allow players to roll outside their turn without GM approval. */
  allow_out_of_turn_rolls?: boolean;
  /** actor_id → номер раунда: этому актёру разрешены броски вне хода до конца этого раунда. */
  actor_out_of_turn_round_pass?: Record<string, number>;
}

/**
 * Корневая сессия боя (ADR-18).
 * С бэка приходят `core` / `display` / `hardware` / `session`; плюс служебные поля на корне.
 */
export interface CombatSession {
  core: CombatCore;
  display: DisplayState;
  hardware: HardwareState;
  session: SessionMeta;
  /** См. GET /api/combat/state и WebSocket payload */
  can_undo?: boolean;
  can_redo?: boolean;
  initiative_engine_locked?: boolean;
  /** mechanics.json initiative_roll не «none» */
  initiative_roll_available?: boolean;
}

/** @deprecated Имя оставлено для постепенной миграции импортов — это `CombatSession`. */
export type CombatState = CombatSession;

/** Checkbox / action-economy group: nested booleans under `actor.stats[column.key][item.id]`. */
export type CheckboxGroupItem = { id: string; label: string; color: string };

export interface ColumnConfig {
  key: string;
  label: string;
  showInTable: boolean;
  group?: string;
  /** @deprecated Use max_key. Kept for backwards compatibility. */
  maxKey?: string;
  /** Column data type; default "number" */
  type?: 'number' | 'fraction' | 'text' | 'string' | 'checkbox_group';
  /** For text/string columns: show full value on hover tooltip (default false). */
  show_tooltip?: boolean;
  /** For `checkbox_group`: toggle buttons / indicators */
  items?: CheckboxGroupItem[];
  /** For `checkbox_group`: when the backend restores all items to `true` */
  reset_policy?: 'turn_start' | 'round_start' | 'manual';
  /** For `checkbox_group`: compact badges vs dot indicators */
  display_style?: 'badge' | 'dot';
  /** Column width e.g. "80px" or "1fr" */
  width?: string;
  min_value?: number;
  max_value?: number;
  /** Key of another stat for dynamic min (e.g. min_hp) */
  min_key?: string;
  /** Key of another stat for dynamic max (e.g. max_hp) */
  max_key?: string;
  /** If true, render as "Value / Max" in table when max_key is set */
  display_as_fraction?: boolean;
  /** Read-only in the table/mini sheet; usually derived or system-owned. */
  is_readonly?: boolean;
  /** Enables the hover dice button in the tracker table. */
  is_rollable?: boolean;
  /** Custom roll expression, e.g. "1d20 + [value]". */
  roll_formula?: string | null;
  /** Formula id from mechanics.json; value is derived and has no editable base. */
  computed_formula_id?: string | null;
  log_changes?: boolean;
  log_color?: string;
  show_in_mini_sheet?: boolean;
  is_advanced?: boolean;
}

/** Same as ColumnConfig — alias for schema / docs naming. */
export type ColumnDefinition = ColumnConfig;
