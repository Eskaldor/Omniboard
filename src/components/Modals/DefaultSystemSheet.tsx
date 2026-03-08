import React, { useState, useEffect } from 'react';
import { Save, Download, Upload, Plus, RefreshCcw } from 'lucide-react';
import { Actor, ColumnConfig } from '../../types';
import { useCombatState } from '../../contexts/CombatStateContext';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { getMaxKey, buildStatUpdate } from '../../utils/stats';
import { InlineInput } from '../InitiativeTracker/InlineInput';

type DeviceInfo = { name?: string; ip?: string; status?: string };

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
  const { state } = useCombatState();
  const colName = (col: ColumnConfig) =>
    i18n.t(`${col.key}.name`, { ns: `systems/${systemName}`, defaultValue: col.key });
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [expertMode, setExpertMode] = useState(false);
  const [devices, setDevices] = useState<Record<string, DeviceInfo>>({});

  const actors = state?.actors ?? [];
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
      .then((data) => setDevices(typeof data === 'object' && data !== null ? data : {}))
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
        alert('Invalid JSON file');
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
      <div className="flex items-center justify-center">
        <div className="inline-flex rounded-full bg-zinc-800 p-0.5 border border-zinc-700/50">
          <button
            type="button"
            onClick={() => setExpertMode(false)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              !expertMode ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {t('modals.simple_mode', { defaultValue: 'Simple' })}
          </button>
          <button
            type="button"
            onClick={() => setExpertMode(true)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              expertMode ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {t('modals.expert_mode', { defaultValue: 'Expert' })}
          </button>
        </div>
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
                      src={actor.portrait}
                      alt={actor.name}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity">
                      <span className="text-xs font-medium text-white px-2 py-1 rounded bg-zinc-800/90">
                        {t('modals.edit', { defaultValue: 'Edit' })}
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
                  <option value="character">{t('modals.role_character', { defaultValue: 'Character' })}</option>
                  <option value="enemy">{t('modals.role_enemy', { defaultValue: 'Enemy' })}</option>
                  <option value="ally">{t('modals.role_ally', { defaultValue: 'Ally' })}</option>
                  <option value="neutral">{t('modals.role_neutral', { defaultValue: 'Neutral' })}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-zinc-500 mb-1">{t('modals.group')}</label>
                <select
                  value={actor.group_id ?? ''}
                  onChange={(e) => handleGroupChange(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="">{t('modals.no_group', { defaultValue: 'No Group' })}</option>
                  {activeGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name || g.id}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-zinc-500 mb-1">{t('actor.layout_profile', { defaultValue: 'Display profile (ESP32)' })}</label>
                <select
                  value={actor.layout_profile_id ?? ''}
                  onChange={(e) => onUpdate?.(actor.id, 'layout_profile_id', e.target.value || null)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="">{t('actor.layout_profile_default', { defaultValue: 'Default' })}</option>
                  {state?.layout_profiles?.map((p) => (
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
                  {t('modals.show_portrait_on_tracker', { defaultValue: 'Show Portrait on Tracker' })}
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
                  {t('modals.pin_remember_actor', { defaultValue: 'Pin / Remember Actor' })}
                </span>
              </label>

              <div>
                <label className="block text-xs text-zinc-500 mb-1">
                  {t('modals.bind_miniature', { defaultValue: 'Bind Miniature (MAC/ID)' })}
                </label>
                <div className="flex gap-2">
                  <select
                    value={actor.miniature_id ?? ''}
                    onChange={(e) => {
                      const mac = e.target.value || null;
                      onUpdate?.(actor.id, 'miniature_id', mac);
                      fetch(`/api/actors/${actor.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ miniature_id: mac }),
                      }).catch(console.error);
                    }}
                    className="flex-1 min-w-0 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">{t('modals.select_miniature')}</option>
                    {Object.entries(devices).length === 0 ? (
                      <option value="" disabled>{t('modals.no_miniatures_found')}</option>
                    ) : (
                      Object.entries(devices).map(([mac, info]) => (
                        <option key={mac} value={mac}>
                          {info.name || mac} — {info.status === 'online' ? t('hardware.status_online', { defaultValue: 'Online' }) : t('hardware.status_offline', { defaultValue: 'Offline' })}
                        </option>
                      ))
                    )}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      const mac = actor.miniature_id;
                      if (!mac) return;
                      fetch(`/api/render/${actor.id}?mac=${encodeURIComponent(mac)}`).catch(console.error);
                    }}
                    disabled={!actor.miniature_id}
                    title={t('modals.refresh_miniature_screen', { defaultValue: 'Update screen on miniature' })}
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
                {t('modals.group_options', { defaultValue: 'Group options' })}
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
            {t('modals.stats', { defaultValue: 'Stats' })}
          </h4>
          <div className="grid grid-cols-2 gap-3">
            {columns.map((col) => {
              const maxKey = getMaxKey(col);
              const hasMaxKey = !!maxKey;
              const showAsFraction = (col.display_as_fraction ?? false) && hasMaxKey;
              const baseVal = actor.stats[col.key] ?? 0;
              const maxVal = maxKey != null ? actor.stats[maxKey] : undefined;

              if (showAsFraction) {
                return (
                  <div key={col.key} className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                    <label className="block text-xs text-zinc-500 mb-1.5">{colName(col)}</label>
                    <div className="flex items-center gap-2 flex-wrap">
                      <InlineInput
                        type="number"
                        value={baseVal}
                        onChange={(val) =>
                          onUpdate?.(actor.id, 'stats', buildStatUpdate(actor, col, col.key, parseInt(val) || 0) as Record<string, unknown>)
                        }
                        maxValue={typeof maxVal === 'number' ? maxVal : (col.max_value ?? undefined)}
                        className="w-14 bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                      />
                      <span className="text-zinc-500">/</span>
                      <span className="min-w-[2rem] text-sm text-zinc-400 tabular-nums">
                        {maxVal != null ? String(maxVal) : '—'}
                      </span>
                    </div>
                  </div>
                );
              }

              if (hasMaxKey) {
                return (
                  <div key={col.key} className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 space-y-2">
                    <label className="block text-xs text-zinc-500">{colName(col)}</label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <span className="text-[10px] text-zinc-500 block mb-0.5">
                          {t('modals.current', { defaultValue: 'Current' })}
                        </span>
                        <InlineInput
                          type="number"
                          value={baseVal}
                          onChange={(val) =>
                            onUpdate?.(actor.id, 'stats', buildStatUpdate(actor, col, col.key, parseInt(val) || 0) as Record<string, unknown>)
                          }
                          maxValue={typeof maxVal === 'number' ? maxVal : col.max_value}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div className="flex-1">
                        <span className="text-[10px] text-zinc-500 block mb-0.5">
                          {t('modals.max', { defaultValue: 'Max' })}
                        </span>
                        <InlineInput
                          type="number"
                          value={maxVal ?? ''}
                          onChange={(val) =>
                            onUpdate?.(actor.id, 'stats', { ...actor.stats, [maxKey!]: parseInt(val) || 0 })
                          }
                          className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div key={col.key} className="bg-zinc-950 p-3 rounded-lg border border-zinc-800">
                  <label className="block text-xs text-zinc-500 mb-1.5">{colName(col)}</label>
                  <InlineInput
                    type="number"
                    value={baseVal}
                    onChange={(val) =>
                      onUpdate?.(actor.id, 'stats', buildStatUpdate(actor, col, col.key, parseInt(val) || 0) as Record<string, unknown>)
                    }
                    maxValue={col.max_value}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>
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
