import React, { useCallback, useMemo } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  normalizeSheetAccordionDisplay,
  type SheetAccordionSectionDisplay,
} from '../../hooks/useSystemSheetProfiles';
import type { ActorActionsPanelOverride } from '../../types';

type AccordionDraft = { name: string; columns: string[]; display: SheetAccordionSectionDisplay };

function draftsFromAccordions(acc: ActorActionsPanelOverride['accordions']): AccordionDraft[] {
  return acc.map((a) => ({
    name: typeof a.name === 'string' ? a.name : '',
    columns: Array.isArray(a.columns) ? [...a.columns] : [],
    display: normalizeSheetAccordionDisplay(a.display),
  }));
}

export function ActorActionsLayoutEditor({
  accordions,
  validMacroIds,
  macroLabel,
  onChange,
}: {
  accordions: ActorActionsPanelOverride['accordions'];
  validMacroIds: string[];
  macroLabel: (id: string) => string;
  onChange: (next: ActorActionsPanelOverride['accordions']) => void;
}) {
  const { t } = useTranslation('core', { useSuspense: false });

  const validSet = useMemo(() => new Set(validMacroIds), [validMacroIds]);

  const drafts = useMemo(
    () =>
      draftsFromAccordions(accordions).map((d) => ({
        ...d,
        columns: d.columns.filter((k) => validSet.has(k)),
      })),
    [accordions, validSet],
  );

  const emit = useCallback(
    (nextDrafts: AccordionDraft[]) => {
      const payload = nextDrafts.map((d) => ({
        name: d.name,
        columns: [...d.columns],
        display: d.display,
      }));
      onChange(payload);
    },
    [onChange],
  );

  const patchDrafts = useCallback(
    (fn: (d: AccordionDraft[]) => AccordionDraft[]) => {
      const current: AccordionDraft[] = drafts.map((d) => ({
        name: d.name,
        columns: [...d.columns],
        display: d.display,
      }));
      emit(fn(current));
    },
    [drafts, emit],
  );

  const inputClass =
    'w-full py-1.5 px-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none';

  const sortedPickIds = useMemo(
    () =>
      [...validMacroIds].sort((a, b) =>
        macroLabel(a).localeCompare(macroLabel(b), undefined, { sensitivity: 'base' }),
      ),
    [validMacroIds, macroLabel],
  );

  const addGroup = () => {
    patchDrafts((d) => [...d, { name: '', columns: [], display: 'open' }]);
  };

  const removeGroup = (idx: number) => {
    patchDrafts((d) => d.filter((_, i) => i !== idx));
  };

  const moveAccordion = (idx: number, dir: 'up' | 'down') => {
    patchDrafts((d) => {
      const j = dir === 'up' ? idx - 1 : idx + 1;
      if (j < 0 || j >= d.length) return d;
      const next = d.map((x) => ({ ...x, columns: [...x.columns] }));
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };

  const setAccordionName = (idx: number, name: string) => {
    patchDrafts((d) => d.map((a, i) => (i === idx ? { ...a, name } : a)));
  };

  const setAccordionDisplay = (idx: number, display: SheetAccordionSectionDisplay) => {
    patchDrafts((d) => d.map((a, i) => (i === idx ? { ...a, display } : a)));
  };

  const removeMacroFromGroup = (accIdx: number, macroId: string) => {
    patchDrafts((d) =>
      d.map((a, i) => (i === accIdx ? { ...a, columns: a.columns.filter((k) => k !== macroId) } : a)),
    );
  };

  const addMacroToGroup = (accIdx: number, macroId: string) => {
    if (!macroId || !validSet.has(macroId)) return;
    patchDrafts((d) =>
      d.map((a, i) => {
        if (i !== accIdx) return a;
        if (a.columns.includes(macroId)) return a;
        return { ...a, columns: [...a.columns, macroId] };
      }),
    );
  };

  if (validMacroIds.length === 0) {
    return <div className="text-xs text-zinc-600">{t('config_modal.sheet_actions_no_macros')}</div>;
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={addGroup}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-zinc-700 text-zinc-300 hover:border-emerald-500/40 hover:bg-emerald-600/10 transition-colors"
      >
        <Plus size={14} />
        {t('config_modal.sheet_summary_add_group')}
      </button>

      {drafts.length === 0 ? (
        <div className="text-xs text-zinc-600">{t('config_modal.sheet_summary_no_groups')}</div>
      ) : (
        <div className="space-y-3">
          {drafts.map((acc, accIdx) => {
            const idsUsedElsewhere = new Set(
              drafts.flatMap((a, i) => (i === accIdx ? [] : a.columns)),
            );
            const available = sortedPickIds.filter(
              (id) => !acc.columns.includes(id) && !idsUsedElsewhere.has(id),
            );
            const pickSelectKey = `actor-act-${accIdx}-${drafts.map((a) => [...a.columns].sort().join(',')).join('|')}`;
            return (
              <div key={`acc-${accIdx}`} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
                <div className="flex flex-wrap gap-2 items-start justify-between">
                  <label className="block flex-1 min-w-[160px] space-y-1">
                    <span className="text-[11px] text-zinc-500">{t('config_modal.sheet_template_accordion_name')}</span>
                    <input
                      type="text"
                      value={acc.name}
                      onChange={(e) => setAccordionName(accIdx, e.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <div className="flex items-center gap-1 shrink-0 mt-5">
                    <button
                      type="button"
                      onClick={() => moveAccordion(accIdx, 'up')}
                      disabled={accIdx === 0}
                      className="p-2 rounded-lg border border-zinc-800 text-zinc-500 hover:text-zinc-200 hover:border-zinc-600 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                      title={t('config_modal.move_up')}
                      aria-label={t('config_modal.move_up')}
                    >
                      <ChevronUp size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveAccordion(accIdx, 'down')}
                      disabled={accIdx >= drafts.length - 1}
                      className="p-2 rounded-lg border border-zinc-800 text-zinc-500 hover:text-zinc-200 hover:border-zinc-600 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                      title={t('config_modal.move_down')}
                      aria-label={t('config_modal.move_down')}
                    >
                      <ChevronDown size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeGroup(accIdx)}
                      className="p-2 rounded-lg border border-zinc-800 text-zinc-500 hover:text-rose-400 hover:border-rose-500/40 transition-colors"
                      title={t('config_modal.sheet_summary_delete_group')}
                      aria-label={t('config_modal.sheet_summary_delete_group')}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <label className="block space-y-1">
                  <span className="text-[11px] text-zinc-500">{t('config_modal.sheet_section_display')}</span>
                  <select
                    value={acc.display}
                    onChange={(e) =>
                      setAccordionDisplay(accIdx, e.target.value === 'open' ? 'open' : 'accordion')
                    }
                    className={`${inputClass} py-2`}
                  >
                    <option value="open">{t('config_modal.sheet_section_display_open')}</option>
                    <option value="accordion">{t('config_modal.sheet_section_display_accordion')}</option>
                  </select>
                </label>

                <div className="space-y-2">
                  <span className="text-[11px] text-zinc-500">{t('config_modal.sheet_actions_macros_in_group')}</span>
                  {acc.columns.length === 0 ? (
                    <div className="text-xs text-zinc-600">{t('config_modal.sheet_actions_no_macros_in_group')}</div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {acc.columns.map((macroId) => (
                        <span
                          key={macroId}
                          className="inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded-md text-xs bg-emerald-500/15 text-emerald-200 border border-emerald-500/35 max-w-full"
                        >
                          <span className="truncate" title={macroId}>
                            {macroLabel(macroId)}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeMacroFromGroup(accIdx, macroId)}
                            className="shrink-0 p-0.5 rounded hover:bg-emerald-500/25 text-emerald-300/90"
                            title={t('config_modal.sheet_summary_remove_column')}
                          >
                            <X size={14} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <select
                    key={pickSelectKey}
                    defaultValue=""
                    disabled={available.length === 0}
                    onChange={(e) => {
                      const id = e.target.value;
                      if (id) addMacroToGroup(accIdx, id);
                    }}
                    className={`${inputClass} py-2 disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <option value="">{t('config_modal.sheet_actions_select_macro_to_add')}</option>
                    {available.map((id) => (
                      <option key={id} value={id}>
                        {macroLabel(id)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
