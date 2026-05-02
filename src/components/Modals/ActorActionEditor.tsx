import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Actor, ActorActionsMergePatch, ActorActionsPanelOverride } from '../../types';
import type { SystemActionDef } from '../../hooks/useSystemActions';
import type { SystemSheetLayoutTab } from '../../hooks/useSystemSheetProfiles';
import { normalizeSheetAccordionDisplay } from '../../hooks/useSystemSheetProfiles';
import { ActorActionsLayoutEditor } from './ActorActionsLayoutEditor';

type Ov = NonNullable<Actor['actions']>[string];

function mergeEntry(prev: Ov | undefined, partial: Partial<Ov>): Ov {
  const p = prev ?? {};
  const nextShow =
    partial.show_on_panel !== undefined
      ? Boolean(partial.show_on_panel)
      : p.show_on_panel !== undefined
        ? Boolean(p.show_on_panel)
        : true;
  return {
    show_on_panel: nextShow,
    formula_override:
      partial.formula_override !== undefined
        ? String(partial.formula_override).trim() || undefined
        : p.formula_override,
    comment:
      partial.comment !== undefined ? String(partial.comment).trim() || undefined : p.comment,
    custom_name:
      partial.custom_name !== undefined
        ? String(partial.custom_name).trim() || undefined
        : p.custom_name,
    custom_formula:
      partial.custom_formula !== undefined
        ? String(partial.custom_formula).trim() || undefined
        : p.custom_formula,
  };
}

function macroLabel(merged: Record<string, SystemActionDef>, id: string): string {
  return (merged[id]?.name || '').trim() || id;
}

