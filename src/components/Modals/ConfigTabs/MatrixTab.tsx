import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Plus, Trash2 } from 'lucide-react';

type ColumnKind = 'expression' | 'macro' | 'composite';

type ActorRole = 'character' | 'enemy' | 'ally' | 'neutral';

interface PartDraft {
  key: string;
  kind: 'expression' | 'macro';
  expression: string;
  macro_key: string;
  part_label: string;
}

interface ColumnDraft {
  key: string;
  column_id: string;
  label: string;
  kind: ColumnKind;
  expression: string;
  count: number;
  display: 'single' | 'pair';
  macro_key: string;
  macro_count: number;
  macro_display: 'single' | 'pair';
  parts: PartDraft[];
}

interface GroupDraft {
  key: string;
  group_id: string;
  label: string;
  columns: ColumnDraft[];
  expanded: boolean;
}

const ROLES: ActorRole[] = ['character', 'enemy', 'ally', 'neutral'];

function newKey(): string {
  return crypto.randomUUID();
}

function newPart(): PartDraft {
  return {
    key: newKey(),
    kind: 'expression',
    expression: '1d20',
    macro_key: '',
    part_label: '',
  };
}

function newColumn(kind: ColumnKind = 'expression'): ColumnDraft {
  return {
    key: newKey(),
    column_id: '',
    label: '',
    kind,
    expression: '1d20',
    count: 1,
    display: 'single',
    macro_key: '',
    macro_count: 1,
    macro_display: 'single',
    parts: [newPart(), newPart()],
  };
}

function newGroup(): GroupDraft {
  return {
    key: newKey(),
    group_id: '',
    label: '',
    columns: [newColumn('expression')],
    expanded: true,
  };
}

function parsePart(raw: unknown): PartDraft {
  if (!raw || typeof raw !== 'object') return newPart();
  const o = raw as Record<string, unknown>;
  const kind = String(o.kind || 'expression').toLowerCase() === 'macro' ? 'macro' : 'expression';
  return {
    key: newKey(),
    kind,
    expression: typeof o.expression === 'string' ? o.expression : '1d20',
    macro_key: typeof o.macro_key === 'string' ? o.macro_key : '',
    part_label: typeof o.part_label === 'string' ? o.part_label : '',
  };
}

function parseColumn(raw: unknown): ColumnDraft {
  if (!raw || typeof raw !== 'object') return newColumn();
  const o = raw as Record<string, unknown>;
  const kindRaw = String(o.kind || 'expression').toLowerCase();
  const kind: ColumnKind =
    kindRaw === 'macro' ? 'macro' : kindRaw === 'composite' ? 'composite' : 'expression';
  const partsRaw = Array.isArray(o.parts) ? o.parts : [];
  const parts =
    kind === 'composite' && partsRaw.length > 0
      ? partsRaw.map(parsePart)
      : [newPart(), newPart()];
  return {
    key: newKey(),
    column_id: typeof o.id === 'string' ? o.id : '',
    label: typeof o.label === 'string' ? o.label : '',
    kind,
    expression: typeof o.expression === 'string' ? o.expression : '1d20',
    count: typeof o.count === 'number' && Number.isFinite(o.count) ? Math.max(1, o.count) : 1,
    display: o.display === 'pair' ? 'pair' : 'single',
    macro_key: typeof o.macro_key === 'string' ? o.macro_key : '',
    macro_count:
      typeof o.count === 'number' && Number.isFinite(o.count) ? Math.max(1, o.count) : 1,
    macro_display: o.display === 'pair' ? 'pair' : 'single',
    parts,
  };
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
    expanded: true,
  };
}

