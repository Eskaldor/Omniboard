import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Actor, ColumnConfig } from '../../types';

export function ExpertActorEditor({
  actor,
  columns,
}: {
  actor: Actor;
  columns: ColumnConfig[];
}) {
  const { t } = useTranslation('core', { useSuspense: false });

  return (
    <div className="p-5 space-y-4">
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
        <div className="text-sm text-amber-200">{t('modals.expert_warning')}</div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
        <div className="text-xs text-zinc-500">{actor.name}</div>
        <div className="text-[10px] text-zinc-600 mt-1">
          {t('modals.all_stats')}: <span className="font-mono">{columns.length}</span>
        </div>
      </div>
    </div>
  );
}

