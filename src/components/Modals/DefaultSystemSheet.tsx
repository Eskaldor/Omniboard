import React, { useState, useEffect } from 'react';
import { Save, Download, Upload, Plus, RefreshCcw, Wrench } from 'lucide-react';
import { Actor, ColumnConfig } from '../../types';
import { useCombat } from '../../contexts/CombatContext';
import { useCombatState } from '../../contexts/CombatStateContext';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import {
  getMaxKey,
  getStatNumeric,
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

function StatValueEditor({
  actor,
  column,
  label,
  onUpdate,
}: {
  key?: React.Key;
  actor: Actor;
  column: ColumnConfig;
  label: string;
  onUpdate?: (id: string, field: string, value: unknown) => void;
}) {
  const { t } = useTranslation('core', { useSuspense: false });
  const raw = actor.stats[column.key];
  const draft = parseStatValueDraft(raw);
  const readonly = column.is_readonly === true;
  const computedId = (column.computed_formula_id ?? '').trim();
  const isComputed = computedId !== '';
  const [overrides, setOverrides] = useState<StatOverrideDraft[]>(draft.overrides);
  const [newSource, setNewSource] = useState('');
  const [newValue, setNewValue] = useState('');

  useEffect(() => {
    setOverrides(draft.overrides);
  }, [raw]);

  const commit = (next: { base?: number; overrides?: StatOverrideDraft[] }) => {
    if (!onUpdate || readonly) return;
    const nextOverrides = next.overrides ?? overrides;
    const nextBase = isComputed ? 0 : next.base ?? draft.base;
    const optimisticValue = isComputed
      ? draft.value
      : Math.round(nextBase + nextOverrides.reduce((sum, o) => sum + o.value, 0));
    onUpdate(actor.id, 'stats', {
      ...actor.stats,
      [column.key]: {
        base: nextBase,
        formula_id: isComputed ? computedId : draft.formula_id,
        overrides: nextOverrides,
        value: optimisticValue,
      },
    });
  };

  const addOverride = () => {
    const source = newSource.trim();
    const value = parseFloat(newValue.replace(',', '.'));
    if (!source || Number.isNaN(value)) return;
    const next = [...overrides, { source, value }];
    setOverrides(next);
    setNewSource('');
    setNewValue('');
    commit({ overrides: next });
  };

  const removeOverride = (index: number) => {
    const next = overrides.filter((_, i) => i !== index);
    setOverrides(next);
    commit({ overrides: next });
  };

  return (
    <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="block text-xs text-zinc-500">{label}</label>
        <span className={`text-sm tabular-nums ${readonly || isComputed ? 'text-zinc-500 italic' : 'text-zinc-200'}`}>
          {draft.value}
        </span>
      </div>
      {isComputed ? (
        <div className="text-[10px] text-zinc-500">
          {t('stat_editor.formula_id')}: <span className="font-mono">{computedId}</span>
        </div>
      ) : readonly ? (
        <div className="text-[10px] text-zinc-500">
          {t('stat_editor.base')}: <span className="font-mono">{draft.base}</span>
        </div>
      ) : (
        <label className="block">
          <span className="text-[10px] text-zinc-500">{t('stat_editor.base')}</span>
          <InlineInput
            type="number"
            value={draft.base}
            onChange={(val) => commit({ base: parseFloat(val) || 0 })}
            maxValue={column.max_value}
            className="mt-0.5 w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
          />
        </label>
      )}
      {readonly ? (
        <div className="text-[10px] text-zinc-600 italic">
          {t('stat_editor.readonly_hint', { defaultValue: 'Read-only stat' })}
        </div>
      ) : (
        <div className="border-t border-zinc-800 pt-2">
          <div className="text-[10px] text-zinc-500 mb-1">{t('stat_editor.overrides')}</div>
          <div className="space-y-1 mb-2">
            {overrides.length === 0 && (
              <div className="text-[10px] text-zinc-600 italic">{t('stat_editor.overrides_none')}</div>
            )}
            {overrides.map((o, i) => (
              <div key={`${o.source}-${i}`} className="flex items-center gap-1 text-xs">
                <span className="flex-1 truncate text-zinc-300">{o.source}</span>
                <span className="font-mono text-zinc-400">{o.value}</span>
                <button type="button" className="px-1 text-red-400 hover:text-red-300" onClick={() => removeOverride(i)}>
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-1">
            <input
              type="text"
              placeholder={t('stat_editor.source_placeholder')}
              className="flex-1 min-w-0 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-xs"
              value={newSource}
              onChange={(e) => setNewSource(e.target.value)}
            />
            <input
              type="number"
              placeholder={t('stat_editor.value_modifier_placeholder')}
              className="w-14 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-xs"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
            />
            <button type="button" className="rounded bg-zinc-700 px-2 py-1 text-xs hover:bg-zinc-600" onClick={addOverride}>
              {t('common.add')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Internal form content for the mini-sheet. Used by MiniSheetModal; future systems can render DnD5eSheet, etc. */
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
  const emptyDash = t('common.empty_dash');
  const { state } = useCombatState();
  const { systemLayoutProfiles } = useCombat();
  const portraitCacheVersion = usePortraitCacheVersion();
  const colName = (col: ColumnConfig) =>
    i18n.t(`${col.key}.name`, { ns: `systems/${systemName}` }) || col.label || col.key;
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [expertMode, setExpertMode] = useState(false);
  const [devices, setDevices] = useState<Record<string, DeviceInfo>>({});

  const portraitSrc = React.useMemo(() => {
    const url = actor.portrait ?? '';
    if (!url) return '';
    // Only bust cache for local-served assets (external URLs shouldn't be mutated).
    const isLocal = url.startsWith('/assets/') || url.startsWith('/api/assets/');
    const buster = `${portraitCacheVersion}-${actor.id}-${actor.name}-${url}`;
    return isLocal ? withCacheBuster(url, buster) : url;
  }, [actor.id, actor.name, actor.portrait, portraitCacheVersion]);

  const actors = state?.core.actors ?? [];
  const activeGroups = React.useMemo(() => {
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
    reader.onload = async (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string);
        const { id, ...updates } = imported;
        if (onUpdate) {
          await fetch(`/api/actors/${actor.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
          });
        }
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

  return (
    <div className="p-6 space-y-6 transition-opacity duration-150">
      <div className="flex justify-end mb-4">
        <label className="flex items-center cursor-pointer gap-3">
          <span className="text-sm font-medium text-zinc-400">{t('modals.tab_expert')}</span>
          <button
            type="button"
            role="switch"
            aria-checked={expertMode}
            onClick={() => setExpertMode((v) => !v)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-zinc-900 ${
              expertMode ? 'bg-emerald-500' : 'bg-zinc-700'
            }`}
            title={t('modals.tab_expert')}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                expertMode ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </label>
      </div>

      {!expertMode ? (
        <div className="space-y-6">
          <div className="text-sm text-zinc-400">
            {t('combat.initiative')}: <span className="text-zinc-200 font-medium">{actor.initiative}</span>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-row gap-4">
            <div className="flex-shrink-0">
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
                    <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity">
                      <span className="text-xs font-medium text-white px-2 py-1 rounded bg-zinc-800/90">
                        {t('common.edit')}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-500">
                    <Plus size={28} strokeWidth={1.5} />
                  </div>
                )}
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-3 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm text-zinc-400 shrink-0">{t('modals.role')}:</span>
                <select
                  value={actor.role}
                  onChange={(e) => onUpdate?.(actor.id, 'role', e.target.value as Actor['role'])}
                  className="flex-1 min-w-0 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20"
                >
                  <option value="character">{t('modals.role_character')}</option>
                  <option value="enemy">{t('modals.role_enemy')}</option>
                  <option value="ally">{t('modals.role_ally')}</option>
                  <option value="neutral">{t('modals.role_neutral')}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-zinc-500 mb-1">{t('modals.group')}</label>
                <select
                  value={actor.group_id ?? ''}
                  onChange={(e) => handleGroupChange(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="">{t('modals.no_group')}</option>
                  {activeGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name || g.id}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-zinc-500 mb-1">{t('actor.layout_profile')}</label>
                <select
                  value={actor.layout_profile_id ?? ''}
                  onChange={(e) => onUpdate?.(actor.id, 'layout_profile_id', e.target.value || null)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="">{t('actor.layout_profile_default')}</option>
                  {systemLayoutProfiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="text-sm text-zinc-400">
                {t('combat.initiative')}: <span className="text-zinc-200">{actor.initiative}</span>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={actor.show_portrait ?? false}
                  onChange={(e) => onUpdate?.(actor.id, 'show_portrait', e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-600 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 focus:ring-2"
                />
                <span className="text-sm text-zinc-400">
                  {t('modals.show_portrait_on_tracker')}
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={actor.is_pinned ?? false}
                  onChange={(e) => onUpdate?.(actor.id, 'is_pinned', e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-600 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 focus:ring-2"
                />
                <span className="text-sm text-zinc-400">
                  {t('modals.pin_remember_actor')}
                </span>
              </label>

              <div>
                <label className="block text-xs text-zinc-500 mb-1">
                  {t('modals.bind_miniature')}
                </label>
                <div className="flex gap-2">
                  <select
                    value={actor.miniature_id ?? ''}
                    onChange={(e) => {
                      const mac = e.target.value || null;
                      onUpdate?.(actor.id, 'miniature_id', mac);
                    }}
                    className="flex-1 min-w-0 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">{t('modals.select_miniature')}</option>
                    {Object.entries(devices).length === 0 ? (
                      <option value="" disabled>{t('modals.no_miniatures_found')}</option>
                    ) : (
                      (Object.entries(devices) as [string, DeviceInfo][]).map(([mac, info]) => (
                        <option key={mac} value={mac}>
                          {info.name || mac} — {info.status === 'online' ? t('hardware.status_online') : t('hardware.status_offline')}
                        </option>
                      ))
                    )}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      const mac = actor.miniature_id;
                      if (!mac) return;
                      fetch(`/api/render/${actor.id}?mac=${encodeURIComponent(mac)}&t=${Date.now()}`).catch(console.error);
                    }}
                    disabled={!actor.miniature_id}
                    title={t('modals.refresh_miniature_screen')}
                    className="shrink-0 p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <RefreshCcw size={18} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {actor.group_id && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-zinc-500 uppercase tracking-wider">
                {t('modals.group_options')}
              </h4>
              <div className="flex flex-wrap gap-4">
                <div className="min-w-[8rem]">
                  <label className="block text-xs text-zinc-500 mb-1">{t('modals.group_mode')}</label>
                  <select
                    value={actor.group_mode ?? 'sequential'}
                    onChange={(e) =>
                      onUpdate?.(actor.id, 'group_mode', e.target.value === 'none' ? null : e.target.value)
                    }
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="simultaneous">{t('modals.simultaneous')}</option>
                    <option value="sequential">{t('modals.sequential')}</option>
                    <option value="none">{t('modals.none')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">{t('modals.group_color')}</label>
                  <input
                    type="color"
                    value={actor.group_color ?? '#10b981'}
                    onChange={(e) => onUpdate?.(actor.id, 'group_color', e.target.value)}
                    className="w-10 h-8 rounded bg-zinc-800 border border-zinc-700 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {columns.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-zinc-500 uppercase tracking-wider mb-3">
            {t('modals.stats')}
          </h4>
          <div className="grid grid-cols-2 gap-3">
            {columns.map((col) => {
              const maxKey = getMaxKey(col);
              const hasMaxKey = !!maxKey;
              const showAsFraction = (col.display_as_fraction ?? false) && hasMaxKey;
              const maxRaw = maxKey != null ? actor.stats[maxKey] : undefined;
              const maxVal = maxKey != null ? getStatNumeric(maxRaw, NaN) : NaN;
              const maxColumn = columns.find((c) => c.key === maxKey) ?? {
                ...col,
                key: maxKey ?? '',
                label: maxKey ?? '',
                max_value: undefined,
                display_as_fraction: false,
              };

              if (showAsFraction) {
                return (
                  <div key={col.key} className="space-y-2">
                    <StatValueEditor actor={actor} column={col} label={colName(col)} onUpdate={onUpdate} />
                    <div className="text-xs text-zinc-500 px-1">
                      {t('modals.max')}: {maxRaw != null && Number.isFinite(maxVal) ? String(maxVal) : emptyDash}
                    </div>
                  </div>
                );
              }

              if (hasMaxKey) {
                return (
                  <div key={col.key} className="space-y-2">
                    <StatValueEditor actor={actor} column={col} label={colName(col)} onUpdate={onUpdate} />
                    {maxKey && (
                      <StatValueEditor
                        actor={actor}
                        column={maxColumn as ColumnConfig}
                        label={colName(maxColumn as ColumnConfig)}
                        onUpdate={onUpdate}
                      />
                    )}
                  </div>
                );
              }

              return (
                <StatValueEditor key={col.key} actor={actor} column={col} label={colName(col)} onUpdate={onUpdate} />
              );
            })}
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-4 border-t border-zinc-800">
        <button
          onClick={handleExport}
          className="flex-1 flex items-center justify-center gap-2 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs transition-colors"
        >
          <Download size={14} /> {t('config_modal.export')}
        </button>
        <input type="file" ref={fileInputRef} onChange={handleImport} className="hidden" accept=".json" />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 flex items-center justify-center gap-2 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs transition-colors"
        >
          <Upload size={14} /> {t('config_modal.import')}
        </button>
        <button
          onClick={handleSaveToRoster}
          className="flex-1 flex items-center justify-center gap-2 py-2 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 rounded-lg text-xs transition-colors"
        >
          <Save size={14} /> {t('common.save')}
        </button>
      </div>
    </div>
  );
}
