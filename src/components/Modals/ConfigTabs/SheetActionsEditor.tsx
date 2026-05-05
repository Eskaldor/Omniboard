import React, { useCallback, useMemo } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  normalizeSheetAccordionDisplay,
  type SheetAccordionSectionDisplay,
  type SystemSheetProfile,
} from '../../../hooks/useSystemSheetProfiles';
import type { SystemActionDef } from '../../../hooks/useSystemActions';
import { useSystemActions } from '../../../hooks/useSystemActions';

type AccordionDraft = { name: string; columns: string[]; display: SheetAccordionSectionDisplay };

function macroLabel(actions: Record<string, SystemActionDef>, key: string): string {
  const def = actions[key];
  return (def?.name || '').trim() || key;
}

export function SheetActionsEditor({
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
  const { actions, loading: actionsLoading } = useSystemActions(system);

  const sortedSystemActionIds = useMemo(
    () =>
      Object.entries(actions)
        .sort((a, b) =>
          (a[1].name || a[0]).localeCompare(b[1].name || b[0], undefined, { sensitivity: 'base' }),
        )
        .map(([k]) => k),
    [actions],
  );

  const setProfileIsDefault = (profileId: string, checked: boolean) => {
    setLocalProfiles((prev) =>
      prev.map((p) => ({
        ...p,
        is_default: checked ? p.id === profileId : false,
      })),
    );
  };

  const selectedProfile = localProfiles.find((p) => p.id === selectedProfileId);

  const validMacroIds = useMemo(() => new Set(sortedSystemActionIds), [sortedSystemActionIds]);

  const accordions: AccordionDraft[] = useMemo(() => {
    const acc = selectedProfile?.actions?.accordions ?? [];
    return acc.map((a) => ({
      name: typeof a.name === 'string' ? a.name : '',
      columns: Array.isArray(a.columns)
        ? a.columns.filter((k) => typeof k === 'string' && validMacroIds.has(k))
        : [],
      display: normalizeSheetAccordionDisplay(a.display),
    }));
  }, [selectedProfile, validMacroIds]);

  const patchSelectedActionsAccordions = useCallback(
    (fn: (drafts: AccordionDraft[]) => AccordionDraft[]) => {
      setLocalProfiles((prev) => {
        const prof = prev.find((x) => x.id === selectedProfileId);
        if (!prof) return prev;
        const current: AccordionDraft[] = (prof.actions?.accordions ?? []).map((a) => ({
          name: typeof a.name === 'string' ? a.name : '',
          columns: Array.isArray(a.columns)
            ? a.columns.filter((k) => typeof k === 'string' && validMacroIds.has(k))
            : [],
          display: normalizeSheetAccordionDisplay(a.display),
        }));
        const nextDrafts = fn(current);
        const payload = nextDrafts.map((d) => ({
          name: d.name,
          columns: [...d.columns],
          display: d.display,
        }));
        return prev.map((p) => {
          if (p.id !== selectedProfileId) return p;
          return { ...p, actions: { accordions: payload } };
        });
      });
    },
    [selectedProfileId, validMacroIds],
  );

  const inputClass =
    'w-full py-1.5 px-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none';

  const sortedMacros = useMemo(
    () =>
      [...sortedSystemActionIds].sort((a, b) =>
        macroLabel(actions, a).localeCompare(macroLabel(actions, b), undefined, {
          sensitivity: 'base',
        }),
      ),
    [sortedSystemActionIds, actions],
  );

  const addGroup = () => {
    patchSelectedActionsAccordions((d) => [...d, { name: '', columns: [], display: 'open' }]);
  };

  const removeGroup = (idx: number) => {
    patchSelectedActionsAccordions((d) => d.filter((_, i) => i !== idx));
  };

  const moveAccordion = (idx: number, dir: 'up' | 'down') => {
    patchSelectedActionsAccordions((d) => {
      const j = dir === 'up' ? idx - 1 : idx + 1;
      if (j < 0 || j >= d.length) return d;
      const next = d.map((x) => ({ ...x, columns: [...x.columns] }));
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };

  const setAccordionName = (idx: number, name: string) => {
    patchSelectedActionsAccordions((d) => d.map((a, i) => (i === idx ? { ...a, name } : a)));
  };

  const setAccordionDisplay = (idx: number, display: SheetAccordionSectionDisplay) => {
    patchSelectedActionsAccordions((d) => d.map((a, i) => (i === idx ? { ...a, display } : a)));
  };

  const removeMacroFromGroup = (accIdx: number, macroId: string) => {
    patchSelectedActionsAccordions((d) =>
      d.map((a, i) => (i === accIdx ? { ...a, columns: a.columns.filter((k) => k !== macroId) } : a)),
    );
  };

  const addMacroToGroup = (accIdx: number, macroId: string) => {
    if (!macroId || !validMacroIds.has(macroId)) return;
    patchSelectedActionsAccordions((d) =>
      d.map((a, i) => {
        if (i !== accIdx) return a;
        if (a.columns.includes(macroId)) return a;
        return { ...a, columns: [...a.columns, macroId] };
      }),
    );
  };

  if (!system) {
    return <div className="text-sm text-zinc-500">{t('config_modal.sheet_template_need_system')}</div>;
  }

  return (
    <div className="space-y-4">
      {selectedProfile && (
        <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={selectedProfile.is_default === true}
            onChange={(e) => setProfileIsDefault(selectedProfileId, e.target.checked)}
            className="rounded border-zinc-600 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-900"
          />
          <span>{t('config_modal.sheet_profile_use_as_default')}</span>
        </label>
      )}

      <p className="text-xs text-zinc-500 leading-relaxed">{t('config_modal.sheet_actions_intro')}</p>

      <button
        type="button"
        onClick={addGroup}
        disabled={!selectedProfile || profilesLoading}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-zinc-700 text-zinc-300 hover:border-emerald-500/40 hover:bg-emerald-600/10 transition-colors disabled:opacity-50 disabled:pointer-events-none"
      >
        <Plus size={14} />
        {t('config_modal.sheet_summary_add_group')}
      </button>

      {profilesLoading ? (
        <div className="text-xs text-zinc-500">{t('modals.mini_sheet_layout_loading')}</div>
      ) : localProfiles.length === 0 ? (
        <div className="text-xs text-zinc-500">{t('config_modal.sheet_summary_layout_unavailable')}</div>
      ) : !selectedProfile ? (
        <div className="text-xs text-zinc-500">{t('config_modal.sheet_summary_layout_unavailable')}</div>
      ) : actionsLoading ? (
        <div className="text-xs text-zinc-500">{t('modals.mini_sheet_layout_loading')}</div>
      ) : sortedSystemActionIds.length === 0 ? (
        <div className="text-xs text-zinc-600">{t('config_modal.sheet_actions_no_macros')}</div>
      ) : accordions.length === 0 ? (
        <div className="text-xs text-zinc-600">{t('config_modal.sheet_summary_no_groups')}</div>
      ) : (
        <div className="space-y-3">
          {accordions.map((acc, accIdx) => {
            const idsUsedElsewhere = new Set(
              accordions.flatMap((a, i) => (i === accIdx ? [] : a.columns)),
            );
            const available = sortedMacros.filter(
              (id) => !acc.columns.includes(id) && !idsUsedElsewhere.has(id),
            );
            const pickSelectKey = `pick-act-${accIdx}-${accordions.map((a) => [...a.columns].sort().join(',')).join('|')}`;
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
                      disabled={accIdx >= accordions.length - 1}
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
                            {macroLabel(actions, macroId)}
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
                    disabled={available.length === 0 || actionsLoading}
                    onChange={(e) => {
                      const id = e.target.value;
                      if (id) addMacroToGroup(accIdx, id);
                    }}
                    className={`${inputClass} py-2 disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <option value="">{t('config_modal.sheet_actions_select_macro_to_add')}</option>
                    {available.map((id) => (
                      <option key={id} value={id}>
                        {macroLabel(actions, id)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
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
