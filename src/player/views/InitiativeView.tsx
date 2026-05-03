import React from 'react';
import { Loader2 } from 'lucide-react';
import type { Actor } from '../../types';
import type { PublicCombatState } from '../types';

interface Props {
  state: PublicCombatState | null;
  myActorId: string;
}

const ROLE_DOT: Record<string, string> = {
  character: 'bg-emerald-500',
  ally: 'bg-blue-500',
  enemy: 'bg-red-500',
  neutral: 'bg-zinc-500',
};

function hpDisplay(actor: Actor): string {
  const hp = actor.stats['hp'];
  const maxHp = actor.stats['max_hp'];
  if (!hp) return '';
  const val = typeof hp === 'object' && 'value' in hp ? (hp as { value: number }).value : hp;
  if (!maxHp) return String(val);
  const max = typeof maxHp === 'object' && 'value' in maxHp ? (maxHp as { value: number }).value : maxHp;
  return `${val}/${max}`;
}

export function InitiativeView({ state, myActorId }: Props) {
  if (!state) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={28} className="animate-spin text-zinc-600" />
      </div>
    );
  }

  const { actors, turn_queue, current_index, is_active, round } = state.core;
  const currentActorId = is_active ? turn_queue[current_index] : null;

  const sorted = [...actors].sort((a, b) => b.initiative - a.initiative);

  return (
    <div className="px-4 py-5">
      {/* Round badge */}
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs text-zinc-500 uppercase tracking-widest">Раунд</span>
        <span className="text-2xl font-bold text-zinc-100 tabular-nums">{round}</span>
      </div>

      {!is_active && (
        <p className="text-center text-zinc-500 text-sm mb-4">Бой ещё не начат</p>
      )}

      <div className="space-y-2">
        {sorted.map((actor) => {
          const isCurrent = actor.id === currentActorId;
          const isMe = actor.id === myActorId;
          const dot = ROLE_DOT[actor.role] ?? ROLE_DOT.neutral;
          const hp = hpDisplay(actor);

          return (
            <div
              key={actor.id}
              className={[
                'flex items-center gap-3 px-4 py-3 rounded-2xl border transition-colors',
                isCurrent
                  ? 'border-amber-500/60 bg-amber-500/10'
                  : isMe
                  ? 'border-emerald-500/40 bg-emerald-500/5'
                  : 'border-zinc-800 bg-zinc-900/60',
              ].join(' ')}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />

              <div className="flex-1 min-w-0">
                <div className={`font-medium truncate ${isMe ? 'text-emerald-400' : 'text-zinc-200'}`}>
                  {actor.name}
                  {isMe && <span className="ml-2 text-[10px] text-emerald-500/80 uppercase tracking-wide">вы</span>}
                </div>
              </div>

              {hp && (
                <span className="text-xs text-zinc-400 tabular-nums shrink-0">HP {hp}</span>
              )}

              <span className="text-sm font-semibold text-zinc-300 tabular-nums w-8 text-right shrink-0">
                {actor.initiative}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
