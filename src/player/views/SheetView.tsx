import React from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import type { PlayerAuth, PublicCombatState } from '../types';
import { ActorFullSheet } from '../../components/Sheets/ActorFullSheet';
import { useSystemColumns } from '../../hooks/useSystemColumns';
import { usePlayerActor } from '../hooks/usePlayerActor';

interface Props {
  auth: PlayerAuth;
  system: string;
  /** Live public WS state — when present, the actor is read from it directly so GM edits flow without a refetch. */
  state?: PublicCombatState | null;
}

export function SheetView({ auth, system, state = null }: Props) {
  const { actor, loading, error, refetch } = usePlayerActor(auth, state);

  const { columns } = useSystemColumns(system);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={28} className="animate-spin text-zinc-600" />
      </div>
    );
  }

  if (!actor) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center px-6">
        <p className="text-zinc-400 text-sm">{error ?? 'Персонаж не найден'}</p>
        <button
          onClick={refetch}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-800 text-zinc-200 text-sm active:bg-zinc-700"
        >
          <RefreshCw size={14} />
          Повторить
        </button>
      </div>
    );
  }

  // Same filter as MiniSheetModal: show only columns flagged for the mini-sheet.
  const sheetCols = columns.filter((c) => c.show_in_mini_sheet);

  return (
    <ActorFullSheet
      actor={actor}
      columns={sheetCols}
      systemName={system}
    />
  );
}
