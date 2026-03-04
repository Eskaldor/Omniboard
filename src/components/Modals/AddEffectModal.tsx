import React, { useState, useEffect } from 'react';
import { X, Save, Check } from 'lucide-react';
import { Actor, Effect } from '../../types';
import { useTranslation } from 'react-i18next';
import { slugify } from 'transliteration';

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
  const [showOnMiniature, setShowOnMiniature] = useState(false);
  const [isSavedToSystem, setIsSavedToSystem] = useState(false);

  useEffect(() => {
    fetch(`/api/systems/${encodeURIComponent(systemName)}/effects`)
      .then((res) => res.json())
      .then((data) => setSystemEffects(data))
      .catch((err) => console.error('Failed to load system effects', err));
  }, [systemName]);

  const handleSelectEffect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);
    const selected = systemEffects.find((eff) => eff.name === val);
    if (selected) {
      setTechnicalId(selected.id);
      setIsCustomId(true);
      setDescription(selected.description || '');
      if (selected.duration === null) {
        setIsInfinite(true);
        setDuration('');
      } else {
        setIsInfinite(false);
        setDuration(selected.duration);
      }
      setShowOnMiniature(selected.show_on_miniature || false);
    } else {
      if (!isCustomId) {
        setTechnicalId(slugify(val, { separator: '_' }));
      }
    }
  };

  const handleTechnicalIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTechnicalId(e.target.value);
    setIsCustomId(true);
  };

  const handleSaveToSystem = async () => {
    if (!name || !technicalId) return;
    const newEffect = {
      id: technicalId,
      name,
      description,
      duration: isInfinite ? null : (duration === '' ? 1 : duration),
      show_on_miniature: showOnMiniature,
    };

    try {
      await fetch(`/api/systems/${encodeURIComponent(systemName)}/effects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEffect),
      });
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
      show_on_miniature: showOnMiniature,
    });
  };

  const isCustom = name && !systemEffects.some((e) => e.name === name);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
          <h3 className="text-lg font-medium text-zinc-100">
            {t('modals.add_effect_to')} {actor.name}
          </h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">
                {t('modals.display_name')}
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={name}
                  onChange={handleSelectEffect}
                  placeholder={t('modals.type_or_select_effect')}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                  list="effect-suggestions"
                />
                <datalist id="effect-suggestions">
                  {systemEffects.map((eff) => (
                    <option key={eff.id} value={eff.name} />
                  ))}
                </datalist>
              </div>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">
                {t('modals.technical_id')}
              </label>
              <input
                type="text"
                value={technicalId}
                onChange={handleTechnicalIdChange}
                placeholder={t('modals.technical_id_placeholder')}
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
              rows={3}
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
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isInfinite}
                  onChange={(e) => setIsInfinite(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-900"
                />
                <span className="text-sm text-zinc-300">{t('modals.infinite')}</span>
              </label>
            </div>
          </div>

          <div className="pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showOnMiniature}
                onChange={(e) => setShowOnMiniature(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-900"
              />
              <span className="text-sm text-zinc-300">{t('modals.show_on_miniature')}</span>
            </label>
          </div>

          <div className="flex gap-3 pt-4 border-t border-zinc-800 items-center justify-between">
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
              <div></div>
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
  );
}
