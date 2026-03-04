import React, { useState, useEffect, useMemo } from 'react';
import { X, Save, Check, Sparkles, ImagePlus, ImageOff } from 'lucide-react';
import { Actor, Effect } from '../../types';
import { useTranslation } from 'react-i18next';
import { slugify } from 'transliteration';
import { LibraryModal } from './LibraryModal';

export function AddEffectModal({
  actor,
  systemName,
  onClose,
  onAdd,
}: {
  actor: Actor;
  systemName: string;
  onClose: () => void;
  onAdd: (effect: Effect) => void;
}) {
  const { t } = useTranslation('core', { useSuspense: false });
  const [systemEffects, setSystemEffects] = useState<Effect[]>([]);
  const [name, setName] = useState('');
  const [technicalId, setTechnicalId] = useState('');
  const [isCustomId, setIsCustomId] = useState(false);
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState<number | ''>(1);
  const [isInfinite, setIsInfinite] = useState(false);
  const [renderOnMini, setRenderOnMini] = useState(true);
  const [renderOnPanel, setRenderOnPanel] = useState(true);
  const [icon, setIcon] = useState('');
  const [isSavedToSystem, setIsSavedToSystem] = useState(false);
  const [experimentalAi, setExperimentalAi] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiVariations, setAiVariations] = useState<Record<string, string>>({});
  const [showIconLibrary, setShowIconLibrary] = useState(false);
  const [quickSearch, setQuickSearch] = useState('');
  const [previewError, setPreviewError] = useState(false);
  const [previewResolutionWarning, setPreviewResolutionWarning] = useState(false);

  const OPTIMAL_PREVIEW_SIZE = { width: 172, height: 320 };

  // Reset preview error and resolution warning when icon changes (no dependency cycle: icon is user-driven only).
  useEffect(() => {
    setPreviewError(false);
    setPreviewResolutionWarning(false);
  }, [icon]);

  useEffect(() => {
    fetch(`/api/systems/${encodeURIComponent(systemName)}/effects`)
      .then((res) => res.json())
      .then((data) => setSystemEffects(Array.isArray(data) ? data : []))
      .catch((err) => console.error('Failed to load system effects', err));
  }, [systemName]);

  const effectIconUrl = useMemo(() => {
    if (!icon.trim()) return null;
    const systemParam = encodeURIComponent(systemName);
    return `/api/assets/effects/${encodeURIComponent(icon)}?system=${systemParam}`;
  }, [icon, systemName]);

  const filteredEffects = useMemo(() => {
    if (!quickSearch.trim()) return systemEffects;
    const q = quickSearch.toLowerCase();
    return systemEffects.filter(
      (e) =>
        (e.name && e.name.toLowerCase().includes(q)) ||
        (e.id && e.id.toLowerCase().includes(q))
    );
  }, [systemEffects, quickSearch]);

  const handleSelectEffect = (eff: Effect | null) => {
    if (!eff) {
      setName(quickSearch);
      if (!isCustomId) {
        const base = slugify(quickSearch, { separator: '_' });
        setTechnicalId(base ? `effect_${base}` : '');
      }
      return;
    }
    setName(eff.name);
    setQuickSearch(eff.name);
    setTechnicalId(eff.id);
    setIsCustomId(true);
    setDescription(eff.description || '');
    if (eff.duration === null || eff.duration === undefined) {
      setIsInfinite(true);
      setDuration('');
    } else {
      setIsInfinite(false);
      setDuration(eff.duration);
    }
    setRenderOnMini(eff.render_on_mini ?? eff.show_on_miniature ?? true);
    setRenderOnPanel(eff.render_on_panel ?? true);
    setIcon(eff.icon ?? '');
    setExperimentalAi(eff.experimental_ai ?? false);
    setAiPrompt(eff.ai_prompt ?? '');
    setAiVariations(eff.ai_variations ?? {});
  };

  const handleNameChange = (val: string) => {
    setName(val);
    if (!isCustomId) {
      const base = slugify(val, { separator: '_' });
      setTechnicalId(base ? `effect_${base}` : '');
    }
  };

  const handleTechnicalIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTechnicalId(e.target.value);
    setIsCustomId(true);
  };

  const buildEffectPayload = (): Record<string, unknown> => ({
    id: technicalId,
    name,
    description,
    duration: isInfinite ? null : (duration === '' ? 1 : duration),
    icon: icon || undefined,
    render_on_mini: renderOnMini,
    render_on_panel: renderOnPanel,
    experimental_ai: experimentalAi,
    ai_prompt: aiPrompt,
    ai_variations: aiVariations,
  });

  const handleSaveToSystem = async () => {
    if (!name || !technicalId) return;
    const newEffect = buildEffectPayload();
    try {
      const res = await fetch(`/api/systems/${encodeURIComponent(systemName)}/effects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEffect),
      });
      if (res.status === 403) {
        const data = await res.json().catch(() => ({}));
        if (data.detail && String(data.detail).includes('base effect')) {
          setTechnicalId((id) => (id.endsWith('_copy') ? id : `${id}_copy`));
          setIsCustomId(true);
          return;
        }
      }
      if (!res.ok) throw new Error('Save failed');
      setIsSavedToSystem(true);
      setTimeout(() => setIsSavedToSystem(false), 2000);
    } catch (err) {
      console.error('Failed to save effect to system', err);
    }
  };

  const handleAdd = () => {
    if (!name || !technicalId) return;
    onAdd({
      id: technicalId,
      name,
      description,
      duration: isInfinite ? null : (duration === '' ? 1 : duration),
      icon: icon || undefined,
      render_on_mini: renderOnMini,
      render_on_panel: renderOnPanel,
      experimental_ai: experimentalAi,
      ai_prompt: aiPrompt,
      ai_variations: aiVariations,
    });
  };

  const handleIconSelect = (urlOrFilename: string) => {
    const filename = urlOrFilename.includes('/') ? urlOrFilename.split('/').pop() || '' : urlOrFilename;
    setIcon(filename);
    setShowIconLibrary(false);
    setPreviewError(false);
    // Name and technicalId are separate from the asset: only suggest name when empty, and id is always derived from name.
    if (!name.trim() && filename) {
      const base = filename.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
      const suggestedName = base
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
      setName(suggestedName);
      if (!isCustomId) {
        const slug = slugify(suggestedName, { separator: '_' });
        setTechnicalId(slug ? `effect_${slug}` : '');
      }
    }
  };

  const isCustom = name && !systemEffects.some((e) => e.name === name);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
          <h3 className="text-lg font-medium text-zinc-100">
            {t('modals.add_effect_to')} {actor.name}
          </h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Left: Preview */}
          <div
            className="flex-shrink-0 p-4 flex flex-col items-center border-r border-zinc-800"
            style={{ width: 172 }}
          >
            <div
              role="button"
              tabIndex={0}
              onClick={() => setShowIconLibrary(true)}
              onKeyDown={(e) => e.key === 'Enter' && setShowIconLibrary(true)}
              className="w-full rounded-xl bg-zinc-800/80 border border-zinc-700 flex items-center justify-center overflow-hidden cursor-pointer hover:border-emerald-500/50 hover:bg-zinc-800 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
              style={{ aspectRatio: '172/320' }}
            >
              {effectIconUrl && !previewError ? (
                <img
                  key={icon}
                  src={effectIconUrl}
                  alt=""
                  className="w-full h-full object-contain"
                  onError={() => setPreviewError(true)}
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    if (img.naturalWidth !== OPTIMAL_PREVIEW_SIZE.width || img.naturalHeight !== OPTIMAL_PREVIEW_SIZE.height) {
                      setPreviewResolutionWarning(true);
                    }
                  }}
                />
              ) : effectIconUrl && previewError ? (
                <span className="flex flex-col items-center gap-2 text-zinc-500">
                  <ImageOff size={40} />
                  <span className="text-xs text-center px-2">Нет иконки</span>
                </span>
              ) : (
                <span className="flex flex-col items-center gap-2 text-zinc-500">
                  <ImagePlus size={40} />
                  <span className="text-xs">Выбрать иконку</span>
                </span>
              )}
            </div>
            {previewResolutionWarning && effectIconUrl && (
              <p className="mt-1.5 text-[10px] text-red-500 text-center leading-tight">
                {t('modals.preview_size_warning')}
              </p>
            )}
          </div>

          {/* Right: Settings */}
          <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-4">
            {/* Quick Search combobox */}
            <div>
              <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">
                Быстрый поиск
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={quickSearch}
                  onChange={(e) => {
                    setQuickSearch(e.target.value);
                    const match = systemEffects.find(
                      (eff) =>
                        eff.name.toLowerCase() === e.target.value.toLowerCase() ||
                        eff.id === e.target.value
                    );
                    if (match) handleSelectEffect(match);
                    else handleSelectEffect(null);
                  }}
                  onFocus={() => setQuickSearch(name || quickSearch)}
                  placeholder={t('modals.type_or_select_effect')}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                  list="effect-quick-list"
                />
                <datalist id="effect-quick-list">
                  {filteredEffects.slice(0, 20).map((eff) => (
                    <option key={eff.id} value={eff.name} />
                  ))}
                </datalist>
              </div>
            </div>

            {/* Name & Auto-ID */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">
                  {t('modals.display_name')}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder={t('modals.display_name')}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">
                  ID (effect_…)
                </label>
                <input
                  type="text"
                  value={technicalId}
                  onChange={handleTechnicalIdChange}
                  placeholder="effect_okamenenie"
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">
                {t('modals.description')}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('modals.effect_details')}
                rows={2}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500 resize-none"
              />
            </div>

            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">
                  {t('modals.duration_rounds')}
                </label>
                <input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(parseInt(e.target.value) || '')}
                  disabled={isInfinite}
                  min={1}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer pb-2">
                <input
                  type="checkbox"
                  checked={isInfinite}
                  onChange={(e) => setIsInfinite(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-900"
                />
                <span className="text-sm text-zinc-300">{t('modals.infinite')}</span>
              </label>
            </div>

            {/* Visibility */}
            <div className="space-y-2">
              <span className="block text-xs font-medium text-zinc-500 uppercase tracking-wider">
                Видимость
              </span>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={renderOnMini}
                    onClick={() => setRenderOnMini((v) => !v)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-zinc-900 ${
                      renderOnMini ? 'bg-emerald-600' : 'bg-zinc-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition ${
                        renderOnMini ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                  <span className="text-sm text-zinc-300">На миниатюре</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={renderOnPanel}
                    onClick={() => setRenderOnPanel((v) => !v)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-zinc-900 ${
                      renderOnPanel ? 'bg-emerald-600' : 'bg-zinc-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition ${
                        renderOnPanel ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                  <span className="text-sm text-zinc-300">В интерфейсе</span>
                </label>
              </div>
            </div>

            {/* AI Mode */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
              <label className="flex items-center gap-3 p-3 cursor-pointer hover:bg-zinc-800/50 transition-colors">
                <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-violet-500/20 text-violet-400">
                  <Sparkles size={18} />
                </span>
                <div className="flex-1">
                  <span className="text-sm font-medium text-zinc-200">Экспериментальный ИИ</span>
                  <p className="text-xs text-zinc-500 mt-0.5">Промпт для изменения изображения под эффект</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={experimentalAi}
                  onClick={() => setExperimentalAi((v) => !v)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-zinc-900 ${
                    experimentalAi ? 'bg-violet-500' : 'bg-zinc-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
                      experimentalAi ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </label>
              {experimentalAi && (
                <div className="px-3 pb-3 pt-0 border-t border-zinc-800/80 pt-3">
                  <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">
                    Промпт для ИИ
                  </label>
                  <textarea
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="Опишите, как ИИ должен изменить изображение под эффект. Например: «Сделай существо окаменевшим, как статую»"
                    rows={2}
                    className="w-full bg-zinc-950 border border-violet-500/30 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50 resize-none"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2 border-t border-zinc-800 items-center justify-between mt-auto">
              {isCustom ? (
                <button
                  onClick={handleSaveToSystem}
                  className="flex items-center gap-1 text-xs text-zinc-400 hover:text-emerald-400 transition-colors"
                  title={t('modals.save_effect_to_system_title')}
                >
                  {isSavedToSystem ? <Check size={14} className="text-emerald-500" /> : <Save size={14} />}
                  {isSavedToSystem ? t('modals.saved') : t('modals.save_to_system')}
                </button>
              ) : (
                <div />
              )}
              <button
                onClick={handleAdd}
                disabled={!name || !technicalId}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {t('modals.add_effect')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {showIconLibrary && (
        <LibraryModal
          systemName={systemName}
          initialTab="effects"
          searchQuery={name}
          initialDisplayName={name}
          initialTechnicalId={technicalId}
          onClose={() => setShowIconLibrary(false)}
          onSelect={handleIconSelect}
        />
      )}
    </div>
  );
}
