import { memo, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AtSign, Dices, ListPlus, Plus, Sparkles } from 'lucide-react';
import type { Actor } from '../../types';

/** Item rendered in the popup list. */
export interface RollTokenItem {
  /** Token key without the trigger prefix (e.g. `str`, `attack`, the actor name). */
  key: string;
  /** User-facing label (column label / macro name / actor name). */
  label: string;
  /**
   * Per-actor preview cells. For `!` — numeric stat value; for `$` — formula.
   * Missing entries render as `—` (the actor doesn't have this stat/macro).
   */
  preview?: Record<string, string | undefined>;
  /** Actor ids for which this item is available (used for the "X/Y" badge). */
  presentIn?: string[];
}

export type RollTokenJoiner = '+' | ';';
export type RollTokenKind = 'at' | 'bang' | 'dollar';

export interface RollTokenPopupProps {
  kind: RollTokenKind;
  items: RollTokenItem[];
  /** Actors mentioned in the current input — drives the preview columns. */
  scopeActors: Actor[];
  /** Filter from the current partial token. */
  partial: string;
  /** Pixel offset from the bottom of the viewport (anchor above the input). */
  bottomPx: number;
  /** Single-select pick (plain click on a row). */
  onSingleSelect: (key: string) => void;
  /** Multi-select confirm — `at` mode never fires this. */
  onMultiSelect: (keys: string[], joiner: RollTokenJoiner) => void;
  /** Empty-state message override (e.g. "укажите актёра через @"). */
  emptyMessage?: string;
}

const KIND_META: Record<RollTokenKind, { icon: typeof AtSign; ring: string }> = {
  at: { icon: AtSign, ring: 'ring-emerald-500/40' },
  bang: { icon: Dices, ring: 'ring-amber-500/40' },
  dollar: { icon: Sparkles, ring: 'ring-amber-500/40' },
};

function filterItems(items: RollTokenItem[], partial: string): RollTokenItem[] {
  if (!partial) return items;
  const q = partial.toLowerCase();
  return items.filter(
    (it) => it.key.toLowerCase().includes(q) || it.label.toLowerCase().includes(q),
  );
}

function actorBadge(actor: Actor): string {
  const n = (actor.name || '').trim();
  return n.length > 12 ? `${n.slice(0, 11)}…` : n;
}

