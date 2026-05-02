import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import {
  normalizeSheetAccordionDisplay,
  saveSystemSheetProfiles,
  useSystemSheetProfiles,
  type SheetAccordionSectionDisplay,
  type SystemSheetLayoutTab,
  type SystemSheetProfile,
} from '../../../hooks/useSystemSheetProfiles';
import { useSystemColumns } from '../../../hooks/useSystemColumns';

type DraftAccordion = { name: string; columns: string[]; display: SheetAccordionSectionDisplay };
type DraftTab = {
  id: string;
  name: string;
  content?: string;
  accordions: DraftAccordion[];
};

function tabsFromDefaultProfile(profiles: SystemSheetProfile[]): SystemSheetLayoutTab[] {
  const p = profiles.find((x) => x.id === 'default') ?? profiles[0];
  return p?.tabs ?? [];
}

function mergeSerializedTabsIntoDefaultProfile(
  profiles: SystemSheetProfile[],
  tabs: SystemSheetLayoutTab[],
  defaultDisplayName: string,
): SystemSheetProfile[] {
  const next = [...profiles];
  const idx = next.findIndex((p) => p.id === 'default');
  if (idx >= 0) {
    next[idx] = { ...next[idx], tabs };
  } else {
    next.unshift({
      id: 'default',
      name: defaultDisplayName,
      tabs,
    });
  }
  return next;
}

function cloneFromTabs(layoutTabs: SystemSheetLayoutTab[]): { tabs: DraftTab[] } {
  const tabs = layoutTabs ?? [];
  return {
    tabs: tabs.map((tab) => ({
      id: tab.id ?? '',
      name: typeof tab.name === 'string' ? tab.name : '',
      content: tab.content,
      accordions: (tab.accordions ?? []).map((a) => ({
        name: typeof a.name === 'string' ? a.name : '',
        columns: Array.isArray(a.columns) ? [...a.columns] : [],
        display: normalizeSheetAccordionDisplay(a.display),
      })),
    })),
  };
}

function serializeDraft(draft: { tabs: DraftTab[] }): SystemSheetLayoutTab[] {
  const tabs: SystemSheetLayoutTab[] = draft.tabs
    .filter((t) => t.id.trim().length > 0)
    .map((tab) => {
      const out: SystemSheetLayoutTab = {
        id: tab.id.trim(),
      };
      const nm = tab.name.trim();
      if (nm) out.name = nm;
      const ct = tab.content?.trim();
      if (ct) out.content = ct;
      const accs = tab.accordions
        .filter((a) => (a.name.trim().length > 0 || a.columns.length > 0))
        .map((a) => ({
          name: a.name.trim() || '—',
          columns: [...a.columns],
          display: normalizeSheetAccordionDisplay(a.display),
        }));
      if (accs.length > 0) out.accordions = accs;
      return out;
    });
  return tabs;
}

