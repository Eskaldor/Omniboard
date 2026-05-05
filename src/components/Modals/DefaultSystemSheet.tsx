import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Save,
  Download,
  Upload,
  Plus,
  RefreshCcw,
  Dices,
  ChevronDown,
  Shield,
  Users,
  ListOrdered,
  Tv,
  Cpu,
  Eye,
  Pin,
  Settings2,
  Pencil,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Actor, ColumnConfig } from '../../types';
import { useCombatOptional } from '../../contexts/CombatContext';
import { useCombatStateOptional } from '../../contexts/CombatStateContext';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import {
  getMaxKey,
  parseStatValueDraft,
  type StatOverrideDraft,
} from '../../utils/stats';
import { InlineInput } from '../InitiativeTracker/InlineInput';
import { usePortraitCacheVersion } from '../../utils/portraitCache';
import {
  normalizeSheetAccordionDisplay,
  type SystemSheetProfile,
} from '../../hooks/useSystemSheetProfiles';
import {
  parseRollHttpResponse,
  showRollErrorToast,
  showRollResultToast,
} from '../../utils/rollToast';
import { TextEditorModal } from './TextEditorModal';
import { CheckboxGroupCell } from '../InitiativeTracker/ActorRow';

type DeviceInfo = { name?: string; ip?: string; status?: string };

/** Visual density / chrome variant. `gm` = compact modal, `player` = roomy mobile. */
export type SheetVariant = 'gm' | 'player';

