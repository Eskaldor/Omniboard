import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  Actor,
  CombatSession,
  MatrixActorPrerollsRow,
  MatrixPrerollSlot,
  MatrixQueueEntry,
  MatrixRollResult,
  MatrixRuleGroup,
} from '../../types';
import { isMatrixPrerollGroupRow } from '../../types';

function formatRollTotal(r: MatrixRollResult, unknownTotal: string): string {
  return typeof r.total === 'number' && Number.isFinite(r.total) ? String(r.total) : unknownTotal;
}

/** Compact pill body: shows just totals or `[label] N | [label] N` for composite. */
function pillBody(
  display: 'single' | 'pair',
  slot: MatrixPrerollSlot,
  unknownTotal: string,
): string {
  const results = slot.results ?? [];
  const labels = slot.part_labels ?? [];
  const hasNamedParts = labels.some((l) => (l ?? '').trim().length > 0);

  if (hasNamedParts) {
    return results
      .map((r, i) => {
        const tot = formatRollTotal(r, unknownTotal);
        const lbl = (labels[i] ?? '').trim();
        return lbl ? `${lbl} ${tot}` : tot;
      })
      .join(' · ');
  }

  if (results.length > 1 || display === 'pair') {
    return results.map((r) => formatRollTotal(r, unknownTotal)).join(' · ');
  }

  return formatRollTotal(results[0] ?? ({ total: NaN } as MatrixRollResult), unknownTotal);
}

type HeaderGroup =
  | { mode: 'v2'; key: string; groupId: string; label: string }
  | { mode: 'legacy'; key: string; ruleId: string; label: string };

function buildHeaderGroups(rowsByActor: Record<string, MatrixActorPrerollsRow[]>): HeaderGroup[] {
  const out: HeaderGroup[] = [];
  const seenV2 = new Set<string>();
  const seenLegacy = new Set<string>();
  for (const rows of Object.values(rowsByActor)) {
    for (const row of rows) {
      if (isMatrixPrerollGroupRow(row)) {
        if (!seenV2.has(row.group_id)) {
          seenV2.add(row.group_id);
          out.push({ mode: 'v2', key: `v2:${row.group_id}`, groupId: row.group_id, label: row.label });
        }
      } else {
        if (!seenLegacy.has(row.rule_id)) {
          seenLegacy.add(row.rule_id);
          out.push({ mode: 'legacy', key: `legacy:${row.rule_id}`, ruleId: row.rule_id, label: row.label });
        }
      }
    }
  }
  return out;
}

function findGroupRow(rows: MatrixActorPrerollsRow[], groupId: string) {
  for (const row of rows) {
    if (isMatrixPrerollGroupRow(row) && row.group_id === groupId) return row;
  }
  return null;
}

function findLegacyRow(rows: MatrixActorPrerollsRow[], ruleId: string): MatrixRuleGroup | null {
  for (const row of rows) {
    if (!isMatrixPrerollGroupRow(row) && row.rule_id === ruleId) return row;
  }
  return null;
}

function isQueued(
  queue: Record<string, MatrixQueueEntry[]>,
  actorId: string,
  cellId: string,
  slotIndex: number,
): boolean {
  const q = queue[actorId] ?? [];
  return q.some((e) => e.cell_id === cellId && e.slot_index === slotIndex);
}

const pillBase =
  'inline-flex max-w-full items-center gap-1 rounded-full text-[11px] tabular-nums px-2.5 py-1 leading-none border transition-colors';
const pillIdle = 'bg-zinc-800/80 text-zinc-300 border-zinc-700 hover:bg-zinc-800';
const pillQueued =
  'bg-emerald-600/25 text-emerald-200 border-emerald-500/50 hover:bg-emerald-600/35';
const pillOpen =
  'bg-zinc-700/80 text-zinc-100 border-zinc-500 ring-1 ring-emerald-500/40';

interface PopoverState {
  actorId: string;
  cellId: string;
  slotIndex: number;
}

