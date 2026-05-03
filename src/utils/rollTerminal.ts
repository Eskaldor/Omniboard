import type { Actor, ColumnConfig } from '../types';
import type { SystemActionDef } from '../hooks/useSystemActions';
import { getStatNumeric } from './stats';

/* ----------------------------------------------------------------------------
 * GM-console roll terminal: shared parsing + per-actor resolution.
 *
 * Public surface:
 *   - `findCaretToken(text, caret)`   — caret-aware trigger detection (@ / ! / $)
 *   - `replaceTokenInText(...)`       — autocomplete insert helper
 *   - `parseRollInput(text, actors)`  — strip `# comment` and `@Mention`s
 *   - `planSegmentsForActor(...)`     — split by `;` and resolve each segment
 *   - `previewSegmentForActor(...)`   — same, but returns intermediate steps
 *
 * Token semantics:
 *   `!key`  →  longest match against `actor.stats` keys; substituted to numeric value.
 *              When the whole segment is just `!key`, expands to the column's
 *              `roll_formula` (or `<system_dice> + !key`) before resolution.
 *   `$key`  →  longest match against merged action defs (system + per-actor `custom_formula`);
 *              substituted to `(formula)`. Per-actor `formula_override` is honoured.
 *   `;`     →  segment separator. Each segment is sent as its own `RollRequest`.
 *   `#`     →  trailing comment (existing behaviour).
 *
 * `!` is intentionally not triggered after digits / dice tokens (e.g. `4d6!`,
 * `1d10!>8`) — d20 explode notation is preserved verbatim.
 * -------------------------------------------------------------------------- */

export type TokenKind = 'at' | 'bang' | 'dollar';

export interface CaretToken {
  kind: TokenKind;
  /** Inclusive index of the trigger char (`@`/`!`/`$`). */
  start: number;
  /** Exclusive end of the partial token (== caret position). */
  end: number;
  /** Text after the trigger char up to the caret. */
  partial: string;
}

/** Characters before the trigger that allow `@`/`!`/`$` to act as a token start. */
const TRIGGER_BREAK = /[\s+\-*/(),;]/;

function isTriggerStart(text: string, idx: number): boolean {
  if (idx === 0) return true;
  return TRIGGER_BREAK.test(text[idx - 1]);
}

/** Same gate used by `findCaretToken` and the resolver — keeps both in lockstep. */
function isStatTriggerAt(text: string, idx: number): boolean {
  if (text[idx] !== '!') return false;
  const next = text[idx + 1] ?? '';
  return isTriggerStart(text, idx) && /^[\p{L}_]/u.test(next);
}

function isMacroTriggerAt(text: string, idx: number): boolean {
  if (text[idx] !== '$') return false;
  const next = text[idx + 1] ?? '';
  return isTriggerStart(text, idx) && /^[\w-]/.test(next);
}

/**
 * Find the open token whose tail sits at the caret. Scans backwards from `caret`
 * stopping at the first whitespace/operator. Returns null when the caret is not
 * inside a `@`/`!`/`$` token.
 */
export function findCaretToken(text: string, caret: number): CaretToken | null {
  if (caret < 0 || caret > text.length) return null;
  for (let i = caret - 1; i >= 0; i -= 1) {
    const ch = text[i];
    if (ch === '@') {
      return isTriggerStart(text, i)
        ? { kind: 'at', start: i, end: caret, partial: text.slice(i + 1, caret) }
        : null;
    }
    if (ch === '$') {
      return isTriggerStart(text, i)
        ? { kind: 'dollar', start: i, end: caret, partial: text.slice(i + 1, caret) }
        : null;
    }
    if (ch === '!') {
      // d20-explode (`1d6!`, `4d6!>5`) is filtered by `isTriggerStart` (previous
      // char must be a break — not a digit). The "next char must be a letter"
      // check is enforced at resolution time, not here, so the popup opens as
      // soon as the user types `!` even before any letters follow.
      return isTriggerStart(text, i)
        ? { kind: 'bang', start: i, end: caret, partial: text.slice(i + 1, caret) }
        : null;
    }
    if (TRIGGER_BREAK.test(ch) || ch === '#') return null;
  }
  return null;
}

/** Replace [start, end) with `insert`; returns new text and the resulting caret pos. */
export function replaceTokenInText(
  text: string,
  start: number,
  end: number,
  insert: string,
): { text: string; caret: number } {
  const next = text.slice(0, start) + insert + text.slice(end);
  return { text: next, caret: start + insert.length };
}

