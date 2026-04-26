import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { X, Search, RefreshCw, Zap, Loader2, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LedProfile, Miniature } from '../../types';
import { useCombatState } from '../../contexts/CombatStateContext';

export function HardwareModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('core', { useSuspense: false });
  const [loading, setLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [rowLoading, setRowLoading] = useState<Record<string, string | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [ledProfiles, setLedProfiles] = useState<LedProfile[]>([]);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { state, refetchState } = useCombatState();
  const actors = state?.core.actors ?? [];
  const turnQueue = state?.core.turn_queue ?? [];
  const currentIndex = state?.core.current_index ?? 0;
  const systemName = state?.core.system ?? '';
  const miniatures = state?.hardware.miniatures ?? [];

  const actorByMiniatureId = useMemo(() => {
    const map = new Map<string, string>();
    for (const actor of actors) {
      const miniId = (actor.miniature_id ?? '').trim();
      if (miniId) map.set(miniId, actor.id);
    }
    return map;
  }, [actors]);

  const actorsById = useMemo(() => {
    const map = new Map<string, string>();
    for (const actor of actors) map.set(actor.id, actor.name);
    return map;
  }, [actors]);

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    try {
      await refetchState();
      setError(null);
    } catch (err) {
      console.error('Failed to fetch devices', err);
      setError('Не удалось обновить список устройств');
    } finally {
      setLoading(false);
    }
  }, [refetchState]);

  useEffect(() => {
    void fetchDevices();
  }, [fetchDevices]);

  useEffect(() => {
    if (!systemName) {
      setLedProfiles([]);
      return;
    }
    fetch(`/api/systems/${encodeURIComponent(systemName)}/led_profiles`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: LedProfile[]) => setLedProfiles(Array.isArray(data) ? data : []))
      .catch((err) => {
        console.error('Failed to fetch LED profiles', err);
        setLedProfiles([]);
      });
  }, [systemName]);

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  const handleDiscover = async () => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    setIsSearching(true);
    try {
      await fetch('/api/hardware/discover', { method: 'POST' });
      await refetchState();
      setError(null);
    } catch (err) {
      console.error('Discover failed', err);
      setError('Поиск устройств не удался');
    } finally {
      setIsSearching(false);
    }
  };

  const withRowLoading = async (mac: string, label: string, fn: () => Promise<void>) => {
    setRowLoading((prev) => ({ ...prev, [mac]: label }));
    try {
      await fn();
      setError(null);
    } catch (err) {
      console.error(label, err);
      setError('Не удалось выполнить действие с устройством');
    } finally {
      setRowLoading((prev) => ({ ...prev, [mac]: undefined }));
    }
  };

  const patchMiniature = async (mini: Miniature, patch: Partial<Miniature>) => {
    const mac = mini.mac || mini.id;
    const res = await fetch(`/api/hardware/miniatures/${encodeURIComponent(mac)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(`Failed to patch miniature ${mac}`);
  };

  const patchActorMiniature = async (actorId: string, miniatureId: string | null) => {
    const res = await fetch(`/api/actors/${encodeURIComponent(actorId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ miniature_id: miniatureId }),
    });
    if (!res.ok) throw new Error(`Failed to patch actor ${actorId}`);
  };

  const clearCurrentActorBindings = (miniId: string, exceptActorId?: string) => {
    return actors
      .filter((actor) => actor.miniature_id === miniId && actor.id !== exceptActorId)
      .map((actor) => patchActorMiniature(actor.id, null));
  };

  const handleModeChange = (mini: Miniature, mode: 'actor' | 'slot') => {
    const mac = mini.mac || mini.id;
    void withRowLoading(mac, 'saving', async () => {
      if (mode === 'slot') {
        await Promise.all([
          patchMiniature(mini, { binding_mode: 'slot', slot_index: mini.slot_index ?? 0 }),
          ...clearCurrentActorBindings(mini.id),
        ]);
      } else {
        await patchMiniature(mini, { binding_mode: 'actor', slot_index: 0 });
      }
      await refetchState();
    });
  };

  const handleActorChange = (mini: Miniature, actorId: string) => {
    const mac = mini.mac || mini.id;
    void withRowLoading(mac, 'saving', async () => {
      await patchMiniature(mini, { binding_mode: 'actor', slot_index: 0 });
      await Promise.all([
        ...clearCurrentActorBindings(mini.id, actorId || undefined),
        actorId ? patchActorMiniature(actorId, mini.id) : Promise.resolve(),
      ]);
      await refetchState();
    });
  };

  const handleSlotChange = (mini: Miniature, queuePosition: number) => {
    const mac = mini.mac || mini.id;
    const nextSlot = Math.max(0, Math.min(10, queuePosition - 1));
    void withRowLoading(mac, 'saving', async () => {
      await Promise.all([
        patchMiniature(mini, { binding_mode: 'slot', slot_index: nextSlot }),
        ...clearCurrentActorBindings(mini.id),
      ]);
      await refetchState();
    });
  };

  const handleSlotLedModeChange = (mini: Miniature, slotLedMode: 'actor' | 'custom') => {
    const mac = mini.mac || mini.id;
    const fallbackProfileId = ledProfiles[0]?.id ?? null;
    void withRowLoading(mac, 'saving', async () => {
      await patchMiniature(mini, {
        slot_led_mode: slotLedMode,
        slot_led_profile_id:
          slotLedMode === 'custom'
            ? mini.slot_led_profile_id || fallbackProfileId
            : null,
      });
      await refetchState();
    });
  };

  const handleSlotLedProfileChange = (mini: Miniature, profileId: string) => {
    const mac = mini.mac || mini.id;
    void withRowLoading(mac, 'saving', async () => {
      await patchMiniature(mini, {
        slot_led_mode: 'custom',
        slot_led_profile_id: profileId || null,
      });
      await refetchState();
    });
  };

  const handleBlinkLed = (mini: Miniature) => {
    const mac = mini.mac || mini.id;
    void withRowLoading(mac, 'blink', async () => {
      const res = await fetch(`/api/hardware/${encodeURIComponent(mac)}/blink`, { method: 'POST' });
      if (!res.ok) throw new Error(`Blink failed: ${res.status}`);
    });
  };

  const handleForget = (mini: Miniature) => {
    const mac = mini.mac || mini.id;
    void withRowLoading(mac, 'delete', async () => {
      await Promise.all(clearCurrentActorBindings(mini.id));
      const res = await fetch(`/api/hardware/miniatures/${encodeURIComponent(mac)}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) throw new Error(`Forget failed: ${res.status}`);
      await refetchState();
    });
  };

  const getSlotActorName = (slotIndex: number) => {
    if (turnQueue.length === 0) return 'очередь пуста';
    const safeCurrent = ((currentIndex % turnQueue.length) + turnQueue.length) % turnQueue.length;
    const targetIndex = (safeCurrent + slotIndex) % turnQueue.length;
    return actorsById.get(turnQueue[targetIndex]) ?? 'актор не найден';
  };

  const statusDotClass = (status?: string) => {
    if ((status ?? '').toLowerCase() === 'online') return 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]';
    return 'bg-zinc-600';
  };

  const controlClass =
    'w-full bg-zinc-950 border border-zinc-700 rounded-md px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500 disabled:opacity-60';

  const sortedMiniatures = [...miniatures].sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));

  const renderAssignment = (mini: Miniature) => {
    const mode = mini.binding_mode ?? 'actor';
    const boundActorId = actorByMiniatureId.get(mini.id) ?? '';
    const pending = rowLoading[mini.mac || mini.id];
    const queuePosition = (mini.slot_index ?? 0) + 1;
    if (mode === 'slot') {
      const slotLedMode = mini.slot_led_mode ?? 'actor';
      return (
        <div className="space-y-1">
          <input
            type="number"
            min={1}
            max={11}
            value={queuePosition}
            disabled={Boolean(pending)}
            onChange={(e) => handleSlotChange(mini, Number(e.target.value) || 1)}
            className={controlClass}
          />
          <div className="text-[11px] text-zinc-500">
            1 = текущий ход. Там сейчас: {getSlotActorName(mini.slot_index ?? 0)}
          </div>
          <select
            value={slotLedMode}
            disabled={Boolean(pending)}
            onChange={(e) => handleSlotLedModeChange(mini, e.target.value as 'actor' | 'custom')}
            className={controlClass}
          >
            <option value="actor">Подсветка: как у персонажа</option>
            <option value="custom">Подсветка: своя для слота</option>
          </select>
          {slotLedMode === 'custom' && (
            <select
              value={mini.slot_led_profile_id ?? ledProfiles[0]?.id ?? ''}
              disabled={Boolean(pending) || ledProfiles.length === 0}
              onChange={(e) => handleSlotLedProfileChange(mini, e.target.value)}
              className={controlClass}
            >
              {ledProfiles.length === 0 ? (
                <option value="">LED-профили не найдены</option>
              ) : (
                ledProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name || profile.id}
                  </option>
                ))
              )}
            </select>
          )}
        </div>
      );
    }
    return (
      <select
        value={boundActorId}
        disabled={Boolean(pending)}
        onChange={(e) => handleActorChange(mini, e.target.value)}
        className={controlClass}
      >
        <option value="">Не назначено</option>
        {actors.map((actor) => (
          <option key={actor.id} value={actor.id}>
            {actor.name}
          </option>
        ))}
      </select>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50 shrink-0">
          <h3 className="text-lg font-medium text-zinc-100">{t('header.device_manager')}</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchDevices}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-zinc-200 rounded-lg text-sm transition-colors"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              {t('hardware.refresh')}
            </button>
            <button
              type="button"
              onClick={handleDiscover}
              disabled={isSearching}
              className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm transition-colors"
            >
              {isSearching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              {t('hardware.discover')}
            </button>
            <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100 p-1">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1 min-h-0">
          {error && (
            <div className="mb-3 rounded-lg border border-red-500/40 bg-red-950/30 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}
          {loading && sortedMiniatures.length === 0 ? (
            <p className="text-zinc-500 text-sm">{t('hardware.loading')}</p>
          ) : sortedMiniatures.length === 0 ? (
            <p className="text-zinc-500 text-sm">{t('hardware.no_devices')}</p>
          ) : (
            <div className="border border-zinc-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm table-fixed">
                <thead>
                  <tr className="bg-zinc-950/90 text-zinc-500 text-left text-xs uppercase tracking-wide">
                    <th className="px-3 py-2 font-medium w-[34%]">Устройство</th>
                    <th className="px-3 py-2 font-medium w-[18%]">Режим</th>
                    <th className="px-3 py-2 font-medium w-[34%]">Назначение</th>
                    <th className="px-3 py-2 font-medium text-right w-[14%]">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMiniatures.map((mini) => {
                    const mac = mini.mac || mini.id;
                    const pending = rowLoading[mac];
                    return (
                    <tr key={mini.id} className="border-t border-zinc-800 hover:bg-zinc-800/40">
                      <td className="px-3 py-2 align-top">
                        <div className="flex items-start gap-2 min-w-0">
                          <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${statusDotClass(mini.status)}`} />
                          <div className="min-w-0">
                            <div className="text-zinc-200 text-sm truncate">{mini.name || mini.id}</div>
                            <div className="text-zinc-500 font-mono text-[11px] truncate">{mac}</div>
                            <div className="text-zinc-600 text-[11px] truncate">
                              {(mini.status ?? 'offline').toUpperCase()}{mini.ip ? ` · ${mini.ip}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <select
                          value={mini.binding_mode ?? 'actor'}
                          disabled={Boolean(pending)}
                          onChange={(e) => handleModeChange(mini, e.target.value as 'actor' | 'slot')}
                          className={controlClass}
                        >
                          <option value="actor">Персонаж</option>
                          <option value="slot">Слот очереди</option>
                        </select>
                      </td>
                      <td className="px-3 py-2 align-top">{renderAssignment(mini)}</td>
                      <td className="px-3 py-2 align-top text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {pending === 'saving' && <Loader2 size={15} className="animate-spin text-emerald-400" />}
                          <button
                            type="button"
                            onClick={() => handleBlinkLed(mini)}
                            disabled={Boolean(pending)}
                            title="Мигнуть"
                            className="p-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 rounded-md transition-colors"
                          >
                            {pending === 'blink' ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleForget(mini)}
                            disabled={Boolean(pending)}
                            title="Забыть"
                            className="p-2 bg-zinc-800 hover:bg-red-600/80 disabled:opacity-50 text-zinc-200 rounded-md transition-colors"
                          >
                            {pending === 'delete' ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