function serializePart(p: PartDraft): Record<string, unknown> | null {
  if (p.kind === 'expression') {
    const expr = p.expression.trim();
    if (!expr) return null;
    const out: Record<string, unknown> = { kind: 'expression', expression: expr };
    const pl = p.part_label.trim();
    if (pl) out.part_label = pl;
    return out;
  }
  const mk = p.macro_key.trim();
  if (!mk) return null;
  const out: Record<string, unknown> = { kind: 'macro', macro_key: mk };
  const pl = p.part_label.trim();
  if (pl) out.part_label = pl;
  return out;
}

function serializeColumn(c: ColumnDraft): Record<string, unknown> | null {
  const id = c.column_id.trim();
  const label = c.label.trim();
  if (!id || !label) return null;

  if (c.kind === 'expression') {
    const expr = c.expression.trim() || '1d20';
    const out: Record<string, unknown> = {
      id,
      label,
      kind: 'expression',
      expression: expr,
      count: Math.max(1, Math.floor(c.count) || 1),
      display: c.display,
    };
    return out;
  }

  if (c.kind === 'macro') {
    const mk = c.macro_key.trim();
    if (!mk) return null;
    const out: Record<string, unknown> = {
      id,
      label,
      kind: 'macro',
      macro_key: mk,
      count: Math.max(1, Math.floor(c.macro_count) || 1),
      display: c.macro_display,
    };
    return out;
  }

  const parts = (c.parts ?? []).map(serializePart).filter(Boolean) as Record<string, unknown>[];
  if (parts.length === 0) return null;
  return { id, label, kind: 'composite', parts };
}

function serializeGroup(g: GroupDraft): Record<string, unknown> | null {
  const gid = g.group_id.trim();
  const glabel = g.label.trim();
  if (!gid || !glabel) return null;
  const columns = (g.columns ?? []).map(serializeColumn).filter(Boolean) as Record<
    string,
    unknown
  >[];
  if (columns.length === 0) return null;
  return { id: gid, label: glabel, columns };
}

