import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { slugify } from 'transliteration';
import { useSystemActions, type SystemActionDef } from '../../../hooks/useSystemActions';
import { useSystemColumns } from '../../../hooks/useSystemColumns';
import { InfoTooltip } from '../../UI/InfoTooltip';
import type { ColumnConfig } from '../../../types';

const MAX_PARTS_PER_COLUMN = 4;

function makeSlug(text: string, fallback: string): string {
  const raw = (text || '').trim();
  if (!raw) return fallback;
  const slug = (slugify(raw, { separator: '_' }) || '').toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const trimmed = slug.replace(/^_+|_+$/g, '').replace(/_+/g, '_');
  return trimmed || fallback;
}

function uniqueSlug(base: string, taken: Set<string>): string {
  let candidate = base;
  let i = 1;
  while (taken.has(candidate)) {
    i += 1;
    candidate = `${base}_${i}`;
  }
  taken.add(candidate);
  return candidate;
}

type ActorRole = 'character' | 'enemy' | 'ally' | 'neutral';

type PartKind = 'expression' | 'action' | 'stat';

interface PartDraft {
  key: string;
  kind: PartKind;
  expression: string;
  action_key: string;
  stat_key: string;
  part_label: string;
  /** How many times this sub-roll repeats per round. Only honored when the column has exactly 1 part. */
  count: number;
}

interface ColumnDraft {
  key: string;
  column_id: string;
  label: string;
  parts: PartDraft[];
}

interface GroupDraft {
  key: string;
  group_id: string;
  label: string;
  columns: ColumnDraft[];
}

const ROLES: ActorRole[] = ['character', 'enemy', 'ally', 'neutral'];

const SELECT_CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")";

function newKey(): string {
  return crypto.randomUUID();
}

function newPart(kind: PartKind = 'action'): PartDraft {
  return {
    key: newKey(),
    kind,
    expression: '',
    action_key: '',
    stat_key: '',
    part_label: '',
    count: 1,
  };
}

function newColumn(): ColumnDraft {
  return {
    key: newKey(),
    column_id: '',
    label: '',
    parts: [newPart('action')],
  };
}

function newGroup(): GroupDraft {
  return {
    key: newKey(),
    group_id: '',
    label: '',
    columns: [newColumn()],
  };
}

