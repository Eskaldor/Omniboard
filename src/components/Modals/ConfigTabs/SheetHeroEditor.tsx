import React, { useCallback, useMemo } from 'react';
import { Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type SystemSheetProfile } from '../../../hooks/useSystemSheetProfiles';
import { useSystemColumns } from '../../../hooks/useSystemColumns';
import type { ColumnConfig } from '../../../types';

function columnLabel(columns: ColumnConfig[], key: string): string {
  const col = columns.find((c) => c.key === key);
  return (col?.label || '').trim() || key;
}

/** Editor for `hero_columns` — stat keys shown as chips in PlayerHeroHeader. */
export function SheetHeroEditor({
  system,
  localProfiles,
  setLocalProfiles,
  selectedProfileId,
  profilesLoading,
  saving,
  canSave,
  onSave,
}: {
  system: string;
  localProfiles: SystemSheetProfile[];
  setLocalProfiles: React.Dispatch<React.SetStateAction<SystemSheetProfile[]>>;
  selectedProfileId: string;
  profilesLoading: boolean;
  saving: boolean;
  canSave: boolean;
  onSave: () => void | Promise<void>;
}) {
  const { t } = useTranslation('core', { useSuspense: false });
  const { columns, loading: columnsLoading } = useSystemColumns(system);

  const selectedProfile = localProfiles.find((p) => p.id === selectedProfileId);
  const heroColumns: string[] = useMemo(
    () => (Array.isArray(selectedProfile?.hero_columns) ? selectedProfile!.hero_columns : []),
    [selectedProfile],
  );

  const patchHeroColumns = useCallback(
    (fn: (prev: string[]) => string[]) => {
      setLocalProfiles((prev) =>
        prev.map((p) => {
          if (p.id !== selectedProfileId) return p;
          return { ...p, hero_columns: fn(p.hero_columns ?? []) };
        }),
      );
    },
    [selectedProfileId],
  );

  const addColumn = (key: string) => {
    if (!key) return;
    patchHeroColumns((prev) => (prev.includes(key) ? prev : [...prev, key]));
  };

  const removeColumn = (key: string) => {
    patchHeroColumns((prev) => prev.filter((k) => k !== key));
  };

  const sortedAvailable = useMemo(() => {
    const usedSet = new Set(heroColumns);
    return [...columns]
      .filter((c) => !usedSet.has(c.key) && c.type !== 'text' && c.type !== 'string')
      .sort((a, b) => (a.label || a.key).localeCompare(b.label || b.key, undefined, { sensitivity: 'base' }));
  }, [columns, heroColumns]);

  const pickKey = `pick-hero-${heroColumns.join(',')}`;

  const inputClass =
    'w-full py-1.5 px-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none';

  if (!system) {
    return <div className="text-sm text-zinc-500">{t('config_modal.sheet_template_need_system')}</div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500 leading-relaxed">
        {t('config_modal.sheet_hero_intro')}
      </p>

      {profilesLoading ? (
        <div className="text-xs text-zinc-500">{t('modals.mini_sheet_layout_loading')}</div>
      ) : !selectedProfile ? (
        <div className="text-xs text-zinc-500">{t('config_modal.sheet_summary_layout_unavailable')}</div>
      ) : (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
          {/* Current chips */}
          <div className="space-y-2">
            <span className="text-[11px] text-zinc-500 uppercase tracking-wider">
              {t('config_modal.sheet_hero_selected_columns')}
            </span>
            {heroColumns.length === 0 ? (
              <div className="text-xs text-zinc-600">{t('config_modal.sheet_hero_no_columns')}</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {heroColumns.map((key) => (
                  <span
                    key={key}
                    className="inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded-md text-xs bg-indigo-500/15 text-indigo-200 border border-indigo-500/35"
                  >
                    <span className="truncate max-w-[10rem]" title={key}>
                      {columnLabel(columns, key)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeColumn(key)}
                      className="shrink-0 p-0.5 rounded hover:bg-indigo-500/25 text-indigo-300/90"
                      title={t('config_modal.sheet_summary_remove_column')}
                    >
                      <X size={14} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Add column */}
          <div>
            <select
              key={pickKey}
              defaultValue=""
              disabled={sortedAvailable.length === 0 || columnsLoading}
              onChange={(e) => {
                const key = e.target.value;
                if (key) addColumn(key);
              }}
              className={`${inputClass} py-2 disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <option value="">{t('config_modal.sheet_hero_select_column')}</option>
              {sortedAvailable.map((c) => (
                <option key={c.key} value={c.key}>
                  {(c.label || '').trim() || c.key}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="pt-2 border-t border-zinc-800 flex justify-end">
        <button
          type="button"
          disabled={saving || !canSave || profilesLoading || localProfiles.length === 0}
          onClick={() => void onSave()}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/30 disabled:opacity-50 disabled:pointer-events-none transition-colors"
        >
          {saving ? t('gm_console.saving') : t('config_modal.sheet_template_save')}
        </button>
      </div>
    </div>
  );
}
