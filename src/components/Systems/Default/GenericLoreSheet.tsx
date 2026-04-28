import React from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../../../i18n';
import type { Actor, ColumnConfig } from '../../../types';
import { parseStatValueDraft } from '../../../utils/stats';

export type LoreSheetProps = {
  actor: Actor;
  columns: ColumnConfig[];
  systemName: string;
};

function colName(systemName: string, col: ColumnConfig): string {
  return i18n.t(`${col.key}.name`, { ns: `systems/${systemName}` }) || col.label || col.key;
}

function statDisplayValue(actor: Actor, col: ColumnConfig): string {
  const raw = actor.stats[col.key];
  if (raw == null) return '';
  const draft = parseStatValueDraft(raw);
  return Number.isFinite(draft.value) ? String(draft.value) : '';
}

export function GenericLoreSheet({ actor, columns, systemName }: LoreSheetProps) {
  const { t } = useTranslation('core', { useSuspense: false });
  const emptyDash = t('common.empty_dash');

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-start gap-4">
        <div className="shrink-0 w-20 aspect-[172/320] rounded-xl overflow-hidden border border-zinc-700 bg-zinc-900">
          {actor.portrait ? (
            <img
              src={actor.portrait}
              alt={actor.name}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-full h-full bg-zinc-900" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-lg font-semibold text-zinc-100 truncate">{actor.name}</div>
          <div className="text-xs text-zinc-500">
            {t('combat.initiative')}: <span className="text-zinc-300 tabular-nums">{actor.initiative}</span>
          </div>
        </div>
      </div>

      {columns.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {columns.map((col) => {
            const v = statDisplayValue(actor, col);
            return (
              <div key={col.key} className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-zinc-500 truncate">
                  {colName(systemName, col)}
                </div>
                <div className="text-sm text-zinc-200 tabular-nums">
                  {v !== '' ? v : emptyDash}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

