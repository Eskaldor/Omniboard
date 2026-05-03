import React from 'react';
import { Loader2 } from 'lucide-react';
import type { CombatLogEntry } from '../../types';
import type { PublicCombatState } from '../types';

interface Props {
  state: PublicCombatState | null;
}

const LOG_ICONS: Record<string, string> = {
  combat_start: '⚔️',
  combat_end: '🏁',
  round_start: '🔔',
  turn_start: '▶️',
  hp_change: '❤️',
  stat_change: '📊',
  effect_added: '✨',
  effect_removed: '💨',
  actor_joined: '➕',
  actor_left: '➖',
  roll: '🎲',
  text: '💬',
};

function logLabel(entry: CombatLogEntry): string {
  const d = entry.details as Record<string, unknown>;
  switch (entry.type) {
    case 'hp_change': {
      const delta = d['delta'] as number | undefined;
      if (!delta) return `${entry.actor_name ?? '?'}: HP изменился`;
      const sign = delta > 0 ? '+' : '';
      return `${entry.actor_name ?? '?'}: HP ${sign}${delta}`;
    }
    case 'roll': {
      const expr = d['expression'] as string | undefined;
      const total = d['total'] as number | undefined;
      return `${entry.actor_name ?? '?'}: ${expr ?? 'бросок'} → ${total ?? '?'}`;
    }
    case 'effect_added':
      return `${entry.actor_name ?? '?'}: +эффект "${d['effect_name'] ?? '?'}"`;
    case 'effect_removed':
      return `${entry.actor_name ?? '?'}: -эффект "${d['effect_name'] ?? '?'}"`;
    case 'round_start':
      return `Раунд ${entry.round}`;
    case 'turn_start':
      return `Ход: ${entry.actor_name ?? '?'}`;
    case 'combat_start':
      return 'Бой начался';
    case 'combat_end':
      return 'Бой завершён';
    case 'text':
      return (d['text'] as string | undefined) ?? '';
    default:
      return entry.type;
  }
}

export function LogView({ state }: Props) {
  if (!state) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={28} className="animate-spin text-zinc-600" />
      </div>
    );
  }

  const history = [...(state.session?.history ?? [])].reverse();

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <p className="text-zinc-500 text-sm">Лог пуст</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-5 space-y-2">
      {history.map((entry, i) => {
        const icon = LOG_ICONS[entry.type] ?? '•';
        return (
          <div key={i} className="flex items-start gap-3 rounded-xl bg-zinc-900/60 border border-zinc-800 px-3 py-2.5">
            <span className="text-base shrink-0">{icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-zinc-200 leading-snug">{logLabel(entry)}</p>
              <span className="text-[10px] text-zinc-600">раунд {entry.round}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
