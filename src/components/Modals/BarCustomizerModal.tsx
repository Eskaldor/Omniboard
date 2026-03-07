import React, { useState, useEffect } from 'react';
import { X, Save, Plus, ImageIcon, Trash2 } from 'lucide-react';
import { slugify } from 'transliteration';
import { BarProfileConfig } from '../../types';
import { useTranslation } from 'react-i18next';

const SYSTEM_NS = (sys: string) => `systems/${sys}`;

export function getBarDisplayName(
  i18n: { t: (key: string, opts?: { ns?: string; defaultValue?: string }) => string },
  system: string,
  id: string,
  fallback: string
): string {
  const key = `bar_${id}`;
  const name = i18n.t(key, { ns: SYSTEM_NS(system), defaultValue: '' });
  return (name && name !== key ? name.trim() : '') || fallback || id;
}

export function BarCustomizerModal({
  isOpen,
  onClose,
  system,
}: {
  isOpen: boolean;
  onClose: () => void;
  system: string;
}) {
  const { t, i18n } = useTranslation('core', { useSuspense: false });
  const [profiles, setProfiles] = useState<BarProfileConfig[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<BarProfileConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [textureKey, setTextureKey] = useState(Date.now());
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !system) return;
    i18n.loadNamespaces(SYSTEM_NS(system)).catch(() => {});
  }, [isOpen, system, i18n]);

  useEffect(() => {
    if (!isOpen) return;
    fetch(`/api/assets/bars?system=${encodeURIComponent(system || '')}`)
      .then((res) => res.json())
      .then((data: BarProfileConfig[]) => {
        const list = Array.isArray(data) ? data : [];
        setProfiles(list);
        if (list.length > 0 && !selectedId) setSelectedId(list[0].id);
        if (list.length === 0) setSelectedId(null);
      })
      .catch((err) => {
        console.error('Failed to fetch bar profiles', err);
        setProfiles([]);
        setSelectedId(null);
      });
  }, [isOpen, system]);

  useEffect(() => {
    if (!selectedId) {
      setEditing(null);
      return;
    }
    const found = profiles.find((p) => p.id === selectedId);
    if (found) {
      setEditing({ ...found });
    } else {
      setEditing({
        id: selectedId,
        name: selectedId,
        mode: 'solid',
        fg_color: '#00c800',
        fg_color_end: undefined,
        fg_color_mid: undefined,
        gradient_stop: 1,
        gradient_mid_stop: 0.5,
        bg_color: '#323232',
        border_color: '#000000',
        border_width: 1,
        border_radius: 0,
      });
    }
  }, [selectedId, profiles]);

  const handleCreateStyle = () => {
    const id = `style_${Date.now()}`;
    const newConfig: BarProfileConfig = {
      id,
      name: '',
      mode: 'solid',
      fg_color: '#00c800',
      fg_color_end: undefined,
      fg_color_mid: undefined,
      gradient_stop: 1,
      gradient_mid_stop: 0.5,
      bg_color: '#323232',
      border_color: '#000000',
      border_width: 1,
      border_radius: 0,
    };
    setProfiles((prev) => [...prev, newConfig]);
    setSelectedId(id);
    setEditing({ ...newConfig });
  };

  const handleTextureUpload = async (type: 'bg' | 'fg' | 'mask' | 'overlay', file: File) => {
    if (!editing) return;
    const formData = new FormData();
    formData.append('texture_type', type);
    formData.append('file', file);
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/assets/bars/${encodeURIComponent(editing.id)}/textures?system=${encodeURIComponent(system || '')}`,
        { method: 'POST', body: formData }
      );
      if (res.ok) setTextureKey(Date.now());
    } catch (err) {
      console.error('Failed to upload texture', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTextureDelete = async (type: 'bg' | 'fg' | 'mask' | 'overlay') => {
    if (!editing) return;
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/assets/bars/${encodeURIComponent(editing.id)}/textures/${type}?system=${encodeURIComponent(system || '')}`,
        { method: 'DELETE' }
      );
      if (res.ok) setTextureKey(Date.now());
    } catch (err) {
      console.error('Failed to delete texture', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editing) return;
    const isNew = editing.id.startsWith('style_') || (editing.id.startsWith('bar_') && !profiles.some((p) => p.id === editing.id));
    const displayName = (editing.name || editing.id).trim();
    const technicalId = isNew
      ? (slugify(displayName, { separator: '_' }) || `bar_${Date.now()}`).toLowerCase().replace(/[^a-z0-9_]/g, '_')
      : editing.id;

    setSaving(true);
    try {
      const url = system
        ? `/api/assets/bars?system=${encodeURIComponent(system)}`
        : '/api/assets/bars';
      const payload = { ...editing, id: technicalId, name: displayName };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const lang = (i18n.language || 'ru').split('-')[0];
        if (system && system.trim()) {
          await fetch(`/api/locales/systems/${encodeURIComponent(system)}/entry`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: `bar_${technicalId}`, value: displayName, lang }),
          }).catch(() => {});
        }
        const data = await fetch(
          `/api/assets/bars?system=${encodeURIComponent(system || '')}`
        ).then((r) => r.json());
        setProfiles(Array.isArray(data) ? data : []);
        setSelectedId(technicalId);
      }
    } catch (err) {
      console.error('Failed to save bar profile', err);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
          <h3 className="text-lg font-medium text-zinc-100">
            {t('miniature_layout.bar_forge', { defaultValue: 'Конфигуратор шкал' })}
          </h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 min-h-0 flex gap-6">
          {/* Слева: список стилей */}
          <div className="w-48 flex-shrink-0 flex flex-col gap-2">
            <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              {t('miniature_layout.styles', { defaultValue: 'Styles' })}
            </div>
            <ul className="space-y-1">
              {profiles.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      selectedId === p.id
                        ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/50'
                        : 'bg-zinc-800/50 text-zinc-300 hover:bg-zinc-700 border border-transparent'
                    }`}
                  >
                    {getBarDisplayName(i18n, system || '', p.id, p.name || p.id)}
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={handleCreateStyle}
              className="flex items-center justify-center gap-2 py-2 mt-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors"
            >
              <Plus size={16} /> {t('miniature_layout.new_style', { defaultValue: 'Новый стиль' })}
            </button>
          </div>

          {/* Центр: форма */}
          <div className="flex-1 min-w-0 space-y-4">
            {editing ? (
              <>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">{t('name', { defaultValue: 'Имя' })}</label>
                  <input
                    type="text"
                    value={editing.name}
                    onChange={(e) => setEditing((prev) => prev ? { ...prev, name: e.target.value } : null)}
                    placeholder={t('miniature_layout.profile_name', { defaultValue: 'Profile name' })}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                  />
                  <p className="mt-1 text-xs text-zinc-500">
                    {t('miniature_layout.name_hint', { defaultValue: 'Display name in UI. On save, ID = transliteration (e.g. HealthBar → healthbar).' })}
                  </p>
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">{t('miniature_layout.bar_style', { defaultValue: 'Bar style' })}</label>
                  <select
                    value={editing.mode}
                    onChange={(e) =>
                      setEditing((prev) =>
                        prev ? { ...prev, mode: e.target.value as 'solid' | 'textured' } : null
                      )
                    }
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="solid">{t('miniature_layout.style_solid', { defaultValue: 'Сплошной цвет' })}</option>
                    <option value="textured">{t('miniature_layout.style_textured', { defaultValue: 'Текстура' })}</option>
                  </select>
                </div>
                {editing.mode === 'solid' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">{t('miniature_layout.fg_color', { defaultValue: 'Цвет шкалы (Начало)' })}</label>
                      <input
                        type="color"
                        value={editing.fg_color}
                        onChange={(e) => setEditing((prev) => prev ? { ...prev, fg_color: e.target.value } : null)}
                        className="w-10 h-10 rounded bg-zinc-900 border border-zinc-700 cursor-pointer block"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">{t('miniature_layout.fg_color_end', { defaultValue: 'Цвет шкалы (Конец градиента)' })}</label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!(editing.fg_color_end && editing.fg_color_end.trim() !== '')}
                          onChange={(e) =>
                            setEditing((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    fg_color_end: e.target.checked ? prev.fg_color_end || prev.fg_color : undefined,
                                  }
                                : null
                            )
                          }
                          className="rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500"
                        />
                        <span className="text-sm text-zinc-400">{t('miniature_layout.gradient', { defaultValue: 'Gradient' })}</span>
                      </label>
                      {(editing.fg_color_end && editing.fg_color_end.trim() !== '') && (
                        <input
                          type="color"
                          value={editing.fg_color_end}
                          onChange={(e) => setEditing((prev) => prev ? { ...prev, fg_color_end: e.target.value } : null)}
                          className="mt-1 w-10 h-10 rounded bg-zinc-900 border border-zinc-700 cursor-pointer block"
                        />
                      )}
                    </div>
                    {(editing.fg_color_end && editing.fg_color_end.trim() !== '') && (
                      <>
                        <div>
                          <label className="block text-xs text-zinc-500 mb-1">{t('miniature_layout.fg_color_mid', { defaultValue: 'Цвет шкалы (Середина градиента)' })}</label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!(editing.fg_color_mid && editing.fg_color_mid.trim() !== '')}
                              onChange={(e) =>
                                setEditing((prev) =>
                                  prev
                                    ? { ...prev, fg_color_mid: e.target.checked ? prev.fg_color_mid || prev.fg_color : undefined }
                                    : null
                                )
                              }
                              className="rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500"
                            />
                            <span className="text-sm text-zinc-400">{t('miniature_layout.three_stops', { defaultValue: 'Three stops' })}</span>
                          </label>
                          {(editing.fg_color_mid && editing.fg_color_mid.trim() !== '') && (
                            <input
                              type="color"
                              value={editing.fg_color_mid}
                              onChange={(e) => setEditing((prev) => prev ? { ...prev, fg_color_mid: e.target.value } : null)}
                              className="mt-1 w-10 h-10 rounded bg-zinc-900 border border-zinc-700 cursor-pointer block"
                            />
                          )}
                        </div>
                        <div>
                          <label className="block text-xs text-zinc-500 mb-1">{t('miniature_layout.gradient_stop', { defaultValue: 'Сила перехода (доля ширины)' })}</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min={0.1}
                              max={1}
                              step={0.05}
                              value={editing.gradient_stop ?? 1}
                              onChange={(e) =>
                                setEditing((prev) => prev ? { ...prev, gradient_stop: Number(e.target.value) } : null)
                              }
                              className="flex-1 h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                            />
                            <span className="text-sm text-zinc-400 w-10">{Math.round((editing.gradient_stop ?? 1) * 100)}%</span>
                          </div>
                        </div>
                        {(editing.fg_color_mid && editing.fg_color_mid.trim() !== '') && (
                          <div>
                            <label className="block text-xs text-zinc-500 mb-1">{t('miniature_layout.gradient_mid_stop', { defaultValue: 'Позиция середины градиента' })}</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="range"
                                min={0.1}
                                max={0.9}
                                step={0.05}
                                value={editing.gradient_mid_stop ?? 0.5}
                                onChange={(e) =>
                                  setEditing((prev) => prev ? { ...prev, gradient_mid_stop: Number(e.target.value) } : null)
                                }
                                className="flex-1 h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                              />
                              <span className="text-sm text-zinc-400 w-10">{Math.round((editing.gradient_mid_stop ?? 0.5) * 100)}%</span>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">{t('miniature_layout.bar_bg_color', { defaultValue: 'Цвет подложки' })}</label>
                      <input
                        type="color"
                        value={editing.bg_color}
                        onChange={(e) => setEditing((prev) => prev ? { ...prev, bg_color: e.target.value } : null)}
                        className="w-10 h-10 rounded bg-zinc-900 border border-zinc-700 cursor-pointer block"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">{t('miniature_layout.border_color', { defaultValue: 'Цвет рамки' })}</label>
                      <input
                        type="color"
                        value={editing.border_color}
                        onChange={(e) => setEditing((prev) => prev ? { ...prev, border_color: e.target.value } : null)}
                        className="w-10 h-10 rounded bg-zinc-900 border border-zinc-700 cursor-pointer block"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">{t('miniature_layout.border_width', { defaultValue: 'Толщина рамки' })}</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={0}
                          max={10}
                          value={editing.border_width}
                          onChange={(e) =>
                            setEditing((prev) =>
                              prev ? { ...prev, border_width: Number(e.target.value) } : null
                            )
                          }
                          className="flex-1 h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                        />
                        <span className="text-sm text-zinc-400 w-6">{editing.border_width}</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">{t('miniature_layout.border_radius', { defaultValue: 'Скругление (Радиус)' })}</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={0}
                          max={24}
                          value={editing.border_radius ?? 0}
                          onChange={(e) =>
                            setEditing((prev) =>
                              prev ? { ...prev, border_radius: Number(e.target.value) } : null
                            )
                          }
                          className="flex-1 h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                        />
                        <span className="text-sm text-zinc-400 w-6">{editing.border_radius ?? 0}</span>
                      </div>
                    </div>
                  </div>
                )}
                {editing.mode === 'textured' && (
                  <div className="space-y-4">
                    {isLoading && (
                      <p className="text-xs text-amber-400 flex items-center gap-1">
                        <span className="inline-block w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                        {t('miniature_layout.uploading', { defaultValue: 'Загрузка...' })}
                      </p>
                    )}
                    {(['bg', 'fg', 'mask', 'overlay'] as const).map((type) => {
                      const labels: Record<typeof type, string> = {
                        bg: t('miniature_layout.texture_bg', { defaultValue: 'Background (bg.png)' }),
                        fg: t('miniature_layout.texture_fg', { defaultValue: 'Bar fill (fg.png)' }),
                        mask: t('miniature_layout.texture_mask', { defaultValue: 'Round mask (mask.png — optional)' }),
                        overlay: t('miniature_layout.texture_overlay', { defaultValue: 'Glass / Highlights (overlay.png)' }),
                      };
                      const textureUrl = `/api/assets/bars/${encodeURIComponent(editing.id)}/textures/${type}?system=${encodeURIComponent(system || '')}&t=${textureKey}`;
                      return (
                        <div key={type} className="flex items-start gap-3 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
                          <div className="flex flex-col gap-1 flex-1 min-w-0">
                            <label className="text-xs font-medium text-zinc-400">{labels[type]}</label>
                            <input
                              type="file"
                              accept="image/*"
                              disabled={isLoading}
                              className="block w-full text-sm text-zinc-300 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-zinc-700 file:text-zinc-200 file:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleTextureUpload(type, f);
                                e.target.value = '';
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => handleTextureDelete(type)}
                              disabled={isLoading}
                              className="mt-1 flex items-center gap-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded px-2 py-1 w-fit transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Trash2 size={12} /> {t('miniature_layout.delete_texture', { defaultValue: 'Удалить' })}
                            </button>
                          </div>
                          <div className="w-16 h-10 flex-shrink-0 rounded border border-zinc-600 overflow-hidden bg-zinc-900 flex items-center justify-center relative">
                            <div className="absolute inset-0 flex items-center justify-center text-zinc-500 z-0">
                              <ImageIcon size={20} />
                            </div>
                            <img
                              src={textureUrl}
                              alt=""
                              className="absolute inset-0 w-full h-full object-cover z-10"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
                >
                  <Save size={18} /> {saving ? t('miniature_layout.saving') : t('common.save')}
                </button>
              </>
            ) : (
              <p className="text-sm text-zinc-500">{t('miniature_layout.bar_forge_empty', { defaultValue: 'Создайте стиль или выберите из списка' })}</p>
            )}
          </div>

          {/* Справа: превью */}
          <div className="w-40 flex-shrink-0">
            <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
              {t('miniature_layout.preview', { defaultValue: 'Preview' })}
            </div>
            {editing && editing.mode === 'textured' && (
              <div className="relative h-8 rounded border border-zinc-600 overflow-hidden bg-zinc-900" title="Превью: основа → жидкость (60%) → стекло/блики (как на рендере)">
                <img
                  src={`/api/assets/bars/${encodeURIComponent(editing.id)}/textures/bg?system=${encodeURIComponent(system || '')}&t=${textureKey}`}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
                <div
                  className="absolute inset-y-0 left-0 overflow-hidden z-[1]"
                  style={{
                    width: '60%',
                    maskImage: `url(/api/assets/bars/${encodeURIComponent(editing.id)}/textures/mask?system=${encodeURIComponent(system || '')}&t=${textureKey})`,
                    maskSize: 'cover',
                    maskRepeat: 'no-repeat',
                    WebkitMaskImage: `url(/api/assets/bars/${encodeURIComponent(editing.id)}/textures/mask?system=${encodeURIComponent(system || '')}&t=${textureKey})`,
                    WebkitMaskSize: 'cover',
                    WebkitMaskRepeat: 'no-repeat',
                  }}
                >
                  <img
                    src={`/api/assets/bars/${encodeURIComponent(editing.id)}/textures/fg?system=${encodeURIComponent(system || '')}&t=${textureKey}`}
                    alt=""
                    className="h-full object-cover max-w-none w-[160px]"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                </div>
                <img
                  src={`/api/assets/bars/${encodeURIComponent(editing.id)}/textures/overlay?system=${encodeURIComponent(system || '')}&t=${textureKey}`}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover z-[2]"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </div>
            )}
            {editing && editing.mode === 'solid' && (() => {
              const stop = (editing.gradient_stop ?? 1) * 100;
              const mid = (editing.gradient_mid_stop ?? 0.5) * 100;
              const hasMid = editing.fg_color_mid && editing.fg_color_mid.trim() !== '';
              let fillStyle: React.CSSProperties;
              if (editing.fg_color_end && editing.fg_color_end.trim() !== '') {
                if (hasMid) {
                  fillStyle = {
                    background: `linear-gradient(90deg, ${editing.fg_color} 0%, ${editing.fg_color_mid} ${mid}%, ${editing.fg_color_end} ${stop}%)`,
                  };
                } else {
                  fillStyle = {
                    background: `linear-gradient(90deg, ${editing.fg_color} 0%, ${editing.fg_color_end} ${stop}%)`,
                  };
                }
              } else {
                fillStyle = { backgroundColor: editing.fg_color };
              }
              return (
                <div
                  className="h-8 overflow-hidden"
                  style={{
                    backgroundColor: editing.bg_color,
                    border: `${editing.border_width}px solid ${editing.border_color}`,
                    borderRadius: editing.border_radius ?? 0,
                  }}
                >
                  <div
                    className="h-full transition-all"
                    style={{
                      width: '70%',
                      ...fillStyle,
                      borderRadius: (editing.border_radius ?? 0) > 0 ? Math.max(0, (editing.border_radius ?? 0) - 2) : 0,
                    }}
                  />
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
