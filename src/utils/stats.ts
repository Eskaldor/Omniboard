import type { Actor, ColumnConfig } from '../types';

export function getMaxKey(col: ColumnConfig): string | undefined {
  return col.max_key ?? col.maxKey;
}

/**
 * Build stats payload for updating a base stat.
 * If the column has a max_key and the current max is 0/undefined/null,
 * auto-initializes the max stat to the new base value.
 */
export function buildStatUpdate(
  actor: Actor,
  col: ColumnConfig,
  baseKey: string,
  newVal: number
): Record<string, unknown> {
  const prev = actor.stats ?? {};
  const stats = { ...prev, [baseKey]: newVal };
  const maxKey = getMaxKey(col);
  if (maxKey) {
    const currentMax = prev[maxKey];
    if (currentMax === undefined || currentMax === null || currentMax === 0) {
      stats[maxKey] = newVal;
    }
  }
  return stats;
}
