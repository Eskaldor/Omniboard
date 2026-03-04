import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Actor, ColumnConfig } from '../../types';
import { useCombatState } from '../../contexts/CombatStateContext';
import { useTranslation } from 'react-i18next';
import { DefaultSystemSheet } from './DefaultSystemSheet';

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
  const liveActor = state?.actors.find((a) => a.id === actor.id) ?? actor;
  const [localName, setLocalName] = useState(liveActor.name);
  const miniSheetCols = columns.filter((c) => c.show_in_mini_sheet);

  useEffect(() => {
    setLocalName(liveActor.name);
  }, [liveActor.name]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
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
        <div className="overflow-y-auto max-h-[70vh] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <DefaultSystemSheet
            actor={liveActor}
            columns={miniSheetCols}
            systemName={systemName}
            onUpdate={onUpdate}
            onOpenPortraitPicker={onPortraitClick}
          />
        </div>
      </div>
    </div>
  );
}
