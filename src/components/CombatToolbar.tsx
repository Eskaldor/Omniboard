import {
  Play,
  Square,
  RotateCw,
  Undo,
  Redo,
  SkipForward,
  Hand,
  Dices,
  Trash2,
} from 'lucide-react';
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
  actorCount: number;
  /** When true, primary action becomes "next round" (POST next-turn with no body). */
  isManualMode?: boolean;
  /** Popcorn: turns are clicks; toolbar forces next round like manual. */
  engineType?: string;
  canUndo: boolean;
  canRedo: boolean;
  onStartCombat: () => void;
  onEndCombat: () => void;
  onNextTurn: () => void;
  onOpenClearCombatModal: () => void;
  onUndo: () => void;
  onRedo: () => void;
  /** Active combat: generate matrix prerolls (POST /api/combat/matrix/generate). */
  onGenerateMatrix?: () => void | Promise<void>;
}

export function CombatToolbar({
  isActive,
  actorCount,
  isManualMode = false,
  engineType = 'standard',
  canUndo,
  canRedo,
  onStartCombat,
  onEndCombat,
  onNextTurn,
  onOpenClearCombatModal,
  onUndo,
  onRedo,
  onGenerateMatrix,
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
      </div>

      <div className="flex gap-3 items-center flex-wrap justify-end">
        {!isActive && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onStartCombat()}
              className="flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-colors bg-emerald-600 text-white hover:bg-emerald-500"
            >
              <Play size={18} aria-hidden /> {t('start_combat')}
            </button>
            {actorCount > 0 && (
              <button
                type="button"
                onClick={() => onOpenClearCombatModal()}
                title={t('toolbar.clear_table')}
                className="flex items-center gap-2 rounded-lg border border-zinc-700/80 bg-zinc-800/40 px-3 py-2 text-sm font-medium text-zinc-400 transition-colors hover:border-red-900/45 hover:bg-red-950/25 hover:text-red-300 sm:px-4"
              >
                <Trash2 size={16} aria-hidden className="shrink-0" />
                <span className="hidden sm:inline">{t('toolbar.clear_table')}</span>
              </button>
            )}
          </div>
        )}
        {isActive && (
          <>
            {onGenerateMatrix && (
              <button
                type="button"
                onClick={() => void onGenerateMatrix()}
                title={t('toolbar.generate_matrix_hint')}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg font-medium transition-colors text-sm border border-zinc-700"
              >
                <Dices size={18} aria-hidden />
                <span className="hidden sm:inline">{t('toolbar.generate_matrix')}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onEndCombat()}
              className="flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-colors border border-red-800/60 bg-red-950/50 text-red-100 hover:bg-red-950/70"
            >
              <Square size={18} aria-hidden /> {t('toolbar.stop_combat')}
            </button>
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
          </>
        )}
      </div>
    </footer>
  );
}
