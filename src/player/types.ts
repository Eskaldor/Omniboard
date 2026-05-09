import type { Actor, CombatState, ColumnConfig } from '../types';

export interface PlayerAuth {
  token: string;
  actorId: string;
}

export interface PlayerCharacterSummary {
  id: string;
  name: string;
  portrait: string;
  role: 'character' | 'enemy' | 'ally' | 'neutral';
  system: string;
  is_claimed: boolean;
}

export interface PlayerSessionInfo {
  system: string;
  active_campaign_id: string | null;
  is_combat_active: boolean;
  round: number;
}

export type PlayerTab = 'sheet' | 'actions' | 'dice' | 'initiative' | 'log';

export interface SheetViewProps {
  actor: Actor | null;
  columns: ColumnConfig[];
  system: string;
}

export interface PublicCombatState extends CombatState {
  active_campaign_id?: string | null;
}
