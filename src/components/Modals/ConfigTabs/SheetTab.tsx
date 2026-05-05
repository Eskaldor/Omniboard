import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SheetSummaryEditor } from './SheetSummaryEditor';
import { SheetActionsEditor } from './SheetActionsEditor';
import { SheetHeroEditor } from './SheetHeroEditor';

export type SheetMode = 'raw' | 'universal' | 'system';

type SheetSubTabId = 'system_view' | 'summary' | 'actions';

const SHEET_SUB_TABS: SheetSubTabId[] = ['system_view', 'summary', 'actions'];

export function SheetTab() {
  const { t } = useTranslation('core', { useSuspense: false });
  const [activeSubTab, setActiveSubTab] = useState<SheetSubTabId>('summary');

  const pillBase =
    'px-3 py-2 rounded-lg text-sm font-medium border transition-colors whitespace-nowrap';
  const pillInactive = 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700/80 hover:border-zinc-600';
  const pillActive = 'bg-emerald-600 text-white border-emerald-500 shadow-sm shadow-emerald-900/30';

  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
        {t('config_modal.section_sheet')}
      </div>

      <div className="flex flex-wrap gap-2">
        {SHEET_SUB_TABS.map((id) => {
          const active = activeSubTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveSubTab(id)}
              className={`${pillBase} ${active ? pillActive : pillInactive}`}
            >
              {t(`config_modal.sheet_subtab_${id === 'system_view' ? 'system' : id}`)}
            </button>
          );
        })}
      </div>

      <div className="bg-zinc-950/40 border border-zinc-800 rounded-xl p-4 min-h-[140px]">
        {activeSubTab === 'system_view' && <SheetHeroEditor />}
        {activeSubTab === 'summary' && <SheetSummaryEditor />}
        {activeSubTab === 'actions' && <SheetActionsEditor />}
      </div>
    </div>
  );
}
