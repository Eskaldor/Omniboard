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
  group_id: string | null;
  group_mode: "sequential" | "simultaneous";
  initiative: number;
  portrait: string;
  miniature_id: string | null;
  stats: Record<string, any>;
  effects: Effect[];
  visibility: Visibility;
  hotbar: HotbarAction[];
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

export interface CombatState {
  actors: Actor[];
  turn_queue: string[];
  current_index: number;
  round: number;
  system: string;
  is_active: boolean;
  layout: MiniatureLayout;
  history?: { message: string }[];
  can_undo?: boolean;
  can_redo?: boolean;
}

export interface ColumnConfig {
  key: string;
  label: string;
  showInTable: boolean;
  group?: string;
  maxKey?: string;
}