export const RollTokenPopup = memo(function RollTokenPopup({
  kind,
  items,
  scopeActors,
  partial,
  bottomPx,
  onSingleSelect,
  onMultiSelect,
  emptyMessage,
}: RollTokenPopupProps) {
  const { t } = useTranslation('core', { useSuspense: false });
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const filtered = useMemo(() => filterItems(items, partial), [items, partial]);

  // Reset selection if the items array identity changes (different popup invocation).
  useEffect(() => {
    setSelected(new Set());
  }, [items, kind]);

  const supportsMulti = kind !== 'at';
  const Meta = KIND_META[kind].icon;

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const apply = (joiner: RollTokenJoiner) => {
    const keys = Array.from(selected);
    if (keys.length === 0) return;
    if (keys.length === 1) onSingleSelect(keys[0]);
    else onMultiSelect(keys, joiner);
  };

  const empty = filtered.length === 0;

  return createPortal(
    <div
      role="dialog"
      aria-modal={false}
      style={{ bottom: bottomPx }}
      className={`fixed left-3 right-3 z-[9999] flex max-h-[60vh] flex-col overflow-hidden rounded-xl border border-zinc-700/80 bg-zinc-900/95 shadow-2xl backdrop-blur-sm ring-1 ${KIND_META[kind].ring}`}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800/80 bg-zinc-900/95 px-3 py-2 text-[11px] uppercase tracking-wider text-zinc-400">
        <Meta size={13} aria-hidden />
        <span>{t(`gm_console.popup_title_${kind}`)}</span>
        {supportsMulti && scopeActors.length > 0 ? (
          <span className="ml-auto inline-flex flex-wrap items-center gap-1 normal-case tracking-normal text-zinc-500">
            {scopeActors.map((a) => (
              <span
                key={a.id}
                className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300"
                title={a.name}
              >
                {actorBadge(a)}
              </span>
            ))}
          </span>
        ) : null}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto" role="listbox">
        {empty ? (
          <div className="px-3 py-3 text-xs text-zinc-500">
            {emptyMessage ?? t('gm_console.mention_no_results')}
          </div>
        ) : (
          <ul>
            {filtered.map((item) => {
              const isChecked = selected.has(item.key);
              const presentIn = item.presentIn;
              const partialBadge =
                presentIn &&
                presentIn.length > 0 &&
                scopeActors.length > 0 &&
                presentIn.length < scopeActors.length;
              return (
                <li key={item.key} role="option" aria-selected={isChecked}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (supportsMulti && (e.metaKey || e.ctrlKey || e.shiftKey)) {
                        toggle(item.key);
                        return;
                      }
                      onSingleSelect(item.key);
                    }}
                    className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm text-zinc-200 transition-colors hover:bg-zinc-800/60 ${
                      isChecked ? 'bg-zinc-800/60' : ''
                    }`}
                  >
                    {supportsMulti ? (
                      <input
                        type="checkbox"
                        checked={isChecked}
                        readOnly
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          toggle(item.key);
                        }}
                        className="h-3.5 w-3.5 cursor-pointer accent-amber-500"
                        tabIndex={-1}
                      />
                    ) : null}
                    <span className="flex-1 min-w-0 truncate">
                      <span className="text-zinc-100">{item.label}</span>
                      {item.label !== item.key ? (
                        <span className="ml-2 font-mono text-[11px] text-zinc-500">{item.key}</span>
                      ) : null}
                    </span>
                    {partialBadge ? (
                      <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                        {t('gm_console.popup_present_in', {
                          n: presentIn!.length,
                          m: scopeActors.length,
                        })}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Preview table */}
      {supportsMulti && selected.size > 0 && scopeActors.length > 0 ? (
        <div className="border-t border-zinc-800/80 bg-zinc-950/60 px-3 py-2">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">
            {t('gm_console.popup_preview')}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[11px] text-zinc-300">
              <thead>
                <tr>
                  <th className="border-b border-zinc-800 px-1 py-1 text-left font-normal text-zinc-500">
                    {t(`gm_console.popup_token_${kind}`)}
                  </th>
                  {scopeActors.map((a) => (
                    <th
                      key={a.id}
                      className="border-b border-zinc-800 px-1 py-1 text-left font-normal text-zinc-500"
                      title={a.name}
                    >
                      {actorBadge(a)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from(selected).map((key) => {
                  const it = items.find((x) => x.key === key);
                  if (!it) return null;
                  return (
                    <tr key={key}>
                      <td className="border-b border-zinc-800/40 px-1 py-1 align-top">
                        <span className="text-amber-400">
                          {kind === 'bang' ? '!' : '$'}
                          {it.key}
                        </span>{' '}
                        <span className="text-zinc-500">({it.label})</span>
                      </td>
                      {scopeActors.map((a) => {
                        const v = it.preview?.[a.id];
                        const has = v !== undefined && v !== '';
                        return (
                          <td
                            key={a.id}
                            className={`border-b border-zinc-800/40 px-1 py-1 align-top font-mono ${
                              has ? 'text-zinc-200' : 'text-zinc-600'
                            }`}
                          >
                            {has ? v : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Footer with confirm buttons */}
      {supportsMulti ? (
        <div className="flex items-center justify-end gap-1.5 border-t border-zinc-800/80 bg-zinc-900/95 px-3 py-2">
          <span className="mr-auto text-[10px] text-zinc-500">
            {selected.size === 0
              ? t('gm_console.popup_hint_empty')
              : t('gm_console.popup_hint_selected', { n: selected.size })}
          </span>
          <button
            type="button"
            disabled={selected.size === 0}
            onMouseDown={(e) => {
              e.preventDefault();
              apply('+');
            }}
            className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 transition hover:border-amber-500/50 hover:bg-zinc-800/70 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={12} aria-hidden />
            {t('gm_console.popup_apply_sum')}
          </button>
          <button
            type="button"
            disabled={selected.size === 0}
            onMouseDown={(e) => {
              e.preventDefault();
              apply(';');
            }}
            className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 transition hover:border-amber-500/50 hover:bg-zinc-800/70 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ListPlus size={12} aria-hidden />
            {t('gm_console.popup_apply_series')}
          </button>
        </div>
      ) : null}
    </div>,
    document.body,
  );
});
