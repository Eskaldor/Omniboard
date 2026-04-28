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
} from 'lucide-react';
import { Actor, ColumnConfig } from '../../types';
import { useCombat } from '../../contexts/CombatContext';
import { useCombatState } from '../../contexts/CombatStateContext';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import {
  getMaxKey,
  parseStatValueDraft,
  type StatOverrideDraft,
} from '../../utils/stats';
import { InlineInput } from '../InitiativeTracker/InlineInput';
import { usePortraitCacheVersion } from '../../utils/portraitCache';

type DeviceInfo = { name?: string; ip?: string; status?: string };

function withCacheBuster(url: string, buster: string | number): string {
  if (!url) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${encodeURIComponent(String(buster))}`;
}

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

function StatRow({
  actor,
  column,
  label,
  pairColumn,
  onUpdate,
}: {
  actor: Actor;
  column: ColumnConfig;
  label: string;
  pairColumn?: ColumnConfig;
  onUpdate?: (id: string, field: string, value: unknown) => void;
}) {
  const { t } = useTranslation('core', { useSuspense: false });
  const draft = parseStatValueDraft(actor.stats[column.key]);
  const readonly = column.is_readonly === true;
  const computedId = (column.computed_formula_id ?? '').trim();
  const isComputed = computedId !== '';
  const editable = !readonly && !isComputed;
  const ovSum = draft.overrides.reduce((s, o) => s + o.value, 0);
  const hasOv = draft.overrides.length > 0;
  const canRoll = column.is_rollable === true;
  const isWide = !!pairColumn;

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
      await fetch(`/api/combat/actors/${encodeURIComponent(actor.id)}/roll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expression: expr, is_preroll: false }),
      });
    } finally {
      setRolling(false);
    }
  };

  const renderControl = (col: ColumnConfig, compact = false) => {
    const d = parseStatValueDraft(actor.stats[col.key]);
    const ro = col.is_readonly === true;
    const cmp = !!(col.computed_formula_id ?? '').trim();
    if (ro || cmp) {
      return (
        <span
          className={`inline-flex items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 italic tabular-nums text-zinc-500 ${
            compact ? 'px-1.5 py-0.5 text-xs min-w-[2.25rem]' : 'px-2 py-0.5 text-xs min-w-[2.75rem]'
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
          compact ? 'px-1.5 py-0.5 text-xs w-12' : 'px-2 py-0.5 text-xs w-14'
        }`}
      />
    );
  };

  return (
    <div
      className={`break-inside-avoid mb-1 rounded-md hover:bg-zinc-900/40 transition-colors ${
        isWide ? '[column-span:all]' : ''
      }`}
    >
      <div className="flex items-center gap-2 px-1.5 py-1">
        <span className="flex-1 min-w-0 truncate text-xs text-zinc-400" title={label}>
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
              className={`shrink-0 w-5 h-5 grid place-items-center rounded text-zinc-600 hover:text-zinc-200 hover:bg-zinc-800 transition-colors ${
                open ? 'bg-zinc-800 text-zinc-200' : ''
              }`}
              title={t('stat_editor.overrides')}
            >
              <ChevronDown size={12} className={open ? 'rotate-180' : ''} />
            </button>
          )}
          {canRoll && (
            <button
              type="button"
              onClick={handleRoll}
              disabled={rolling}
              className="shrink-0 w-5 h-5 grid place-items-center rounded text-zinc-500 hover:text-emerald-300 hover:bg-emerald-600/20 disabled:opacity-40 transition-colors"
              title={t('stat_editor.roll')}
            >
              <Dices size={12} />
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

export function DefaultSystemSheet({
  actor,
  columns,
  systemName,
  onUpdate,
  onOpenPortraitPicker,
}: {
  actor: Actor;
  columns: ColumnConfig[];
  systemName: string;
  onUpdate?: (id: string, field: string, value: unknown) => void;
  onOpenPortraitPicker?: () => void;
}) {
  const { t } = useTranslation('core', { useSuspense: false });
  const { state } = useCombatState();
  const { systemLayoutProfiles } = useCombat();
  const portraitCacheVersion = usePortraitCacheVersion();
  const colName = (col: ColumnConfig) =>
    i18n.t(`${col.key}.name`, { ns: `systems/${systemName}` }) || col.label || col.key;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [devices, setDevices] = useState<Record<string, DeviceInfo>>({});
  const [showSetup, setShowSetup] = useState(false);

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
  }, []);

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

  return (
    <div className="p-5 space-y-4">
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

        <div className="flex-1 min-w-0">
          {columns.length > 0 ? (
            <div className="columns-2 gap-x-5 [column-fill:balance]">
              {columns.map((col) => {
                const maxKey = getMaxKey(col);
                const showAsFraction = (col.display_as_fraction ?? false) && !!maxKey;
                const pairColumn = maxKey
                  ? columns.find((c) => c.key === maxKey)
                  : undefined;

                if (showAsFraction && pairColumn) {
                  return (
                    <React.Fragment key={col.key}>
                      <StatRow
                        actor={actor}
                        column={col}
                        pairColumn={pairColumn}
                        label={colName(col)}
                        onUpdate={onUpdate}
                      />
                    </React.Fragment>
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
                      />
                      <StatRow
                        actor={actor}
                        column={pairColumn}
                        label={colName(pairColumn)}
                        onUpdate={onUpdate}
                      />
                    </React.Fragment>
                  );
                }

                return (
                  <React.Fragment key={col.key}>
                    <StatRow
                      actor={actor}
                      column={col}
                      label={colName(col)}
                      onUpdate={onUpdate}
                    />
                  </React.Fragment>
                );
              })}
            </div>
          ) : (
            <div className="text-xs text-zinc-600 italic px-1">{t('modals.stats')}: —</div>
          )}
        </div>
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
    </div>
  );
}
