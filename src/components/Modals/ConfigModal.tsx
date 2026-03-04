import React, { useState, useEffect } from 'react';
import { X, Save, Download, Upload, Trash2, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { ColumnConfig } from '../../types';
import { useCombatState } from '../../contexts/CombatStateContext';
import { useTranslation } from 'react-i18next';

export function ConfigModal({
  columns,
  setColumns,
  systemName,
  setSystemName,
  onClose,
}: {
  columns: ColumnConfig[];
  setColumns: (c: ColumnConfig[]) => void;
  systemName: string;
  setSystemName: (s: string) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation('core', { useSuspense: false });
  const { state } = useCombatState();
  const tableCentered = state?.table_centered !== false;

  const [languages, setLanguages] = useState<{ code: string; name: string; flag: string }[]>([]);
  const [showLangDropdown, setShowLangDropdown] = useState(false);
  const [localSystemName, setLocalSystemName] = useState(systemName);
  const [newKey, setNewKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [showPresets, setShowPresets] = useState(false);
  const [presets, setPresets] = useState<string[]>([]);
  const [expertMode, setExpertMode] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});

  const currentLangCode = (i18n.language || '').split('-')[0];

  useEffect(() => {
    const drafts: Record<string, string> = {};
    for (const col of columns) {
      const translated = i18n.t(`${col.key}.name`, {
        ns: `systems/${systemName}`,
        defaultValue: col.key,
      });
      drafts[col.key] = translated;
    }
    setLabelDrafts(drafts);
  }, [systemName, currentLangCode, columns]);

  useEffect(() => {
    setLocalSystemName(systemName);
  }, [systemName]);

  useEffect(() => {
    fetch('/api/locales/languages')
      .then((r) => r.json())
      .then(setLanguages)
      .catch(() => setLanguages([]));
  }, []);

  const changeLanguage = (code: string) => {
    i18n.changeLanguage(code);
    localStorage.setItem('omniboard_language', code);
    setShowLangDropdown(false);
  };

  const currentLang = languages.find((l) => l.code === currentLangCode);
  const flagFontStyle: React.CSSProperties = {
    fontFamily: '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif',
  };

  useEffect(() => {
    fetch('/api/systems/list')
      .then((res) => res.json())
      .then((data) => setPresets(Array.isArray(data) ? data : []))
      .catch(() => setPresets([]));
  }, []);

  const commitSystemName = () => {
    const trimmed = localSystemName.trim();
    if (trimmed) setSystemName(trimmed);
  };

  const toggleColumn = (key: string) => {
    setColumns(columns.map((c) => (c.key === key ? { ...c, showInTable: !c.showInTable } : c)));
  };

  const removeColumn = (key: string) => {
    setColumns(columns.filter((c) => c.key !== key));
  };

  const moveColumn = (index: number, dir: 'up' | 'down') => {
    const next = dir === 'up' ? index - 1 : index + 1;
    if (next < 0 || next >= columns.length) return;
    const copy = [...columns];
    [copy[index], copy[next]] = [copy[next], copy[index]];
    setColumns(copy);
  };

  const updateColumn = (key: string, updates: Partial<ColumnConfig>) => {
    setColumns(columns.map((c) => (c.key === key ? { ...c, ...updates } : c)));
  };

  const addColumn = () => {
    if (newKey && newLabel && !columns.find((c) => c.key === newKey)) {
      setColumns([
        ...columns,
        {
          key: newKey,
          label: newLabel,
          showInTable: true,
          type: 'number',
          width: '80px',
          log_changes: false,
          show_in_mini_sheet: false,
          is_advanced: false,
        },
      ]);
      setNewKey('');
      setNewLabel('');
    }
  };

  const loadPreset = async (preset: string) => {
    setSystemName(preset);
    setLocalSystemName(preset);
    setShowPresets(false);
    try {
      const res = await fetch(`/api/systems/${encodeURIComponent(preset)}/columns`);
      const data = await res.json();
      if (data && Array.isArray(data) && data.length > 0) {
        setColumns(data);
      }
    } catch (err) {
      console.error('Failed to load preset columns', err);
    }
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(columns, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(localSystemName || systemName).replace(/[^a-z0-9]/gi, '_').toLowerCase()}_columns.json`;
    a.click();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string);
        setColumns(imported);
      } catch (err) {
        alert('Invalid JSON file');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async () => {
    const name = localSystemName.trim() || systemName;
    if (!name) return;
    const lang = (i18n.language || 'ru').split('-')[0];
    const columnsToSave = columns.map((c) => ({
      ...c,
      label: labelDrafts[c.key] ?? c.label,
      type: c.type ?? 'number',
      width: c.width ?? '80px',
      min_value: c.min_value ?? undefined,
      max_value: c.max_value ?? undefined,
      min_key: c.min_key ?? undefined,
      max_key: c.max_key ?? c.maxKey ?? undefined,
      display_as_fraction: c.display_as_fraction ?? false,
      log_changes: c.log_changes ?? false,
      log_color: c.log_changes ? (c.log_color ?? undefined) : undefined,
      show_in_mini_sheet: c.show_in_mini_sheet ?? false,
      is_advanced: c.is_advanced ?? false,
    }));
    try {
      const res = await fetch(`/api/systems/${encodeURIComponent(name)}/columns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang, columns: columnsToSave }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detail = err.detail;
        const msg =
          typeof detail === 'string'
            ? detail
            : Array.isArray(detail)
              ? detail.map((d: { msg?: string }) => d.msg || JSON.stringify(d)).join('; ')
              : typeof detail === 'object' && detail !== null
                ? JSON.stringify(detail)
                : `Ошибка сохранения: ${res.status}`;
        alert(msg);
        return;
      }
      alert('Columns saved to system!');
      setColumns(columnsToSave);
      const listRes = await fetch('/api/systems/list');
      const listData = await listRes.json().catch(() => []);
      setPresets(Array.isArray(listData) ? listData : []);
    } catch (err) {
      console.error('Failed to save columns', err);
      alert('Не удалось сохранить. Проверьте консоль.');
    }
  };

  const inputClass =
    'py-1 px-2 text-sm bg-zinc-950 border border-zinc-800 rounded hover:border-zinc-700 focus:border-emerald-500 focus:outline-none text-zinc-200';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
          <div className="relative flex items-center gap-1">
            <input
              type="text"
              value={localSystemName}
              onChange={(e) => setLocalSystemName(e.target.value)}
              onBlur={commitSystemName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                  commitSystemName();
                }
              }}
              className="bg-transparent text-lg font-medium text-zinc-100 border-none outline-none min-w-[8rem] placeholder-zinc-500"
              placeholder={t('config_modal.system_name')}
            />
            <button
              onClick={() => setShowPresets(!showPresets)}
              className="p-1 text-zinc-400 hover:text-emerald-400 transition-colors"
              title={t('config_modal.load_preset')}
            >
              <ChevronDown size={16} className={`transition-transform ${showPresets ? 'rotate-180' : ''}`} />
            </button>

            {showPresets && (
              <div className="absolute top-full left-0 mt-2 w-48 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl overflow-hidden z-10">
                <div className="px-3 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider bg-zinc-900/50">
                  {t('config_modal.saved_systems')}
                </div>
                {presets.length === 0 ? (
                  <div className="px-4 py-2 text-sm text-zinc-500">{t('config_modal.no_systems_yet')}</div>
                ) : (
                  presets.map((p) => (
                    <button
                      key={p}
                      onClick={() => loadPreset(p)}
                      className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
                    >
                      {p}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-1">
          <div className="relative mb-4">
            <button
              type="button"
              onClick={() => setShowLangDropdown(!showLangDropdown)}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm font-medium text-zinc-200 flex items-center gap-2"
            >
              {t('language')}
              <span className="text-lg inline-block min-w-[1.5rem] text-center" style={flagFontStyle} role="img" aria-hidden>
                {currentLang?.flag ?? '🌐'}
              </span>
            </button>
            {showLangDropdown && (
              <div className="absolute top-full left-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 min-w-[160px]">
                {languages.map((lang) => (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => changeLanguage(lang.code)}
                    className={`w-full px-4 py-2 text-left hover:bg-zinc-700 flex items-center gap-2 text-sm ${
                      currentLangCode === lang.code ? 'text-emerald-400 font-semibold' : 'text-zinc-200'
                    }`}
                  >
                    <span className="text-lg inline-block min-w-[1.5rem] text-center" style={flagFontStyle} role="img" aria-hidden>
                      {lang.flag}
                    </span>
                    {lang.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between py-2 mb-2 border-b border-zinc-800/50">
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{t('config_modal.table')}</span>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-sm text-zinc-300">{t('config_modal.center_table')}</span>
              <input
                type="checkbox"
                checked={tableCentered}
                onChange={async (e) => {
                  const next = e.target.checked;
                  try {
                    await fetch('/api/combat/settings', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ table_centered: next }),
                    });
                  } catch (err) {
                    console.error('Failed to toggle table centering', err);
                  }
                }}
                className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-900"
              />
            </label>
          </div>

          <div className="flex items-center justify-between py-2 mb-2 border-b border-zinc-800/50">
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              {t('config_modal.column_mode', { defaultValue: 'Column config' })}
            </span>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-sm text-zinc-400">{t('config_modal.simple_mode', { defaultValue: 'Simple' })}</span>
              <input
                type="checkbox"
                checked={expertMode}
                onChange={(e) => setExpertMode(e.target.checked)}
                className="sr-only peer"
              />
              <div className="relative w-10 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:border-zinc-300 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500" />
              <span className="text-sm text-zinc-300">{t('config_modal.expert_mode', { defaultValue: 'Expert' })}</span>
            </label>
          </div>

          <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">{t('config_modal.fields_columns')}</div>
          {columns.map((col, index) => (
            <div key={col.key} className="py-3 border-b border-zinc-800/50 last:border-0 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex flex-col shrink-0">
                  <button
                    type="button"
                    onClick={() => moveColumn(index, 'up')}
                    disabled={index === 0}
                    className="p-0.5 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed"
                    title={t('config_modal.move_up')}
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveColumn(index, 'down')}
                    disabled={index === columns.length - 1}
                    className="p-0.5 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed"
                    title={t('config_modal.move_down')}
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
                <input
                  type="text"
                  value={labelDrafts[col.key] ?? col.label}
                  onChange={(e) => {
                    const v = e.target.value;
                    setLabelDrafts((prev) => ({ ...prev, [col.key]: v }));
                  }}
                  placeholder={t('config_modal.label_placeholder')}
                  className={`${inputClass} w-24 min-w-0 flex-1 max-w-[120px]`}
                />
                <select
                  value={col.type ?? 'number'}
                  onChange={(e) => updateColumn(col.key, { type: e.target.value as 'number' | 'text' | 'string' })}
                  className={`${inputClass} w-20 min-w-0 max-w-[100px]`}
                >
                  <option value="number">{t('config_modal.type_number', { defaultValue: 'Number' })}</option>
                  <option value="text">{t('config_modal.type_text', { defaultValue: 'Text' })}</option>
                  <option value="string">{t('config_modal.type_string', { defaultValue: 'String' })}</option>
                </select>
                <input
                  type="text"
                  value={col.key}
                  onChange={(e) => updateColumn(col.key, { key: e.target.value })}
                  placeholder={t('config_modal.key_placeholder')}
                  className={`${inputClass} w-20 min-w-0 font-mono max-w-[100px]`}
                />
                <input
                  type="text"
                  value={col.group ?? ''}
                  onChange={(e) => updateColumn(col.key, { group: e.target.value.trim() || undefined })}
                  placeholder={t('config_modal.group_placeholder_column')}
                  className={`${inputClass} w-20 min-w-0 flex-1 max-w-[100px]`}
                />
                <input
                  type="text"
                  value={col.width ?? '80px'}
                  onChange={(e) => updateColumn(col.key, { width: e.target.value.trim() || '80px' })}
                  placeholder="80px"
                  className={`${inputClass} w-16 min-w-0 font-mono max-w-[80px]`}
                  title={t('config_modal.width', { defaultValue: 'Width' })}
                />
                <div className="flex items-center gap-1 shrink-0 w-16 justify-center">
                  <input
                    type="checkbox"
                    checked={col.showInTable}
                    onChange={() => toggleColumn(col.key)}
                    className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-900"
                    title={t('config_modal.show_in_table')}
                  />
                  <button
                    type="button"
                    onClick={() => removeColumn(col.key)}
                    className="p-1 text-zinc-600 hover:text-red-400 transition-colors"
                    title={t('config_modal.remove_field')}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {expertMode && (
                <div className="pl-8 flex flex-wrap items-center gap-4 text-sm">
                  <div className="flex flex-col gap-1">
                    <span className="text-zinc-500 text-xs">{t('config_modal.min_value', { defaultValue: 'Min' })}</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={col.min_key ?? ''}
                        onChange={(e) => updateColumn(col.key, { min_key: e.target.value.trim() || undefined })}
                        placeholder={t('config_modal.min_key_placeholder', { defaultValue: 'Key (e.g. min_hp)' })}
                        className={`${inputClass} w-24 font-mono`}
                      />
                      <input
                        type="number"
                        value={col.min_value ?? ''}
                        onChange={(e) =>
                          updateColumn(col.key, {
                            min_value: e.target.value === '' ? undefined : parseInt(e.target.value, 10) || undefined,
                          })
                        }
                        placeholder={t('config_modal.static_limit', { defaultValue: 'Static' })}
                        className={`${inputClass} w-16`}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-zinc-500 text-xs">{t('config_modal.max_value', { defaultValue: 'Max' })}</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={col.max_key ?? col.maxKey ?? ''}
                        onChange={(e) => updateColumn(col.key, { max_key: e.target.value.trim() || undefined })}
                        placeholder={t('config_modal.max_key_placeholder', { defaultValue: 'Key (e.g. max_hp)' })}
                        className={`${inputClass} w-24 font-mono`}
                      />
                      <input
                        type="number"
                        value={col.max_value ?? ''}
                        onChange={(e) =>
                          updateColumn(col.key, {
                            max_value: e.target.value === '' ? undefined : parseInt(e.target.value, 10) || undefined,
                          })
                        }
                        placeholder={t('config_modal.static_limit', { defaultValue: 'Static' })}
                        className={`${inputClass} w-16`}
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={col.display_as_fraction ?? false}
                      onChange={(e) => updateColumn(col.key, { display_as_fraction: e.target.checked })}
                      className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-900"
                    />
                    <span className="text-zinc-400">
                      {t('config_modal.display_as_fraction', { defaultValue: 'Display as fraction (e.g., Current / Max)' })}
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={col.show_in_mini_sheet ?? false}
                      onChange={(e) => updateColumn(col.key, { show_in_mini_sheet: e.target.checked })}
                      className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-900"
                    />
                    <span className="text-zinc-400">{t('config_modal.show_in_mini_sheet', { defaultValue: 'Mini sheet' })}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={col.is_advanced ?? false}
                      onChange={(e) => updateColumn(col.key, { is_advanced: e.target.checked })}
                      className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-900"
                    />
                    <span className="text-zinc-400">
                      {t('config_modal.is_advanced', { defaultValue: 'Advanced (hidden from players)' })}
                    </span>
                  </label>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={col.log_changes ?? false}
                        onChange={(e) => updateColumn(col.key, { log_changes: e.target.checked })}
                        className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-900"
                      />
                      <span className="text-zinc-400">{t('config_modal.log_changes', { defaultValue: 'Log changes' })}</span>
                    </label>
                    {(col.log_changes ?? false) && (
                      <input
                        type="color"
                        value={col.log_color ?? '#eab308'}
                        onChange={(e) => updateColumn(col.key, { log_color: e.target.value })}
                        className="w-8 h-7 rounded bg-zinc-800 border border-zinc-700 cursor-pointer"
                        title={t('config_modal.log_color', { defaultValue: 'Log color' })}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          <div className="flex items-center gap-2 py-2 mt-2 border-t border-zinc-800">
            <span className="text-xs text-zinc-500 shrink-0">{t('config_modal.add_field')}:</span>
            <input
              type="text"
              placeholder={t('config_modal.label_placeholder')}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className={`${inputClass} w-28`}
            />
            <input
              type="text"
              placeholder={t('config_modal.key_placeholder')}
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              className={`${inputClass} w-24 font-mono`}
            />
            <button
              onClick={addColumn}
              disabled={!newKey || !newLabel}
              className="p-1.5 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors flex items-center justify-center"
              title={t('config_modal.add_column')}
            >
              <Plus size={16} />
            </button>
          </div>

          <div className="flex gap-2 pt-4 border-t border-zinc-800 mt-2">
            <button
              onClick={handleExport}
              className="flex-1 flex items-center justify-center gap-2 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs transition-colors"
            >
              <Download size={14} /> {t('config_modal.export')}
            </button>
            <input type="file" ref={fileInputRef} onChange={handleImport} className="hidden" accept=".json" />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-2 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs transition-colors"
            >
              <Upload size={14} /> {t('config_modal.import')}
            </button>
            <button
              onClick={handleSave}
              className="flex-1 flex items-center justify-center gap-2 py-2 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 rounded-lg text-xs transition-colors"
            >
              <Save size={14} /> {t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