function moveItem<T>(arr: T[], i: number, delta: -1 | 1): T[] {
  const j = i + delta;
  if (j < 0 || j >= arr.length) return arr;
  const next = arr.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

function partFromRaw(raw: unknown): PartDraft {
  const part = newPart('expression');
  if (!raw || typeof raw !== 'object') return part;
  const o = raw as Record<string, unknown>;
  const kind = String(o.kind || '').toLowerCase();
  if (typeof o.part_label === 'string') part.part_label = o.part_label;
  if (kind === 'macro') {
    part.kind = 'action';
    if (typeof o.macro_key === 'string') part.action_key = o.macro_key;
    return part;
  }
  if (kind === 'expression') {
    part.kind = 'expression';
    if (typeof o.expression === 'string') part.expression = o.expression;
    return part;
  }
  return part;
}

function parseColumn(raw: unknown): ColumnDraft {
  const col = newColumn();
  if (!raw || typeof raw !== 'object') return col;
  const o = raw as Record<string, unknown>;
  if (typeof o.id === 'string') col.column_id = o.id;
  if (typeof o.label === 'string') col.label = o.label;
  const kindRaw = String(o.kind || 'expression').toLowerCase();
  const colCount =
    typeof o.count === 'number' && Number.isFinite(o.count) ? Math.max(1, o.count) : 1;

  if (kindRaw === 'macro') {
    const part = newPart('action');
    if (typeof o.macro_key === 'string') part.action_key = o.macro_key;
    part.count = colCount;
    col.parts = [part];
    return col;
  }
  if (kindRaw === 'expression') {
    const part = newPart('expression');
    if (typeof o.expression === 'string') part.expression = o.expression;
    part.count = colCount;
    col.parts = [part];
    return col;
  }
  if (kindRaw === 'composite') {
    const rawParts = Array.isArray(o.parts) ? o.parts : [];
    col.parts = rawParts.length > 0 ? rawParts.map(partFromRaw) : [newPart('action')];
    return col;
  }
  return col;
}

function parseGroup(raw: unknown): GroupDraft {
  if (!raw || typeof raw !== 'object') return newGroup();
  const o = raw as Record<string, unknown>;
  const cols = Array.isArray(o.columns) ? o.columns.map(parseColumn) : [];
  return {
    key: newKey(),
    group_id: typeof o.id === 'string' ? o.id : '',
    label: typeof o.label === 'string' ? o.label : '',
    columns: cols.length > 0 ? cols : [newColumn()],
  };
}

/** Build expression for a stat using its `roll_formula` (if defined) or fall back to `[stat_key]`. */
function statToExpression(statKey: string, columns: ColumnConfig[]): string {
  const col = columns.find((c) => c.key === statKey);
  const tmpl = col?.roll_formula?.trim();
  if (tmpl) return tmpl.replace(/\[value\]/g, `[${statKey}]`);
  return `[${statKey}]`;
}

function serializePart(
  p: PartDraft,
  columns: ColumnConfig[],
  fallbackLabel: string,
): Record<string, unknown> | null {
  const partLabel = (p.part_label || '').trim() || fallbackLabel;
  if (p.kind === 'expression') {
    const expr = p.expression.trim();
    if (!expr) return null;
    return { kind: 'expression', expression: expr, part_label: partLabel };
  }
  if (p.kind === 'action') {
    const ak = p.action_key.trim();
    if (!ak) return null;
    return { kind: 'macro', macro_key: ak, part_label: partLabel };
  }
  // stat
  const sk = p.stat_key.trim();
  if (!sk) return null;
  return { kind: 'expression', expression: statToExpression(sk, columns), part_label: partLabel };
}

function serializeColumn(
  c: ColumnDraft,
  columns: ColumnConfig[],
  defaultPartLabel: (n: number) => string,
  takenIds: Set<string>,
  fallbackId: string,
): Record<string, unknown> | null {
  const label = c.label.trim();
  if (!label) return null;
  const id = uniqueSlug(makeSlug(c.column_id, makeSlug(label, fallbackId)), takenIds);

  const usableParts = c.parts
    .map((p, i) => serializePart(p, columns, defaultPartLabel(i + 1)))
    .filter(Boolean) as Record<string, unknown>[];
  if (usableParts.length === 0) return null;

  if (usableParts.length === 1) {
    const single = usableParts[0];
    const sKind = single.kind;
    const partCount = Math.max(1, Math.floor(c.parts[0]?.count) || 1);
    const out: Record<string, unknown> = {
      id,
      label,
      kind: sKind,
      count: partCount,
    };
    if (sKind === 'expression') out.expression = single.expression;
    if (sKind === 'macro') out.macro_key = single.macro_key;
    return out;
  }

  return { id, label, kind: 'composite', parts: usableParts };
}

function serializeGroup(
  g: GroupDraft,
  columns: ColumnConfig[],
  defaultPartLabel: (n: number) => string,
  takenGroupIds: Set<string>,
  fallbackId: string,
): Record<string, unknown> | null {
  const glabel = g.label.trim();
  if (!glabel) return null;
  const gid = uniqueSlug(makeSlug(g.group_id, makeSlug(glabel, fallbackId)), takenGroupIds);

  const takenColIds = new Set<string>();
  const cols = (g.columns ?? [])
    .map((c, idx) => serializeColumn(c, columns, defaultPartLabel, takenColIds, `column_${idx + 1}`))
    .filter(Boolean) as Record<string, unknown>[];
  if (cols.length === 0) return null;
  return { id: gid, label: glabel, columns: cols };
}

const inputClass =
  'w-full py-1.5 px-2 text-xs bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none min-w-0';
const selectClass = `${inputClass} appearance-none cursor-pointer pr-8 bg-[length:14px] bg-[right_8px_center] bg-no-repeat`;
const iconBtnClass =
  'inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 disabled:opacity-30 disabled:hover:border-zinc-800 disabled:hover:text-zinc-400 transition-colors';

function RowControls({
  onUp,
  onDown,
  onRemove,
  upDisabled,
  downDisabled,
  upLabel,
  downLabel,
  removeLabel,
}: {
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
  upDisabled: boolean;
  downDisabled: boolean;
  upLabel: string;
  downLabel: string;
  removeLabel: string;
}) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button type="button" onClick={onUp} disabled={upDisabled} aria-label={upLabel} title={upLabel} className={iconBtnClass}>
        <span aria-hidden className="text-sm leading-none">↑</span>
      </button>
      <button type="button" onClick={onDown} disabled={downDisabled} aria-label={downLabel} title={downLabel} className={iconBtnClass}>
        <span aria-hidden className="text-sm leading-none">↓</span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        title={removeLabel}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 text-zinc-500 hover:border-rose-500/40 hover:text-rose-300 transition-colors"
      >
        <span aria-hidden className="text-sm leading-none">✕</span>
      </button>
    </div>
  );
}

