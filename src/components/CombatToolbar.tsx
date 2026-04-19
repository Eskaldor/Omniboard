import { Play, Square, RotateCcw, RotateCw, Trash, Undo, Redo, SkipForward, Hand } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface ManualModeToggleProps {
  isManualMode: boolean;
  onToggle: (next: boolean) => void | Promise<void>;
}

/** Toolbar control for ADR-14 manual initiative; place next to main combat actions. */
export function ManualModeToggle({ isManualMode, onToggle }: ManualModeToggleProps) {
  const { t } = useTranslation('core', { useSuspense: false });

  return (
    <button
      type="button"
      onClick={() => onToggle(!isManualMode)}
      title={t('toolbar.manual_mode_hint')}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
        isManualMode
          ? 'bg-amber-500/20 text-amber-200 border-amber-400/70 shadow-[0_0_12px_rgba(251,191,36,0.25)]'
          : 'bg-zinc-800/80 text-zinc-400 border-zinc-700 hover:border-zinc-600 hover:text-zinc-200'
      }`}
      aria-pressed={isManualMode}
    >
      <Hand size={16} className={isManualMode ? 'text-amber-300' : 'text-zinc-500'} />
      {t('toolbar.manual_mode')}
    </button>
  );
}

export interface CombatToolbarProps {
  isActive: boolean;
  /** When true, primary action becomes "next round" (POST next-turn with no body). */
  isManualMode?: boolean;
  /** Popcorn: turns are clicks; toolbar forces next round like manual. */
  engineType?: string;
  canUndo: boolean;
  canRedo: boolean;
  onStartCombat: () => void;
  onEndCombat: () => void;
  onNextTurn: () => void;
  onReset: () => void;
  onClearCombat: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

export function CombatToolbar({
  isActive,
  isManualMode = false,
  engineType = 'standard',
  canUndo,
  canRedo,
  onStartCombat,
  onEndCombat,
  onNextTurn,
  onReset,
  onClearCombat,
  onUndo,
  onRedo,
}: CombatToolbarProps) {
  const { t } = useTranslation('core', { useSuspense: false });
  const et = engineType.toLowerCase();
  const nextRoundLike = isManualMode || et === 'popcorn' || et === 'phase';

  return (
    <footer className="bg-zinc-900 border-t border-zinc-800 p-4 flex justify-between items-center">
      <div className="flex gap-2">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-300 rounded-lg font-medium transition-colors text-sm"
          title={t('toolbar.undo')}
        >
          <Undo size={16} /> {t('toolbar.undo')}
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-300 rounded-lg font-medium transition-colors text-sm"
          title={t('toolbar.redo')}
        >
          <Redo size={16} /> {t('toolbar.redo')}
        </button>
        <button onClick={onReset} className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg font-medium transition-colors text-sm">
          <RotateCcw size={16} /> {t('toolbar.reset')}
        </button>
        <button onClick={onClearCombat} className="flex items-center gap-2 px-4 py-2 bg-red-900/20 hover:bg-red-900/40 text-red-400 rounded-lg font-medium transition-colors text-sm border border-red-900/30">
          <Trash size={16} /> {t('toolbar.clear_combat')}
        </button>
        {isActive && (
          <button onClick={onEndCombat} className="flex items-center gap-2 px-4 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-lg font-medium transition-colors text-sm border border-red-900/50">
            <Square size={16} /> {t('toolbar.end_combat')}
          </button>
        )}
      </div>

      <div className="flex gap-4">
        {!isActive ? (
          <button onClick={onStartCombat} className="flex items-center gap-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors">
            <Play size={18} /> {t('start_combat')}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onNextTurn()}
            className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors"
          >
            {nextRoundLike ? (
              <>
                <RotateCw size={18} aria-hidden /> {t('toolbar.next_round')}
              </>
            ) : (
              <>
                <SkipForward size={18} aria-hidden /> {t('header.next_turn')}
              </>
            )}
          </button>
        )}
      </div>
    </footer>
  );
}