/* ------------------------------- @-mentions ------------------------------- */

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface ParsedRollInput {
  /** Working expression text with `# comment` and `@Mention`s removed. */
  working: string;
  /** Trailing `# …` comment (trimmed). */
  comment: string | null;
  /** All `@Actor` matches in source order; duplicates preserved per occurrence. */
  matchedActors: Actor[];
}

/**
 * Strip optional trailing `# comment` and every `@Actor` mention; longer names
 * are matched first so `@Goblin Boss` consumes before `@Goblin`. Stray `@xxx`
 * fragments are dropped from the working expression.
 */
export function parseRollInput(text: string, actors: Actor[]): ParsedRollInput {
  const hashIdx = text.indexOf('#');
  let comment: string | null = null;
  let working: string;
  if (hashIdx === -1) {
    working = text;
  } else {
    const after = text.slice(hashIdx + 1).trim();
    comment = after.length > 0 ? after : null;
    working = text.slice(0, hashIdx).trimEnd();
  }
  const named = actors.filter((a) => (a.name ?? '').trim().length > 0);
  const sorted = [...named].sort((a, b) => b.name.length - a.name.length);
  const matched: Actor[] = [];
  for (const a of sorted) {
    const re = new RegExp(`@${escapeRegExp(a.name)}`, 'gi');
    const occ = (working.match(re) ?? []).length;
    for (let i = 0; i < occ; i += 1) matched.push(a);
    working = working.replace(re, '');
  }
  working = working.replace(/@[^\s#]+/g, '').trim();
  return { working: working.trim(), comment, matchedActors: matched };
}

/** Distinct list of mentioned actors (preserving first-seen order). */
export function uniqActors(list: Actor[]): Actor[] {
  const seen = new Set<string>();
  const out: Actor[] = [];
  for (const a of list) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    out.push(a);
  }
  return out;
}

/* ------------------------------- resolution ------------------------------- */

export interface ResolveContext {
  actor: Actor;
  /** `columns.json` indexed by `key` — used for `roll_formula` and labels. */
  columnsByKey: Record<string, ColumnConfig>;
  /** System `actions.json` merged with per-actor `custom_formula` macros. */
  mergedActions: Record<string, SystemActionDef>;
  /** `mechanics.json[system_dice]`, e.g. `1d20`. */
  systemDice: string;
}

/** Longest-match (case-insensitive) of `keys` against the start of `tail`. */
function matchLongestKey(
  tail: string,
  keys: string[],
): { key: string; matchLength: number } | null {
  if (!tail) return null;
  const lowerTail = tail.toLowerCase();
  let best: { key: string; matchLength: number } | null = null;
  for (const key of keys) {
    if (!key) continue;
    if (lowerTail.startsWith(key.toLowerCase())) {
      const len = key.length;
      if (!best || len > best.matchLength) best = { key, matchLength: len };
    }
  }
  return best;
}

function macroKeys(ctx: ResolveContext): string[] {
  return Object.keys(ctx.mergedActions).sort((a, b) => b.length - a.length);
}

function statKeys(ctx: ResolveContext): string[] {
  const keys = Object.keys(ctx.actor.stats || {});
  // Add columns even if the actor doesn't have a base value yet (computed columns).
  for (const k of Object.keys(ctx.columnsByKey)) {
    if (!keys.includes(k)) keys.push(k);
  }
  return keys.sort((a, b) => b.length - a.length);
}

interface StepResult {
  expr: string;
  missing: string[];
  resolved: Array<{ token: string; key: string; replacement: string }>;
}

/** First pass: replace every `$macro` by its `(formula)` definition. */
function expandMacros(expr: string, ctx: ResolveContext): StepResult {
  const keys = macroKeys(ctx);
  const missing: string[] = [];
  const resolved: StepResult['resolved'] = [];
  let i = 0;
  let out = '';
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === '$' && isMacroTriggerAt(expr, i)) {
      const tail = expr.slice(i + 1);
      const m = matchLongestKey(tail, keys);
      if (m) {
        const def = ctx.mergedActions[m.key];
        const ovr = ctx.actor.actions?.[m.key]?.formula_override?.trim();
        const formula = (ovr || def.formula || '').trim();
        const replacement = formula ? `(${formula})` : '0';
        out += replacement;
        resolved.push({ token: `$${m.key}`, key: m.key, replacement });
        i += 1 + m.matchLength;
        continue;
      }
      const fallback = /^([\w-]+)/.exec(tail);
      if (fallback) {
        missing.push(`$${fallback[1]}`);
        out += '0';
        i += 1 + fallback[1].length;
        continue;
      }
    }
    out += ch;
    i += 1;
  }
  return { expr: out, missing, resolved };
}