export function MatrixTab({ systemName }: { systemName: string }) {
  const { t } = useTranslation('core', { useSuspense: false });
  const [groups, setGroups] = useState<GroupDraft[]>([]);
  const [excludeRoles, setExcludeRoles] = useState<Set<string>>(new Set());
  const [legacyWarn, setLegacyWarn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ variant: 'success' | 'error'; text: string } | null>(null);

  const inputClass =
    'py-1.5 px-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 outline-none focus:border-emerald-500/60 min-w-0';
  const selectClass =
    `${inputClass} appearance-none cursor-pointer pr-8 bg-[length:14px] bg-[right_8px_center] bg-no-repeat`;

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
        Array.isArray(rules) && rules.length > 0 && (!Array.isArray(groupsRaw) || groupsRaw.length === 0);
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

    const serializedGroups = groups.map(serializeGroup).filter(Boolean) as Record<
      string,
      unknown
    >[];
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
  }, [excludeRoles, groups, load, systemName, t]);

  const roleLabel = (role: ActorRole) => {
    const keys: Record<ActorRole, string> = {
      character: 'gm_console.initiative_role_character',
      enemy: 'gm_console.initiative_role_enemy',
      ally: 'gm_console.initiative_role_ally',
      neutral: 'gm_console.initiative_role_neutral',
    };
    return t(keys[role]);
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500 leading-relaxed">{t('config_modal.matrix_editor_intro')}</p>

      {legacyWarn ? (
        <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {t('config_modal.matrix_legacy_notice')}
        </div>
      ) : null}

      <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          {t('config_modal.matrix_exclude_roles')}
        </div>
        <div className="flex flex-wrap gap-3">
          {ROLES.map((role) => (
            <label
              key={role}
              className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer select-none"
            >
              <input
                type="checkbox"
                className="rounded border-zinc-600 bg-zinc-900 text-emerald-500 focus:ring-emerald-500/40"
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
        {groups.map((grp, gi) => (
          <div
            key={grp.key}
            className="rounded-xl border border-zinc-800 bg-zinc-950/50 overflow-hidden"
          >
            <button
              type="button"
              onClick={() =>
                setGroups((prev) =>
                  prev.map((g, i) => (i === gi ? { ...g, expanded: !g.expanded } : g)),
                )
              }
              className="flex w-full items-center justify-between gap-2 px-3 py-2 bg-zinc-900/60 hover:bg-zinc-900 text-left"
            >
              <span className="text-sm font-medium text-zinc-200 truncate">
                {grp.label.trim() || grp.group_id.trim() || t('config_modal.matrix_group_unnamed')}
              </span>
              <ChevronDown
                size={16}
                className={`shrink-0 text-zinc-500 transition-transform ${grp.expanded ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </button>

            {grp.expanded ? (
              <div className="p-3 space-y-3 border-t border-zinc-800">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="block space-y-1">
                    <span className="text-[10px] uppercase text-zinc-500">
                      {t('config_modal.matrix_group_id')}
                    </span>
                    <input
                      className={`${inputClass} w-full`}
                      value={grp.group_id}
                      onChange={(e) =>
                        setGroups((prev) =>
                          prev.map((g, i) => (i === gi ? { ...g, group_id: e.target.value } : g)),
                        )
                      }
                      placeholder="attacks"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[10px] uppercase text-zinc-500">
                      {t('config_modal.matrix_group_label')}
                    </span>
                    <input
                      className={`${inputClass} w-full`}
                      value={grp.label}
                      onChange={(e) =>
                        setGroups((prev) =>
                          prev.map((g, i) => (i === gi ? { ...g, label: e.target.value } : g)),
                        )
                      }
                      placeholder={t('config_modal.matrix_group_label_placeholder')}
                    />
                  </label>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      setGroups((prev) =>
                        prev.map((g, i) =>
                          i === gi ? { ...g, columns: [...g.columns, newColumn()] } : g,
                        ),
                      )
                    }
                    className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300"
                  >
                    <Plus size={14} aria-hidden />
                    {t('config_modal.matrix_add_column')}
                  </button>
                </div>

                <div className="space-y-2">
                  {grp.columns.map((col, ci) => (
                    <div
                      key={col.key}
                      className="rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[11px] font-medium text-zinc-400">
                          {t('config_modal.matrix_column_heading', { index: ci + 1 })}
                        </span>
                        <button
                          type="button"
                          title={t('config_modal.matrix_delete_column')}
                          onClick={() =>
                            setGroups((prev) =>
                              prev.map((g, i) =>
                                i === gi
                                  ? { ...g, columns: g.columns.filter((_, j) => j !== ci) }
                                  : g,
                              ),
                            )
                          }
                          className="p-1 rounded-md text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10"
                        >
                          <Trash2 size={14} aria-hidden />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <label className="block space-y-1">
                          <span className="text-[10px] uppercase text-zinc-500">
                            {t('config_modal.matrix_column_id')}
                          </span>
                          <input
                            className={`${inputClass} w-full`}
                            value={col.column_id}
                            onChange={(e) =>
                              setGroups((prev) =>
                                prev.map((g, i) =>
                                  i === gi
                                    ? {
                                        ...g,
                                        columns: g.columns.map((c, j) =>
                                          j === ci ? { ...c, column_id: e.target.value } : c,
                                        ),
                                      }
                                    : g,
                                ),
                              )
                            }
                          />
                        </label>
                        <label className="block space-y-1">
                          <span className="text-[10px] uppercase text-zinc-500">
                            {t('config_modal.matrix_column_label')}
                          </span>
                          <input
                            className={`${inputClass} w-full`}
                            value={col.label}
                            onChange={(e) =>
                              setGroups((prev) =>
                                prev.map((g, i) =>
                                  i === gi
                                    ? {
                                        ...g,
                                        columns: g.columns.map((c, j) =>
                                          j === ci ? { ...c, label: e.target.value } : c,
                                        ),
                                      }
                                    : g,
                                ),
                              )
                            }
                          />
                        </label>
                      </div>

                      <label className="block space-y-1">
                        <span className="text-[10px] uppercase text-zinc-500">
                          {t('config_modal.matrix_kind')}
                        </span>
                        <select
                          className={`${selectClass} w-full max-w-xs`}
                          style={{
                            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                          }}
                          value={col.kind}
                          onChange={(e) => {
                            const k = e.target.value as ColumnKind;
                            setGroups((prev) =>
                              prev.map((g, i) =>
                                i === gi
                                  ? {
                                      ...g,
                                      columns: g.columns.map((c, j) =>
                                        j === ci
                                          ? {
                                              ...newColumn(k),
                                              key: c.key,
                                              column_id: c.column_id,
                                              label: c.label,
                                            }
                                          : c,
                                      ),
                                    }
                                  : g,
                              ),
                            );
                          }}
                        >
                          <option value="expression">{t('config_modal.matrix_kind_expression')}</option>
                          <option value="macro">{t('config_modal.matrix_kind_macro')}</option>
                          <option value="composite">{t('config_modal.matrix_kind_composite')}</option>
                        </select>
                      </label>

                      {col.kind === 'expression' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <label className="block space-y-1 sm:col-span-2">
                            <span className="text-[10px] uppercase text-zinc-500">
                              {t('config_modal.matrix_field_expression')}
                            </span>
                            <input
                              className={`${inputClass} w-full font-mono`}
                              value={col.expression}
                              onChange={(e) =>
                                setGroups((prev) =>
                                  prev.map((g, i) =>
                                    i === gi
                                      ? {
                                          ...g,
                                          columns: g.columns.map((c, j) =>
                                            j === ci ? { ...c, expression: e.target.value } : c,
                                          ),
                                        }
                                      : g,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label className="block space-y-1">
                            <span className="text-[10px] uppercase text-zinc-500">
                              {t('config_modal.matrix_field_count')}
                            </span>
                            <input
                              type="number"
                              min={1}
                              className={`${inputClass} w-full`}
                              value={col.count}
                              onChange={(e) =>
                                setGroups((prev) =>
                                  prev.map((g, i) =>
                                    i === gi
                                      ? {
                                          ...g,
                                          columns: g.columns.map((c, j) =>
                                            j === ci
                                              ? {
                                                  ...c,
                                                  count: Math.max(1, parseInt(e.target.value, 10) || 1),
                                                }
                                              : c,
                                          ),
                                        }
                                      : g,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label className="block space-y-1 sm:col-span-3">
                            <span className="text-[10px] uppercase text-zinc-500">
                              {t('config_modal.matrix_field_display')}
                            </span>
                            <select
                              className={`${selectClass} w-full max-w-xs`}
                              style={{
                                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                              }}
                              value={col.display}
                              onChange={(e) =>
                                setGroups((prev) =>
                                  prev.map((g, i) =>
                                    i === gi
                                      ? {
                                          ...g,
                                          columns: g.columns.map((c, j) =>
                                            j === ci
                                              ? {
                                                  ...c,
                                                  display: e.target.value === 'pair' ? 'pair' : 'single',
                                                }
                                              : c,
                                          ),
                                        }
                                      : g,
                                  ),
                                )
                              }
                            >
                              <option value="single">{t('config_modal.matrix_display_single')}</option>
                              <option value="pair">{t('config_modal.matrix_display_pair')}</option>
                            </select>
                          </label>
                        </div>
                      ) : null}

                      {col.kind === 'macro' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <label className="block space-y-1 sm:col-span-2">
                            <span className="text-[10px] uppercase text-zinc-500">
                              {t('config_modal.matrix_field_macro_key')}
                            </span>
                            <input
                              className={`${inputClass} w-full font-mono`}
                              value={col.macro_key}
                              onChange={(e) =>
                                setGroups((prev) =>
                                  prev.map((g, i) =>
                                    i === gi
                                      ? {
                                          ...g,
                                          columns: g.columns.map((c, j) =>
                                            j === ci ? { ...c, macro_key: e.target.value } : c,
                                          ),
                                        }
                                      : g,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label className="block space-y-1">
                            <span className="text-[10px] uppercase text-zinc-500">
                              {t('config_modal.matrix_field_count')}
                            </span>
                            <input
                              type="number"
                              min={1}
                              className={`${inputClass} w-full`}
                              value={col.macro_count}
                              onChange={(e) =>
                                setGroups((prev) =>
                                  prev.map((g, i) =>
                                    i === gi
                                      ? {
                                          ...g,
                                          columns: g.columns.map((c, j) =>
                                            j === ci
                                              ? {
                                                  ...c,
                                                  macro_count: Math.max(
                                                    1,
                                                    parseInt(e.target.value, 10) || 1,
                                                  ),
                                                }
                                              : c,
                                          ),
                                        }
                                      : g,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label className="block space-y-1 sm:col-span-3">
                            <span className="text-[10px] uppercase text-zinc-500">
                              {t('config_modal.matrix_field_display')}
                            </span>
                            <select
                              className={`${selectClass} w-full max-w-xs`}
                              style={{
                                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                              }}
                              value={col.macro_display}
                              onChange={(e) =>
                                setGroups((prev) =>
                                  prev.map((g, i) =>
                                    i === gi
                                      ? {
                                          ...g,
                                          columns: g.columns.map((c, j) =>
                                            j === ci
                                              ? {
                                                  ...c,
                                                  macro_display:
                                                    e.target.value === 'pair' ? 'pair' : 'single',
                                                }
                                              : c,
                                          ),
                                        }
                                      : g,
                                  ),
                                )
                              }
                            >
                              <option value="single">{t('config_modal.matrix_display_single')}</option>
                              <option value="pair">{t('config_modal.matrix_display_pair')}</option>
                            </select>
                          </label>
                        </div>
                      ) : null}

                      {col.kind === 'composite' ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] text-zinc-500">
                              {t('config_modal.matrix_composite_parts')}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setGroups((prev) =>
                                  prev.map((g, i) =>
                                    i === gi
                                      ? {
                                          ...g,
                                          columns: g.columns.map((c, j) =>
                                            j === ci ? { ...c, parts: [...c.parts, newPart()] } : c,
                                          ),
                                        }
                                      : g,
                                  ),
                                )
                              }
                              className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300"
                            >
                              <Plus size={12} aria-hidden />
                              {t('config_modal.matrix_add_part')}
                            </button>
                          </div>
                          {(col.parts ?? []).map((part, pi) => (
                            <div
                              key={part.key}
                              className="flex flex-col sm:flex-row gap-2 sm:items-end rounded-md border border-zinc-800/80 p-2 bg-zinc-950/40"
                            >
                              <label className="block space-y-1 flex-1 min-w-0">
                                <span className="text-[10px] uppercase text-zinc-500">
                                  {t('config_modal.matrix_part_kind')}
                                </span>
                                <select
                                  className={`${selectClass} w-full`}
                                  style={{
                                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                                  }}
                                  value={part.kind}
                                  onChange={(e) =>
                                    setGroups((prev) =>
                                      prev.map((g, i) =>
                                        i === gi
                                          ? {
                                              ...g,
                                              columns: g.columns.map((c, j) =>
                                                j === ci
                                                  ? {
                                                      ...c,
                                                      parts: c.parts.map((p, k) =>
                                                        k === pi
                                                          ? {
                                                              ...p,
                                                              kind:
                                                                e.target.value === 'macro'
                                                                  ? 'macro'
                                                                  : 'expression',
                                                            }
                                                          : p,
                                                      ),
                                                    }
                                                  : c,
                                              ),
                                            }
                                          : g,
                                      ),
                                    )
                                  }
                                >
                                  <option value="expression">
                                    {t('config_modal.matrix_kind_expression')}
                                  </option>
                                  <option value="macro">{t('config_modal.matrix_kind_macro')}</option>
                                </select>
                              </label>
                              {part.kind === 'expression' ? (
                                <label className="block space-y-1 flex-[2] min-w-0">
                                  <span className="text-[10px] uppercase text-zinc-500">
                                    {t('config_modal.matrix_field_expression')}
                                  </span>
                                  <input
                                    className={`${inputClass} w-full font-mono`}
                                    value={part.expression}
                                    onChange={(e) =>
                                      setGroups((prev) =>
                                        prev.map((g, i) =>
                                          i === gi
                                            ? {
                                                ...g,
                                                columns: g.columns.map((c, j) =>
                                                  j === ci
                                                    ? {
                                                        ...c,
                                                        parts: c.parts.map((p, k) =>
                                                          k === pi
                                                            ? { ...p, expression: e.target.value }
                                                            : p,
                                                        ),
                                                      }
                                                    : c,
                                                ),
                                              }
                                            : g,
                                        ),
                                      )
                                    }
                                  />
                                </label>
                              ) : (
                                <label className="block space-y-1 flex-[2] min-w-0">
                                  <span className="text-[10px] uppercase text-zinc-500">
                                    {t('config_modal.matrix_field_macro_key')}
                                  </span>
                                  <input
                                    className={`${inputClass} w-full font-mono`}
                                    value={part.macro_key}
                                    onChange={(e) =>
                                      setGroups((prev) =>
                                        prev.map((g, i) =>
                                          i === gi
                                            ? {
                                                ...g,
                                                columns: g.columns.map((c, j) =>
                                                  j === ci
                                                    ? {
                                                        ...c,
                                                        parts: c.parts.map((p, k) =>
                                                          k === pi
                                                            ? { ...p, macro_key: e.target.value }
                                                            : p,
                                                        ),
                                                      }
                                                    : c,
                                                ),
                                              }
                                            : g,
                                        ),
                                      )
                                    }
                                  />
                                </label>
                              )}
                              <label className="block space-y-1 flex-1 min-w-0">
                                <span className="text-[10px] uppercase text-zinc-500">
                                  {t('config_modal.matrix_part_label_optional')}
                                </span>
                                <input
                                  className={`${inputClass} w-full`}
                                  value={part.part_label}
                                  onChange={(e) =>
                                    setGroups((prev) =>
                                      prev.map((g, i) =>
                                        i === gi
                                          ? {
                                              ...g,
                                              columns: g.columns.map((c, j) =>
                                                j === ci
                                                  ? {
                                                      ...c,
                                                      parts: c.parts.map((p, k) =>
                                                        k === pi
                                                          ? { ...p, part_label: e.target.value }
                                                          : p,
                                                      ),
                                                    }
                                                  : c,
                                              ),
                                            }
                                          : g,
                                      ),
                                    )
                                  }
                                />
                              </label>
                              <button
                                type="button"
                                disabled={(col.parts?.length ?? 0) <= 1}
                                title={t('config_modal.matrix_delete_part')}
                                onClick={() =>
                                  setGroups((prev) =>
                                    prev.map((g, i) =>
                                      i === gi
                                        ? {
                                            ...g,
                                            columns: g.columns.map((c, j) =>
                                              j === ci
                                                ? {
                                                    ...c,
                                                    parts: c.parts.filter((_, k) => k !== pi),
                                                  }
                                                : c,
                                            ),
                                          }
                                        : g,
                                    ),
                                  )
                                }
                                className="self-end p-2 rounded-md text-zinc-500 hover:text-rose-400 disabled:opacity-30"
                              >
                                <Trash2 size={14} aria-hidden />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => setGroups((prev) => prev.filter((_, i) => i !== gi))}
                    className="inline-flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300"
                  >
                    <Trash2 size={14} aria-hidden />
                    {t('config_modal.matrix_delete_group')}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ))}

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