interface SlotPillProps {
  actorId: string;
  cellId: string;
  cellLabel: string;
  display: 'single' | 'pair';
  slot: MatrixPrerollSlot;
  queued: boolean;
  open: boolean;
  unknownTotal: string;
  onClickPill: () => void;
  onToggleQueued: () => void;
  closeLabel: string;
  queueAddLabel: string;
  queueRemoveLabel: string;
  glitchLabel: string;
  critGlitchLabel: string;
  onClose: () => void;
}

function SlotPill({
  cellLabel,
  display,
  slot,
  queued,
  open,
  unknownTotal,
  onClickPill,
  onToggleQueued,
  queueAddLabel,
  queueRemoveLabel,
  glitchLabel,
  critGlitchLabel,
  onClose,
}: SlotPillProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const body = pillBody(display, slot, unknownTotal);
  const labels = slot.part_labels ?? [];

  const hasGlitch = (slot.results ?? []).some((r) => r.is_glitch === true);
  const hasCritGlitch = (slot.results ?? []).some((r) => r.is_crit_glitch === true);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const accent = hasCritGlitch
    ? 'border-rose-500/70 ring-1 ring-rose-500/30'
    : hasGlitch
    ? 'border-amber-500/60'
    : '';

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={onClickPill}
        className={`${pillBase} ${open ? pillOpen : queued ? pillQueued : pillIdle} ${accent}`}
      >
        {hasCritGlitch ? <span className="text-rose-300" aria-label={critGlitchLabel}>!!</span> : null}
        {!hasCritGlitch && hasGlitch ? <span className="text-amber-300" aria-label={glitchLabel}>!</span> : null}
        <span className="truncate">{body}</span>
      </button>
      {open ? (
        <div
          className="absolute left-0 z-50 mt-1 min-w-[16rem] max-w-[22rem] rounded-lg border border-zinc-700 bg-zinc-950/97 p-3 shadow-xl shadow-black/60"
          role="dialog"
        >
          {cellLabel.trim() ? (
            <div className="mb-2 truncate text-[11px] font-semibold uppercase tracking-wide text-zinc-300">
              {cellLabel}
            </div>
          ) : null}
          <div className="space-y-1.5 text-[11px] text-zinc-300">
            {(slot.results ?? []).map((r, i) => {
              const partLbl = (labels[i] ?? '').trim();
              const formula = (r.formula ?? '').trim();
              const total = formatRollTotal(r, unknownTotal);
              const details = (r.details ?? '').trim();
              return (
                <div key={i} className="space-y-0.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-zinc-400 truncate">
                      {partLbl ? `${partLbl}: ` : ''}
                      <span className="font-mono">{formula || '—'}</span>
                    </span>
                    <span className="font-mono text-zinc-100 text-sm tabular-nums shrink-0">{total}</span>
                  </div>
                  {details ? (
                    <div className="text-[10px] font-mono text-zinc-500 whitespace-pre-wrap break-words leading-snug">
                      {details}
                    </div>
                  ) : null}
                  {r.is_crit_glitch ? (
                    <div className="text-[10px] font-medium text-rose-400">{critGlitchLabel}</div>
                  ) : r.is_glitch ? (
                    <div className="text-[10px] font-medium text-amber-400">{glitchLabel}</div>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-end">
            <button
              type="button"
              onClick={onToggleQueued}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                queued
                  ? 'bg-emerald-600/30 text-emerald-200 hover:bg-emerald-600/40'
                  : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
              }`}
            >
              {queued ? queueRemoveLabel : queueAddLabel}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export const RollMatrixDrawer = memo(function RollMatrixDrawer({
  combatSession,
  onRefetch,
}: {
  combatSession: CombatSession | null;
  onRefetch?: () => void | Promise<void>;
}) {
  const { t } = useTranslation('core', { useSuspense: false });
  const unknownTotal = t('stat_editor.unknown_total');
  const queueAddLabel = t('config_modal.matrix_queue_add');
  const queueRemoveLabel = t('config_modal.matrix_queue_remove');
  const glitchLabel = t('config_modal.matrix_glitch');
  const critGlitchLabel = t('config_modal.matrix_crit_glitch');
  const closeLabel = t('config_modal.matrix_collapse_group');

  const prerolls = combatSession?.session?.prerolls ?? {};
  const queue = combatSession?.session?.matrix_cell_queue ?? {};
  const ghostGlobal = combatSession?.session?.matrix_ghost_global === true;
  const rowGhost = combatSession?.session?.matrix_row_ghost ?? {};

  const [openPopover, setOpenPopover] = useState<PopoverState | null>(null);

  const actorsById = useMemo(() => {
    const m = new Map<string, Actor>();
    for (const a of combatSession?.core?.actors ?? []) m.set(a.id, a);
    return m;
  }, [combatSession?.core?.actors]);

  const actorIds = useMemo(() => Object.keys(prerolls), [prerolls]);
  const headerGroups = useMemo(() => buildHeaderGroups(prerolls), [prerolls]);

  const patchSelection = useCallback(
    async (actorId: string, cellId: string, slotIndex: number, queued: boolean) => {
      try {
        await fetch('/api/combat/matrix/selection', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actor_id: actorId, cell_id: cellId, slot_index: slotIndex, queued }),
        });
        await onRefetch?.();
      } catch {
        /* ignore */
      }
    },
    [onRefetch],
  );

  const patchGhostGlobal = useCallback(
    async (next: boolean) => {
      try {
        await fetch('/api/combat/matrix/ghost', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ matrix_ghost_global: next }),
        });
        await onRefetch?.();
      } catch {
        /* ignore */
      }
    },
    [onRefetch],
  );

  const patchRowGhost = useCallback(
    async (actorId: string, next: boolean) => {
      try {
        await fetch('/api/combat/matrix/ghost', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actor_id: actorId, row_ghost: next }),
        });
        await onRefetch?.();
      } catch {
        /* ignore */
      }
    },
    [onRefetch],
  );

  const generateMatrix = useCallback(async () => {
    try {
      await fetch('/api/combat/matrix/generate', { method: 'POST' });
      await onRefetch?.();
    } catch {
      /* ignore */
    }
  }, [onRefetch]);

  const isPopoverOpen = (actorId: string, cellId: string, slotIndex: number) =>
    openPopover !== null &&
    openPopover.actorId === actorId &&
    openPopover.cellId === cellId &&
    openPopover.slotIndex === slotIndex;

  const onPillClick = (actorId: string, cellId: string, slotIndex: number) => {
    if (isPopoverOpen(actorId, cellId, slotIndex)) {
      setOpenPopover(null);
    } else {
      setOpenPopover({ actorId, cellId, slotIndex });
    }
  };

  const renderSlotPills = (
    actorId: string,
    cellId: string,
    cellLabel: string,
    display: 'single' | 'pair',
    slots: MatrixPrerollSlot[],
  ) =>
    slots.map((slot) => {
      const q = isQueued(queue, actorId, cellId, slot.index);
      const open = isPopoverOpen(actorId, cellId, slot.index);
      return (
        <SlotPill
          key={`${cellId}-${slot.index}`}
          actorId={actorId}
          cellId={cellId}
          cellLabel={cellLabel}
          display={display}
          slot={slot}
          queued={q}
          open={open}
          unknownTotal={unknownTotal}
          onClickPill={() => onPillClick(actorId, cellId, slot.index)}
          onToggleQueued={() => {
            void patchSelection(actorId, cellId, slot.index, !q);
            setOpenPopover(null);
          }}
          closeLabel={closeLabel}
          queueAddLabel={queueAddLabel}
          queueRemoveLabel={queueRemoveLabel}
          glitchLabel={glitchLabel}
          critGlitchLabel={critGlitchLabel}
          onClose={() => setOpenPopover(null)}
        />
      );
    });

  return (
    <div className="pointer-events-auto max-h-[min(70vh,520px)] flex flex-col gap-3 border-b border-zinc-800 bg-zinc-900/95 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void generateMatrix()}
          className="rounded-lg bg-amber-600/20 px-3 py-1.5 text-xs font-medium text-amber-200 ring-1 ring-amber-500/35 hover:bg-amber-600/30"
        >
          {t('gm_console.roll_matrix_regenerate')}
        </button>
        <label className="flex items-center gap-2 text-[11px] text-zinc-400 cursor-pointer select-none">
          <input
            type="checkbox"
            className="rounded border-zinc-600 bg-zinc-900 text-emerald-500 focus:ring-emerald-500/40"
            checked={ghostGlobal}
            onChange={(e) => void patchGhostGlobal(e.target.checked)}
          />
          {t('gm_console.roll_matrix_ghost_global')}
        </label>
      </div>

      {actorIds.length === 0 ? (
        <p className="text-xs text-zinc-500">{t('gm_console.roll_matrix_empty')}</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-zinc-800">
          <table className="w-auto border-collapse text-xs">
            <thead>
              <tr className="bg-zinc-950/80">
                <th className="sticky left-0 z-20 w-px max-w-[14rem] bg-zinc-950 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-500 border-b border-r border-zinc-800 shadow-[4px_0_14px_-6px_rgba(0,0,0,0.55)]">
                  {t('gm_console.roll_matrix_actor')}
                </th>
                {headerGroups.map((g) => (
                  <th
                    key={g.key}
                    className="px-3 py-2.5 text-left border-b border-zinc-800 whitespace-nowrap"
                    title={g.label}
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-300">
                      {g.label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {actorIds.map((aid) => {
                const actor = actorsById.get(aid);
                const rows = prerolls[aid] ?? [];
                const rg = rowGhost[aid] === true;
                const ghosted = rg || ghostGlobal;
                const ghostTitle = rg
                  ? t('gm_console.roll_matrix_ghost_row')
                  : t('gm_console.roll_matrix_ghost_row');
                return (
                  <tr key={aid} className="border-b border-zinc-800/80 hover:bg-zinc-900/60">
                    <td className="sticky left-0 z-10 w-px max-w-[14rem] bg-zinc-950/98 px-3 py-2 text-xs font-medium whitespace-nowrap border-r border-zinc-800 shadow-[4px_0_14px_-6px_rgba(0,0,0,0.45)]">
                      <button
                        type="button"
                        title={ghostTitle}
                        onClick={() => void patchRowGhost(aid, !rg)}
                        className={`block w-full text-left transition-colors ${
                          ghosted
                            ? 'text-zinc-600 italic line-through decoration-zinc-700'
                            : 'text-zinc-200 hover:text-zinc-100'
                        }`}
                      >
                        {actor?.name ?? aid}
                      </button>
                    </td>
                    {headerGroups.map((g) => {
                      if (g.mode === 'v2') {
                        const groupRow = findGroupRow(rows, g.groupId);
                        if (!groupRow) {
                          return (
                            <td key={g.key} className="px-3 py-2 align-middle text-zinc-600">
                              —
                            </td>
                          );
                        }
                        const visibleColumns = groupRow.columns.filter((c) => !c.skipped);
                        if (visibleColumns.length === 0) {
                          return (
                            <td key={g.key} className="px-3 py-2 align-middle text-zinc-600">
                              —
                            </td>
                          );
                        }
                        const showColumnLabels = visibleColumns.length > 1;
                        return (
                          <td key={g.key} className="px-2 py-2 align-top">
                            <div className="flex flex-row items-start gap-x-3 gap-y-2 flex-nowrap">
                              {visibleColumns.map((cell) => (
                                <div key={cell.cell_id} className="flex flex-col gap-1 min-w-[3rem]">
                                  {showColumnLabels && cell.label.trim() ? (
                                    <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 leading-tight">
                                      {cell.label}
                                    </span>
                                  ) : null}
                                  <div className="flex flex-col items-start gap-1">
                                    {renderSlotPills(
                                      aid,
                                      cell.cell_id,
                                      cell.label,
                                      cell.display as 'single' | 'pair',
                                      cell.slots,
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                        );
                      }

                      const ruleRow = findLegacyRow(rows, g.ruleId);
                      if (!ruleRow) {
                        return (
                          <td key={g.key} className="px-3 py-2 align-middle text-zinc-600">
                            —
                          </td>
                        );
                      }
                      return (
                        <td key={g.key} className="px-3 py-2 align-top">
                          <div className="flex flex-col items-start gap-1">
                            {renderSlotPills(
                              aid,
                              ruleRow.rule_id,
                              ruleRow.label,
                              ruleRow.display,
                              ruleRow.slots,
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});
