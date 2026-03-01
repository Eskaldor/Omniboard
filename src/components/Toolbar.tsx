import { Play, Square, RotateCcw, Trash, Undo, Redo, SkipForward } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface ToolbarProps {
  isActive: boolean;
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

export function Toolbar({
  isActive,
  canUndo,
  canRedo,
  onStartCombat,
  onEndCombat,
  onNextTurn,
  onReset,
  onClearCombat,
  onUndo,
  onRedo,
}: ToolbarProps) {
  const { t } = useTranslation('core', { useSuspense: false });

  return (
    <footer className="bg-zinc-900 border-t border-zinc-800 p-4 flex justify-between items-center">
      <div className="flex gap-2">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-300 rounded-lg font-medium transition-colors text-sm"
          title="Undo"
        >
          <Undo size={16} /> Undo
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-300 rounded-lg font-medium transition-colors text-sm"
          title="Redo"
        >
          <Redo size={16} /> Redo
        </button>
        <button onClick={onReset} className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg font-medium transition-colors text-sm">
          <RotateCcw size={16} /> Reset
        </button>
        <button onClick={onClearCombat} className="flex items-center gap-2 px-4 py-2 bg-red-900/20 hover:bg-red-900/40 text-red-400 rounded-lg font-medium transition-colors text-sm border border-red-900/30">
          <Trash size={16} /> Clear Combat
        </button>
        {isActive && (
          <button onClick={onEndCombat} className="flex items-center gap-2 px-4 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-lg font-medium transition-colors text-sm border border-red-900/50">
            <Square size={16} /> End Combat
          </button>
        )}
      </div>

      <div className="flex gap-4">
        {!isActive ? (
          <button onClick={onStartCombat} className="flex items-center gap-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors">
            <Play size={18} /> {t('start_combat', 'Start Combat')}
          </button>
        ) : (
          <button onClick={onNextTurn} className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors">
            <SkipForward size={18} /> Next Turn
          </button>
        )}
      </div>
    </footer>
  );
}
