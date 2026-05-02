import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Actor } from '../../types';
import type { SystemActionDef } from '../../hooks/useSystemActions';

type Ov = NonNullable<Actor['actions']>[string];

function mergeEntry(prev: Ov | undefined, partial: Partial<Ov>): Ov {
  const p = prev ?? {};
  return {
    show_on_panel:
      partial.show_on_panel !== undefined ? Boolean(partial.show_on_panel) : Boolean(p.show_on_panel),
    formula_override:
      partial.formula_override !== undefined
        ? String(partial.formula_override).trim() || undefined
        : p.formula_override,
    comment:
      partial.comment !== undefined ? String(partial.comment).trim() || undefined : p.comment,
  };
}

export function ActorActionEditor({
  actor,
  systemActions,
  onPatchActor,
}: {
  actor: Actor;
  systemActions: Record<string, SystemActionDef>;
  onPatchActor: (updates: Partial<Actor>) => void;
}) {
  const { t } = useTranslation('core', { useSuspense: false });

  const actionKeys = useMemo(() => {
    const fromSystem = Object.keys(systemActions);
    const fromActor = Object.keys(actor.actions ?? {});
    return [...new Set([...fromSystem, ...fromActor])].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    );
  }, [actor.actions, systemActions]);

  const patchActionKey = (key: string, partial: Partial<Ov>) => {
    const prevEntry = actor.actions?.[key];
    const nextEntry = mergeEntry(prevEntry, partial);
    onPatchActor({
      actions: {
        [key]: nextEntry,
      },
    });
  };

  const inputClass =
    'w-full py-1.5 px-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none';

  return (
    <div className="p-4 space-y-3">
      <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
        {t('modals.action_editor_title')}
      </div>
      {actionKeys.length === 0 ? (
        <p className="text-sm text-zinc-500">{t('modals.mini_sheet_actions_empty')}</p>
      ) : (
        <div className="grid gap-3">
          {actionKeys.map((key) => {
            const def = systemActions[key];
            const label = def?.name ?? key;
            const entry = actor.actions?.[key];
            const showOn = entry?.show_on_panel === true;
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
  );
}
