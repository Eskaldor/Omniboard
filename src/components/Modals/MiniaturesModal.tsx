import React, { useState, useEffect, useMemo } from 'react';
import { X, Save, Plus, RefreshCw, Settings } from 'lucide-react';
import { ColumnConfig, LayoutProfile, DisplayField, BarProfileConfig } from '../../types';
import { useCombatState } from '../../contexts/CombatStateContext';
import { useTranslation } from 'react-i18next';
import { BarCustomizerModal, getBarDisplayName } from './BarCustomizerModal';

const SLOT_KEYS_SLOTS_ONLY = ['top1', 'top2', 'bottom1', 'bottom2', 'left1', 'right1'] as const;

function defaultProfile(id: string, name: string): LayoutProfile {
  return {
    id,
    name,
    frame_asset: 'default_frame.png',
    show_portrait: true,
    top1: null,
    top2: null,
    bottom1: null,
    bottom2: null,
    left1: null,
    right1: null,
    font_id: 'default.ttf',
    font_size: 18,
    bar_height: 16,
  };
}

/** Приводит данные с бэка (layout_profiles или старый layout) к списку LayoutProfile с id/name. */
function normalizeProfiles(state: { layout_profiles?: LayoutProfile[]; layout?: LayoutProfile } | null): LayoutProfile[] {
  if (!state) return [defaultProfile('default', 'Default')];
  if (state.layout_profiles && Array.isArray(state.layout_profiles) && state.layout_profiles.length > 0) {
    return state.layout_profiles.map((p) => ({
      ...defaultProfile(p.id ?? 'default', p.name ?? 'Default'),
      ...p,
      id: p.id ?? 'default',
      name: p.name ?? 'Default',
    }));
  }
  if (state.layout && typeof state.layout === 'object') {
    const old = state.layout as Record<string, unknown>;
    return [{
      ...defaultProfile('default', 'Default'),
      ...old,
      id: (old.id as string) ?? 'default',
      name: (old.name as string) ?? 'Default',
    } as LayoutProfile];
  }
  return [defaultProfile('default', 'Default')];
}

