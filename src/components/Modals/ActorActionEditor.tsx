import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Actor, ActorActionsMergePatch, ActorActionsPanelOverride } from '../../types';
import type { SystemActionDef } from '../../hooks/useSystemActions';
import type { SystemSheetLayoutAccordion } from '../../hooks/useSystemSheetProfiles';
import { normalizeSheetAccordionDisplay } from '../../hooks/useSystemSheetProfiles';
import { ActorActionsLayoutEditor } from './ActorActionsLayoutEditor';

type Ov = NonNullable<Actor['actions']>[string];
type SubTab = 'grouping' | 'custom' | 'base';

type BaseDraftEntry = {
  show_on_panel: boolean;
  show_in_tracker: boolean;
  formula_override: string;
  comment: string;
};
type BaseDraftMap = Record<string, BaseDraftEntry>;

function mergeEntry(prev: Ov | undefined, partial: Partial<Ov>): Ov {
  const p = prev ?? {};
  const nextShow =
    partial.show_on_panel !== undefined
      ? Boolean(partial.show_on_panel)
      : p.show_on_panel !== undefined
        ? Boolean(p.show_on_panel)
        : true;
  const nextTracker =
    partial.show_in_tracker !== undefined
      ? Boolean(partial.show_in_tracker)
      : p.show_in_tracker !== undefined
        ? Boolean(p.show_in_tracker)
        : false;
  return {
    show_on_panel: nextShow,
    show_in_tracker: nextTracker,
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

/**
 * Snapshot of system-macro overrides on an actor, in the shape the form binds to.
 * Pre-fills `formula_override` / `comment` with the *effective* value (live override or system
 * default) so a long formula can be edited in place — one digit at a time — instead of being
 * retyped from a placeholder.
 */
function buildBaseDraft(actor: Actor, systemActions: Record<string, SystemActionDef>): BaseDraftMap {
  const out: BaseDraftMap = {};
  for (const [key, def] of Object.entries(systemActions)) {
    const entry = actor.actions?.[key];
    const liveFormula = (entry?.formula_override ?? '').trim();
    const liveComment = (entry?.comment ?? '').trim();
    out[key] = {
      show_on_panel: entry?.show_on_panel !== false,
      show_in_tracker: entry?.show_in_tracker === true,
      formula_override: liveFormula || (def?.formula ?? '').trim(),
      comment: liveComment || (def?.name ?? '').trim(),
    };
  }
  return out;
}

/**
 * Field-level diff against the *effective* current value (override falls back to system default).
 * A draft equal to the default is **not** dirty even if there's no live override — that matches
 * the pre-fill behaviour: untouched field == "no change".
 */
function computeBaseFieldDirty(
  actor: Actor,
  draft: BaseDraftMap,
  systemActions: Record<string, SystemActionDef>,
): Record<
  string,
  { show: boolean; tracker: boolean; formula: boolean; comment: boolean; any: boolean }
> {
  const out: Record<
    string,
    { show: boolean; tracker: boolean; formula: boolean; comment: boolean; any: boolean }
  > = {};
  for (const [key, d] of Object.entries(draft)) {
    const def = systemActions[key];
    const defFormula = (def?.formula ?? '').trim();
    const defName = (def?.name ?? '').trim();
    const entry = actor.actions?.[key];
    const liveShow = entry?.show_on_panel !== false;
    const liveTracker = entry?.show_in_tracker === true;
    const liveFormulaOv = (entry?.formula_override ?? '').trim();
    const liveCommentOv = (entry?.comment ?? '').trim();
    const liveEffectiveFormula = liveFormulaOv || defFormula;
    const liveEffectiveComment = liveCommentOv || defName;
    const draftFormula = d.formula_override.trim() || defFormula;
    const draftComment = d.comment.trim() || defName;
    const show = d.show_on_panel !== liveShow;
    const tracker = d.show_in_tracker !== liveTracker;
    const formula = draftFormula !== liveEffectiveFormula;
    const comment = draftComment !== liveEffectiveComment;
    out[key] = { show, tracker, formula, comment, any: show || tracker || formula || comment };
  }
  return out;
}

export function ActorActionEditor({
  actor,
  systemActions,
  mergedActionDefs,
  profileActionsAccordions,
  onPatchActor,
}: {
  actor: Actor;
  systemActions: Record<string, SystemActionDef>;
  mergedActionDefs: Record<string, SystemActionDef>;
  profileActionsAccordions?: SystemSheetLayoutAccordion[] | null;
  onPatchActor: (updates: Partial<Actor>) => void;
}) {
  const { t } = useTranslation('core', { useSuspense: false });
  const [subTab, setSubTab] = useState<SubTab>('grouping');
  const [newKey, setNewKey] = useState('');
  const [newName, setNewName] = useState('');
  const [newFormula, setNewFormula] = useState('');

  // Base-actions tab uses an explicit draft + Apply / Discard pattern (single PATCH on Apply).
  // Re-seed when the actor identity or the available system-macro list changes; in-flight edits
  // are intentionally preserved across unrelated remote updates of the same actor.
  const [baseDraft, setBaseDraft] = useState<BaseDraftMap>(() => buildBaseDraft(actor, systemActions));
  const systemActionsSig = useMemo(
    () => Object.keys(systemActions).sort().join('|'),
    [systemActions],
  );
  useEffect(() => {
    setBaseDraft(buildBaseDraft(actor, systemActions));
  }, [actor.id, systemActionsSig]);

  const baseFieldDirty = useMemo(
    () => computeBaseFieldDirty(actor, baseDraft, systemActions),
    [actor, baseDraft, systemActions],
  );
  const baseDirty = useMemo(
    () => Object.values(baseFieldDirty).some((d) => d.any),
    [baseFieldDirty],
  );

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
    const src = profileActionsAccordions ?? [];
    const accordions: ActorActionsPanelOverride['accordions'] = src.map((a) => ({
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

  const setBaseField = (key: string, partial: Partial<BaseDraftEntry>) => {
    setBaseDraft((prev) => {
      const cur =
        prev[key] ?? {
          show_on_panel: true,
          show_in_tracker: false,
          formula_override: '',
          comment: '',
        };
      return { ...prev, [key]: { ...cur, ...partial } };
    });
  };

  const applyBaseDraft = () => {
    const patch: Record<string, Ov> = {};
    for (const key of Object.keys(systemActions)) {
      if (!baseFieldDirty[key]?.any) continue;
      const def = systemActions[key];
      const defFormula = (def?.formula ?? '').trim();
      const defName = (def?.name ?? '').trim();
      const draft = baseDraft[key];
      const draftFormula = draft.formula_override.trim();
      const draftComment = draft.comment.trim();
      // Empty OR exactly the system default → "no override" (send null to clear via deep-merge).
      const formulaToSet = !draftFormula || draftFormula === defFormula ? null : draftFormula;
      const commentToSet = !draftComment || draftComment === defName ? null : draftComment;
      patch[key] = {
        show_on_panel: draft.show_on_panel,
        show_in_tracker: draft.show_in_tracker,
        formula_override: formulaToSet,
        comment: commentToSet,
      };
    }
    if (Object.keys(patch).length === 0) return;
    onPatchActor({ actions: patch });
  };

  const discardBaseDraft = () => {
    setBaseDraft(buildBaseDraft(actor, systemActions));
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
      show_in_tracker: false,
    });
    setNewKey('');
    setNewName('');
    setNewFormula('');
  };

  const inputClass =
    'w-full py-1.5 px-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none';
  const dirtyInputClass = `${inputClass} border-amber-500/50`;
  const visibilityCheckboxClass =
    'w-4 h-4 shrink-0 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-900';

  const subBtn = (active: boolean) =>
    `flex-1 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
      active
        ? 'border-emerald-500 text-emerald-300 bg-zinc-900/40'
        : 'border-transparent text-zinc-500 hover:text-zinc-300'
    }`;

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex border-b border-zinc-800 bg-zinc-950/40 shrink-0">
        <button
          type="button"
          className={subBtn(subTab === 'grouping')}
          onClick={() => setSubTab('grouping')}
        >
          {t('modals.actor_action_subtab_grouping')}
        </button>
        <button
          type="button"
          className={subBtn(subTab === 'custom')}
          onClick={() => setSubTab('custom')}
        >
          {t('modals.actor_action_subtab_custom')}
        </button>
        <button
          type="button"
          className={subBtn(subTab === 'base')}
          onClick={() => setSubTab('base')}
          aria-label={t('modals.actor_action_subtab_base')}
        >
          <span className="inline-flex items-center gap-1.5">
            {t('modals.actor_action_subtab_base')}
            {baseDirty && (
              <span
                className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400"
                aria-hidden
                title={t('modals.actor_action_base_dirty')}
              />
            )}
          </span>
        </button>
      </div>

      <div className="p-4 space-y-4 overflow-y-auto max-h-[min(70vh,520px)]">
        {subTab === 'grouping' && (
          <>
            <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              {t('modals.action_editor_title')}
            </div>

            {!hasOverride ? (
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 space-y-2">
                <p className="text-xs text-zinc-400 leading-relaxed">
                  {t('modals.actor_actions_inherit_template')}
                </p>
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
          </>
        )}

        {subTab === 'custom' && (
          <>
            <p className="text-xs text-zinc-500 leading-relaxed">
              {t('modals.actor_custom_macros_intro')}
            </p>

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
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-zinc-200 truncate">
                        {(ov?.custom_name || '').trim() || key}
                      </div>
                      <div className="font-mono text-[10px] text-zinc-600 truncate">{key}</div>
                      <div className="font-mono text-[11px] text-zinc-500 truncate mt-0.5">
                        {ov?.custom_formula}
                      </div>
                      <div className="flex flex-wrap items-center gap-4 mt-2 pt-2 border-t border-zinc-800/80">
                        <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={ov?.show_on_panel !== false}
                            onChange={(e) => patchActionKey(key, { show_on_panel: e.target.checked })}
                            className={visibilityCheckboxClass}
                          />
                          <span>{t('modals.action_visibility_mini_sheet')}</span>
                        </label>
                        <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={ov?.show_in_tracker === true}
                            onChange={(e) => patchActionKey(key, { show_in_tracker: e.target.checked })}
                            className={visibilityCheckboxClass}
                          />
                          <span>{t('modals.action_visibility_tracker')}</span>
                        </label>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteCustomMacro(key)}
                      className="shrink-0 px-2 py-1 text-xs rounded border border-rose-500/40 text-rose-300 hover:bg-rose-500/10 self-start"
                    >
                      {t('common.delete')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {subTab === 'base' && (
          <>
            <div className="sticky -top-4 -mt-4 -mx-4 px-4 pt-3 pb-2 bg-zinc-900/95 backdrop-blur-sm border-b border-zinc-800 z-10 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-zinc-400 leading-relaxed flex-1 min-w-[12rem]">
                {t('modals.actor_action_base_intro')}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={discardBaseDraft}
                  disabled={!baseDirty}
                  className="px-3 py-1.5 text-xs rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                >
                  {t('modals.actor_action_base_discard')}
                </button>
                <button
                  type="button"
                  onClick={applyBaseDraft}
                  disabled={!baseDirty}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/30 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                >
                  {t('modals.actor_action_base_apply')}
                </button>
              </div>
            </div>

            {sortedSystemKeys.length === 0 ? (
              <p className="text-sm text-zinc-500">{t('modals.mini_sheet_actions_empty')}</p>
            ) : (
              <div className="grid gap-3">
                {sortedSystemKeys.map((key) => {
                  const def = systemActions[key];
                  const label = def?.name ?? key;
                  const draft = baseDraft[key] ?? {
                    show_on_panel: true,
                    show_in_tracker: false,
                    formula_override: '',
                    comment: '',
                  };
                  const dirty = baseFieldDirty[key] ?? {
                    show: false,
                    tracker: false,
                    formula: false,
                    comment: false,
                    any: false,
                  };

                  return (
                    <div
                      key={key}
                      className={`rounded-xl border bg-zinc-950/50 p-3 space-y-2 transition-colors ${
                        dirty.any ? 'border-amber-500/40' : 'border-zinc-800'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-zinc-200 truncate">{label}</div>
                          <div className="font-mono text-[10px] text-zinc-600 truncate" title={key}>
                            {key}
                          </div>
                          {def?.formula ? (
                            <div className="text-[11px] text-zinc-500 mt-0.5">
                              <span className="text-zinc-600">
                                {t('modals.action_editor_default_formula')}:
                              </span>{' '}
                              <span className="font-mono text-zinc-400">{def.formula}</span>
                            </div>
                          ) : null}
                        </div>
                        {dirty.any && (
                          <span className="shrink-0 text-[10px] uppercase tracking-wider text-amber-300/90 font-medium">
                            {t('modals.actor_action_base_field_changed')}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-1">
                        <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={draft.show_on_panel}
                            onChange={(e) => setBaseField(key, { show_on_panel: e.target.checked })}
                            className={visibilityCheckboxClass}
                          />
                          <span>{t('modals.action_visibility_mini_sheet')}</span>
                        </label>
                        <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={draft.show_in_tracker}
                            onChange={(e) => setBaseField(key, { show_in_tracker: e.target.checked })}
                            className={visibilityCheckboxClass}
                          />
                          <span>{t('modals.action_visibility_tracker')}</span>
                        </label>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] text-zinc-500">
                          {t('modals.action_editor_formula_override')}
                        </label>
                        <input
                          type="text"
                          value={draft.formula_override}
                          onChange={(e) => setBaseField(key, { formula_override: e.target.value })}
                          spellCheck={false}
                          className={`${
                            dirty.formula ? dirtyInputClass : inputClass
                          } font-mono`}
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] text-zinc-500">
                          {t('modals.action_editor_comment')}
                        </label>
                        <input
                          type="text"
                          value={draft.comment}
                          onChange={(e) => setBaseField(key, { comment: e.target.value })}
                          className={dirty.comment ? dirtyInputClass : inputClass}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
