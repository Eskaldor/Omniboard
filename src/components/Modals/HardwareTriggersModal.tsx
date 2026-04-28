import React, { useCallback, useContext, useEffect, useState } from 'react';
import { X, Trash2, Loader2, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { ColumnsContext } from '../../contexts/ColumnsContext';
import { useCombatState } from '../../contexts/CombatStateContext';
import type { ColumnConfig, HardwareTrigger, LedProfile } from '../../types';

/** Value stored in HardwareTrigger.target_stat (API column id if set, else key). */
function columnStatId(col: ColumnConfig): string {
  const ext = col as ColumnConfig & { id?: string };
  return (ext.id && String(ext.id).trim()) || col.key;
}

function localizedStatName(systemName: string, col: ColumnConfig): string {
  const ns = `systems/${systemName}`;
  return i18n.t(`${col.key}.name`, { ns }) || col.label || col.key;
}

function localizedStatNameById(systemName: string, statId: string): string {
  const ns = `systems/${systemName}`;
  return i18n.t(`${statId}.name`, { ns }) || statId;
}

function newRuleId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `rule-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const SCREEN_TRANSITION_OPTIONS = [
  { value: 'none', label: 'Без эффекта' },
  { value: 'flash', label: 'Вспышка' },
  { value: 'wipe_down', label: 'Сдвиг вниз' },
  { value: 'wipe_right', label: 'Сдвиг вправо' },
  { value: 'shimmer', label: 'Мерцание' },
  { value: 'dissolve', label: 'Растворение / Fade' },
  { value: 'pixelate', label: 'Пикселизация' },
  { value: 'matrix', label: 'Матрица' },
] as const;

function normalizeTransition(value: unknown): HardwareTrigger['transition'] {
  return typeof value === 'string' && value && value !== 'none' ? value : null;
}

function createEmptyRule(profiles: LedProfile[]): HardwareTrigger {
  const firstId = profiles[0]?.id ?? 'default_static';
  return {
    id: newRuleId(),
    event_type: 'turn_start',
    target_stat: null,
    led_profile_id: firstId,
    transition: null,
    transition_color: '#ffffff',
    duration_type: 'time',
    duration_ms: 1000,
  };
}

function normalizeLoadedRule(raw: unknown, profiles: LedProfile[]): HardwareTrigger {
  const firstId = profiles[0]?.id ?? 'default_static';
  if (!raw || typeof raw !== 'object') {
    return createEmptyRule(profiles);
  }
  const o = raw as Record<string, unknown>;
  const eventType =
    o.event_type === 'stat_change' || o.event_type === 'miniature_bind'
      ? o.event_type
      : 'turn_start';
  const durationType = o.duration_type === 'turn' ? 'turn' : 'time';
  const ledId = typeof o.led_profile_id === 'string' && o.led_profile_id ? o.led_profile_id : firstId;
  const durationMs =
    typeof o.duration_ms === 'number' && !Number.isNaN(o.duration_ms) ? o.duration_ms : 1000;
  return {
    id: typeof o.id === 'string' && o.id ? o.id : newRuleId(),
    event_type: eventType,
    target_stat: typeof o.target_stat === 'string' ? o.target_stat : null,
    led_profile_id: ledId,
    transition: normalizeTransition(o.transition ?? o.animation),
    transition_color: typeof o.transition_color === 'string' && o.transition_color ? o.transition_color : '#ffffff',
    duration_type: durationType,
    duration_ms: durationMs,
  };
}

export function HardwareTriggersModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useTranslation('core', { useSuspense: false });
  const columnsCtx = useContext(ColumnsContext);
  const { state } = useCombatState();
  const columns = columnsCtx?.columns ?? [];
  const system = (state?.core.system ?? '').trim();
  const systemNameForI18n = system || 'D&D 5e';

  const [profiles, setProfiles] = useState<LedProfile[]>([]);
  const [rules, setRules] = useState<HardwareTrigger[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!system) {
      setProfiles([]);
      setRules([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [resTriggers, resProfiles] = await Promise.all([
        fetch(`/api/systems/${encodeURIComponent(system)}/led_triggers`),
        fetch(`/api/systems/${encodeURIComponent(system)}/led_profiles`),
      ]);
      if (!resProfiles.ok) throw new Error('profiles');
      const profData: LedProfile[] = await resProfiles.json();
      const list = Array.isArray(profData) ? profData : [];
      setProfiles(list);

      let rawRules: unknown[] = [];
      if (resTriggers.ok) {
        const trigData: unknown = await resTriggers.json();
        rawRules = Array.isArray(trigData) ? trigData : [];
      } else {
        setError(t('led_triggers.load_failed'));
      }
      setRules(rawRules.map((r) => normalizeLoadedRule(r, list)));
    } catch {
      setError(t('led_triggers.load_failed'));
      setProfiles([]);
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, [system, t]);

  useEffect(() => {
    if (!isOpen) return;
    void load();
  }, [isOpen, load]);

  const updateRule = (id: string, patch: Partial<HardwareTrigger>) => {
    setRules((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...patch };
        if (patch.event_type && patch.event_type !== 'stat_change') {
          next.target_stat = null;
        }
        if (patch.duration_type === 'turn') {
          next.duration_ms = r.duration_ms ?? 1000;
        }
        return next;
      })
    );
  };

  const addRule = () => {
    setRules((prev) => [...prev, createEmptyRule(profiles.length ? profiles : [])]);
  };

  const removeRule = (id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
  };

  const handleSave = async () => {
    if (!system) return;
    setSaving(true);
    setError(null);
    try {
      const payload = rules.map((r) => ({
        id: r.id,
        event_type: r.event_type,
        target_stat: r.event_type === 'stat_change' ? (r.target_stat?.trim() || null) : null,
        led_profile_id: r.led_profile_id,
        transition: normalizeTransition(r.transition),
        transition_color: normalizeTransition(r.transition) ? (r.transition_color || '#ffffff') : null,
        duration_type: r.duration_type,
        duration_ms: r.duration_type === 'time' ? Math.max(0, r.duration_ms ?? 1000) : (r.duration_ms ?? 1000),
      }));
      const res = await fetch(`/api/systems/${encodeURIComponent(system)}/led_triggers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(String(res.status));
      onClose();
    } catch {
      setError(t('led_triggers.save_failed'));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[75] p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-5xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        <div className="p-4 border-b border-zinc-800 flex flex-wrap gap-2 justify-between items-center bg-zinc-900/50">
          <h3 className="text-lg font-medium text-zinc-100">
            Триггеры подсветки и экрана (Hardware Triggers)
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-100 p-1"
            aria-label={t('common.close')}
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto flex-1 min-h-0 flex flex-col gap-4">
          {!system && (
            <p className="text-sm text-zinc-500">{t('config_modal.no_systems_yet')}</p>
          )}

          {error && (
            <p className="text-sm text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">{error}</p>
          )}

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-zinc-400 py-6">
              <Loader2 className="animate-spin" size={18} />
              {t('hardware.loading')}
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {rules.length === 0 && (
                  <p className="text-sm text-zinc-500">{t('led_triggers.no_rules')}</p>
                )}
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="grid grid-cols-1 gap-3 lg:gap-2 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,100px)_auto] items-end p-3 rounded-xl border border-zinc-800 bg-zinc-950/80"
                  >
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">
                        {t('led_triggers.event_type')}
                      </label>
                      <select
                        value={rule.event_type}
                        onChange={(e) =>
                          updateRule(rule.id, {
                            event_type: e.target.value as HardwareTrigger['event_type'],
                          })
                        }
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="turn_start">{t('led_triggers.event_turn_start')}</option>
                        <option value="stat_change">{t('led_triggers.event_stat_change')}</option>
                        <option value="miniature_bind">Привязка миниатюры</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">
                        {t('led_triggers.stat_characteristic')}
                      </label>
                      {rule.event_type === 'stat_change' ? (
                        <select
                          value={rule.target_stat ?? ''}
                          onChange={(e) =>
                            updateRule(rule.id, {
                              target_stat: e.target.value || null,
                            })
                          }
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                        >
                          <option value="">{t('common.empty_dash')}</option>
                          {rule.target_stat &&
                            !columns.some(
                              (col) => columnStatId(col) === (rule.target_stat || '').trim()
                            ) && (
                              <option value={rule.target_stat}>
                                {localizedStatNameById(systemNameForI18n, rule.target_stat)}
                              </option>
                            )}
                          {columns.map((col) => {
                            const val = columnStatId(col);
                            return (
                              <option key={val} value={val}>
                                {localizedStatName(systemNameForI18n, col)}
                              </option>
                            );
                          })}
                        </select>
                      ) : (
                        <div className="h-[42px] rounded-lg border border-zinc-800/80 bg-zinc-950/50" aria-hidden />
                      )}
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">
                        {t('led_triggers.led_profile')}
                      </label>
                      <select
                        value={rule.led_profile_id}
                        onChange={(e) => updateRule(rule.id, { led_profile_id: e.target.value })}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                      >
                        {rule.led_profile_id &&
                          !profiles.some((p) => p.id === rule.led_profile_id) && (
                            <option value={rule.led_profile_id}>
                              {rule.led_profile_id}{' '}
                              {t('miniature_layout.led_profile_custom_hint')}
                            </option>
                          )}
                        {profiles.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name || p.id}
                          </option>
                        ))}
                        {profiles.length === 0 && <option value={rule.led_profile_id}>{rule.led_profile_id}</option>}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">
                        Переход экрана
                      </label>
                      <select
                        value={rule.transition || 'none'}
                        onChange={(e) => updateRule(rule.id, { transition: normalizeTransition(e.target.value) })}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                      >
                        {SCREEN_TRANSITION_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      {rule.transition && (
                        <label className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
                          Цвет
                          <input
                            type="color"
                            value={rule.transition_color || '#ffffff'}
                            onChange={(e) => updateRule(rule.id, { transition_color: e.target.value })}
                            className="h-8 w-10 cursor-pointer rounded border border-zinc-700 bg-zinc-900 p-1"
                          />
                          <input
                            type="text"
                            value={rule.transition_color || '#ffffff'}
                            onChange={(e) => updateRule(rule.id, { transition_color: e.target.value })}
                            className="min-w-0 flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
                          />
                        </label>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">
                        {t('led_triggers.duration')}
                      </label>
                      <select
                        value={rule.duration_type}
                        onChange={(e) =>
                          updateRule(rule.id, {
                            duration_type: e.target.value as HardwareTrigger['duration_type'],
                          })
                        }
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="time">{t('led_triggers.duration_time')}</option>
                        <option value="turn">{t('led_triggers.duration_turn')}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">
                        {t('led_triggers.duration_ms')}
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={rule.duration_ms ?? 1000}
                        disabled={rule.duration_type !== 'time'}
                        onChange={(e) =>
                          updateRule(rule.id, { duration_ms: Math.max(0, Number(e.target.value) || 0) })
                        }
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed"
                      />
                    </div>
                    <div className="flex justify-end lg:justify-center pb-0.5">
                      <button
                        type="button"
                        onClick={() => removeRule(rule.id)}
                        className="p-2 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-950/30 border border-transparent hover:border-red-900/40 transition-colors"
                        aria-label={t('common.delete')}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addRule}
                disabled={!system}
                className="flex items-center justify-center gap-2 py-2 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-sm transition-colors disabled:opacity-40 w-full sm:w-auto"
              >
                <Plus size={16} />
                {t('led_triggers.add_trigger')}
              </button>
            </>
          )}
        </div>

        <div className="p-4 border-t border-zinc-800 flex flex-wrap gap-2 justify-end bg-zinc-900/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-zinc-300 bg-zinc-800 hover:bg-zinc-700 transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!system || saving || loading}
            className="px-4 py-2 rounded-lg text-sm text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 transition-colors flex items-center gap-2"
          >
            {saving && <Loader2 className="animate-spin" size={16} />}
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
