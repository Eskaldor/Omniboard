import React, { useState, useEffect } from 'react';
import { BookOpen, Cpu, List, X } from 'lucide-react';
import { Actor, ColumnConfig } from '../../types';
import { useCombatState } from '../../contexts/CombatStateContext';
import { useTranslation } from 'react-i18next';
import { DefaultSystemSheet } from './DefaultSystemSheet';
import { ExpertActorEditor } from './ExpertActorEditor';
import { getSystemSheet } from '../Systems/SheetRegistry';

export function MiniSheetModal({
  actor,
  columns,
  systemName,
  onClose,
  onUpdate,
  onPortraitClick,
}: {
  actor: Actor;
  columns: ColumnConfig[];
  systemName: string;
  onClose: () => void;
  onUpdate?: (id: string, field: string, value: unknown) => void;
  onPortraitClick?: () => void;
}) {
  const { t } = useTranslation('core', { useSuspense: false });
  const { state } = useCombatState();
  const liveActor = state?.core.actors.find((a) => a.id === actor.id) ?? actor;
  const [localName, setLocalName] = useState(liveActor.name);
  const [viewMode, setViewMode] = useState<'lore' | 'gm' | 'expert'>('gm');
  const miniSheetCols = columns.filter((c) => c.show_in_mini_sheet);

  useEffect(() => {
    setLocalName(liveActor.name);
  }, [liveActor.name]);

  const LoreSheet = getSystemSheet(systemName);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
          <div className="flex items-center gap-2">
            <span className="text-zinc-500 font-medium">{t('modals.mini_sheet')}:</span>
            <input
              type="text"
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              onBlur={() => onUpdate?.(liveActor.id, 'name', localName)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              autoFocus
              className="bg-transparent border-b border-dashed border-zinc-600 hover:border-zinc-400 focus:border-emerald-500 focus:outline-none text-lg font-medium text-zinc-100 px-1 w-48 transition-colors"
            />
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-row">
          <div className="w-12 border-r border-zinc-800 bg-zinc-950/40 flex flex-col items-center py-2 gap-1">
            <button
              type="button"
              title={t('modals.tab_lore')}
              onClick={() => setViewMode('lore')}
              className={`p-2 rounded-lg transition-colors ${
                viewMode === 'lore'
                  ? 'text-emerald-500 bg-zinc-800/50'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30'
              }`}
            >
              <BookOpen size={18} />
            </button>
            <button
              type="button"
              title={t('modals.tab_gm')}
              onClick={() => setViewMode('gm')}
              className={`p-2 rounded-lg transition-colors ${
                viewMode === 'gm'
                  ? 'text-emerald-500 bg-zinc-800/50'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30'
              }`}
            >
              <List size={18} />
            </button>
            <button
              type="button"
              title={t('modals.tab_expert')}
              onClick={() => setViewMode('expert')}
              className={`p-2 rounded-lg transition-colors ${
                viewMode === 'expert'
                  ? 'text-emerald-500 bg-zinc-800/50'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30'
              }`}
            >
              <Cpu size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[70vh] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {viewMode === 'lore' ? (
              <LoreSheet actor={liveActor} columns={miniSheetCols} systemName={systemName} />
            ) : viewMode === 'gm' ? (
              <DefaultSystemSheet
                actor={liveActor}
                columns={miniSheetCols}
                systemName={systemName}
                onUpdate={onUpdate}
                onOpenPortraitPicker={onPortraitClick}
              />
            ) : (
              <ExpertActorEditor actor={liveActor} columns={columns} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
