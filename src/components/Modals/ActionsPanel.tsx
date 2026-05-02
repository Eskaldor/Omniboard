import React from 'react';
import { ChevronDown, Dices } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Actor } from '../../types';
import {
  normalizeSheetAccordionDisplay,
  type SystemSheetLayoutAccordion,
  type SystemSheetLayoutTab,
} from '../../hooks/useSystemSheetProfiles';
import type { SystemActionDef } from '../../hooks/useSystemActions';

function MacroRollButton({
  actionKey,
  def,
  actor,
  onRollAction,
}: {
  actionKey: string;
  def: SystemActionDef;
  actor: Actor;
  onRollAction: (formula: string, comment: string) => void | Promise<void>;
}) {
  const ov = actor.actions?.[actionKey];
  const displayFormula = (ov?.formula_override?.trim() || def.formula).trim();
  const rollComment = (ov?.comment?.trim() || def.name).trim() || actionKey;

  return (
    <button
      type="button"
      onClick={() => void onRollAction(displayFormula, rollComment)}
      className="text-left rounded-xl border border-zinc-800 bg-zinc-950/50 hover:border-emerald-500/40 hover:bg-zinc-900/60 px-3 py-2.5 transition-colors group"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-zinc-200 truncate">{def.name}</span>
        <Dices size={16} className="shrink-0 text-zinc-500 group-hover:text-emerald-400 transition-colors" />
      </div>
      <div className="mt-1 font-mono text-[11px] text-zinc-500 truncate" title={displayFormula}>
        {displayFormula}
      </div>
    </button>
  );
}

export function ActionsPanel({
  actor,
  mergedActionDefs,
  onRollAction,
  actionsTab,
}: {
  actor: Actor;
  /** System `actions.json` merged with this actor's `custom_formula` macros. */
  mergedActionDefs: Record<string, SystemActionDef>;
  onRollAction: (formula: string, comment: string) => void | Promise<void>;
  /**
   * Profile actions tab (`sheet_profiles`). Ignored when `actor.actions_panel_override` is set —
   * then per-actor grouping replaces the template.
   */
  actionsTab?: SystemSheetLayoutTab | null;
}) {
  const { t } = useTranslation('core', { useSuspense: false });

  const entriesFiltered = Object.entries(mergedActionDefs).filter(
    ([actionKey]) => actor.actions?.[actionKey]?.show_on_panel !== false,
  );

  const effectiveActionsTab: SystemSheetLayoutTab | null | undefined =
    actor.actions_panel_override != null
      ? { id: 'actions', accordions: actor.actions_panel_override.accordions }
      : actionsTab ?? undefined;

  const accordions = effectiveActionsTab?.accordions?.filter(
    (a): a is SystemSheetLayoutAccordion =>
      !!a && typeof a === 'object' && typeof (a as SystemSheetLayoutAccordion).name === 'string',
  );

  const renderFlatGrid = (entries: [string, SystemActionDef][]) => (
    <div className="p-4 grid gap-2 sm:grid-cols-2">
      {entries.map(([actionKey, def]) => (
        <MacroRollButton
          key={actionKey}
          actionKey={actionKey}
          def={def}
          actor={actor}
          onRollAction={onRollAction}
        />
      ))}
    </div>
  );

  if (entriesFiltered.length === 0) {
    return (
      <div className="p-4 text-sm text-zinc-500">{t('modals.mini_sheet_actions_empty')}</div>
    );
  }

  if (!accordions?.length) {
    return renderFlatGrid(entriesFiltered);
  }

  const byKey = new Map(entriesFiltered);

  const sections = accordions.map((acc, idx) => {
    const ordered = acc.columns
      .map((key) => {
        const def = byKey.get(key);
        return def ? ([key, def] as [string, SystemActionDef]) : null;
      })
      .filter((row): row is [string, SystemActionDef] => !!row);

    if (ordered.length === 0) return null;

    const heading = (acc.name || '').trim() || t('modals.mini_sheet_group_other');
    const mode = normalizeSheetAccordionDisplay(acc.display);

    const macroGrid = (
      <div className="p-3 grid gap-2 sm:grid-cols-2">
        {ordered.map(([actionKey, def]) => (
          <MacroRollButton
            key={actionKey}
            actionKey={actionKey}
            def={def}
            actor={actor}
            onRollAction={onRollAction}
          />
        ))}
      </div>
    );

    return (
      <div key={`acc-${idx}-${heading}`} className="space-y-2">
        <div className="flex items-center gap-3 px-1 pt-1">
          <span className="h-px flex-1 bg-zinc-700/70 min-w-[1rem]" aria-hidden />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 shrink-0 max-w-[70%] truncate">
            {heading}
          </span>
          <span className="h-px flex-1 bg-zinc-700/70 min-w-[1rem]" aria-hidden />
        </div>

        {mode === 'open' ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 overflow-hidden">{macroGrid}</div>
        ) : (
          <details
            open
            className="group rounded-lg border border-zinc-800 bg-zinc-950/40 overflow-hidden"
          >
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 bg-zinc-800 text-sm text-zinc-200 border-b border-zinc-700/50 [&::-webkit-details-marker]:hidden">
              <ChevronDown
                size={14}
                className="shrink-0 text-zinc-500 transition-transform group-open:rotate-180"
              />
              <span className="font-medium truncate">{heading}</span>
            </summary>
            {macroGrid}
          </details>
        )}
      </div>
    );
  });

  const anyRendered = sections.some((s) => s != null);
  if (!anyRendered) {
    return renderFlatGrid(entriesFiltered);
  }

  return <div className="p-4 pt-3 space-y-4">{sections}</div>;
}
