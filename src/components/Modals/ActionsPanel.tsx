import React from 'react';
import { Dices } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Actor } from '../../types';
import type { SystemActionDef } from '../../hooks/useSystemActions';

export function ActionsPanel({
  actor,
  systemActions,
  onRollAction,
}: {
  actor: Actor;
  systemActions: Record<string, SystemActionDef>;
  onRollAction: (formula: string, comment: string) => void | Promise<void>;
}) {
  const { t } = useTranslation('core', { useSuspense: false });
  const entries = Object.entries(systemActions);

  if (entries.length === 0) {
    return (
      <div className="p-4 text-sm text-zinc-500">{t('modals.mini_sheet_actions_empty')}</div>
    );
  }

  return (
    <div className="p-4 grid gap-2 sm:grid-cols-2">
      {entries.map(([actionKey, def]) => {
        const ov = actor.actions?.[actionKey];
        const displayFormula = (ov?.formula_override?.trim() || def.formula).trim();
        const rollComment = (ov?.comment?.trim() || def.name).trim() || actionKey;

        return (
          <button
            key={actionKey}
            type="button"
            onClick={() => void onRollAction(displayFormula, rollComment)}
            className="text-left rounded-xl border border-zinc-800 bg-zinc-950/50 hover:border-emerald-500/40 hover:bg-zinc-900/60 px-3 py-2.5 transition-colors group"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium text-zinc-200 truncate">{def.name}</span>
              <Dices
                size={16}
                className="shrink-0 text-zinc-500 group-hover:text-emerald-400 transition-colors"
              />
            </div>
            <div className="mt-1 font-mono text-[11px] text-zinc-500 truncate" title={displayFormula}>
              {displayFormula}
            </div>
          </button>
        );
      })}
    </div>
  );
}
