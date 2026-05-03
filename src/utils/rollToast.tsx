import toast from 'react-hot-toast';
import i18n from '../i18n';

export type RollResultPayload = {
  total: number;
  formula: string;
  details: string;
  is_glitch?: boolean;
  is_crit_glitch?: boolean;
};

const NS = 'core';
const DETAILS_SOFT_MAX = 140;
const BATCH_MAX_ROWS = 12;

function t(key: string): string {
  return i18n.t(key, { ns: NS });
}

export function truncateText(s: string, maxLen: number): string {
  const x = (s ?? '').trim();
  if (x.length <= maxLen) return x;
  return `${x.slice(0, maxLen - 1)}…`;
}

/** FastAPI-style `detail`: string | {msg}[] | unknown */
export function formatFastApiDetail(data: unknown): string {
  if (data == null || typeof data !== 'object') return '';
  const d = (data as Record<string, unknown>).detail;
  if (typeof d === 'string') return d.trim();
  if (Array.isArray(d)) {
    return d
      .map((x) =>
        typeof x === 'object' && x !== null && 'msg' in x
          ? String((x as { msg: unknown }).msg)
          : String(x),
      )
      .join('; ');
  }
  return '';
}

export function normalizeRollResult(data: unknown): RollResultPayload | null {
  if (data == null || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  const totalRaw = o.total;
  const total =
    typeof totalRaw === 'number' && Number.isFinite(totalRaw)
      ? Math.trunc(totalRaw)
      : typeof totalRaw === 'string' && totalRaw.trim() !== '' && Number.isFinite(Number(totalRaw))
        ? Math.trunc(Number(totalRaw))
        : NaN;
  if (!Number.isFinite(total)) return null;
  const formula = typeof o.formula === 'string' ? o.formula : '';
  const details = typeof o.details === 'string' ? o.details : '';
  return {
    total,
    formula,
    details,
    is_glitch: o.is_glitch === true,
    is_crit_glitch: o.is_crit_glitch === true,
  };
}

export async function parseRollHttpResponse(res: Response): Promise<
  | { ok: true; result: RollResultPayload }
  | { ok: false; message: string }
> {
  const raw = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = formatFastApiDetail(raw) || (typeof raw === 'object' && raw && 'message' in raw
      ? String((raw as { message?: unknown }).message ?? '')
      : '') || `HTTP ${res.status}`;
    return { ok: false, message: msg.trim() || t('stat_editor.roll_failed') };
  }
  const result = normalizeRollResult(raw);
  if (!result) return { ok: false, message: t('stat_editor.roll_failed') };
  return { ok: true, result };
}

function glitchSuffix(result: RollResultPayload): string {
  if (result.is_crit_glitch === true) return ` — ${t('stat_editor.roll_critical_glitch')}`;
  if (result.is_glitch === true) return ` — ${t('stat_editor.roll_glitch')}`;
  return '';
}

function glitchBadgeOnly(result: RollResultPayload): string | null {
  if (result.is_crit_glitch === true) return t('stat_editor.roll_critical_glitch');
  if (result.is_glitch === true) return t('stat_editor.roll_glitch');
  return null;
}

function RollToastBody({
  headline,
  subhead,
  result,
}: {
  headline?: string;
  subhead?: string;
  result: RollResultPayload;
}) {
  const detailsShort = truncateText(result.details, DETAILS_SOFT_MAX);
  const detailsFull = (result.details ?? '').trim();
  const g = glitchSuffix(result);
  const gOnly = glitchBadgeOnly(result);
  return (
    <div className="flex flex-col gap-1 min-w-[14rem] max-w-[22rem]">
      {headline ? (
        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 truncate">
          {headline}
        </div>
      ) : null}
      {subhead ? (
        <div className="text-xs text-zinc-400 line-clamp-2" title={subhead}>
          {subhead}
        </div>
      ) : null}
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-2xl font-semibold tabular-nums text-emerald-400 leading-none">
          {result.total}
        </span>
        {result.formula ? (
          <span className="font-mono text-[11px] text-zinc-500 truncate max-w-full" title={result.formula}>
            {truncateText(result.formula, 48)}
          </span>
        ) : null}
      </div>
      {detailsShort ? (
        <div
          className="text-[11px] text-zinc-400 font-mono leading-snug whitespace-pre-wrap break-words"
          title={detailsFull.length > detailsShort.length ? detailsFull : undefined}
        >
          {detailsShort}
          {g}
        </div>
      ) : gOnly ? (
        <div className="text-[11px] text-amber-400/90">{gOnly}</div>
      ) : null}
    </div>
  );
}