/** Second pass: replace every `!stat` by its numeric value for the actor. */
function resolveStats(expr: string, ctx: ResolveContext): StepResult {
  const keys = statKeys(ctx);
  const missing: string[] = [];
  const resolved: StepResult['resolved'] = [];
  let i = 0;
  let out = '';
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === '!' && isStatTriggerAt(expr, i)) {
      const tail = expr.slice(i + 1);
      const m = matchLongestKey(tail, keys);
      if (m) {
        const num = getStatNumeric(ctx.actor.stats[m.key], 0);
        const replacement = `(${num})`;
        out += replacement;
        resolved.push({ token: `!${m.key}`, key: m.key, replacement: String(num) });
        i += 1 + m.matchLength;
        continue;
      }
      const fallback = /^([\p{L}_][\p{L}\p{N}_]*)/u.exec(tail);
      if (fallback) {
        missing.push(`!${fallback[1]}`);
        out += '0';
        i += 1 + fallback[1].length;
        continue;
      }
    }
    out += ch;
    i += 1;
  }
  return { expr: out, missing, resolved };
}

/* ------------------------------- segments -------------------------------- */

export interface SegmentPlan {
  /** Original segment text (between `;`s) as the user typed it. */
  raw: string;
  /** Final expression, ready to send to `/api/combat/.../roll`. */
  expression: string;
  /** Suggested log comment derived from the segment (column label / macro name). */
  autoComment: string | null;
  /** Tokens that could not be resolved — caller may surface them as an error. */
  missing: string[];
  /** Detailed substitutions performed (token → replacement) for previewing. */
  resolved: Array<{ token: string; key: string; replacement: string }>;
}

function expandStandalone(raw: string, ctx: ResolveContext): { expr: string; autoComment: string | null } {
  const dollarAlone = /^\$([\w-]+)$/.exec(raw);
  if (dollarAlone) {
    const key = matchLongestKey(dollarAlone[1], macroKeys(ctx));
    if (key) {
      const def = ctx.mergedActions[key.key];
      const ovr = ctx.actor.actions?.[key.key];
      const autoComment = (ovr?.comment?.trim() || def.name).trim() || key.key;
      return { expr: raw, autoComment };
    }
  }
  // `!key` or `!{multi word key}` as the entire segment → column-template expansion.
  const bangAlone = /^!\s*\{?\s*([^!$#{}]+?)\s*\}?\s*$/u.exec(raw);
  if (bangAlone && !raw.slice(1).match(/[+\-*/();]/)) {
    const candidate = bangAlone[1].trim();
    const m = matchLongestKey(candidate, statKeys(ctx));
    // Only treat as alone if the entire candidate is consumed by the matched key.
    if (m && m.matchLength === candidate.length) {
      const col = ctx.columnsByKey[m.key];
      const autoComment = col?.label?.trim() || m.key;
      const tmpl = col?.roll_formula?.trim()
        ? col.roll_formula.replace(/\[value\]/g, `!${m.key}`)
        : `${ctx.systemDice} + !${m.key}`;
      return { expr: tmpl, autoComment };
    }
  }
  return { expr: raw, autoComment: null };
}

/**
 * Split the working expression by `;` and produce a fully-resolved plan per segment.
 * Comments are not handled here — strip them via `parseRollInput` first.
 */
export function planSegmentsForActor(working: string, ctx: ResolveContext): SegmentPlan[] {
  const segments = working
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return segments.map((raw): SegmentPlan => {
    const { expr: exprIn, autoComment } = expandStandalone(raw, ctx);
    const macros = expandMacros(exprIn, ctx);
    const stats = resolveStats(macros.expr, ctx);
    return {
      raw,
      expression: stats.expr.trim(),
      autoComment,
      missing: [...macros.missing, ...stats.missing],
      resolved: [...macros.resolved, ...stats.resolved],
    };
  });
}

/** Convenience: build a per-actor preview without sending. */
export function previewSegmentsForActor(
  working: string,
  ctx: ResolveContext,
): SegmentPlan[] {
  return planSegmentsForActor(working, ctx);
}
