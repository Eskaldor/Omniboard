import React from 'react';
import { Lock, User } from 'lucide-react';
import type { PlayerCharacterSummary } from '../types';

const ROLE_COLORS: Record<string, string> = {
  character: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  ally: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  enemy: 'bg-red-500/20 text-red-400 border-red-500/30',
  neutral: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
};

const ROLE_LABELS: Record<string, string> = {
  character: 'Персонаж',
  ally: 'Союзник',
  enemy: 'Враг',
  neutral: 'Нейтрал',
};

interface Props {
  character: PlayerCharacterSummary;
  onClaim: () => void;
  isLoading?: boolean;
}

export function CharacterCard({ character, onClaim, isLoading }: Props) {
  const roleClass = ROLE_COLORS[character.role] ?? ROLE_COLORS.neutral;

  return (
    <button
      onClick={character.is_claimed ? undefined : onClaim}
      disabled={character.is_claimed || isLoading}
      className={[
        'relative flex items-center gap-3 w-full rounded-2xl border p-4 text-left transition-all',
        character.is_claimed
          ? 'border-zinc-700/50 bg-zinc-900/50 opacity-50 cursor-not-allowed'
          : 'border-zinc-700 bg-zinc-900 active:scale-[0.98] active:bg-zinc-800',
        isLoading ? 'opacity-70 pointer-events-none' : '',
      ].join(' ')}
    >
      {/* Portrait */}
      <div className="shrink-0 w-14 h-14 rounded-xl overflow-hidden border border-zinc-700 bg-zinc-800">
        {character.portrait ? (
          <img
            src={character.portrait}
            alt={character.name}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600">
            <User size={24} />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-zinc-100 truncate">{character.name}</div>
        <span className={`mt-1 inline-block text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border ${roleClass}`}>
          {ROLE_LABELS[character.role] ?? character.role}
        </span>
      </div>

      {/* Claimed badge */}
      {character.is_claimed && (
        <div className="shrink-0 flex items-center gap-1 text-xs text-zinc-500">
          <Lock size={12} />
          <span>Занято</span>
        </div>
      )}
    </button>
  );
}
