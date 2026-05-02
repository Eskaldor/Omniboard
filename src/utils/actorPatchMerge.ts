import type { Actor, CombatState } from '../types';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function deepMergeRecords(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (isPlainObject(v) && isPlainObject(out[k])) {
      out[k] = deepMergeRecords(out[k] as Record<string, unknown>, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Deep-merge actor `actions`; `null` removes a macro key (delete custom macro). */
function deepMergeActorActions(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) {
      delete out[k];
    } else if (isPlainObject(v) && isPlainObject(out[k])) {
      out[k] = deepMergeRecords(out[k] as Record<string, unknown>, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Deep-merge `actions_panel_override` payloads (lists such as `accordions` replace on patch, like Python). */
function deepMergeActionsPanelOverride(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (isPlainObject(v) && isPlainObject(out[k])) {
      out[k] = deepMergeRecords(out[k] as Record<string, unknown>, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Collapse rapid UI edits into one PATCH body; deep-merge `stats` keys. */
export function mergeActorPatchBodies(
  previous: Record<string, unknown> | undefined,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const base = previous ? { ...previous } : {};
  for (const [key, value] of Object.entries(incoming)) {
    if (key === 'stats' && isPlainObject(value)) {
      const prevStats = base['stats'];
      base['stats'] = deepMergeRecords(
        isPlainObject(prevStats) ? prevStats : {},
        value,
      );
    } else if (key === 'actions' && isPlainObject(value)) {
      const prevActions = base['actions'];
      base['actions'] = deepMergeActorActions(
        isPlainObject(prevActions) ? prevActions : {},
        value,
      );
    } else if (key === 'actions_panel_override') {
      if (value === null) {
        delete base['actions_panel_override'];
      } else if (isPlainObject(value)) {
        const prev = base['actions_panel_override'];
        base['actions_panel_override'] = deepMergeActionsPanelOverride(
          isPlainObject(prev) ? prev : {},
          value,
        );
      } else {
        base[key] = value;
      }
    } else {
      base[key] = value;
    }
  }
  return base;
}

/** Apply one incremental patch to an actor for optimistic UI (single user action). */
export function applyActorPatchOptimistic(actor: Actor, patch: Record<string, unknown>): Actor {
  const baseStats = { ...(actor.stats ?? {}) };
  const next: Actor = { ...actor, stats: baseStats };
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'stats' && isPlainObject(value)) {
      next.stats = deepMergeRecords(
        next.stats as Record<string, unknown>,
        value,
      ) as Actor['stats'];
    } else if (key === 'actions' && isPlainObject(value)) {
      next.actions = deepMergeActorActions(
        (next.actions ?? {}) as Record<string, unknown>,
        value,
      ) as Actor['actions'];
    } else if (key === 'actions_panel_override') {
      if (value === null) {
        next.actions_panel_override = undefined;
      } else if (isPlainObject(value)) {
        const prevRaw = next.actions_panel_override;
        const prev =
          prevRaw !== undefined && prevRaw !== null && typeof prevRaw === 'object' && !Array.isArray(prevRaw)
            ? { ...(prevRaw as Record<string, unknown>) }
            : {};
        next.actions_panel_override = deepMergeActionsPanelOverride(prev, value) as Actor['actions_panel_override'];
      } else {
        (next as Record<string, unknown>)[key] = value;
      }
    } else {
      (next as Record<string, unknown>)[key] = value;
    }
  }
  return next;
}

/**
 * Patches queued for PATCH /api/actors/:id (debounced). While non-empty, incoming server
 * state (WebSocket / refetch) is re-merged with these so UI does not flash stale stats.
 */
const pendingByActorId = new Map<string, Record<string, unknown>>();

export function accumulatePendingActorPatch(actorId: string, patch: Record<string, unknown>): void {
  pendingByActorId.set(actorId, mergeActorPatchBodies(pendingByActorId.get(actorId), patch));
}

export function takeAndClearPendingActorPatch(actorId: string): Record<string, unknown> | undefined {
  const body = pendingByActorId.get(actorId);
  pendingByActorId.delete(actorId);
  return body;
}

/** Snapshot and clear all pending patches (e.g. React unmount). */
export function drainAllPendingActorPatches(): [string, Record<string, unknown>][] {
  const out = [...pendingByActorId.entries()];
  pendingByActorId.clear();
  return out;
}

/** Re-apply all pending actor patches onto server snapshot (no map mutation). */
export function applyPendingPatchesToCombatState(state: CombatState | null): CombatState | null {
  if (!state || pendingByActorId.size === 0) {
    return state;
  }
  return {
    ...state,
    core: {
      ...state.core,
      actors: state.core.actors.map((a) => {
        const pending = pendingByActorId.get(a.id);
        if (!pending || Object.keys(pending).length === 0) {
          return a;
        }
        return applyActorPatchOptimistic(a, pending);
      }),
    },
  };
}