export function SheetTemplateBuilder({ systemName }: { systemName: string }) {
  const { t } = useTranslation('core', { useSuspense: false });
  const name = systemName.trim();
  const { profiles, loading: layoutLoading, refetchProfiles } = useSystemSheetProfiles(name);
  const { columns, loading: columnsLoading } = useSystemColumns(name);

  const [draft, setDraft] = useState<{ tabs: DraftTab[] }>({ tabs: [] });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (layoutLoading) return;
    setDraft(cloneFromTabs(tabsFromDefaultProfile(profiles)));
  }, [profiles, layoutLoading]);

  const inputClass =
    'w-full py-1.5 px-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none';

  const toggleAccordionColumn = (
    tabIdx: number,
    accIdx: number,
    columnKey: string,
    checked: boolean,
  ) => {
    setDraft((prev) => ({
      tabs: prev.tabs.map((tab, ti) => {
        if (ti !== tabIdx) return tab;
        const accordions = tab.accordions.map((acc, ai) => {
          if (ai !== accIdx) return acc;
          const nextCols = new Set(acc.columns);
          if (checked) nextCols.add(columnKey);
          else nextCols.delete(columnKey);
          const order = columns.map((c) => c.key).filter((k) => nextCols.has(k));
          const extras = [...nextCols].filter((k) => !order.includes(k));
          return { ...acc, columns: [...order, ...extras.sort()] };
        });
        return { ...tab, accordions };
      }),
    }));
  };

  const addTab = () => {
    const slug = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : String(Date.now());
    setDraft((prev) => ({
      tabs: [
        ...prev.tabs,
        {
          id: `tab_${slug}`,
          name: '',
          accordions: [{ name: '', columns: [], display: 'open' }],
        },
      ],
    }));
  };

  const removeTab = (tabIdx: number) => {
    setDraft((prev) => ({
      tabs: prev.tabs.filter((_, i) => i !== tabIdx),
    }));
  };

  const addAccordion = (tabIdx: number) => {
    setDraft((prev) => ({
      tabs: prev.tabs.map((tab, ti) =>
        ti === tabIdx
          ? { ...tab, accordions: [...tab.accordions, { name: '', columns: [], display: 'open' }] }
          : tab,
      ),
    }));
  };

  const removeAccordion = (tabIdx: number, accIdx: number) => {
    setDraft((prev) => ({
      tabs: prev.tabs.map((tab, ti) =>
        ti === tabIdx
          ? { ...tab, accordions: tab.accordions.filter((_, ai) => ai !== accIdx) }
          : tab,
      ),
    }));
  };

  const handleSave = async () => {
    if (!name) return;
    if (draft.tabs.some((tab) => !tab.id.trim())) {
      toast.error(t('config_modal.sheet_layout_invalid_tabs'));
      return;
    }
    setSaving(true);
    try {
      const tabs = serializeDraft(draft);
      const merged = mergeSerializedTabsIntoDefaultProfile(
        profiles,
        tabs,
        t('config_modal.sheet_profiles_default_name'),
      );
      const ok = await saveSystemSheetProfiles(name, merged);
      if (ok) refetchProfiles();
    } finally {
      setSaving(false);
    }
  };

  if (!name) {
    return (
      <div className="text-xs text-zinc-500 mt-3">{t('config_modal.sheet_template_need_system')}</div>
    );
  }

  return (
    <div className="mt-4 bg-zinc-950/40 border border-zinc-800 rounded-xl p-3 space-y-4">
      <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
        {t('config_modal.sheet_template_builder_title')}
      </div>

      {layoutLoading ? (
        <div className="text-xs text-zinc-500">{t('modals.mini_sheet_layout_loading')}</div>
      ) : (
        <>
          <div className="space-y-4">
            {draft.tabs.map((tab, tabIdx) => (
              <div
                key={`${tab.id}-${tabIdx}`}
                className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-3"
              >
                <div className="flex flex-wrap items-start gap-2 justify-between">
                  <div className="grid gap-2 sm:grid-cols-2 flex-1 min-w-0">
                    <label className="block space-y-1">
                      <span className="text-[11px] text-zinc-500">{t('config_modal.sheet_template_tab_id')}</span>
                      <input
                        type="text"
                        value={tab.id}
                        onChange={(e) =>
                          setDraft((p) => ({
                            tabs: p.tabs.map((x, i) => (i === tabIdx ? { ...x, id: e.target.value } : x)),
                          }))
                        }
                        className={inputClass}
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-[11px] text-zinc-500">{t('config_modal.sheet_template_tab_name')}</span>
                      <input
                        type="text"
                        value={tab.name}
                        onChange={(e) =>
                          setDraft((p) => ({
                            tabs: p.tabs.map((x, i) => (i === tabIdx ? { ...x, name: e.target.value } : x)),
                          }))
                        }
                        className={inputClass}
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeTab(tabIdx)}
                    className="shrink-0 p-2 rounded-lg border border-zinc-800 text-zinc-500 hover:text-rose-400 hover:border-rose-500/40 transition-colors"
                    title={t('config_modal.sheet_template_delete_tab')}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <label className="block space-y-1">
                  <span className="text-[11px] text-zinc-500">{t('config_modal.sheet_template_tab_content')}</span>
                  <input
                    type="text"
                    value={tab.content ?? ''}
                    placeholder={t('config_modal.sheet_template_tab_content_placeholder')}
                    onChange={(e) =>
                      setDraft((p) => ({
                        tabs: p.tabs.map((x, i) =>
                          i === tabIdx ? { ...x, content: e.target.value || undefined } : x,
                        ),
                      }))
                    }
                    className={inputClass}
                  />
                </label>

                <div className="space-y-2 pt-1 border-t border-zinc-800/80">
                  <div className="text-[11px] font-medium text-zinc-500">{t('config_modal.sheet_template_accordions')}</div>
                  {tab.accordions.map((acc, accIdx) => (
                    <div
                      key={`acc-${tabIdx}-${accIdx}`}
                      className="rounded-md border border-zinc-800/90 bg-zinc-950/50 p-2 space-y-2"
                    >
                      <div className="flex gap-2 items-start">
                        <label className="flex-1 space-y-1 min-w-0">
                          <span className="text-[11px] text-zinc-500">
                            {t('config_modal.sheet_template_accordion_name')}
                          </span>
                          <input
                            type="text"
                            value={acc.name}
                            onChange={(e) =>
                              setDraft((p) => ({
                                tabs: p.tabs.map((x, ti) =>
                                  ti !== tabIdx
                                    ? x
                                    : {
                                        ...x,
                                        accordions: x.accordions.map((a, ai) =>
                                          ai === accIdx ? { ...a, name: e.target.value } : a,
                                        ),
                                      },
                                ),
                              }))
                            }
                            className={inputClass}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => removeAccordion(tabIdx, accIdx)}
                          className="shrink-0 p-2 rounded-lg border border-zinc-800 text-zinc-500 hover:text-rose-400 hover:border-rose-500/40 transition-colors mt-5"
                          title={t('config_modal.sheet_template_delete_accordion')}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      <label className="block space-y-1">
                        <span className="text-[11px] text-zinc-500">{t('config_modal.sheet_section_display')}</span>
                        <select
                          value={acc.display}
                          onChange={(e) =>
                            setDraft((p) => ({
                              tabs: p.tabs.map((x, ti) =>
                                ti !== tabIdx
                                  ? x
                                  : {
                                      ...x,
                                      accordions: x.accordions.map((a, ai) =>
                                        ai === accIdx
                                          ? {
                                              ...a,
                                              display: e.target.value === 'open' ? 'open' : 'accordion',
                                            }
                                          : a,
                                      ),
                                    },
                              ),
                            }))
                          }
                          className={`${inputClass} py-2`}
                        >
                          <option value="open">{t('config_modal.sheet_section_display_open')}</option>
                          <option value="accordion">{t('config_modal.sheet_section_display_accordion')}</option>
                        </select>
                      </label>

                      <div className="space-y-1">
                        <span className="text-[11px] text-zinc-500">
                          {t('config_modal.sheet_template_columns_heading')}
                        </span>
                        {columnsLoading ? (
                          <div className="text-xs text-zinc-500">{t('modals.mini_sheet_layout_loading')}</div>
                        ) : columns.length === 0 ? (
                          <div className="text-xs text-zinc-600">{t('config_modal.sheet_template_no_columns')}</div>
                        ) : (
                          <div className="max-h-36 overflow-y-auto rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-2 grid gap-1.5 sm:grid-cols-2">
                            {columns.map((col) => (
                              <label
                                key={col.key}
                                className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer select-none"
                              >
                                <input
                                  type="checkbox"
                                  checked={acc.columns.includes(col.key)}
                                  onChange={(e) =>
                                    toggleAccordionColumn(tabIdx, accIdx, col.key, e.target.checked)
                                  }
                                  className="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-900 shrink-0"
                                />
                                <span className="truncate font-mono text-[11px]" title={col.label}>
                                  {col.key}
                                </span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addAccordion(tabIdx)}
                    className="inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-lg border border-zinc-700 text-zinc-400 hover:border-emerald-500/40 hover:text-emerald-300 transition-colors"
                  >
                    <Plus size={14} /> {t('config_modal.sheet_template_add_accordion')}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addTab}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-zinc-700 text-zinc-300 hover:border-emerald-500/40 hover:bg-emerald-600/10 transition-colors"
          >
            <Plus size={14} /> {t('config_modal.sheet_template_add_tab')}
          </button>

          <div className="pt-2 border-t border-zinc-800 flex justify-end">
            <button
              type="button"
              disabled={saving || layoutLoading}
              onClick={() => void handleSave()}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/30 disabled:opacity-50 disabled:pointer-events-none transition-colors"
            >
              {saving ? t('gm_console.saving') : t('config_modal.sheet_template_save')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
