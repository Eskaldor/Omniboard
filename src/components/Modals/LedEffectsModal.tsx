import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { X, Plus, Save, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LedProfile, LedProfileMode } from '../../types';

const LED_MODES = ['static', 'cycle', 'blink', 'breathe', 'pulse', 'rainbow'] as const;
type LedMode = (typeof LED_MODES)[number];

function isLedMode(m: string): m is LedMode {
  return (LED_MODES as readonly string[]).includes(m);
}

const PREVIEW_ROLE = '#ef4444';
const PREVIEW_GROUP = '#3b82f6';

export function resolvePreviewColor(token: string): string {
  if (token === '$ROLE_COLOR') return PREVIEW_ROLE;
  if (token === '$GROUP_COLOR') return PREVIEW_GROUP;
  if (/^#[0-9A-Fa-f]{3,8}$/.test(token)) return token;
  return '#737373';
}

function LedPreviewBubble({
  draft,
  styleKey,
}: {
  draft: LedProfile;
  styleKey: string;
}) {
  const colors = (draft.colors?.length ? draft.colors : ['#888888']).map(resolvePreviewColor);
  const c0 = colors[0];
  const c1 = colors[1] ?? colors[0];
  const bri = Math.max(0, Math.min(255, draft.brightness)) / 255;
  const speed = Math.max(0, Math.min(2000, draft.speed));
  const mode: LedMode = isLedMode(draft.mode) ? draft.mode : 'static';

  const period = Math.max(120, speed * 2 || 600);

  const base: React.CSSProperties = {
    width: 100,
    height: 100,
    borderRadius: 9999,
    opacity: bri,
    boxShadow: `0 0 ${12 + bri * 24}px ${c0}88`,
  };

  if (mode === 'static') {
    return (
      <div
        className="mx-auto shrink-0 border border-zinc-600"
        style={{ ...base, backgroundColor: c0 }}
        key={styleKey}
      />
    );
  }

  if (mode === 'cycle') {
    const half = Math.max(100, speed || 200);
    return (
      <div
        className="mx-auto shrink-0 border border-zinc-600 led-blink-preview"
        style={
          {
            ...base,
            ['--led-c0' as string]: c0,
            ['--led-c1' as string]: c1,
            animation: `ledBlinkPreview ${half * 2}ms steps(2, end) infinite`,
          } as React.CSSProperties
        }
        key={styleKey}
      />
    );
  }

  if (mode === 'blink') {
    const half = Math.max(80, speed || 200);
    return (
      <div
        className="mx-auto shrink-0 border border-zinc-600 led-blink-preview"
        style={
          {
            ...base,
            ['--led-c0' as string]: c0,
            ['--led-c1' as string]: c1,
            animation: `ledBlinkPreview ${half * 2}ms steps(2, end) infinite`,
          } as React.CSSProperties
        }
        key={styleKey}
      />
    );
  }

  if (mode === 'pulse') {
    return (
      <div
        className="mx-auto shrink-0 border border-zinc-600 led-pulse-preview"
        style={
          {
            ...base,
            backgroundColor: c0,
            animation: `ledPulsePreview ${Math.max(400, speed * 2 || 1200)}ms ease-in-out infinite`,
          } as React.CSSProperties
        }
        key={styleKey}
      />
    );
  }

  if (mode === 'breathe') {
    return (
      <div
        className="mx-auto shrink-0 border border-zinc-600"
        style={
          {
            ...base,
            backgroundColor: c0,
            animation: `ledBreathePreview ${Math.max(600, speed * 2 || 2000)}ms ease-in-out infinite`,
          } as React.CSSProperties
        }
        key={styleKey}
      />
    );
  }

  /* rainbow */
  return (
    <div
      className="mx-auto shrink-0 border border-zinc-600 led-rainbow-preview"
      style={
        {
          ...base,
          background: `conic-gradient(from 0deg, ${c0}, ${c1}, ${c0})`,
          animation: `ledRainbowPreview ${Math.max(800, period)}ms linear infinite`,
        } as React.CSSProperties
      }
      key={styleKey}
    />
  );
}

const DEFAULT_NEW: LedProfile = {
  id: '',
  name: '',
  mode: 'static',
  speed: 0,
  brightness: 255,
  colors: ['#00ff88'],
};

export function LedEffectsModal({
  isOpen,
  onClose,
  system,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  system: string;
  onSaved?: () => void;
}) {
  const { t } = useTranslation('core', { useSuspense: false });
  const previewUid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [profiles, setProfiles] = useState<LedProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<LedProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const selected = draft;

  const load = useCallback(async () => {
    if (!system.trim()) {
      setProfiles([]);
      setSelectedId(null);
      setDraft(null);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/systems/${encodeURIComponent(system)}/led_profiles`);
      if (!res.ok) throw new Error(String(res.status));
      const data: LedProfile[] = await res.json();
      const list = Array.isArray(data) ? data : [];
      setProfiles(list);
      if (list.length === 0) {
        setSelectedId(null);
        setDraft(null);
        return;
      }
      setSelectedId((cur) => (cur && list.some((p) => p.id === cur) ? cur : list[0].id));
    } catch {
      setLoadError(t('led_profiles.load_failed', { defaultValue: 'Failed to load LED profiles' }));
      setProfiles([]);
      setSelectedId(null);
      setDraft(null);
    } finally {
      setLoading(false);
    }
  }, [system, t]);

  useEffect(() => {
    if (!isOpen) return;
    void load();
  }, [isOpen, load]);

  useEffect(() => {
    if (!selectedId) {
      setDraft(null);
      return;
    }
    const p = profiles.find((x) => x.id === selectedId);
    if (p) setDraft({ ...p, colors: [...p.colors] });
  }, [selectedId, profiles]);

  const previewStyleKey = useMemo(() => {
    if (!draft) return 'x';
    return `${draft.id}-${draft.mode}-${draft.speed}-${draft.brightness}-${draft.colors.join(',')}`;
  }, [draft]);

  const updateDraft = (partial: Partial<LedProfile>) => {
    setDraft((prev) => (prev ? { ...prev, ...partial } : null));
  };

  const updateColor = (index: number, value: string) => {
    setDraft((prev) => {
      if (!prev) return null;
      const next = [...prev.colors];
      next[index] = value;
      return { ...prev, colors: next };
    });
  };

  const addColorRow = () => {
    setDraft((prev) => {
      if (!prev) return null;
      return { ...prev, colors: [...prev.colors, '#FFFFFF'] };
    });
  };

  const removeColorRow = (index: number) => {
    setDraft((prev) => {
      if (!prev || prev.colors.length <= 1) return prev;
      return { ...prev, colors: prev.colors.filter((_, i) => i !== index) };
    });
  };

  const commitDraftToList = (): LedProfile[] | null => {
    if (!draft || !draft.id.trim() || !selectedId) return null;
    const name = (draft.name || draft.id).trim();
    const id = draft.id.trim();
    const mode: LedProfileMode = isLedMode(draft.mode) ? draft.mode : 'static';
    const speed = Math.max(0, Math.min(2000, Number(draft.speed) || 0));
    const brightness = Math.max(0, Math.min(255, Number(draft.brightness) || 0));
    const colors = draft.colors.length > 0 ? draft.colors.map((c) => c.trim() || '#000000') : ['#000000'];
    const nextItem: LedProfile = { id, name: name || id, mode, speed, brightness, colors };
    const idx = profiles.findIndex((p) => p.id === selectedId);
    if (idx < 0) return [...profiles, nextItem];
    const copy = [...profiles];
    copy[idx] = nextItem;
    return copy;
  };

  const handleAddProfile = () => {
    const id = `led_${Date.now()}`;
    const created: LedProfile = {
      ...DEFAULT_NEW,
      id,
      name: t('led_profiles.new_profile_name', { defaultValue: 'New LED profile' }),
      colors: ['#00ff88'],
    };
    setProfiles((prev) => [...prev, created]);
    setSelectedId(id);
    setDraft({ ...created, colors: [...created.colors] });
  };

  const handleSaveAll = async () => {
    const merged = commitDraftToList();
    if (!merged) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/systems/${encodeURIComponent(system)}/led_profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged),
      });
      if (!res.ok) throw new Error(String(res.status));
      const saved: LedProfile[] = await res.json();
      const list = Array.isArray(saved) ? saved : merged;
      setProfiles(list);
      if (selectedId && list.some((p) => p.id === selectedId)) {
        setSelectedId(selectedId);
      }
      onSaved?.();
    } catch {
      setLoadError(t('led_profiles.save_failed', { defaultValue: 'Failed to save LED profiles' }));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <style>{`
        @keyframes ledBlinkPreview {
          0%, 49% { background-color: var(--led-c0, #f00); }
          50%, 100% { background-color: var(--led-c1, #000); }
        }
        @keyframes ledPulsePreview {
          0%, 100% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(1.12); filter: brightness(1.25); }
        }
        @keyframes ledBreathePreview {
          0%, 100% { transform: scale(1); filter: brightness(0.85); }
          50% { transform: scale(1.08); filter: brightness(1.35); }
        }
        @keyframes ledRainbowPreview {
          to { filter: hue-rotate(360deg); }
        }
      `}</style>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-5xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
          <div className="p-4 border-b border-zinc-800 flex flex-wrap gap-2 justify-between items-center bg-zinc-900/50">
            <h3 className="text-lg font-medium text-zinc-100">
              {t('led_profiles.title', { defaultValue: 'LED profiles (Omnimini)' })}
            </h3>
            <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-100 p-1" aria-label={t('common.close', { defaultValue: 'Close' })}>
              <X size={20} />
            </button>
          </div>

          <div className="p-4 sm:p-6 overflow-y-auto flex-1 min-h-0 flex flex-col lg:flex-row gap-6">
            {/* List */}
            <div className="w-full lg:w-52 shrink-0 flex flex-col gap-2">
              <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                {t('led_profiles.list_heading', { defaultValue: 'Profiles' })}
              </div>
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-zinc-400 py-4">
                  <Loader2 className="animate-spin" size={18} />
                  {t('hardware.loading', { defaultValue: 'Loading…' })}
                </div>
              ) : (
                <ul className="space-y-1 max-h-48 lg:max-h-none overflow-y-auto">
                  {profiles.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(p.id)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                          selectedId === p.id
                            ? 'bg-amber-600/30 text-amber-200 border border-amber-500/50'
                            : 'bg-zinc-800/50 text-zinc-300 hover:bg-zinc-700 border border-transparent'
                        }`}
                      >
                        {p.name || p.id}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={handleAddProfile}
                className="flex items-center justify-center gap-2 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors"
              >
                <Plus size={16} />
                {t('led_profiles.add_profile', { defaultValue: 'Add profile' })}
              </button>
            </div>

            {/* Editor + preview */}
            <div className="flex-1 min-w-0 flex flex-col xl:flex-row gap-6">
              <div className="flex-1 space-y-4 min-w-0">
                {loadError && (
                  <p className="text-sm text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">{loadError}</p>
                )}
                {selected ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-zinc-500 mb-1">{t('led_profiles.field_id', { defaultValue: 'Id' })}</label>
                        <input
                          type="text"
                          value={selected.id}
                          onChange={(e) => updateDraft({ id: e.target.value })}
                          className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-amber-500 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-zinc-500 mb-1">{t('miniature_layout.profile_name', { defaultValue: 'Profile name' })}</label>
                        <input
                          type="text"
                          value={selected.name}
                          onChange={(e) => updateDraft({ name: e.target.value })}
                          className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">{t('led_profiles.mode', { defaultValue: 'Mode' })}</label>
                      <select
                        value={isLedMode(selected.mode) ? selected.mode : 'static'}
                        onChange={(e) => updateDraft({ mode: e.target.value as LedProfileMode })}
                        className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-amber-500"
                      >
                        <option value="static">{t('led_profiles.mode_static', { defaultValue: 'Static' })}</option>
                        <option value="cycle">{t('led_profiles.mode_cycle', { defaultValue: 'Cycle' })}</option>
                        <option value="blink">{t('led_profiles.mode_blink', { defaultValue: 'Blink' })}</option>
                        <option value="breathe">{t('led_profiles.mode_breathe', { defaultValue: 'Breathe' })}</option>
                        <option value="pulse">{t('led_profiles.mode_pulse', { defaultValue: 'Pulse' })}</option>
                        <option value="rainbow">{t('led_profiles.mode_rainbow', { defaultValue: 'Rainbow' })}</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">
                        {t('led_profiles.speed_ms', { defaultValue: 'Speed (ms)' })}: {selected.speed}
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={2000}
                        value={selected.speed}
                        onChange={(e) => updateDraft({ speed: Number(e.target.value) })}
                        className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">
                        {t('led_profiles.brightness', { defaultValue: 'Brightness' })}: {selected.brightness}
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={255}
                        value={selected.brightness}
                        onChange={(e) => updateDraft({ brightness: Number(e.target.value) })}
                        className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs text-zinc-500 font-medium uppercase tracking-wider">
                          {t('led_profiles.colors', { defaultValue: 'Colors' })}
                        </label>
                        <button type="button" onClick={addColorRow} className="text-xs text-amber-400 hover:text-amber-300">
                          + {t('led_profiles.add_color', { defaultValue: 'Add color' })}
                        </button>
                      </div>
                      <ul className="space-y-2">
                        {selected.colors.map((color, idx) => (
                          <li key={`c-${idx}`} className="flex flex-wrap items-center gap-2">
                            <input
                              type="text"
                              value={color}
                              onChange={(e) => updateColor(idx, e.target.value)}
                              placeholder="#RRGGBB or $ROLE_COLOR"
                              className="flex-1 min-w-[140px] bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-200 font-mono focus:outline-none focus:border-amber-500"
                            />
                            {/^#[0-9A-Fa-f]{3,8}$/.test(color) ? (
                              <input
                                type="color"
                                value={color.length === 4 ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}` : color.slice(0, 7)}
                                onChange={(e) => updateColor(idx, e.target.value)}
                                className="w-10 h-9 rounded border border-zinc-600 cursor-pointer bg-zinc-900 p-0 shrink-0"
                                title={t('miniature_layout.color', { defaultValue: 'Color' })}
                              />
                            ) : (
                              <span className="w-10 h-9 rounded border border-zinc-600 bg-zinc-800 shrink-0 inline-block" style={{ backgroundColor: resolvePreviewColor(color) }} title={color} />
                            )}
                            <div className="flex flex-wrap gap-1">
                              <button
                                type="button"
                                onClick={() => updateColor(idx, '$ROLE_COLOR')}
                                className="px-2 py-1 text-[10px] uppercase tracking-wide rounded bg-red-900/40 text-red-200 border border-red-800/60 hover:bg-red-900/60"
                              >
                                $ROLE_COLOR
                              </button>
                              <button
                                type="button"
                                onClick={() => updateColor(idx, '$GROUP_COLOR')}
                                className="px-2 py-1 text-[10px] uppercase tracking-wide rounded bg-blue-900/40 text-blue-200 border border-blue-800/60 hover:bg-blue-900/60"
                              >
                                $GROUP_COLOR
                              </button>
                            </div>
                            {selected.colors.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeColorRow(idx)}
                                className="text-xs text-zinc-500 hover:text-red-400 ml-auto"
                              >
                                {t('common.delete', { defaultValue: 'Delete' })}
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-xs text-zinc-500">
                        {t('led_profiles.colors_hint', {
                          defaultValue: 'Use $ROLE_COLOR / $GROUP_COLOR for dynamic colors on the device.',
                        })}
                      </p>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-zinc-500">{t('led_profiles.select_or_add', { defaultValue: 'Select a profile or add a new one.' })}</p>
                )}
              </div>

              <div className="w-full xl:w-44 shrink-0 flex flex-col items-center gap-2 border-t xl:border-t-0 xl:border-l border-zinc-800 pt-4 xl:pt-0 xl:pl-6">
                <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider self-stretch text-center xl:text-left">
                  {t('miniature_layout.preview', { defaultValue: 'Preview' })}
                </div>
                <p className="text-[10px] text-zinc-500 text-center xl:text-left leading-tight">
                  {t('led_profiles.preview_role_note', { defaultValue: '$ROLE_COLOR shows as red in preview.' })}
                </p>
                {draft && (
                  <LedPreviewBubble draft={draft} styleKey={`${previewUid}-${previewStyleKey}`} />
                )}
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-zinc-800 flex flex-wrap gap-2 justify-end bg-zinc-900/50">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-zinc-300 bg-zinc-800 hover:bg-zinc-700 transition-colors"
            >
              {t('common.close', { defaultValue: 'Close' })}
            </button>
            <button
              type="button"
              onClick={() => void handleSaveAll()}
              disabled={saving || !draft?.id?.trim()}
              className="flex items-center gap-2 px-5 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
              {t('led_profiles.save_all', { defaultValue: 'Save all' })}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
