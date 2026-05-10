import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  Actor,
  CombatSession,
  MatrixActorPrerollsRow,
  MatrixColumnCell,
  MatrixPrerollSlot,
  MatrixQueueEntry,
  MatrixRuleGroup,
} from '../../types';
import { isMatrixPrerollGroupRow } from '../../types';

function slotSummary(display: 'single' | 'pair', slot: MatrixPrerollSlot, unknownTotal: string): string {
  const parts = (slot.results ?? []).map((r) =>
    typeof r.total === 'number' && Number.isFinite(r.total) ? String(r.total) : unknownTotal,
  );
  if (parts.length > 1) return parts.join(' | ');
  if (display === 'pair') return parts.join(' | ');
  return parts[0] ?? unknownTotal;
}

function slotTooltip(slot: MatrixPrerollSlot): string {
  return (slot.results ?? []).map((r) => `${r.formula} → ${r.total}: ${r.details}`).join('; ');
}

type HeaderCol =
  | { mode: 'legacy'; ruleId: string; label: string }
  | { mode: 'v2'; cellId: string; label: string; groupLabel: string };

function buildHeaderColumns(rows: MatrixActorPrerollsRow[]): HeaderCol[] {
  const out: HeaderCol[] = [];
  for (const row of rows) {
    if (isMatrixPrerollGroupRow(row)) {
      for (const c of row.columns) {
        out.push({ mode: 'v2', cellId: c.cell_id, label: c.label, groupLabel: row.label });
      }
    } else {
      out.push({ mode: 'legacy', ruleId: row.rule_id, label: row.label });
    }
  }
  return out;
}

function iterateSlotsForColumn(
  rows: MatrixActorPrerollsRow[],
  col: HeaderCol,
): MatrixColumnCell | MatrixRuleGroup | null {
  for (const row of rows) {
    if (col.mode === 'legacy' && !isMatrixPrerollGroupRow(row) && row.rule_id === col.ruleId) {
      return row;
    }
    if (col.mode === 'v2' && isMatrixPrerollGroupRow(row)) {
      const c = row.columns.find((x) => x.cell_id === col.cellId);
      if (c) return c;
    }
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

export const RollMatrixDrawer = memo(function RollMatrixDrawer({
  combatSession,
  onRefetch,
}: {
  combatSession: CombatSession | null;
  onRefetch?: () => void | Promise<void>;
}) {
  const { t } = useTranslation('core', { useSuspense: false });
  const unknownTotal = t('stat_editor.unknown_total');

  const prerolls = combatSession?.session?.prerolls ?? {};
  const queue = combatSession?.session?.matrix_cell_queue ?? {};
  const ghostGlobal = combatSession?.session?.matrix_ghost_global === true;
  const rowGhost = combatSession?.session?.matrix_row_ghost ?? {};

  const actorsById = useMemo(() => {
    const m = new Map<string, Actor>();
    for (const a of combatSession?.core?.actors ?? []) {
      m.set(a.id, a);
    }
    return m;
  }, [combatSession?.core?.actors]);

  const actorIds = useMemo(() => Object.keys(prerolls), [prerolls]);

  const headerColumns = useMemo(() => {
    const first = actorIds[0];
    if (!first) return [];
    return buildHeaderColumns(prerolls[first] ?? []);
  }, [actorIds, prerolls]);

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
          <table className="w-max min-w-full border-collapse text-xs">
            <thead>
              <tr className="bg-zinc-950/80">
                <th className="sticky left-0 z-10 bg-zinc-950 px-2 py-2 text-left font-medium text-zinc-400 border-b border-zinc-800">
                  {t('gm_console.roll_matrix_actor')}
                </th>
                <th className="px-2 py-2 text-left font-medium text-zinc-500 border-b border-zinc-800 w-24">
                  {t('gm_console.roll_matrix_ghost_row')}
                </th>
                {headerColumns.map((col) => (
                  <th
                    key={col.mode === 'legacy' ? col.ruleId : col.cellId}
                    className="px-2 py-2 text-left font-medium text-zinc-300 border-b border-zinc-800 whitespace-nowrap max-w-[10rem]"
                    title={col.mode === 'v2' ? `${col.groupLabel} · ${col.label}` : col.label}
                  >
                    {col.mode === 'v2' ? (
                      <span className="flex flex-col gap-0.5">
                        <span className="text-[10px] text-zinc-500 truncate">{col.groupLabel}</span>
                        <span className="truncate">{col.label}</span>
                      </span>
                    ) : (
                      <span className="truncate">{col.label}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {actorIds.map((aid) => {
                const actor = actorsById.get(aid);
                const rows = prerolls[aid] ?? [];
                const rg = rowGhost[aid] === true;
                return (
                  <tr key={aid} className="border-b border-zinc-800/80 hover:bg-zinc-900/60">
                    <td className="sticky left-0 z-10 bg-zinc-950/95 px-2 py-1.5 font-medium text-zinc-200 whitespace-nowrap border-r border-zinc-800/60">
                      {actor?.name ?? aid}
                    </td>
                    <td className="px-2 py-1.5 align-middle">
                      <input
                        type="checkbox"
                        title={t('gm_console.roll_matrix_ghost_row')}
                        className="rounded border-zinc-600 bg-zinc-900 text-emerald-500 focus:ring-emerald-500/40"
                        checked={rg}
                        onChange={(e) => void patchRowGhost(aid, e.target.checked)}
                      />
                    </td>
                    {headerColumns.map((hc) => {
                      const cellEnt = iterateSlotsForColumn(rows, hc);
                      const ruleId = hc.mode === 'legacy' ? hc.ruleId : hc.cellId;
                      if (!cellEnt) {
                        return (
                          <td key={ruleId} className="px-1 py-1 align-middle text-zinc-600">
                            —
                          </td>
                        );
                      }
                      if ('skipped' in cellEnt && cellEnt.skipped) {
                        return (
                          <td key={ruleId} className="px-1 py-1 align-middle text-zinc-600">
                            —
                          </td>
                        );
                      }
                      const display = cellEnt.display as 'single' | 'pair';
                      const slots = cellEnt.slots ?? [];
                      return (
                        <td key={ruleId} className="px-1 py-1 align-top whitespace-nowrap">
                          <div className="flex flex-wrap gap-0.5">
                            {slots.map((slot) => {
                              const summary = slotSummary(display, slot, unknownTotal);
                              const tip = slotTooltip(slot);
                              const q = isQueued(queue, aid, ruleId, slot.index);
                              return (
                                <button
                                  key={`${ruleId}-${slot.index}`}
                                  type="button"
                                  title={tip}
                                  onClick={() => void patchSelection(aid, ruleId, slot.index, !q)}
                                  className={`text-[11px] tabular-nums px-1.5 py-0.5 rounded border transition-colors ${
                                    q
                                      ? 'bg-emerald-600/25 text-emerald-100 border-emerald-500/50 ring-1 ring-emerald-500/30'
                                      : 'bg-zinc-800/80 text-zinc-200 border-zinc-700 hover:bg-zinc-700'
                                  }`}
                                >
                                  {summary}
                                </button>
                              );
                            })}
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
