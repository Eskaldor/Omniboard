export interface Effect {
  id: string;
  name: string;
  duration: number | null;
  description?: string;
  icon?: string;
  is_base?: boolean;
  show_on_miniature?: boolean;
  render_on_mini?: boolean;
  render_on_panel?: boolean;
  experimental_ai?: boolean;
  ai_prompt?: string;
  ai_variations?: Record<string, string>;
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
  portrait: string;
  show_portrait?: boolean;
  miniature_id: string | null;
  /** Привязка к профилю отображения миниатюры */
  layout_profile_id?: string | null;
  stats: Record<string, any>;
  effects: Effect[];
  visibility: Visibility;
  hotbar: HotbarAction[];
}

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

export interface LedProfile {
  id: string;
  name: string;
  mode: string;
  speed: number;
  brightness: number;
  colors: string[];
}

export interface LedTriggerRule {
  id: string;
  event_type: 'turn_start' | 'stat_change';
  target_stat?: string | null;
  led_profile_id: string;
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
  | 'text';

export interface CombatLogEntry {
  type: CombatLogEntryType;
  round: number;
  actor_id?: string | null;
  actor_name?: string | null;
  details: Record<string, unknown>;
}

export interface CombatState {
  actors: Actor[];
  turn_queue: string[];
  current_index: number;
  round: number;
  system: string;
  is_active: boolean;
  /** Список профилей отображения миниатюр */
  layout_profiles: LayoutProfile[];
  /** Единый профиль (обратная совместимость, может приходить с бэка как default) */
  layout?: LayoutProfile;
  legend?: LegendConfig;
  show_group_colors?: boolean;
  show_faction_colors?: boolean;
  history?: CombatLogEntry[];
  enable_logging?: boolean;
  can_undo?: boolean;
  can_redo?: boolean;
  table_centered?: boolean;
  autosave_enabled?: boolean;
}

export interface ColumnConfig {
  key: string;
  label: string;
  showInTable: boolean;
  group?: string;
  /** @deprecated Use max_key. Kept for backwards compatibility. */
  maxKey?: string;
  /** Column data type; default "number" */
  type?: 'number' | 'text' | 'string';
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
  log_changes?: boolean;
  log_color?: string;
  show_in_mini_sheet?: boolean;
  is_advanced?: boolean;
}
