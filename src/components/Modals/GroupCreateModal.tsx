import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { useCombatState } from '../../contexts/CombatStateContext';

const PRESET_COLORS = [
  { name: 'Red', hex: '#ef4444' },
  { name: 'Blue', hex: '#3b82f6' },
  { name: 'Green', hex: '#10b981' },
  { name: 'Yellow', hex: '#eab308' },
  { name: 'Purple', hex: '#a855f7' },
  { name: 'Gray', hex: '#9ca3af' },
] as const;

export interface GroupCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string, color: string, layoutProfileId?: string) => void;
}

export function GroupCreateModal({ isOpen, onClose, onSubmit }: GroupCreateModalProps) {
  const { t } = useTranslation('core', { useSuspense: false });
  const { state } = useCombatState();
  const [name, setName] = useState('');
  const [color, setColor] = useState('#10b981');
  const [groupProfileId, setGroupProfileId] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setName('');
      setColor('#10b981');
      setGroupProfileId('');
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim() || 'Group';
    const trimmedColor = color.trim() || '#10b981';
    onSubmit(trimmedName, trimmedColor, groupProfileId || undefined);
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
          <h3 className="text-lg font-medium text-zinc-100">
            {t('modals.create_new_group', { defaultValue: 'Create New Group' })}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-100 transition-colors p-1"
            aria-label={t('common.close', { defaultValue: 'Close' })}
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label htmlFor="group-name" className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1.5">
              {t('modals.group_name', { defaultValue: 'Group Name' })}
            </label>
            <input
              id="group-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('modals.group_name_placeholder', { defaultValue: 'e.g. Goblins' })}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1.5">
              {t('modals.group_color', { defaultValue: 'Color' })}
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-10 h-10 rounded-lg bg-zinc-800 border border-zinc-700 cursor-pointer"
                title={t('modals.custom_color', { defaultValue: 'Custom color' })}
              />
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((preset) => (
                  <button
                    key={preset.hex}
                    type="button"
                    onClick={() => setColor(preset.hex)}
                    className="w-8 h-8 rounded-full border-2 border-transparent hover:border-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors"
                    style={{ backgroundColor: preset.hex }}
                    title={preset.name}
                    aria-label={preset.name}
                  />
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1.5">
              {t('actor.layout_profile', { defaultValue: 'Display profile (ESP32)' })}
            </label>
            <select
              value={groupProfileId}
              onChange={(e) => setGroupProfileId(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
            >
              <option value="">{t('actor.layout_profile_default', { defaultValue: 'Default' })}</option>
              {state?.layout_profiles?.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg text-sm font-medium transition-colors"
            >
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {t('modals.create_group_action', { defaultValue: 'Create' })}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
