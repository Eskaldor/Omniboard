import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, Copy, Plus, RefreshCcw } from 'lucide-react';
import type { Actor, ColumnConfig } from '../../types';
import { useCombatState } from '../../contexts/CombatStateContext';
import { useCombat } from '../../contexts/CombatContext';
import { usePortraitCacheVersion } from '../../utils/portraitCache';

function withCacheBuster(url: string, buster: string | number): string {
  if (!url) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}v=${encodeURIComponent(String(buster))}`;
}

export function ExpertActorEditor({
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

  const [copied, setCopied] = useState(false);

  const json = useMemo(() => JSON.stringify(actor, null, 2), [actor]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  const { state } = useCombatState();
  const { systemLayoutProfiles } = useCombat();
  const [devices, setDevices] = useState<Record<string, { name?: string; ip?: string; status?: string }>>({});
  const portraitCacheVersion = usePortraitCacheVersion();

  const portraitSrc = React.useMemo(() => {
    const url = actor.portrait ?? '';
    if (!url) return '';
    // Only bust cache for local-served assets; external URLs shouldn't be mutated.
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
            ? (data as Record<string, { name?: string; ip?: string; status?: string }>)
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

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-start gap-4">
        <button
          type="button"
          onClick={() => onOpenPortraitPicker?.()}
          className="relative shrink-0 rounded-xl overflow-hidden w-20 bg-zinc-800 border border-zinc-700 hover:border-emerald-500 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-zinc-900 aspect-[9/16]"
        >
          {actor.portrait ? (
            <img
              src={portraitSrc}
              alt={actor.name}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-500">
              <Plus size={22} strokeWidth={1.5} />
            </div>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="text-sm font-medium text-zinc-200 truncate min-w-0">{actor.name}</div>
            <button
              type="button"
              onClick={copy}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
              title="JSON"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? t('common.save') : 'JSON'}
            </button>
          </div>
          <div className="text-xs text-zinc-500">
            {t('combat.initiative')}: <span className="text-zinc-300 tabular-nums">{actor.initiative}</span>
          </div>
          <div className="mt-2 text-[10px] text-zinc-600">
            {t('modals.all_stats')}: <span className="font-mono">{columns.length}</span> · {t('config_modal.system')}:{' '}
            <span className="font-mono">{systemName}</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <AlertTriangle size={16} className="shrink-0 text-amber-300 mt-0.5" />
          <div className="text-sm text-amber-200">{t('modals.expert_warning')}</div>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">{t('modals.role')}</label>
            <select
              value={actor.role}
              onChange={(e) => onUpdate?.(actor.id, 'role', e.target.value as Actor['role'])}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20"
            >
              <option value="character">{t('modals.role_character')}</option>
              <option value="enemy">{t('modals.role_enemy')}</option>
              <option value="ally">{t('modals.role_ally')}</option>
              <option value="neutral">{t('modals.role_neutral')}</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1">{t('actor.layout_profile')}</label>
            <select
              value={actor.layout_profile_id ?? ''}
              onChange={(e) => onUpdate?.(actor.id, 'layout_profile_id', e.target.value || null)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="">{t('actor.layout_profile_default')}</option>
              {systemLayoutProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-xs text-zinc-500 mb-1">{t('modals.group')}</label>
            <select
              value={actor.group_id ?? ''}
              onChange={(e) => handleGroupChange(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="">{t('modals.no_group')}</option>
              {activeGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name || g.id}
                </option>
              ))}
            </select>
          </div>

          {actor.group_id ? (
            <>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">{t('modals.group_mode')}</label>
                <select
                  value={actor.group_mode ?? 'sequential'}
                  onChange={(e) =>
                    onUpdate?.(actor.id, 'group_mode', e.target.value === 'none' ? null : e.target.value)
                  }
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="simultaneous">{t('modals.simultaneous')}</option>
                  <option value="sequential">{t('modals.sequential')}</option>
                  <option value="none">{t('modals.none')}</option>
                </select>
              </div>
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-zinc-500 mb-1">{t('modals.group_color')}</div>
                  <div className="text-[11px] text-zinc-400 truncate">
                    {actor.group_name || actor.group_id}
                  </div>
                </div>
                <input
                  type="color"
                  value={actor.group_color ?? '#10b981'}
                  onChange={(e) => onUpdate?.(actor.id, 'group_color', e.target.value)}
                  className="w-10 h-9 rounded bg-zinc-800 border border-zinc-700 cursor-pointer"
                />
              </div>
            </>
          ) : null}
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1">{t('modals.bind_miniature')}</label>
          <div className="flex gap-2">
            <select
              value={actor.miniature_id ?? ''}
              onChange={(e) => {
                const mac = e.target.value || null;
                onUpdate?.(actor.id, 'miniature_id', mac);
              }}
              className="flex-1 min-w-0 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="">{t('modals.select_miniature')}</option>
              {Object.entries(devices).length === 0 ? (
                <option value="" disabled>
                  {t('modals.no_miniatures_found')}
                </option>
              ) : (
                (Object.entries(devices) as [string, { name?: string; ip?: string; status?: string }][]).map(
                  ([mac, info]) => (
                    <option key={mac} value={mac}>
                      {info.name || mac} —{' '}
                      {info.status === 'online' ? t('hardware.status_online') : t('hardware.status_offline')}
                    </option>
                  ),
                )
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
        <pre className="p-3 text-[11px] leading-relaxed font-mono text-zinc-300 overflow-x-auto max-h-[55vh] [scrollbar-width:thin]">
          {json}
        </pre>
      </div>
    </div>
  );
}