/** Themed success toast for one roll (mini-sheet, tracker column, stat cell, etc.). */
export function showRollResultToast(opts: {
  result: RollResultPayload;
  actorName?: string;
  comment?: string;
  durationMs?: number;
}) {
  const { result, actorName, comment, durationMs = 4200 } = opts;
  const subParts: string[] = [];
  if (actorName?.trim()) subParts.push(actorName.trim());
  if (comment?.trim()) subParts.push(comment.trim());
  const subhead = subParts.length > 0 ? subParts.join(' · ') : undefined;

  toast.custom(
    () => (
      <div className="rounded-xl border border-zinc-700/90 bg-zinc-900 px-4 py-3 shadow-lg shadow-black/40">
        <RollToastBody headline={t('roll_toast.result_headline')} subhead={subhead} result={result} />
      </div>
    ),
    { duration: durationMs },
  );
}

export function showRollErrorToast(message: string, durationMs = 4000) {
  toast.custom(
    () => (
      <div className="rounded-xl border border-rose-500/40 bg-zinc-900 px-4 py-3 shadow-lg shadow-black/40 max-w-[22rem]">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-rose-400/90 mb-1">
          {t('roll_toast.error_headline')}
        </div>
        <div className="text-sm text-zinc-200 whitespace-pre-wrap break-words">{message}</div>
      </div>
    ),
    { duration: durationMs },
  );
}

export type RollBatchRow = {
  /** e.g. actor name or "GM" */
  prefix: string;
  comment?: string;
  result: RollResultPayload;
};

/** Single stacked toast for GM console multi-segment rolls. */
export type InitiativeRollResultRow = RollResultPayload & {
  actor_id: string;
  actor_name?: string;
};

/** Ответ POST `/api/combat/initiative/roll` содержит полный combat payload + `initiative_roll_results`. */
export function extractInitiativeRollResults(raw: unknown): InitiativeRollResultRow[] {
  if (raw == null || typeof raw !== 'object') return [];
  const list = (raw as Record<string, unknown>).initiative_roll_results;
  if (!Array.isArray(list)) return [];
  const out: InitiativeRollResultRow[] = [];
  for (const item of list) {
    if (item == null || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const aid = typeof o.actor_id === 'string' ? o.actor_id : '';
    if (!aid) continue;
    const nr = normalizeRollResult(o);
    if (!nr) continue;
    const name = typeof o.actor_name === 'string' ? o.actor_name : undefined;
    out.push({ actor_id: aid, actor_name: name, ...nr });
  }
  return out;
}

export function toastInitiativeRollOutcome(raw: unknown, initiativeLabel: string) {
  const rows = extractInitiativeRollResults(raw);
  if (rows.length === 0) return;
  if (rows.length === 1) {
    const r = rows[0];
    showRollResultToast({
      result: r,
      actorName: r.actor_name,
      comment: initiativeLabel,
    });
    return;
  }
  showRollBatchToast(
    rows.map((r) => ({
      prefix: (r.actor_name ?? r.actor_id).trim(),
      comment: initiativeLabel,
      result: r,
    })),
  );
}

export function showRollBatchToast(rows: RollBatchRow[], durationMs = 5600) {
  if (rows.length === 0) return;
  const visible = rows.slice(0, BATCH_MAX_ROWS);
  const overflow = rows.length - visible.length;

  toast.custom(
    () => (
      <div className="rounded-xl border border-zinc-700/90 bg-zinc-900 px-3 py-2.5 shadow-lg shadow-black/40 min-w-[16rem] max-w-[26rem]">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-2 px-1">
          {t('roll_toast.batch_headline')}
        </div>
        <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1 [scrollbar-width:thin]">
          {visible.map((row, i) => {
            const label = [row.prefix.trim(), row.comment?.trim()].filter(Boolean).join(' · ');
            const det = truncateText(row.result.details, 80);
            const g = glitchSuffix(row.result);
            const gOnly = glitchBadgeOnly(row.result);
            return (
              <div
                key={`${row.prefix}-${row.comment ?? ''}-${i}`}
                className="rounded-lg bg-zinc-950/80 border border-zinc-800/80 px-2 py-1.5"
              >
                <div className="text-[11px] text-zinc-400 truncate mb-0.5" title={label}>
                  {label || row.prefix}
                </div>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-lg font-semibold tabular-nums text-emerald-400">
                    {row.result.total}
                  </span>
                  {det ? (
                    <span className="text-[10px] font-mono text-zinc-500 truncate max-w-[14rem]" title={row.result.details}>
                      {det}
                      {g}
                    </span>
                  ) : gOnly ? (
                    <span className="text-[10px] text-amber-400/90">{gOnly}</span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        {overflow > 0 ? (
          <div className="text-[10px] text-zinc-500 mt-2 px-1">
            {t('roll_toast.batch_overflow', { count: overflow })}
          </div>
        ) : null}
      </div>
    ),
    { duration: durationMs },
  );
}
