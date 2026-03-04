import React, { useState } from 'react';
import { X, Save } from 'lucide-react';
import { ColumnConfig, MiniatureLayout, DisplayField } from '../../types';
import { useTranslation } from 'react-i18next';

export function MiniaturesModal({
  layout,
  columns,
  onClose,
}: {
  layout: MiniatureLayout;
  columns: ColumnConfig[];
  onClose: () => void;
}) {
  const { t } = useTranslation('core', { useSuspense: false });
  const [localLayout, setLocalLayout] = useState<MiniatureLayout>(layout);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await fetch('/api/combat/layout', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(localLayout),
      });
      onClose();
    } catch (err) {
      console.error('Failed to save layout', err);
    } finally {
      setIsSaving(false);
    }
  };

  const updateSlot = (slotName: keyof MiniatureLayout, field: Partial<DisplayField> | null) => {
    if (field === null) {
      setLocalLayout({ ...localLayout, [slotName]: null });
      return;
    }

    const current = localLayout[slotName] as DisplayField | null;
    setLocalLayout({
      ...localLayout,
      [slotName]: {
        type: field.type ?? current?.type ?? 'text',
        value_path: field.value_path ?? current?.value_path ?? '',
        label: field.label !== undefined ? field.label : current?.label,
        max_value_path: field.max_value_path !== undefined ? field.max_value_path : current?.max_value_path,
        color: field.color ?? current?.color ?? '#00b400',
      },
    });
  };

  const renderSlotConfig = (slotName: keyof MiniatureLayout, title: string) => {
    const slot = localLayout[slotName] as DisplayField | null;
    const isEnabled = slot !== null;

    return (
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-zinc-300">{title}</h4>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs text-zinc-500">{t('miniature_layout.enable')}</span>
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={(e) => {
                if (e.target.checked) {
                  updateSlot(slotName, { type: 'text', value_path: columns[0]?.key || 'hp' });
                } else {
                  updateSlot(slotName, null);
                }
              }}
              className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500"
            />
          </label>
        </div>

        {isEnabled && (
          <div className="space-y-3 pt-2 border-t border-zinc-800/50">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs text-zinc-500 mb-1">{t('miniature_layout.field')}</label>
                <select
                  value={slot.value_path}
                  onChange={(e) => updateSlot(slotName, { value_path: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                >
                  {columns.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs text-zinc-500 mb-1">{t('miniature_layout.display_as')}</label>
                <select
                  value={slot.type}
                  onChange={(e) => updateSlot(slotName, { type: e.target.value as 'text' | 'bar' })}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="text">{t('miniature_layout.text_value')}</option>
                  <option value="bar">{t('miniature_layout.progress_bar')}</option>
                </select>
              </div>
            </div>

            {slot.type === 'bar' && (
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs text-zinc-500 mb-1">{t('miniature_layout.max_value_field')}</label>
                  <select
                    value={slot.max_value_path || ''}
                    onChange={(e) => updateSlot(slotName, { max_value_path: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">{t('miniature_layout.same_as_field_no_max')}</option>
                    {columns.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                    <option value="custom_max_hp">{t('miniature_layout.max_hp_custom')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">{t('miniature_layout.color')}</label>
                  <input
                    type="color"
                    value={slot.color || '#00b400'}
                    onChange={(e) => updateSlot(slotName, { color: e.target.value })}
                    className="w-8 h-8 rounded bg-zinc-900 border border-zinc-700 cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
          <h3 className="text-lg font-medium text-zinc-100">{t('modals.miniature_layout_config')}</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          <div className="flex items-center justify-between bg-zinc-950 p-4 rounded-xl border border-zinc-800">
            <div>
              <h4 className="font-medium text-zinc-200">{t('miniature_layout.show_portrait')}</h4>
              <p className="text-xs text-zinc-500">{t('miniature_layout.show_portrait_desc')}</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={localLayout.show_portrait}
                onChange={(e) => setLocalLayout({ ...localLayout, show_portrait: e.target.checked })}
              />
              <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {renderSlotConfig('top1', t('miniature_layout.slot_top_left_1'))}
            {renderSlotConfig('top2', t('miniature_layout.slot_top_right_2'))}
            {renderSlotConfig('bottom1', t('miniature_layout.slot_bottom_left_1'))}
            {renderSlotConfig('bottom2', t('miniature_layout.slot_bottom_right_2'))}
          </div>

          <div className="pt-4 border-t border-zinc-800 flex justify-end">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
            >
              <Save size={18} /> {isSaving ? t('miniature_layout.saving') : t('miniature_layout.save_layout')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