function withCacheBuster(url: string, buster: string | number): string {
  if (!url) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${encodeURIComponent(String(buster))}`;
}

// ─── Variant tokens ───────────────────────────────────────────────────────────

interface DensityTokens {
  rootPad: string;
  rootGap: string;
  sectionPad: string;
  sectionRadius: string;
  sectionBg: string;
  statGridCols: string;
  statGap: string;
  headingTopPad: string;
  textBlockPad: string;
}

function densityFor(variant: SheetVariant): DensityTokens {
  if (variant === 'player') {
    return {
      rootPad: 'p-4',
      rootGap: 'space-y-4',
      sectionPad: 'p-4',
      sectionRadius: 'rounded-xl',
      sectionBg: 'bg-zinc-900/50 border border-zinc-800/70',
      statGridCols: 'grid grid-cols-1 gap-3',
      statGap: 'gap-3',
      headingTopPad: 'pt-2',
      textBlockPad: 'p-4',
    };
  }
  return {
    rootPad: 'p-5',
    rootGap: 'space-y-4',
    sectionPad: 'p-2',
    sectionRadius: 'rounded-lg',
    sectionBg: 'bg-zinc-950/40 border border-zinc-800',
    statGridCols: 'grid grid-cols-2 gap-x-5',
    statGap: 'gap-2',
    headingTopPad: 'pt-1',
    textBlockPad: 'p-2',
  };
}

// ─── BadgeSelect / IconChip (unchanged) ──────────────────────────────────────

function BadgeSelect({
  icon: Icon,
  title,
  value,
  onChange,
  options,
  maxWidth = '11rem',
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  maxWidth?: string;
}) {
  return (
    <div
      className="relative inline-flex items-center bg-zinc-900 border border-zinc-700 hover:border-zinc-600 rounded-md transition-colors"
      title={title}
      style={{ maxWidth }}
    >
      <Icon size={13} className="ml-2 text-zinc-500 shrink-0 pointer-events-none" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none cursor-pointer bg-transparent text-xs text-zinc-200 pl-1.5 pr-6 py-1 outline-none truncate min-w-0 [&>option]:bg-zinc-900 [&>option]:text-zinc-200"
        style={{ maxWidth }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} style={{ background: '#18181b', color: '#e4e4e7' }}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={11}
        className="absolute right-1.5 text-zinc-500 pointer-events-none"
      />
    </div>
  );
}

function IconChip({
  icon: Icon,
  active,
  onClick,
  title,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  active: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`w-7 h-7 grid place-items-center rounded-md border transition-colors ${
        active
          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
          : 'bg-zinc-900 border-zinc-700 text-zinc-500 hover:text-zinc-200 hover:border-zinc-600'
      }`}
    >
      <Icon size={13} />
    </button>
  );
}

// ─── StatRow (numeric / fraction columns) ─────────────────────────────────────

function StatRow({
  actor,
  column,
  label,
  pairColumn,
  onUpdate,
  variant,
}: {
  actor: Actor;
  column: ColumnConfig;
  label: string;
  pairColumn?: ColumnConfig;
  onUpdate?: (id: string, field: string, value: unknown) => void;
  variant: SheetVariant;
}) {
  const { t } = useTranslation('core', { useSuspense: false });
  const draft = parseStatValueDraft(actor.stats[column.key]);
  const readonly = column.is_readonly === true;
  const computedId = (column.computed_formula_id ?? '').trim();
  const isComputed = computedId !== '';
  const editable = !!onUpdate && !readonly && !isComputed;
  const ovSum = draft.overrides.reduce((s, o) => s + o.value, 0);
  const hasOv = draft.overrides.length > 0;
  const canRoll = column.is_rollable === true;
  const isPlayer = variant === 'player';

  const [open, setOpen] = useState(false);
  const [newSource, setNewSource] = useState('');
  const [newValue, setNewValue] = useState('');
  const [rolling, setRolling] = useState(false);

  const commit = (next: { base?: number; overrides?: StatOverrideDraft[] }) => {
    if (!onUpdate || !editable) return;
    const nextOverrides = next.overrides ?? draft.overrides;
    const nextBase = next.base ?? draft.base;
    const optimistic = Math.round(
      nextBase + nextOverrides.reduce((sum, o) => sum + o.value, 0),
    );
    onUpdate(actor.id, 'stats', {
      ...actor.stats,
      [column.key]: {
        base: nextBase,
        formula_id: draft.formula_id,
        overrides: nextOverrides,
        value: optimistic,
      },
    });
  };

  const addOverride = () => {
    const source = newSource.trim();
    const value = parseFloat(newValue.replace(',', '.'));
    if (!source || Number.isNaN(value)) return;
    commit({ overrides: [...draft.overrides, { source, value }] });
    setNewSource('');
    setNewValue('');
  };

  const removeOverride = (index: number) => {
    commit({ overrides: draft.overrides.filter((_, i) => i !== index) });
  };

  const handleRoll = async () => {
    if (!canRoll || rolling) return;
    setRolling(true);
    try {
      const rawExpr = column.roll_formula?.trim();
      const expr = rawExpr
        ? rawExpr.replace(/\[value\]/g, `[${column.key}]`)
        : `1d20 + [${column.key}]`;
      const res = await fetch(`/api/combat/actors/${encodeURIComponent(actor.id)}/roll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expression: expr, is_preroll: false }),
      });
      const parsed = await parseRollHttpResponse(res);
      if (!parsed.ok) {
        showRollErrorToast(parsed.message);
        return;
      }
      showRollResultToast({
        result: parsed.result,
        actorName: actor.name,
        comment: label,
      });
    } catch {
      showRollErrorToast(t('stat_editor.roll_network_error'));
    } finally {
      setRolling(false);
    }
  };

  const renderControl = (col: ColumnConfig, compact = false) => {
    const d = parseStatValueDraft(actor.stats[col.key]);
    const ro = col.is_readonly === true;
    const cmp = !!(col.computed_formula_id ?? '').trim();
    if (!onUpdate || ro || cmp) {
      return (
        <span
          className={`inline-flex items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 italic tabular-nums text-zinc-400 ${
            isPlayer
              ? 'px-3 py-1 text-sm min-w-[3rem]'
              : compact
              ? 'px-1.5 py-0.5 text-xs min-w-[2.25rem]'
              : 'px-2 py-0.5 text-xs min-w-[2.75rem]'
          }`}
        >
          {d.value}
        </span>
      );
    }
    return (
      <InlineInput
        type="number"
        value={d.base}
        onChange={(val) => {
          const parsed = parseFloat(val);
          const base = Number.isFinite(parsed) ? parsed : 0;
          if (!onUpdate) return;
          const optimistic = Math.round(
            base + d.overrides.reduce((s, o) => s + o.value, 0),
          );
          onUpdate(actor.id, 'stats', {
            ...actor.stats,
            [col.key]: {
              base,
              formula_id: d.formula_id,
              overrides: d.overrides,
              value: optimistic,
            },
          });
        }}
        maxValue={col.max_value}
        className={`bg-zinc-900 border border-zinc-700 rounded-md text-right tabular-nums text-zinc-200 hover:border-zinc-600 focus:outline-none focus:border-emerald-500 ${
          isPlayer
            ? 'px-3 py-1.5 text-sm w-16'
            : compact
            ? 'px-1.5 py-0.5 text-xs w-12'
            : 'px-2 py-0.5 text-xs w-14'
        }`}
      />
    );
  };

  const labelClass = isPlayer
    ? 'flex-1 min-w-0 truncate text-sm text-zinc-300'
    : 'flex-1 min-w-0 truncate text-xs text-zinc-400';
  const rowPad = isPlayer ? 'px-2 py-1.5' : 'px-1.5 py-1';

  return (
    <div className="rounded-md hover:bg-zinc-900/40 transition-colors">
      <div className={`flex items-center gap-2 ${rowPad}`}>
        <span className={labelClass} title={label}>
          {label}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {renderControl(column, !pairColumn)}
          {pairColumn && (
            <>
              <span className="text-zinc-600 text-xs select-none">/</span>
              {renderControl(pairColumn, true)}
            </>
          )}
          {editable && hasOv && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className={`shrink-0 px-1 py-0.5 rounded text-[10px] font-mono border tabular-nums ${
                ovSum > 0
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
              title={t('stat_editor.overrides')}
            >
              {ovSum > 0 ? `+${ovSum}` : ovSum}
            </button>
          )}
          {editable && !hasOv && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className={`shrink-0 grid place-items-center rounded text-zinc-600 hover:text-zinc-200 hover:bg-zinc-800 transition-colors ${
                open ? 'bg-zinc-800 text-zinc-200' : ''
              } ${isPlayer ? 'w-7 h-7' : 'w-5 h-5'}`}
              title={t('stat_editor.overrides')}
            >
              <ChevronDown size={isPlayer ? 14 : 12} className={open ? 'rotate-180' : ''} />
            </button>
          )}
          {canRoll && (
            <button
              type="button"
              onClick={handleRoll}
              disabled={rolling}
              className={`shrink-0 grid place-items-center rounded text-zinc-500 hover:text-emerald-300 hover:bg-emerald-600/20 disabled:opacity-40 transition-colors ${
                isPlayer ? 'w-8 h-8' : 'w-5 h-5'
              }`}
              title={t('stat_editor.roll')}
            >
              <Dices size={isPlayer ? 16 : 12} />
            </button>
          )}
        </span>
      </div>

      {open && editable && (
        <div className="mx-1.5 mb-1.5 rounded-lg border border-zinc-800 bg-zinc-950/60 p-2 space-y-1.5">
          <div className="flex items-center justify-between text-[10px] text-zinc-500">
            <span className="uppercase tracking-wider">{t('stat_editor.base')}</span>
            <span className="font-mono">{draft.base}</span>
          </div>
          {draft.overrides.length > 0 && (
            <ul className="space-y-1">
              {draft.overrides.map((o, i) => (
                <li
                  key={`${o.source}-${i}`}
                  className="flex items-center gap-2 text-xs rounded bg-zinc-900/60 px-2 py-1"
                >
                  <span className="flex-1 truncate text-zinc-300">{o.source}</span>
                  <span
                    className={`font-mono tabular-nums ${
                      o.value >= 0 ? 'text-emerald-300' : 'text-rose-300'
                    }`}
                  >
                    {o.value >= 0 ? `+${o.value}` : o.value}
                  </span>
                  <button
                    type="button"
                    className="text-zinc-500 hover:text-rose-400 px-1"
                    onClick={() => removeOverride(i)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-1">
            <input
              type="text"
              placeholder={t('stat_editor.source_placeholder')}
              className="flex-1 min-w-0 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
              value={newSource}
              onChange={(e) => setNewSource(e.target.value)}
            />
            <input
              type="number"
              placeholder={t('stat_editor.value_modifier_placeholder')}
              className="w-12 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addOverride();
              }}
            />
            <button
              type="button"
              className="rounded bg-zinc-800 hover:bg-zinc-700 px-2 py-1 text-xs text-zinc-200"
              onClick={addOverride}
            >
              {t('common.add')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TextStatRow (text / string columns — markdown + edit modal) ──────────────

function TextStatRow({
  actor,
  column,
  label,
  onUpdate,
  variant,
}: {
  actor: Actor;
  column: ColumnConfig;
  label: string;
  onUpdate?: (id: string, field: string, value: unknown) => void;
  variant: SheetVariant;
}) {
  const { t } = useTranslation('core', { useSuspense: false });
  const raw = actor.stats[column.key];
  const text = typeof raw === 'string' ? raw : raw == null ? '' : String(raw);
  const editable = !!onUpdate && column.is_readonly !== true;
  const isPlayer = variant === 'player';

  const [editorOpen, setEditorOpen] = useState(false);

  const openEditor = () => {
    if (!editable) return;
    setEditorOpen(true);
  };

  const labelClass = isPlayer
    ? 'text-[11px] uppercase tracking-widest text-zinc-500 font-medium'
    : 'text-[10px] uppercase tracking-widest text-zinc-600 font-medium';

  const proseClass = isPlayer
    ? 'prose prose-invert prose-sm max-w-none prose-p:my-1.5 prose-headings:text-zinc-200 prose-strong:text-zinc-100 prose-li:my-0.5'
    : 'prose prose-invert prose-xs max-w-none prose-p:my-1 prose-headings:text-zinc-300 prose-strong:text-zinc-200 prose-li:my-0';

  return (
    <div className="col-span-full">
      <div className="flex items-center justify-between gap-2 px-1 mb-1">
        <span className={labelClass} title={label}>
          {label}
        </span>
        {editable && (
          <button
            type="button"
            onClick={openEditor}
            className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            title={t('common.edit')}
          >
            <Pencil size={11} />
            {t('common.edit')}
          </button>
        )}
      </div>
      <div
        role={editable ? 'button' : undefined}
        tabIndex={editable ? 0 : undefined}
        onClick={editable ? openEditor : undefined}
        onKeyDown={
          editable
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openEditor();
                }
              }
            : undefined
        }
        className={`rounded-lg border bg-zinc-950/50 transition-colors ${
          isPlayer ? 'p-4 border-zinc-800/70' : 'p-3 border-zinc-800'
        } ${editable ? 'cursor-text hover:border-zinc-700' : ''}`}
      >
        {text.trim() ? (
          <div className={proseClass}>
            <ReactMarkdown>{text}</ReactMarkdown>
          </div>
        ) : (
          <span className="text-xs italic text-zinc-600 select-none">
            {editable ? t('text_editor.placeholder') ?? '…' : '—'}
          </span>
        )}
      </div>

      <TextEditorModal
        isOpen={editorOpen}
        title={label}
        value={text}
        onCancel={() => setEditorOpen(false)}
        onSave={(next) => {
          if (!onUpdate) return;
          onUpdate(actor.id, 'stats', { ...actor.stats, [column.key]: next });
          setEditorOpen(false);
        }}
      />
    </div>
  );
}

// ─── CheckboxGroupRow (action-economy slots: badges/dots) ─────────────────────

function CheckboxGroupRow({
  actor,
  column,
  label,
  onUpdate,
  variant,
}: {
  actor: Actor;
  column: ColumnConfig;
  label: string;
  onUpdate?: (id: string, field: string, value: unknown) => void;
  variant: SheetVariant;
}) {
  const isPlayer = variant === 'player';
  // CheckboxGroupCell speaks `(updates: Partial<Actor>) => void`. Adapt to our triple-arg signature.
  // The cell sends `{ stats: { [column.key]: { …slotMap } } }` — merge it onto the live stats.
  const adaptedOnUpdate = React.useCallback(
    (updates: Partial<Actor>) => {
      if (!onUpdate) return;
      if (updates.stats !== undefined) {
        const existingGroup =
          (actor.stats?.[column.key] as Record<string, boolean> | undefined) ?? {};
        const incomingGroup =
          (updates.stats[column.key] as Record<string, boolean> | undefined) ?? {};
        onUpdate(actor.id, 'stats', {
          ...actor.stats,
          [column.key]: { ...existingGroup, ...incomingGroup },
        });
      }
    },
    [onUpdate, actor.id, actor.stats, column.key],
  );

  const labelClass = isPlayer
    ? 'flex-1 min-w-0 truncate text-sm text-zinc-300'
    : 'flex-1 min-w-0 truncate text-xs text-zinc-400';
  const rowPad = isPlayer ? 'px-2 py-2' : 'px-1.5 py-1';

  return (
    <div className="col-span-full rounded-md hover:bg-zinc-900/40 transition-colors">
      <div className={`flex items-center gap-3 ${rowPad}`}>
        <span className={labelClass} title={label}>
          {label}
        </span>
        <div
          className={`shrink-0 flex flex-wrap items-center justify-end gap-1 ${
            isPlayer ? 'gap-1.5' : 'gap-1'
          }`}
        >
          <CheckboxGroupCell column={column} stats={actor.stats} onUpdate={isPlayer ? undefined : adaptedOnUpdate} />
        </div>
      </div>
    </div>
  );
}

// ─── Column rendering helpers ─────────────────────────────────────────────────

function isTextLikeColumn(col: ColumnConfig): boolean {
  return col.type === 'text' || col.type === 'string';
}

function isCheckboxGroupColumn(col: ColumnConfig): boolean {
  return col.type === 'checkbox_group';
}

function renderSheetColumn(
  actor: Actor,
  col: ColumnConfig,
  lookupColumns: ColumnConfig[],
  colName: (col: ColumnConfig) => string,
  onUpdate: ((id: string, field: string, value: unknown) => void) | undefined,
  variant: SheetVariant,
): React.ReactNode {
  if (isTextLikeColumn(col)) {
    return (
      <TextStatRow
        key={col.key}
        actor={actor}
        column={col}
        label={colName(col)}
        onUpdate={onUpdate}
        variant={variant}
      />
    );
  }

  if (isCheckboxGroupColumn(col)) {
    return (
      <CheckboxGroupRow
        key={col.key}
        actor={actor}
        column={col}
        label={colName(col)}
        onUpdate={onUpdate}
        variant={variant}
      />
    );
  }

  const maxKey = getMaxKey(col);
  const showAsFraction = (col.display_as_fraction ?? false) && !!maxKey;
  const pairColumn = maxKey ? lookupColumns.find((c) => c.key === maxKey) : undefined;

  if (showAsFraction && pairColumn) {
    return (
      <div key={col.key} className="col-span-full">
        <StatRow
          actor={actor}
          column={col}
          pairColumn={pairColumn}
          label={colName(col)}
          onUpdate={onUpdate}
          variant={variant}
        />
      </div>
    );
  }

  if (pairColumn) {
    return (
      <React.Fragment key={col.key}>
        <StatRow
          actor={actor}
          column={col}
          label={colName(col)}
          onUpdate={onUpdate}
          variant={variant}
        />
        <StatRow
          actor={actor}
          column={pairColumn}
          label={colName(pairColumn)}
          onUpdate={onUpdate}
          variant={variant}
        />
      </React.Fragment>
    );
  }

  return (
    <StatRow
      key={col.key}
      actor={actor}
      column={col}
      label={colName(col)}
      onUpdate={onUpdate}
      variant={variant}
    />
  );
}

// ─── Hero header (player variant only) ────────────────────────────────────────

interface HeroStatChip {
  key: string;
  label: string;
  value: string | number;
}

function PlayerHeroHeader({
  actor,
  portraitSrc,
  heroStatChips = [],
  onOpenPortraitPicker,
}: {
  actor: Actor;
  portraitSrc: string;
  heroStatChips?: HeroStatChip[];
  onOpenPortraitPicker?: () => void;
}) {
  const { t } = useTranslation('core', { useSuspense: false });
  const roleStyle =
    actor.role === 'enemy'
      ? 'bg-red-500/15 text-red-300 border-red-500/30'
      : actor.role === 'ally'
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
      : actor.role === 'character'
      ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
      : 'bg-zinc-700/40 text-zinc-300 border-zinc-700';

  const PortraitTag = onOpenPortraitPicker ? 'button' : ('div' as const);

  return (
    <section className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-b from-zinc-900 via-zinc-900/60 to-zinc-950/80 shadow-xl">
      {/* Decorative blurred portrait backdrop */}
      {portraitSrc && (
        <div
          aria-hidden
          className="absolute inset-0 opacity-25 blur-2xl scale-110"
          style={{
            backgroundImage: `url(${portraitSrc})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
      )}
      <div className="relative flex items-center gap-4 p-5">
        <PortraitTag
          {...(onOpenPortraitPicker
            ? { type: 'button' as const, onClick: () => onOpenPortraitPicker() }
            : {})}
          className={`shrink-0 rounded-xl overflow-hidden bg-zinc-900 border-2 border-zinc-700 shadow-lg w-24 aspect-[172/320] ${
            onOpenPortraitPicker
              ? 'hover:border-emerald-500 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500'
              : ''
          }`}
        >
          {actor.portrait ? (
            <img
              src={portraitSrc}
              alt={actor.name}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-full h-full grid place-items-center text-zinc-600">
              <Plus size={28} strokeWidth={1.5} />
            </div>
          )}
        </PortraitTag>

        <div className="min-w-0 flex-1 flex flex-col gap-2">
          <h2 className="text-xl font-semibold text-zinc-50 truncate leading-tight">
            {actor.name}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium uppercase tracking-wider border ${roleStyle}`}
            >
              {actor.role}
            </span>
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border bg-zinc-900/70 border-zinc-700 text-zinc-300"
              title={t('combat.initiative')}
            >
              <span className="uppercase tracking-wider text-zinc-500">
                {t('combat.initiative')}
              </span>
              <span className="font-mono tabular-nums text-emerald-300">
                {actor.initiative}
              </span>
            </span>
          </div>
          {/* Configurable stat chips from hero_columns */}
          {heroStatChips.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-0.5">
              {heroStatChips.map((chip) => (
                <span
                  key={chip.key}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border bg-zinc-900/80 border-zinc-700/80 text-zinc-300"
                  title={chip.label}
                >
                  <span className="text-zinc-500 truncate max-w-[5rem]">{chip.label}</span>
                  <span className="font-mono tabular-nums text-zinc-100">{chip.value}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── DefaultSystemSheet (root) ────────────────────────────────────────────────

export function DefaultSystemSheet({
  actor,
  columns,
  systemName,
  onUpdate,
  onOpenPortraitPicker,
  activeProfile = null,
  sheetProfilesLoading = false,
  variant = 'gm',
}: {
  actor: Actor;
  columns: ColumnConfig[];
  systemName: string;
  onUpdate?: (id: string, field: string, value: unknown) => void;
  onOpenPortraitPicker?: () => void;
  activeProfile?: SystemSheetProfile | null;
  sheetProfilesLoading?: boolean;
  /** `gm` (default) — compact modal; `player` — roomy mobile with hero header. */
  variant?: SheetVariant;
}) {
  const { t } = useTranslation('core', { useSuspense: false });
  const combatState = useCombatStateOptional();
  const combatCtx = useCombatOptional();
  const state = combatState?.state ?? null;
  const systemLayoutProfiles = combatCtx?.systemLayoutProfiles ?? [];
  const portraitCacheVersion = usePortraitCacheVersion();
  const colName = (col: ColumnConfig) =>
    i18n.t(`${col.key}.name`, { ns: `systems/${systemName}` }) || col.label || col.key;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [devices, setDevices] = useState<Record<string, DeviceInfo>>({});
  const [showSetup, setShowSetup] = useState(false);

  const isPlayer = variant === 'player';
  const isGM = variant === 'gm';
  const tokens = densityFor(variant);

  const portraitSrc = useMemo(() => {
    const url = actor.portrait ?? '';
    if (!url) return '';
    const isLocal = url.startsWith('/assets/') || url.startsWith('/api/assets/');
    const buster = `${portraitCacheVersion}-${actor.id}-${actor.name}-${url}`;
    return isLocal ? withCacheBuster(url, buster) : url;
  }, [actor.id, actor.name, actor.portrait, portraitCacheVersion]);

  const actors = state?.core.actors ?? [];
  const activeGroups = useMemo(() => {
    const seen = new Set<string>();
    const list: { id: string; name: string | null; color: string | null; mode: string | null }[] = [];
    for (const a of actors) {
      if (a.group_id && !seen.has(a.group_id)) {
        seen.add(a.group_id);
        list.push({
          id: a.group_id,
          name: a.group_name ?? null,
          color: a.group_color ?? null,
          mode: a.group_mode ?? null,
        });
      }
    }
    return list;
  }, [actors]);

  useEffect(() => {
    // GM-only: hardware/devices are not relevant for player view.
    if (!isGM) return;
    fetch('/api/hardware/')
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: unknown) => {
        const d =
          typeof data === 'object' && data !== null && !Array.isArray(data)
            ? (data as Record<string, DeviceInfo>)
            : {};
        setDevices(d);
      })
      .catch(() => setDevices({}));
  }, [isGM]);

  const handleGroupChange = (value: string) => {
    if (!onUpdate) return;
    const trimmed = value.trim() || null;
    onUpdate(actor.id, 'group_id', trimmed);
    if (!trimmed) {
      onUpdate(actor.id, 'group_name', null);
      onUpdate(actor.id, 'group_mode', null);
      onUpdate(actor.id, 'group_color', null);
      return;
    }
    const group = activeGroups.find((g) => g.id === trimmed);
    if (group) {
      onUpdate(actor.id, 'group_name', group.name);
      onUpdate(actor.id, 'group_color', group.color);
      onUpdate(actor.id, 'group_mode', group.mode);
    }
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(actor, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${actor.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
    a.click();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const imported = JSON.parse(ev.target?.result as string);
        const { id: _ignore, ...updates } = imported;
        await fetch(`/api/actors/${actor.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });
      } catch {
        alert(t('modals.import_actor_invalid_json'));
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSaveToRoster = async () => {
    try {
      await fetch(`/api/systems/${encodeURIComponent(systemName)}/actors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(actor),
      });
      alert(t('modals.actor_saved_to_roster'));
    } catch (err) {
      console.error('Failed to save actor', err);
    }
  };

  const refreshMiniature = () => {
    const mac = actor.miniature_id;
    if (!mac) return;
    fetch(`/api/render/${actor.id}?mac=${encodeURIComponent(mac)}&t=${Date.now()}`).catch(
      console.error,
    );
  };

  const roleOptions = [
    { value: 'character', label: t('modals.role_character') },
    { value: 'enemy', label: t('modals.role_enemy') },
    { value: 'ally', label: t('modals.role_ally') },
    { value: 'neutral', label: t('modals.role_neutral') },
  ];

  const groupOptions = [
    { value: '', label: t('modals.no_group') },
    ...activeGroups.map((g) => ({ value: g.id, label: g.name || g.id })),
  ];

  const layoutOptions = [
    { value: '', label: t('actor.layout_profile_default') },
    ...systemLayoutProfiles.map((p) => ({ value: p.id, label: p.name })),
  ];

  const miniatureOptions = [
    { value: '', label: t('modals.select_miniature') },
    ...(Object.entries(devices).length === 0
      ? []
      : (Object.entries(devices) as [string, DeviceInfo][]).map(([mac, info]) => ({
          value: mac,
          label: `${info.name || mac} ${info.status === 'online' ? '●' : '○'}`,
        }))),
  ];

  const groupModeOptions = [
    { value: 'simultaneous', label: t('modals.simultaneous') },
    { value: 'sequential', label: t('modals.sequential') },
    { value: 'none', label: t('modals.none') },
  ];

  const statsLayoutTab = useMemo(() => {
    const tabs = activeProfile?.tabs;
    if (!tabs?.length) return null;
    return tabs.find((tab) => tab.id === 'stats') ?? null;
  }, [activeProfile]);

  // Per-section open/closed state for `accordion` display mode (collapsed by default).
  const statsSectionKeys = useMemo(
    () =>
      (statsLayoutTab?.accordions ?? []).map(
        (a, idx) => `${idx}:${(a.name || '').trim()}:${normalizeSheetAccordionDisplay(a.display)}`,
      ),
    [statsLayoutTab],
  );
  const [statsOpenMap, setStatsOpenMap] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setStatsOpenMap({});
  }, [statsSectionKeys.join('|')]);

  const renderStatsColumnPanel = () => {
    if (columns.length === 0) {
      return <div className="text-xs text-zinc-600 italic px-1">{t('modals.stats')}: —</div>;
    }

    if (sheetProfilesLoading && !activeProfile) {
      return <div className="text-xs text-zinc-500 px-1 py-2">{t('modals.mini_sheet_layout_loading')}</div>;
    }

    const gridFor = (ordered: ColumnConfig[]) => (
      <div className={tokens.statGridCols}>
        {ordered.map((col) =>
          renderSheetColumn(actor, col, columns, colName, onUpdate, variant),
        )}
      </div>
    );

    const accordions = statsLayoutTab?.accordions;
    if (!accordions?.length) {
      return gridFor(columns);
    }

    /**
     * Track which column keys ended up in any accordion. Anything left over —
     * including `checkbox_group` slots that the user forgot to assign — gets a
     * fallback "Прочее" section at the end so it never silently disappears.
     */
    const claimedKeys = new Set<string>();

    const sections = accordions.map((acc, idx) => {
      const ordered = acc.columns
        .map((key) => columns.find((c) => c.key === key))
        .filter((c): c is ColumnConfig => !!c);
      if (ordered.length === 0) return null;
      ordered.forEach((c) => claimedKeys.add(c.key));

      const heading = (acc.name || '').trim() || t('modals.mini_sheet_group_other');
      const mode = normalizeSheetAccordionDisplay(acc.display);
      const sectionKey = statsSectionKeys[idx];
      const isCollapsible = mode === 'accordion';
      const isOpen = isCollapsible ? statsOpenMap[sectionKey] === true : true;
      const grid = gridFor(ordered);

      return (
        <SheetSection
          key={`${acc.name}-${idx}`}
          heading={heading}
          collapsible={isCollapsible}
          isOpen={isOpen}
          onToggle={
            isCollapsible
              ? () => setStatsOpenMap((prev) => ({ ...prev, [sectionKey]: !isOpen }))
              : undefined
          }
          tokens={tokens}
        >
          {grid}
        </SheetSection>
      );
    });

    // No accordion produced any matched column → fall back to a flat grid.
    if (sections.every((s) => s == null)) {
      return gridFor(columns);
    }

    // Append "Прочее" with all columns not claimed by any accordion. Critical:
    // checkbox_group / text columns that the user didn't assign explicitly
    // would otherwise disappear. The "leftover" section is always-open.
    const leftover = columns.filter((c) => !claimedKeys.has(c.key));
    let leftoverSection: React.ReactNode = null;
    if (leftover.length > 0) {
      leftoverSection = (
        <SheetSection
          key="__leftover__"
          heading={t('modals.mini_sheet_group_other')}
          collapsible={false}
          isOpen
          tokens={tokens}
        >
          {gridFor(leftover)}
        </SheetSection>
      );
    }

    return (
      <div className={isPlayer ? 'space-y-5' : 'space-y-4'}>
        {sections}
        {leftoverSection}
      </div>
    );
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (isPlayer) {
    const heroKeys: string[] = activeProfile?.hero_columns ?? [];
    const heroStatChips: HeroStatChip[] = heroKeys
      .map((key) => {
        const col = columns.find((c) => c.key === key);
        if (!col) return null;
        const label = colName(col);
        const raw = actor.stats[key];
        // Resolve effective scalar value: StatValue object or plain number/string
        const value =
          raw != null && typeof raw === 'object' && 'value' in raw
            ? String((raw as { value: unknown }).value ?? '—')
            : raw != null
            ? String(raw)
            : '—';
        return { key, label, value } satisfies HeroStatChip;
      })
      .filter((c): c is HeroStatChip => c !== null);

    return (
      <div className={`${tokens.rootPad} ${tokens.rootGap}`}>
        <PlayerHeroHeader
          actor={actor}
          portraitSrc={portraitSrc}
          heroStatChips={heroStatChips}
          onOpenPortraitPicker={onOpenPortraitPicker}
        />
        <section>{renderStatsColumnPanel()}</section>
      </div>
    );
  }

  // GM variant — original layout (compact modal).
  return (
    <div className={`${tokens.rootPad} ${tokens.rootGap}`}>
      <section className="flex gap-4">
        <div className="shrink-0 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenPortraitPicker?.()}
            className="relative rounded-xl overflow-hidden w-28 bg-zinc-800 border-2 border-zinc-700 hover:border-emerald-500 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-zinc-900 aspect-[172/320]"
          >
            {actor.portrait ? (
              <>
                <img
                  src={portraitSrc}
                  alt={actor.name}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 grid place-items-center transition-opacity">
                  <span className="text-xs font-medium text-white px-2 py-1 rounded bg-zinc-900/90">
                    {t('common.edit')}
                  </span>
                </div>
              </>
            ) : (
              <div className="w-full h-full grid place-items-center text-zinc-500">
                <Plus size={28} strokeWidth={1.5} />
              </div>
            )}
          </button>
          <div className="w-28 flex items-center justify-center gap-1.5">
            <IconChip
              icon={Eye}
              active={!!actor.show_portrait}
              onClick={() => onUpdate?.(actor.id, 'show_portrait', !actor.show_portrait)}
              title={t('modals.show_portrait_on_tracker')}
            />
            <IconChip
              icon={Pin}
              active={!!actor.is_pinned}
              onClick={() => onUpdate?.(actor.id, 'is_pinned', !actor.is_pinned)}
              title={t('modals.pin_remember_actor')}
            />
            <IconChip
              icon={Settings2}
              active={showSetup}
              onClick={() => setShowSetup((v) => !v)}
              title={t('modals.config')}
            />
          </div>
          <div
            className="w-28 flex items-center justify-between gap-1 px-2 py-1 rounded-md bg-zinc-950 border border-zinc-800 text-[10px] uppercase tracking-wider text-zinc-500"
            title={t('combat.initiative')}
          >
            <span>{t('combat.initiative')}</span>
            <span className="font-mono tabular-nums text-emerald-300 text-xs">
              {actor.initiative}
            </span>
          </div>
        </div>

        <div className="flex-1 min-w-0">{renderStatsColumnPanel()}</div>
      </section>

      {showSetup && (
        <section className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-2">
          <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1.5 items-center">
          <div
            className="text-zinc-600 grid place-items-center w-6 h-7"
            title={t('modals.role') + ' / ' + t('modals.group')}
          >
            <Users size={13} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <BadgeSelect
              icon={Shield}
              title={t('modals.role')}
              value={actor.role}
              onChange={(v) => onUpdate?.(actor.id, 'role', v as Actor['role'])}
              options={roleOptions}
              maxWidth="8.5rem"
            />
            <BadgeSelect
              icon={Users}
              title={t('modals.group')}
              value={actor.group_id ?? ''}
              onChange={(v) => handleGroupChange(v)}
              options={groupOptions}
              maxWidth="9.5rem"
            />
            {actor.group_id && (
              <>
                <BadgeSelect
                  icon={ListOrdered}
                  title={t('modals.group_mode')}
                  value={actor.group_mode ?? 'sequential'}
                  onChange={(v) =>
                    onUpdate?.(actor.id, 'group_mode', v === 'none' ? null : v)
                  }
                  options={groupModeOptions}
                  maxWidth="8.5rem"
                />
                <label
                  className="relative inline-flex items-center justify-center w-7 h-7 rounded-md border border-zinc-700 hover:border-zinc-600 cursor-pointer transition-colors shrink-0"
                  title={t('modals.group_color')}
                  style={{ background: actor.group_color ?? '#10b981' }}
                >
                  <input
                    type="color"
                    value={actor.group_color ?? '#10b981'}
                    onChange={(e) => onUpdate?.(actor.id, 'group_color', e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </label>
              </>
            )}
          </div>

          <div
            className="text-zinc-600 grid place-items-center w-6 h-7 border-t border-zinc-800/60"
            title={t('modals.bind_miniature')}
          >
            <Cpu size={13} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 min-w-0 border-t border-zinc-800/60 pt-1.5">
            <BadgeSelect
              icon={Tv}
              title={t('actor.layout_profile')}
              value={actor.layout_profile_id ?? ''}
              onChange={(v) => onUpdate?.(actor.id, 'layout_profile_id', v || null)}
              options={layoutOptions}
              maxWidth="10rem"
            />
            <BadgeSelect
              icon={Cpu}
              title={t('modals.bind_miniature')}
              value={actor.miniature_id ?? ''}
              onChange={(v) => onUpdate?.(actor.id, 'miniature_id', v || null)}
              options={miniatureOptions}
              maxWidth="10rem"
            />
            {actor.miniature_id && (
              <button
                type="button"
                onClick={refreshMiniature}
                title={t('modals.refresh_miniature_screen')}
                className="shrink-0 w-7 h-7 grid place-items-center rounded-md bg-zinc-900 border border-zinc-700 hover:border-zinc-600 text-zinc-400 hover:text-zinc-100 transition-colors"
              >
                <RefreshCcw size={12} />
              </button>
            )}
          </div>
        </div>
      </section>
      )}

      {onUpdate && (
        <div className="flex gap-2 pt-3 border-t border-zinc-800">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImport}
            className="hidden"
            accept=".json"
          />
          <button
            type="button"
            onClick={handleExport}
            title={t('config_modal.export')}
            className="w-9 h-9 shrink-0 grid place-items-center rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-100 transition-colors"
          >
            <Download size={15} />
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title={t('config_modal.import')}
            className="w-9 h-9 shrink-0 grid place-items-center rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-100 transition-colors"
          >
            <Upload size={15} />
          </button>
          <button
            type="button"
            onClick={handleSaveToRoster}
            className="flex-1 inline-flex items-center justify-center gap-2 py-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 hover:text-emerald-200 text-sm font-medium transition-colors"
          >
            <Save size={15} />
            {t('common.save')}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── SheetSection — variant-aware section card ────────────────────────────────

function SheetSection({
  heading,
  collapsible,
  isOpen,
  onToggle,
  tokens,
  children,
}: {
  heading: string;
  collapsible: boolean;
  isOpen: boolean;
  onToggle?: () => void;
  tokens: DensityTokens;
  children: React.ReactNode;
}) {
  const headingInner = (
    <>
      <span className="h-px flex-1 bg-zinc-700/70 min-w-[1rem]" aria-hidden />
      <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 shrink-0 max-w-[70%] truncate">
        {heading}
      </span>
      {collapsible && (
        <ChevronDown
          size={12}
          className={`shrink-0 text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden
        />
      )}
      <span className="h-px flex-1 bg-zinc-700/70 min-w-[1rem]" aria-hidden />
    </>
  );

  return (
    <div className="space-y-2">
      {collapsible ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          className={`flex w-full items-center gap-3 px-1 ${tokens.headingTopPad} text-left`}
        >
          {headingInner}
        </button>
      ) : (
        <div className={`flex items-center gap-3 px-1 ${tokens.headingTopPad}`}>{headingInner}</div>
      )}
      {isOpen && (
        <div className={`${tokens.sectionRadius} ${tokens.sectionBg} ${tokens.sectionPad}`}>
          {children}
        </div>
      )}
    </div>
  );
}
