import React from 'react';
import { useTranslation } from 'react-i18next';

export type SheetMode = 'raw' | 'universal' | 'system';

const SHEET_MODES: SheetMode[] = ['raw', 'universal', 'system'];

export function SheetTab({
  sheetMode,
  onSetSheetMode,
}: {
  sheetMode: SheetMode;
  onSetSheetMode: (mode: SheetMode) => Promise<void>;
}) {
  const { t } = useTranslation('core', { useSuspense: false });

  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
        {t('config_modal.section_sheet')}
      </div>

      <div className="bg-zinc-950/40 border border-zinc-800 rounded-xl p-3 space-y-2">
        <div className="text-xs text-zinc-500">{t('config_modal.sheet_mode_title')}</div>
        <div className="flex flex-col gap-2">
          {SHEET_MODES.map((mode) => {
            const active = sheetMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  if (!active) void onSetSheetMode(mode);
                }}
                className={`w-full text-left rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                  active
                    ? 'bg-emerald-600/15 text-emerald-200 border-emerald-500/40'
                    : 'bg-zinc-900/50 text-zinc-300 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/30'
                }`}
              >
                {t(`config_modal.sheet_mode_${mode}`)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