export function MiniaturesModal({
  columns,
  onClose,
}: {
  columns: ColumnConfig[];
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation('core', { useSuspense: false });
  const { state, refetchState } = useCombatState();
  const actors = state?.actors ?? [];
  const initialProfiles = normalizeProfiles(state ?? null);

  const [localProfiles, setLocalProfiles] = useState<LayoutProfile[]>(initialProfiles);
  const [selectedProfileId, setSelectedProfileId] = useState<string>(() => initialProfiles[0]?.id ?? 'default');
  const [isSaving, setIsSaving] = useState(false);
  const [previewActorId, setPreviewActorId] = useState<string>(() => actors[0]?.id ?? '');
  const [previewKey, setPreviewKey] = useState<number>(() => Date.now());
  const [availableFrames, setAvailableFrames] = useState<string[]>(['default_frame.png']);
  const [testEffects, setTestEffects] = useState<string[]>([]);
  const [availableEffects, setAvailableEffects] = useState<{ id: string; name?: string }[]>([]);
  const [isExpertMode, setIsExpertMode] = useState(false);
  const [availableFonts, setAvailableFonts] = useState<string[]>(['default.ttf']);
  const [availableBarProfiles, setAvailableBarProfiles] = useState<BarProfileConfig[]>([]);
  const [isBarForgeOpen, setIsBarForgeOpen] = useState(false);

  useEffect(() => {
    const system = state?.system || '';
    fetch(`/api/assets/frames?system=${encodeURIComponent(system)}`)
      .then((res) => res.json())
      .then((data: string[]) => {
        const filenames = (Array.isArray(data) ? data : []).map((path) => path.split('/').pop() || path);
        setAvailableFrames(Array.from(new Set([...filenames, 'default_frame.png'])));
      })
      .catch((err) => console.error('Failed to fetch frames', err));
    fetch(`/api/assets/fonts?system=${encodeURIComponent(system)}`)
      .then((res) => res.json())
      .then((data: string[]) => {
        const filenames = (Array.isArray(data) ? data : []).map((path) => path.split('/').pop() || path);
        setAvailableFonts(Array.from(new Set([...filenames, 'default.ttf'])));
      })
      .catch((err) => console.error('Failed to fetch fonts', err));
    fetch(`/api/assets/bars?system=${encodeURIComponent(system)}`)
      .then((res) => res.json())
      .then((data: BarProfileConfig[]) => setAvailableBarProfiles(Array.isArray(data) ? data : []))
      .catch((err) => {
        console.error('Failed to fetch bar profiles', err);
        setAvailableBarProfiles([]);
      });
  }, [state?.system]);

  useEffect(() => {
    const sys = state?.system || '';
    if (!sys) return;
    i18n.loadNamespaces(`systems/${sys}`).catch(() => {});
  }, [state?.system, i18n]);

  useEffect(() => {
    const system = state?.system || '';
    if (!system) {
      setAvailableEffects([]);
      return;
    }
    fetch(`/api/systems/${encodeURIComponent(system)}/effects`)
      .then((res) => res.json())
      .then((data: { id: string; name?: string }[]) => setAvailableEffects(Array.isArray(data) ? data : []))
      .catch((err) => {
        console.error('Failed to fetch effects', err);
        setAvailableEffects([]);
      });
  }, [state?.system]);

  useEffect(() => {
    const list = normalizeProfiles(state ?? null);
    setLocalProfiles(list);
    if (list.length > 0 && !list.some((p) => p.id === selectedProfileId)) {
      setSelectedProfileId(list[0].id);
    }
  }, [state?.layout_profiles, state?.layout]);

  useEffect(() => {
    if (actors.length === 0) {
      setPreviewActorId('');
      return;
    }
    const ids = new Set(actors.map((a) => a.id));
    if (!previewActorId || !ids.has(previewActorId)) {
      setPreviewActorId(actors[0].id);
    }
  }, [actors, previewActorId]);

  const selectedProfile = useMemo(
    () => localProfiles.find((p) => p.id === selectedProfileId) ?? localProfiles[0],
    [localProfiles, selectedProfileId]
  );

  const setSelectedProfile = (updates: Partial<LayoutProfile>) => {
    if (!selectedProfile) return;
    const next = { ...selectedProfile, ...updates };
    setLocalProfiles((prev) => prev.map((p) => (p.id === selectedProfileId ? next : p)));
  };

  const updateSlot = (slotName: typeof SLOT_KEYS_SLOTS_ONLY[number], field: Partial<DisplayField> | null) => {
    if (!selectedProfile) return;
    if (field === null) {
      setSelectedProfile({ [slotName]: null });
      return;
    }
    const current = selectedProfile[slotName] as DisplayField | null | undefined;
    setSelectedProfile({
      [slotName]: {
        type: field.type ?? current?.type ?? 'text',
        value_path: field.value_path ?? current?.value_path ?? '',
        label: field.label !== undefined ? field.label : current?.label,
        max_value_path: field.max_value_path !== undefined ? field.max_value_path : current?.max_value_path,
        color: field.color !== undefined ? field.color : current?.color,
        bar_bg_color: field.bar_bg_color !== undefined ? field.bar_bg_color : current?.bar_bg_color,
        show_text: field.show_text !== undefined ? field.show_text : (current as DisplayField)?.show_text ?? true,
        show_label: field.show_label !== undefined ? field.show_label : (current as DisplayField)?.show_label ?? true,
        show_max: field.show_max !== undefined ? field.show_max : (current as DisplayField)?.show_max ?? true,
        offset_x: field.offset_x !== undefined ? field.offset_x : (current as DisplayField)?.offset_x ?? 0,
        offset_y: field.offset_y !== undefined ? field.offset_y : (current as DisplayField)?.offset_y ?? 0,
        width: field.width !== undefined ? field.width : (current as DisplayField)?.width,
        height: field.height !== undefined ? field.height : (current as DisplayField)?.height,
        font_id: field.font_id !== undefined ? field.font_id : (current as DisplayField)?.font_id,
        font_size: field.font_size !== undefined ? field.font_size : (current as DisplayField)?.font_size,
        bar_style: field.bar_style !== undefined ? field.bar_style : (current as DisplayField)?.bar_style,
        rotation: field.rotation !== undefined ? field.rotation : (current as DisplayField)?.rotation ?? 0,
        theme_id: field.theme_id !== undefined ? field.theme_id : (current as DisplayField)?.theme_id,
      },
    });
  };

  const handleAddProfile = () => {
    const id = Date.now().toString();
    const newProfile = defaultProfile(id, t('miniature_layout.new_profile', { defaultValue: 'New profile' }));
    setLocalProfiles((prev) => [...prev, newProfile]);
    setSelectedProfileId(id);
  };

  const handleSave = async () => {
    if (!selectedProfile) return;
    setIsSaving(true);
    try {
      await fetch('/api/combat/layout', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedProfile),
      });
      await refetchState();
      onClose();
    } catch (err) {
      console.error('Failed to save layout', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAndRefreshPreview = async () => {
    if (!selectedProfile) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/combat/layout', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedProfile),
      });
      if (res.ok) {
        setPreviewKey(Date.now());
      }
    } catch (err) {
      console.error('Failed to save layout', err);
    } finally {
      setIsSaving(false);
    }
  };

  const renderSlotConfig = (slotName: typeof SLOT_KEYS_SLOTS_ONLY[number], title: string) => {
    const slot = (selectedProfile?.[slotName] ?? null) as DisplayField | null;
    const isEnabled = slot !== null && slot !== undefined;

    return (
      <div key={slotName} className={`bg-zinc-950 border rounded-xl p-4 space-y-3 transition-colors ${isEnabled ? 'border-emerald-500/40' : 'border-zinc-800'}`}>
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-medium text-zinc-300">{title}</h4>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={isEnabled}
              onChange={(e) => {
                if (e.target.checked) {
                  updateSlot(slotName, { type: 'text', value_path: columns[0]?.key || 'hp' });
                } else {
                  updateSlot(slotName, null);
                }
              }}
            />
            <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:border-gray-300 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500" />
            <span className={`ml-2 text-sm font-medium whitespace-nowrap ${isEnabled ? 'text-emerald-400' : 'text-zinc-500'}`}>
              {t('miniature_layout.enable')}
            </span>
          </label>
        </div>
        {!isEnabled && (
          <p className="text-xs text-zinc-500 italic">{t('miniature_layout.enable_hint', { defaultValue: 'Включите слот, чтобы настроить поле' })}</p>
        )}

        {isEnabled && slot && (
          <div className="space-y-3 pt-2 border-t border-zinc-800/50">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs text-zinc-500 mb-1">{t('miniature_layout.field')}</label>
                <select
                  value={slot.value_path}
                  onChange={(e) => updateSlot(slotName, { value_path: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="name">{t('actors.name', { defaultValue: 'Имя' })}</option>
                  <option value="initiative">{t('combat.initiative', { defaultValue: 'Инициатива' })}</option>
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
              <>
                <div className="flex flex-wrap gap-3 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={slot.show_text !== false}
                      onChange={(e) => updateSlot(slotName, { show_text: e.target.checked })}
                      className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500"
                    />
                    <span className="text-xs text-zinc-400">{t('miniature_layout.show_text', { defaultValue: 'Показывать текст' })}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={slot.show_label !== false}
                      onChange={(e) => updateSlot(slotName, { show_label: e.target.checked })}
                      className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500"
                    />
                    <span className="text-xs text-zinc-400">{t('miniature_layout.show_label', { defaultValue: 'Показывать ярлык (label)' })}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={slot.show_max !== false}
                      onChange={(e) => updateSlot(slotName, { show_max: e.target.checked })}
                      className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500"
                    />
                    <span className="text-xs text-zinc-400">{t('miniature_layout.show_max', { defaultValue: 'Показывать максимум' })}</span>
                  </label>
                </div>
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
                </div>
              </>
            )}

            {isEnabled && slot && isExpertMode && (
              <div className="pt-3 mt-3 border-t border-zinc-800/50 space-y-3">
                <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  {t('miniature_layout.fine_tuning', { defaultValue: 'Тонкая настройка' })}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">{t('miniature_layout.offset_x', { defaultValue: 'Сдвиг X' })}</label>
                    <input
                      type="number"
                      value={slot.offset_x ?? 0}
                      onChange={(e) => updateSlot(slotName, { offset_x: Number(e.target.value) || 0 })}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">{t('miniature_layout.offset_y', { defaultValue: 'Сдвиг Y' })}</label>
                    <input
                      type="number"
                      value={slot.offset_y ?? 0}
                      onChange={(e) => updateSlot(slotName, { offset_y: Number(e.target.value) || 0 })}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">{t('miniature_layout.width', { defaultValue: 'Шир. (px)' })}</label>
                    <input
                      type="number"
                      min={1}
                      value={slot.width ?? ''}
                      placeholder="—"
                      onChange={(e) => updateSlot(slotName, { width: e.target.value ? Number(e.target.value) : undefined })}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">{t('miniature_layout.height', { defaultValue: 'Высота (px)' })}</label>
                    <input
                      type="number"
                      min={1}
                      value={slot.height ?? ''}
                      placeholder="—"
                      onChange={(e) => updateSlot(slotName, { height: e.target.value ? Number(e.target.value) : undefined })}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">{t('miniature_layout.font_family', { defaultValue: 'Шрифт (файл)' })}</label>
                    <select
                      value={slot.font_id ?? ''}
                      onChange={(e) => updateSlot(slotName, { font_id: e.target.value || undefined })}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="">{t('miniature_layout.font_as_profile', { defaultValue: 'Как в профиле' })}</option>
                      {availableFonts.map((font) => (
                        <option key={font} value={font}>
                          {font}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">{t('miniature_layout.font_size', { defaultValue: 'Размер' })}</label>
                    <input
                      type="number"
                      min={8}
                      max={72}
                      value={slot.font_size ?? ''}
                      placeholder={String(selectedProfile?.font_size ?? 18)}
                      onChange={(e) => {
                        const v = e.target.value === '' ? undefined : Math.max(8, Math.min(72, Number(e.target.value) || 18));
                        updateSlot(slotName, { font_size: v });
                      }}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">{t('miniature_layout.rotation', { defaultValue: 'Поворот (Угол)' })}</label>
                    <select
                      value={slot.rotation ?? 0}
                      onChange={(e) => updateSlot(slotName, { rotation: Number(e.target.value) })}
                      className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                    >
                      <option value={0}>{t('miniature_layout.rot_0', { defaultValue: '0° (Горизонтально)' })}</option>
                      <option value={90}>{t('miniature_layout.rot_90', { defaultValue: '90° (Снизу вверх)' })}</option>
                      <option value={270}>{t('miniature_layout.rot_270', { defaultValue: '270° (Сверху вниз)' })}</option>
                    </select>
                  </div>
                </div>
                {slot.type === 'bar' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex-1 min-w-[120px]">
                      <label className="block text-xs text-zinc-500 mb-1">{t('miniature_layout.bar_style_profile', { defaultValue: 'Стиль бара (профиль)' })}</label>
                      <select
                        value={slot.theme_id ?? 'default'}
                        onChange={(e) => updateSlot(slotName, { theme_id: e.target.value || undefined })}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                      >
                        {availableBarProfiles.map((p) => (
                          <option key={p.id} value={p.id}>
                            {getBarDisplayName(i18n, state?.system ?? '', p.id, p.name || p.id)}
                          </option>
                        ))}
                        {availableBarProfiles.length === 0 && <option value="default">default</option>}
                      </select>
                    </div>
                    <div className="pt-6">
                      <button
                        type="button"
                        onClick={() => setIsBarForgeOpen(true)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg text-sm transition-colors"
                      >
                        <Settings size={14} /> {t('miniature_layout.bar_forge', { defaultValue: 'Конфигуратор шкал' })}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const slotTitles: Record<typeof SLOT_KEYS_SLOTS_ONLY[number], string> = {
    top1: t('miniature_layout.slot_top_left_1'),
    top2: t('miniature_layout.slot_top_right_2'),
    bottom1: t('miniature_layout.slot_bottom_left_1'),
    bottom2: t('miniature_layout.slot_bottom_right_2'),
    left1: t('miniature_layout.slot_left_1', { defaultValue: 'Слева (верт.)' }),
    right1: t('miniature_layout.slot_right_1', { defaultValue: 'Справа (верт.)' }),
  };

  return (
    <>
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-6xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
          <h3 className="text-lg font-medium text-zinc-100">{t('modals.miniature_layout_config')}</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 min-h-0">
          <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr_220px] gap-6">
            {/* Левая колонка: список профилей */}
            <div className="flex flex-col gap-2">
              <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                {t('miniature_layout.profiles', { defaultValue: 'Профили' })}
              </div>
              <ul className="space-y-1">
                {localProfiles.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedProfileId(p.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        selectedProfileId === p.id
                          ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/50'
                          : 'bg-zinc-800/50 text-zinc-300 hover:bg-zinc-700 border border-transparent'
                      }`}
                    >
                      {p.name || p.id}
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={handleAddProfile}
                className="flex items-center justify-center gap-2 py-2 mt-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors"
              >
                <Plus size={16} /> {t('miniature_layout.add_profile', { defaultValue: 'Добавить профиль' })}
              </button>
            </div>

            {/* Центральная колонка: настройки выбранного профиля */}
            <div className="flex flex-col gap-4 min-w-0">
              {selectedProfile && (
                <>
                  <div className="flex items-center justify-between bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                    <span className="text-sm font-medium text-zinc-200">
                      {t('miniature_layout.expert_mode', { defaultValue: 'Экспертный режим' })}
                    </span>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={isExpertMode}
                        onChange={(e) => setIsExpertMode(e.target.checked)}
                      />
                      <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:border-gray-300 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500" />
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">{t('miniature_layout.profile_name', { defaultValue: 'Название профиля' })}</label>
                      <input
                        type="text"
                        value={selectedProfile.name}
                        onChange={(e) => setSelectedProfile({ name: e.target.value })}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">{t('miniature_layout.frame_asset', { defaultValue: 'Рамка (файл)' })}</label>
                      <select
                        value={selectedProfile.frame_asset || 'default_frame.png'}
                        onChange={(e) => setSelectedProfile({ frame_asset: e.target.value })}
                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                      >
                        {availableFrames.map((frame) => (
                          <option key={frame} value={frame}>
                            {frame}
                          </option>
                        ))}
                      </select>
                    </div>
                    {isExpertMode && (
                      <>
                        <div>
                          <label className="block text-xs text-zinc-500 mb-1">{t('miniature_layout.font_family', { defaultValue: 'Шрифт (файл)' })}</label>
                          <select
                            value={selectedProfile.font_id || 'default.ttf'}
                            onChange={(e) => setSelectedProfile({ font_id: e.target.value })}
                            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                          >
                            {availableFonts.map((font) => (
                              <option key={font} value={font}>
                                {font}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-zinc-500 mb-1">{t('miniature_layout.font_size', { defaultValue: 'Размер шрифта' })}</label>
                          <input
                            type="number"
                            min={8}
                            max={72}
                            value={selectedProfile.font_size ?? 18}
                            onChange={(e) => setSelectedProfile({ font_size: Math.max(8, Math.min(72, Number(e.target.value) || 18)) })}
                            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex items-center justify-between bg-zinc-950 p-4 rounded-xl border border-zinc-800">
                    <div>
                      <h4 className="font-medium text-zinc-200">{t('miniature_layout.show_portrait')}</h4>
                      <p className="text-xs text-zinc-500">{t('miniature_layout.show_portrait_desc')}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={selectedProfile.show_portrait}
                        onChange={(e) => setSelectedProfile({ show_portrait: e.target.checked })}
                      />
                      <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500" />
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {SLOT_KEYS_SLOTS_ONLY.map((slotName) => renderSlotConfig(slotName, slotTitles[slotName]))}
                  </div>

                  <div className="pt-4 border-t border-zinc-800 flex flex-wrap gap-2">
                    <button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="flex items-center gap-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
                    >
                      <Save size={18} /> {isSaving ? t('miniature_layout.saving') : t('miniature_layout.save_layout')}
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Правая колонка: предпросмотр */}
            <div className="lg:border-l border-zinc-800 lg:pl-6 space-y-2">
              <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                {t('miniature_layout.preview_172_320', { defaultValue: 'Предпросмотр (172×320)' })}
              </div>
              {actors.length === 0 ? (
                <p className="text-sm text-zinc-500 py-4">
                  {t('miniature_layout.preview_no_actors', { defaultValue: 'Добавьте акторов в бой для предпросмотра' })}
                </p>
              ) : (
                <>
                  <select
                    value={previewActorId}
                    onChange={(e) => setPreviewActorId(e.target.value)}
                    className="w-full py-1.5 px-2 text-sm bg-zinc-950 border border-zinc-800 rounded hover:border-zinc-700 focus:border-emerald-500 focus:outline-none text-zinc-200"
                  >
                    {actors.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.layout_profile_id === selectedProfileId ? `✓ ${a.name}` : a.name}
                      </option>
                    ))}
                  </select>
                  <div className="w-[172px] h-[320px] bg-black border-2 border-gray-700 rounded-md overflow-hidden flex items-center justify-center relative mt-4">
                    <img
                      src={`/api/render/${previewActorId}?t=${previewKey}&profile_id=${encodeURIComponent(selectedProfileId)}${testEffects.length ? '&test_effects=' + encodeURIComponent(testEffects.join(',')) : ''}`}
                      alt="Preview"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>
                  <div className="mt-3">
                    <label className="block text-xs text-zinc-400 mb-1.5">
                      {t('miniature_layout.test_effects', { defaultValue: 'Effects' })}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {availableEffects.map((eff) => (
                        <label
                          key={eff.id}
                          className="inline-flex items-center gap-1.5 cursor-pointer text-sm text-zinc-300"
                        >
                          <input
                            type="checkbox"
                            checked={testEffects.includes(eff.id)}
                            onChange={() => {
                              setTestEffects((prev) =>
                                prev.includes(eff.id) ? prev.filter((id) => id !== eff.id) : [...prev, eff.id]
                              );
                            }}
                            className="rounded border-zinc-600 bg-zinc-900 text-emerald-500 focus:ring-emerald-500"
                          />
                          <span>{eff.name ?? eff.id}</span>
                        </label>
                      ))}
                      {availableEffects.length === 0 && (
                        <span className="text-xs text-zinc-500">{t('miniature_layout.no_effects', { defaultValue: 'Нет эффектов' })}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 mt-3">
                    <button
                      type="button"
                      onClick={handleSaveAndRefreshPreview}
                      disabled={isSaving}
                      className="w-full flex items-center justify-center gap-2 py-2 bg-zinc-700/50 text-zinc-300 hover:bg-zinc-600/50 disabled:opacity-50 rounded-lg text-sm transition-colors"
                    >
                      <RefreshCw size={16} /> {t('miniature_layout.refresh_preview', { defaultValue: 'Обновить превью' })}
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={isSaving}
                      className="w-full flex items-center justify-center gap-2 py-2 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 disabled:opacity-50 rounded-lg text-sm transition-colors"
                    >
                      <Save size={16} /> {t('miniature_layout.save_profile', { defaultValue: 'Сохранить профиль' })}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
    <BarCustomizerModal
      isOpen={isBarForgeOpen}
      onClose={() => {
        setIsBarForgeOpen(false);
        const system = state?.system || '';
        fetch(`/api/assets/bars?system=${encodeURIComponent(system)}`)
          .then((res) => res.json())
          .then((data: BarProfileConfig[]) => setAvailableBarProfiles(Array.isArray(data) ? data : []))
          .catch(() => setAvailableBarProfiles([]));
      }}
      system={state?.system ?? ''}
    />
    </>
  );
}
