import type { Actor, ColumnConfig } from '../types';

const STAT_VALUE_KEYS = new Set(['base', 'value', 'formula_id', 'overrides']);

/** Serialized `StatValue` from backend (not checkbox_group nested map). */
export function isStatValuePayload(v: unknown): v is {
  base?: number;
  value?: number;
  formula_id?: string | null;
  overrides?: unknown[];
} {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const keys = Object.keys(v as object);
  if (keys.length === 0) return false;
  return keys.every((k) => STAT_VALUE_KEYS.has(k));
}

/** Numeric display / edit value: plain number or `StatValue.value` (fallback `base`). */
export function getStatNumeric(v: unknown, defaultNum = 0): number {
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (isStatValuePayload(v)) {
    if (typeof v.value === 'number' && !Number.isNaN(v.value)) return v.value;
    if (typeof v.base === 'number' && !Number.isNaN(v.base)) return v.base;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : defaultNum;
}

export type StatOverrideDraft = { source: string; value: number };

export interface StatValueDraft {
  base: number;
  value: number;
  formula_id: string | null;
  overrides: StatOverrideDraft[];
}

export function parseStatValueDraft(raw: unknown): StatValueDraft {
  const num = (x: unknown) => {
    const n = typeof x === 'number' ? x : parseFloat(String(x ?? ''));
    return Number.isFinite(n) ? n : 0;
  };
  if (isStatValuePayload(raw)) {
    const ovr = Array.isArray(raw.overrides)
      ? raw.overrides
          .filter((x): x is Record<string, unknown> => x != null && typeof x === 'object' && !Array.isArray(x))
          .map((x) => ({
            source: String((x as { source?: unknown }).source ?? ''),
            value: num((x as { value?: unknown }).value),
          }))
          .filter((x) => x.source !== '')
      : [];
    const fid = raw.formula_id;
    return {
      base: num(raw.base),
      value: getStatNumeric(raw, 0),
      formula_id: typeof fid === 'string' && fid.trim() !== '' ? fid : null,
      overrides: ovr,
    };
  }
  if (typeof raw === 'number' && !Number.isNaN(raw)) {
    return { base: raw, value: raw, formula_id: null, overrides: [] };
  }
  return { base: 0, value: 0, formula_id: null, overrides: [] };
}

/** Шаблон быстрого броска по системе (колонка = ключ стата). */
export function buildQuickRollExpression(systemName: string, statKey: string): string {
  const s = (systemName || '').toLowerCase();
  if (s.includes('shadowrun')) return `[${statKey}]`;
  return `1d20 + [${statKey}]`;
}

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
  newVal: number,
): Record<string, unknown> {
  const prev = actor.stats ?? {};
  const stats = { ...prev, [baseKey]: newVal };
  const maxKey = getMaxKey(col);
  if (maxKey) {
    const currentMax = getStatNumeric(prev[maxKey], 0);
    if (prev[maxKey] === undefined || prev[maxKey] === null || currentMax === 0) {
      stats[maxKey] = newVal;
    }
  }
  return stats;
}