export function MatrixTab({ systemName }: { systemName: string }) {
  const { t } = useTranslation('core', { useSuspense: false });
  const [groups, setGroups] = useState<GroupDraft[]>([]);
  const [excludeRoles, setExcludeRoles] = useState<Set<string>>(new Set());
  const [legacyWarn, setLegacyWarn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ variant: 'success' | 'error'; text: string } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [expandedColumns, setExpandedColumns] = useState<Set<string>>(new Set());

  const { actions: systemActions } = useSystemActions(systemName);
  const { columns: systemColumns } = useSystemColumns(systemName);
  const rollableStats = useMemo(
    () => systemColumns.filter((c) => c.is_rollable === true),
    [systemColumns],
  );
  const actionsList = useMemo(
    () =>
      Object.entries(systemActions)
        .map(([key, def]) => ({ key, def }))
        .sort((a, b) => a.def.name.localeCompare(b.def.name)),
    [systemActions],
  );

  const defaultPartLabel = useCallback(
    (n: number) => t('config_modal.matrix_default_part_label', { n }),
    [t],
  );

  const updateGroup = useCallback(
    (gi: number, fn: (g: GroupDraft) => GroupDraft) =>
      setGroups((prev) => prev.map((g, i) => (i === gi ? fn(g) : g))),
    [],
  );
  const updateColumn = useCallback(
    (gi: number, ci: number, fn: (c: ColumnDraft) => ColumnDraft) =>
      updateGroup(gi, (g) => ({
        ...g,
        columns: g.columns.map((c, j) => (j === ci ? fn(c) : c)),
      })),
    [updateGroup],
  );
  const updatePart = useCallback(
    (gi: number, ci: number, pi: number, fn: (p: PartDraft) => PartDraft) =>
      updateColumn(gi, ci, (c) => ({
        ...c,
        parts: c.parts.map((p, j) => (j === pi ? fn(p) : p)),
      })),
    [updateColumn],
  );

  const removeGroup = (gi: number) => setGroups((prev) => prev.filter((_, i) => i !== gi));
  const moveGroup = (gi: number, delta: -1 | 1) => setGroups((prev) => moveItem(prev, gi, delta));
  const removeColumn = (gi: number, ci: number) =>
    updateGroup(gi, (g) => ({ ...g, columns: g.columns.filter((_, j) => j !== ci) }));
  const moveColumn = (gi: number, ci: number, delta: -1 | 1) =>
    updateGroup(gi, (g) => ({ ...g, columns: moveItem(g.columns, ci, delta) }));
  const addColumn = (gi: number) => {
    const fresh = newColumn();
    updateGroup(gi, (g) => ({ ...g, columns: [...g.columns, fresh] }));
    setExpandedColumns((prev) => {
      const next = new Set(prev);
      next.add(fresh.key);
      return next;
    });
  };
  const removePart = (gi: number, ci: number, pi: number) =>
    updateColumn(gi, ci, (c) => ({ ...c, parts: c.parts.filter((_, j) => j !== pi) }));
  const movePart = (gi: number, ci: number, pi: number, delta: -1 | 1) =>
    updateColumn(gi, ci, (c) => ({ ...c, parts: moveItem(c.parts, pi, delta) }));
  const addPart = (gi: number, ci: number) =>
    updateColumn(gi, ci, (c) => ({ ...c, parts: [...c.parts, newPart('action')] }));

  const toggleCollapsed = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleColumnExpanded = (key: string) =>
    setExpandedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const load = useCallback(async () => {
    const name = (systemName || '').trim();
    if (!name) {
      setGroups([]);
      setExcludeRoles(new Set());
      setLegacyWarn(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/systems/${encodeURIComponent(name)}/matrix`);
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const groupsRaw = data.groups;
      const hasGroups = Array.isArray(groupsRaw) && groupsRaw.length > 0;
      const rules = data.generation_rules;
      const hasLegacy =
        Array.isArray(rules) &&
        rules.length > 0 &&
        (!Array.isArray(groupsRaw) || groupsRaw.length === 0);
      setLegacyWarn(hasLegacy);

      if (hasGroups) {
        setGroups((groupsRaw as unknown[]).map(parseGroup));
      } else {
        setGroups([]);
      }

      const af = data.actor_filter;
      const nextEx = new Set<string>();
      if (af && typeof af === 'object' && !Array.isArray(af)) {
        const ex = (af as Record<string, unknown>).exclude_roles;
        if (Array.isArray(ex)) {
          for (const r of ex) {
            if (typeof r === 'string' && ROLES.includes(r as ActorRole)) nextEx.add(r);
          }
        }
      }
      setExcludeRoles(nextEx);
      setNotice(null);
    } catch {
      setNotice({ variant: 'error', text: t('config_modal.matrix_load_error') });
    } finally {
      setLoading(false);
    }
  }, [systemName, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleExclude = (role: ActorRole) => {
    setExcludeRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  };

  const save = useCallback(async () => {
    const name = (systemName || '').trim();
    if (!name) return;

    const takenGroupIds = new Set<string>();
    const serializedGroups = groups
      .map((g, idx) =>
        serializeGroup(g, systemColumns, defaultPartLabel, takenGroupIds, `group_${idx + 1}`),
      )
      .filter(Boolean) as Record<string, unknown>[];
    if (serializedGroups.length === 0) {
      setNotice({ variant: 'error', text: t('config_modal.matrix_editor_need_group') });
      return;
    }

    const payload: Record<string, unknown> = {
      schema_version: 2,
      groups: serializedGroups,
    };
    if (excludeRoles.size > 0) {
      payload.actor_filter = { exclude_roles: Array.from(excludeRoles) };
    }

    try {
      const res = await fetch(`/api/systems/${encodeURIComponent(name)}/matrix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setNotice({
          variant: 'error',
          text: t('config_modal.matrix_save_error', { status: res.status }),
        });
        return;
      }
      setNotice({ variant: 'success', text: t('config_modal.matrix_saved') });
      await load();
    } catch {
      setNotice({ variant: 'error', text: t('config_modal.matrix_save_network_error') });
    }
  }, [defaultPartLabel, excludeRoles, groups, load, systemColumns, systemName, t]);

  const roleLabel = (role: ActorRole) => {
    const keys: Record<ActorRole, string> = {
      character: 'gm_console.initiative_role_character',
      enemy: 'gm_console.initiative_role_enemy',
      ally: 'gm_console.initiative_role_ally',
      neutral: 'gm_console.initiative_role_neutral',
    };
    return t(keys[role]);
  };

  const upLabel = t('config_modal.matrix_move_up');
  const downLabel = t('config_modal.matrix_move_down');
  const groupRemoveLabel = t('config_modal.matrix_delete_group');
  const columnRemoveLabel = t('config_modal.matrix_delete_column');
  const partRemoveLabel = t('config_modal.matrix_delete_part');
  const collapseLabel = t('config_modal.matrix_collapse_group');
  const expandLabel = t('config_modal.matrix_expand_group');

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500 leading-relaxed">{t('config_modal.matrix_editor_intro')}</p>

      {legacyWarn ? (
        <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {t('config_modal.matrix_legacy_notice')}
        </div>
      ) : null}

      <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 space-y-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          {t('config_modal.matrix_exclude_roles')}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
          {ROLES.map((role) => (
            <label key={role} className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-4 h-4 shrink-0 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-900"
                checked={excludeRoles.has(role)}
                onChange={() => toggleExclude(role)}
              />
              {roleLabel(role)}
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={loading || !(systemName || '').trim()}
          onClick={() => setGroups((g) => [...g, newGroup()])}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600/40 bg-emerald-600/15 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-600/25 disabled:opacity-50"
        >
          <Plus size={14} aria-hidden />
          {t('config_modal.matrix_add_group')}
        </button>
        <button
          type="button"
          disabled={loading || !(systemName || '').trim()}
          onClick={() => void load()}
          className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
        >
          {t('config_modal.matrix_reload')}
        </button>
        <button
          type="button"
          disabled={loading || !(systemName || '').trim()}
          onClick={() => void save()}
          className="rounded-lg border border-emerald-600/40 bg-emerald-600/15 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-600/25 disabled:opacity-50"
        >
          {t('config_modal.matrix_save')}
        </button>
      </div>

      <div className="space-y-3">
        {groups.map((grp, gi) => {
          const isCollapsed = collapsed.has(grp.key);
          const Chevron = isCollapsed ? ChevronRight : ChevronDown;
          const groupTitle =
            grp.label.trim() || grp.group_id.trim() || t('config_modal.matrix_group_unnamed');
          return (
            <div key={grp.key} className="rounded-xl border border-zinc-800 bg-zinc-950/50">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800/80">
                <button
                  type="button"
                  onClick={() => toggleCollapsed(grp.key)}
                  aria-label={isCollapsed ? expandLabel : collapseLabel}
                  title={isCollapsed ? expandLabel : collapseLabel}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:text-zinc-200"
                >
                  <Chevron size={16} aria-hidden />
                </button>
                <div className="flex-1 min-w-0 truncate text-xs font-medium text-zinc-200">
                  {groupTitle}
                </div>
                <RowControls
                  onUp={() => moveGroup(gi, -1)}
                  onDown={() => moveGroup(gi, 1)}
                  onRemove={() => removeGroup(gi)}
                  upDisabled={gi === 0}
                  downDisabled={gi === groups.length - 1}
                  upLabel={upLabel}
                  downLabel={downLabel}
                  removeLabel={groupRemoveLabel}
                />
              </div>

              {isCollapsed ? null : (
                <div className="p-4 space-y-4">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <label className="flex flex-col gap-1 flex-1 min-w-0">
                      <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                        {t('config_modal.matrix_group_label')}
                      </span>
                      <input
                        className={inputClass}
                        value={grp.label}
                        onChange={(e) => updateGroup(gi, (g) => ({ ...g, label: e.target.value }))}
                        placeholder={t('config_modal.matrix_group_label_placeholder')}
                      />
                    </label>
                    <label className="flex flex-col gap-1 sm:w-40 shrink-0">
                      <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                        {t('config_modal.matrix_group_id')}
                      </span>
                      <input
                        className={`${inputClass} font-mono`}
                        value={grp.group_id}
                        onChange={(e) => updateGroup(gi, (g) => ({ ...g, group_id: e.target.value }))}
                      />
                    </label>
                  </div>

                  <div className="space-y-3">
                    {grp.columns.map((col, ci) => (
                      <ColumnEditor
                        key={col.key}
                        col={col}
                        ci={ci}
                        total={grp.columns.length}
                        expanded={expandedColumns.has(col.key)}
                        onToggleExpanded={() => toggleColumnExpanded(col.key)}
                        t={t}
                        actions={actionsList}
                        rollableStats={rollableStats}
                        onMoveUp={() => moveColumn(gi, ci, -1)}
                        onMoveDown={() => moveColumn(gi, ci, 1)}
                        onRemove={() => removeColumn(gi, ci)}
                        onChange={(fn) => updateColumn(gi, ci, fn)}
                        onPartChange={(pi, fn) => updatePart(gi, ci, pi, fn)}
                        onPartMoveUp={(pi) => movePart(gi, ci, pi, -1)}
                        onPartMoveDown={(pi) => movePart(gi, ci, pi, 1)}
                        onPartRemove={(pi) => removePart(gi, ci, pi)}
                        onAddPart={() => addPart(gi, ci)}
                        upLabel={upLabel}
                        downLabel={downLabel}
                        columnRemoveLabel={columnRemoveLabel}
                        partRemoveLabel={partRemoveLabel}
                        defaultPartLabel={defaultPartLabel}
                      />
                    ))}
                  </div>

                  <div className="flex justify-start">
                    <button
                      type="button"
                      onClick={() => addColumn(gi)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600/35 bg-emerald-600/10 px-2.5 py-1 text-[11px] font-medium text-emerald-200 hover:bg-emerald-600/20"
                    >
                      <Plus size={14} aria-hidden />
                      {t('config_modal.matrix_add_column')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {groups.length === 0 && !loading ? (
          <p className="text-xs text-zinc-600">{t('config_modal.matrix_editor_empty')}</p>
        ) : null}
      </div>

      {notice ? (
        <div
          className={`text-xs rounded-lg px-3 py-2 ${
            notice.variant === 'success'
              ? 'bg-emerald-950/50 text-emerald-300 border border-emerald-800/50'
              : 'bg-rose-950/40 text-rose-300 border border-rose-800/40'
          }`}
        >
          {notice.text}
        </div>
      ) : null}
    </div>
  );
}

interface ColumnEditorProps {
  col: ColumnDraft;
  ci: number;
  total: number;
  expanded: boolean;
  onToggleExpanded: () => void;
  t: ReturnType<typeof useTranslation>['t'];
  actions: { key: string; def: SystemActionDef }[];
  rollableStats: ColumnConfig[];
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onChange: (fn: (c: ColumnDraft) => ColumnDraft) => void;
  onPartChange: (pi: number, fn: (p: PartDraft) => PartDraft) => void;
  onPartMoveUp: (pi: number) => void;
  onPartMoveDown: (pi: number) => void;
  onPartRemove: (pi: number) => void;
  onAddPart: () => void;
  upLabel: string;
  downLabel: string;
  columnRemoveLabel: string;
  partRemoveLabel: string;
  defaultPartLabel: (n: number) => string;
}

function ColumnEditor({
  col,
  ci,
  total,
  expanded,
  onToggleExpanded,
  t,
  actions,
  rollableStats,
  onMoveUp,
  onMoveDown,
  onRemove,
  onChange,
  onPartChange,
  onPartMoveUp,
  onPartMoveDown,
  onPartRemove,
  onAddPart,
  upLabel,
  downLabel,
  columnRemoveLabel,
  partRemoveLabel,
  defaultPartLabel,
}: ColumnEditorProps) {
  const isSinglePart = col.parts.length === 1;
  const partsLimitReached = col.parts.length >= MAX_PARTS_PER_COLUMN;

  return (
    <div
      className={`rounded-xl border bg-zinc-950/60 transition-colors ${
        expanded ? 'border-zinc-700' : 'border-zinc-800/90'
      }`}
    >
      <div className="flex items-center gap-2 p-2">
        <div className="flex flex-col shrink-0">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={ci === 0}
            className="p-0.5 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed"
            title={upLabel}
            aria-label={upLabel}
          >
            <span aria-hidden className="text-[11px] leading-none">↑</span>
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={ci === total - 1}
            className="p-0.5 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed"
            title={downLabel}
            aria-label={downLabel}
          >
            <span aria-hidden className="text-[11px] leading-none">↓</span>
          </button>
        </div>

        <input
          type="text"
          value={col.label}
          onChange={(e) => onChange((c) => ({ ...c, label: e.target.value }))}
          placeholder={t('config_modal.matrix_column_label')}
          className={`${inputClass} flex-1 min-w-0`}
        />

        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          className="p-1 text-zinc-500 hover:text-zinc-200 transition-colors shrink-0"
          title={expanded ? t('config_modal.matrix_collapse_group') : t('config_modal.matrix_expand_group')}
        >
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>

        <button
          type="button"
          onClick={onRemove}
          className="p-1 text-zinc-600 hover:text-rose-400 transition-colors shrink-0"
          title={columnRemoveLabel}
          aria-label={columnRemoveLabel}
        >
          <span aria-hidden className="text-[13px] leading-none">✕</span>
        </button>
      </div>

      {expanded ? (
        <div className="border-t border-zinc-800/80 p-3 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <label className="flex flex-col gap-1 flex-1 min-w-0">
              <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                {t('config_modal.matrix_column_label')}
              </span>
              <input
                type="text"
                value={col.label}
                onChange={(e) => onChange((c) => ({ ...c, label: e.target.value }))}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1 sm:w-40 shrink-0">
              <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                {t('config_modal.matrix_column_id')}
              </span>
              <input
                type="text"
                value={col.column_id}
                onChange={(e) => onChange((c) => ({ ...c, column_id: e.target.value }))}
                className={`${inputClass} font-mono`}
              />
            </label>
          </div>

          <p className="text-[11px] text-zinc-600 leading-relaxed">{t('config_modal.matrix_column_intro')}</p>

          <div className="space-y-2">
            {col.parts.length === 0 ? (
              <p className="text-[11px] text-zinc-600 px-1">{t('config_modal.matrix_column_no_parts')}</p>
            ) : (
              <div className="grid grid-cols-[7rem_minmax(0,1fr)_7rem_3.5rem_auto] gap-2 px-3 text-[10px] uppercase tracking-wide text-zinc-500">
                <span>{t('config_modal.matrix_part_kind')}</span>
                <span aria-hidden />
                <span>{t('config_modal.matrix_part_label_field')}</span>
                <span className="inline-flex items-center gap-1" title={t('config_modal.matrix_field_repeat_hint')}>
                  {t('config_modal.matrix_field_repeat')}
                  <InfoTooltip text={t('config_modal.matrix_field_repeat_hint')} />
                </span>
                <span aria-hidden />
              </div>
            )}
            {col.parts.map((part, pi) => (
              <PartEditor
                key={part.key}
                part={part}
                pi={pi}
                total={col.parts.length}
                t={t}
                actions={actions}
                rollableStats={rollableStats}
                onMoveUp={() => onPartMoveUp(pi)}
                onMoveDown={() => onPartMoveDown(pi)}
                onRemove={() => onPartRemove(pi)}
                onChange={(fn) => onPartChange(pi, fn)}
                upLabel={upLabel}
                downLabel={downLabel}
                removeLabel={partRemoveLabel}
                placeholderLabel={defaultPartLabel(pi + 1)}
                repeatEnabled={isSinglePart}
              />
            ))}
            <div>
              <button
                type="button"
                onClick={onAddPart}
                disabled={partsLimitReached}
                title={partsLimitReached ? t('config_modal.matrix_max_parts_reached') : undefined}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600/30 bg-emerald-600/10 px-2.5 py-1 text-[11px] font-medium text-emerald-200 hover:bg-emerald-600/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus size={14} aria-hidden />
                {t('config_modal.matrix_add_part')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface PartEditorProps {
  part: PartDraft;
  pi: number;
  total: number;
  t: ReturnType<typeof useTranslation>['t'];
  actions: { key: string; def: SystemActionDef }[];
  rollableStats: ColumnConfig[];
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onChange: (fn: (p: PartDraft) => PartDraft) => void;
  upLabel: string;
  downLabel: string;
  removeLabel: string;
  placeholderLabel: string;
  /** When false, the repeat (count) input is disabled — composite cannot honor per-part counts. */
  repeatEnabled: boolean;
}

function PartEditor({
  part,
  pi,
  total,
  t,
  actions,
  rollableStats,
  onMoveUp,
  onMoveDown,
  onRemove,
  onChange,
  upLabel,
  downLabel,
  removeLabel,
  placeholderLabel,
  repeatEnabled,
}: PartEditorProps) {
  const onKindChange = (next: PartKind) => {
    onChange((p) => ({ ...p, kind: next }));
  };

  const renderSource = () => {
    if (part.kind === 'expression') {
      return (
        <input
          className={`${inputClass} font-mono`}
          value={part.expression}
          onChange={(e) => onChange((p) => ({ ...p, expression: e.target.value }))}
          placeholder="1d20+5"
        />
      );
    }
    if (part.kind === 'action') {
      if (actions.length === 0) {
        return (
          <div className={`${inputClass} text-zinc-600 italic`}>
            {t('config_modal.matrix_part_no_actions')}
          </div>
        );
      }
      return (
        <select
          className={`${selectClass} w-full`}
          style={{ backgroundImage: SELECT_CHEVRON }}
          value={part.action_key}
          onChange={(e) => onChange((p) => ({ ...p, action_key: e.target.value }))}
        >
          <option value="">{t('config_modal.matrix_part_action_select')}</option>
          {actions.map(({ key, def }) => (
            <option key={key} value={key}>
              {def.name} · {def.formula}
            </option>
          ))}
        </select>
      );
    }
    // stat
    if (rollableStats.length === 0) {
      return (
        <div className={`${inputClass} text-zinc-600 italic`}>
          {t('config_modal.matrix_part_no_rollable_stats')}
        </div>
      );
    }
    return (
      <select
        className={`${selectClass} w-full`}
        style={{ backgroundImage: SELECT_CHEVRON }}
        value={part.stat_key}
        onChange={(e) => onChange((p) => ({ ...p, stat_key: e.target.value }))}
      >
        <option value="">{t('config_modal.matrix_part_stat_select')}</option>
        {rollableStats.map((stat) => {
          const tmpl = stat.roll_formula?.trim() || `[${stat.key}]`;
          return (
            <option key={stat.key} value={stat.key}>
              {stat.label || stat.key} · {tmpl}
            </option>
          );
        })}
      </select>
    );
  };

  const repeatTitle = repeatEnabled
    ? t('config_modal.matrix_field_repeat_hint')
    : t('config_modal.matrix_field_repeat_disabled');

  return (
    <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/50 p-3">
      <div className="grid grid-cols-[7rem_minmax(0,1fr)_7rem_3.5rem_auto] gap-2 items-center">
        <select
          className={selectClass}
          style={{ backgroundImage: SELECT_CHEVRON }}
          value={part.kind}
          onChange={(e) => onKindChange(e.target.value as PartKind)}
          aria-label={t('config_modal.matrix_part_kind')}
        >
          <option value="expression">{t('config_modal.matrix_part_kind_expression')}</option>
          <option value="action">{t('config_modal.matrix_part_kind_action')}</option>
          <option value="stat">{t('config_modal.matrix_part_kind_stat')}</option>
        </select>
        {renderSource()}
        <input
          className={inputClass}
          value={part.part_label}
          onChange={(e) => onChange((p) => ({ ...p, part_label: e.target.value }))}
          placeholder={t('config_modal.matrix_part_label_placeholder', { defaultValue: placeholderLabel })}
          aria-label={t('config_modal.matrix_part_label_field')}
        />
        <input
          type="number"
          min={1}
          className={inputClass}
          value={part.count}
          disabled={!repeatEnabled}
          onChange={(e) => onChange((p) => ({ ...p, count: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
          title={repeatTitle}
          aria-label={t('config_modal.matrix_field_repeat')}
        />
        <RowControls
          onUp={onMoveUp}
          onDown={onMoveDown}
          onRemove={onRemove}
          upDisabled={pi === 0}
          downDisabled={pi === total - 1}
          upLabel={upLabel}
          downLabel={downLabel}
          removeLabel={removeLabel}
        />
      </div>
    </div>
  );
}