export function ActorActionEditor({
  actor,
  systemActions,
  mergedActionDefs,
  profileActionsTab,
  onPatchActor,
}: {
  actor: Actor;
  systemActions: Record<string, SystemActionDef>;
  mergedActionDefs: Record<string, SystemActionDef>;
  profileActionsTab?: SystemSheetLayoutTab | null;
  onPatchActor: (updates: Partial<Actor>) => void;
}) {
  const { t } = useTranslation('core', { useSuspense: false });
  const [subTab, setSubTab] = useState<'grouping' | 'custom'>('grouping');
  const [newKey, setNewKey] = useState('');
  const [newName, setNewName] = useState('');
  const [newFormula, setNewFormula] = useState('');

  const hasOverride = actor.actions_panel_override != null;

  const sortedSystemKeys = useMemo(
    () =>
      Object.keys(systemActions).sort((a, b) =>
        macroLabel(mergedActionDefs, a).localeCompare(macroLabel(mergedActionDefs, b), undefined, {
          sensitivity: 'base',
        }),
      ),
    [systemActions, mergedActionDefs],
  );

  const customMacroEntries = useMemo(() => {
    return Object.entries(actor.actions ?? {})
      .filter(([, v]) => typeof v?.custom_formula === 'string' && v.custom_formula.trim().length > 0)
      .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [actor.actions]);

  const patchActionKey = (key: string, partial: Partial<Ov>) => {
    const prevEntry = actor.actions?.[key];
    const nextEntry = mergeEntry(prevEntry, partial);
    onPatchActor({
      actions: {
        [key]: nextEntry,
      },
    });
  };

  const deleteCustomMacro = (key: string) => {
    const actions: ActorActionsMergePatch = { [key]: null };
    onPatchActor({ actions } as Partial<Actor>);
  };

  const seedOverrideFromTemplate = () => {
    const src = profileActionsTab?.accordions;
    const accordions: ActorActionsPanelOverride['accordions'] = (src ?? []).map((a) => ({
      name: typeof a.name === 'string' ? a.name : '',
      columns: Array.isArray(a.columns) ? [...a.columns] : [],
      display: normalizeSheetAccordionDisplay(a.display),
    }));
    onPatchActor({ actions_panel_override: { accordions } });
  };

  const onLayoutChange = (next: ActorActionsPanelOverride['accordions']) => {
    onPatchActor({
      actions_panel_override: {
        accordions: next.map((a) => ({
          name: (a.name || '').trim() || '—',
          columns: [...a.columns],
          display: normalizeSheetAccordionDisplay(a.display),
        })),
      },
    });
  };

  const addCustomMacro = () => {
    const key = newKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
    const formula = newFormula.trim();
    if (!key || !formula) return;
    if (systemActions[key] && !actor.actions?.[key]?.custom_formula) {
      return;
    }
    patchActionKey(key, {
      custom_name: newName.trim() || key,
      custom_formula: formula,
      show_on_panel: true,
    });
    setNewKey('');
    setNewName('');
    setNewFormula('');
  };

  const inputClass =
    'w-full py-1.5 px-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none';

  const subBtn = (active: boolean) =>
    `flex-1 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
      active
        ? 'border-emerald-500 text-emerald-300 bg-zinc-900/40'
        : 'border-transparent text-zinc-500 hover:text-zinc-300'
    }`;

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex border-b border-zinc-800 bg-zinc-950/40 shrink-0">
        <button type="button" className={subBtn(subTab === 'grouping')} onClick={() => setSubTab('grouping')}>
          {t('modals.actor_action_subtab_grouping')}
        </button>
        <button type="button" className={subBtn(subTab === 'custom')} onClick={() => setSubTab('custom')}>
          {t('modals.actor_action_subtab_custom')}
        </button>
      </div>

      <div className="p-4 space-y-4 overflow-y-auto max-h-[min(70vh,520px)]">
        {subTab === 'grouping' ? (
          <>
            <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              {t('modals.action_editor_title')}
            </div>

            {!hasOverride ? (
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 space-y-2">
                <p className="text-xs text-zinc-400 leading-relaxed">{t('modals.actor_actions_inherit_template')}</p>
                <button
                  type="button"
                  onClick={seedOverrideFromTemplate}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-emerald-500/40 bg-emerald-600/15 text-emerald-200 hover:bg-emerald-600/25 transition-colors"
                >
                  {t('modals.actor_actions_start_custom_layout')}
                </button>
              </div>
            ) : (
              <ActorActionsLayoutEditor
                accordions={actor.actions_panel_override!.accordions}
                validMacroIds={Object.keys(mergedActionDefs)}
                macroLabel={(id) => macroLabel(mergedActionDefs, id)}
                onChange={onLayoutChange}
              />
            )}

            <div className="pt-2 border-t border-zinc-800 space-y-2">
              <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
                {t('modals.actor_actions_system_macros')}
              </div>
              {sortedSystemKeys.length === 0 ? (
                <p className="text-sm text-zinc-500">{t('modals.mini_sheet_actions_empty')}</p>
              ) : (
                <div className="grid gap-3 max-h-64 overflow-y-auto pr-1">
                  {sortedSystemKeys.map((key) => {
                    const def = systemActions[key];
                    const label = def?.name ?? key;
                    const entry = actor.actions?.[key];
                    const showOn = entry?.show_on_panel !== false;
                    const formulaVal = entry?.formula_override ?? '';
                    const commentVal = entry?.comment ?? '';

                    return (
                      <div
                        key={key}
                        className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3 space-y-2"
                      >
                        <div className="text-sm font-medium text-zinc-200">{label}</div>
                        <div className="font-mono text-[10px] text-zinc-600 truncate" title={key}>
                          {key}
                        </div>
                        {def?.formula ? (
                          <div className="text-[11px] text-zinc-500">
                            <span className="text-zinc-600">{t('modals.action_editor_default_formula')}:</span>{' '}
                            <span className="font-mono text-zinc-400">{def.formula}</span>
                          </div>
                        ) : null}

                        <label className="flex items-center justify-between gap-2 pt-1">
                          <span className="text-xs text-zinc-400">{t('modals.action_editor_show_on_panel')}</span>
                          <input
                            type="checkbox"
                            checked={showOn}
                            onChange={(e) => patchActionKey(key, { show_on_panel: e.target.checked })}
                            className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-900"
                          />
                        </label>

                        <div className="space-y-1">
                          <label className="text-[11px] text-zinc-500">{t('modals.action_editor_formula_override')}</label>
                          <input
                            type="text"
                            value={formulaVal}
                            onChange={(e) => patchActionKey(key, { formula_override: e.target.value })}
                            placeholder={def?.formula ?? ''}
                            className={inputClass}
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] text-zinc-500">{t('modals.action_editor_comment')}</label>
                          <input
                            type="text"
                            value={commentVal}
                            onChange={(e) => patchActionKey(key, { comment: e.target.value })}
                            placeholder={label}
                            className={inputClass}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-zinc-500 leading-relaxed">{t('modals.actor_custom_macros_intro')}</p>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3 space-y-2">
              <div className="text-[11px] text-zinc-500">{t('modals.actor_custom_macro_new')}</div>
              <input
                type="text"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder={t('modals.actor_custom_macro_id_placeholder')}
                className={inputClass}
              />
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('modals.actor_custom_macro_name_placeholder')}
                className={inputClass}
              />
              <input
                type="text"
                value={newFormula}
                onChange={(e) => setNewFormula(e.target.value)}
                placeholder={t('modals.actor_custom_macro_formula_placeholder')}
                className={inputClass}
              />
              <button
                type="button"
                onClick={addCustomMacro}
                disabled={!newKey.trim() || !newFormula.trim()}
                className="w-full py-2 text-xs font-medium rounded-lg bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/30 disabled:opacity-50 disabled:pointer-events-none transition-colors"
              >
                {t('modals.actor_custom_macro_add')}
              </button>
            </div>

            {customMacroEntries.length === 0 ? (
              <p className="text-sm text-zinc-600">{t('modals.actor_custom_macros_empty')}</p>
            ) : (
              <div className="space-y-2">
                {customMacroEntries.map(([key, ov]) => (
                  <div
                    key={key}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-zinc-200 truncate">
                        {(ov?.custom_name || '').trim() || key}
                      </div>
                      <div className="font-mono text-[10px] text-zinc-600 truncate">{key}</div>
                      <div className="font-mono text-[11px] text-zinc-500 truncate mt-0.5">
                        {ov?.custom_formula}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteCustomMacro(key)}
                      className="shrink-0 px-2 py-1 text-xs rounded border border-rose-500/40 text-rose-300 hover:bg-rose-500/10"
                    >
                      {t('common.delete')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
