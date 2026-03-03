export interface Effect {
  id: string;
  name: string;
  duration: number | null;
  description?: string;
  show_on_miniature: boolean;
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
}

export interface MiniatureLayout {
  show_portrait: boolean;
  top1: DisplayField | null;
  top2: DisplayField | null;
  bottom1: DisplayField | null;
  bottom2: DisplayField | null;
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
  layout: MiniatureLayout;
  legend?: LegendConfig;
  show_group_colors?: boolean;
  show_faction_colors?: boolean;
  history?: CombatLogEntry[];
  enable_logging?: boolean;
  can_undo?: boolean;
  can_redo?: boolean;
  table_centered?: boolean;
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
