import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { ColumnConfig } from '../../types';
import { useCombatState } from '../../contexts/CombatStateContext';
import { useTranslation } from 'react-i18next';
import { SystemTab } from './ConfigTabs/SystemTab';
import { ColumnsTab } from './ConfigTabs/ColumnsTab';
import { TableTab } from './ConfigTabs/TableTab';
import { LanguageTab } from './ConfigTabs/LanguageTab';

function usePatchCombatSettings(refetchState: () => Promise<void>) {
  return useCallback(
    async (payload: Record<string, unknown>) => {
      await fetch('/api/combat/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      await refetchState();
    },
    [refetchState],
  );
}

function usePatchLegend(refetchState: () => Promise<void>) {
  return useCallback(
    async (payload: Record<string, unknown>) => {
      await fetch('/api/combat/legend', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      await refetchState();
    },
    [refetchState],
  );
}

export function ConfigModal({
  columns,
  setColumns,
  systemName,
  onClose,
}: {
  columns: ColumnConfig[];
  setColumns: React.Dispatch<React.SetStateAction<ColumnConfig[]>>;
  systemName: string;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation('core', { useSuspense: false });
  const { state, refetchState } = useCombatState();
  const tableCentered = state?.display.table_centered !== false;
  const engineLocked = state?.initiative_engine_locked ?? false;

  const [languages, setLanguages] = useState<{ code: string; name: string; flag: string }[]>([]);
  const [localSystemName, setLocalSystemName] = useState(systemName);
  const [showPresets, setShowPresets] = useState(false);
  const [presets, setPresets] = useState<string[]>([]);
  const [expertMode, setExpertMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<{ variant: 'success' | 'error'; text: string } | null>(null);

  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'system' | 'columns' | 'table' | 'language'>('system');

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

  const changeLanguage = useCallback((code: string) => {
    i18n.changeLanguage(code);
    localStorage.setItem('omniboard_language', code);
  }, [i18n]);

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

  const applyCombatSystem = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setLocalSystemName(trimmed);
    try {
      await fetch('/api/combat/system', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system: trimmed }),
      });
      await refetchState();
    } catch (err) {
      console.error('Failed to set combat system', err);
    }
  }, [refetchState]);

  const commitSystemName = useCallback(() => {
    const trimmed = localSystemName.trim();
    if (trimmed) void applyCombatSystem(trimmed);
  }, [applyCombatSystem, localSystemName]);

  const applyEngineType = useCallback(async (engineType: string) => {
    if (engineLocked) return;
    try {
      await fetch('/api/combat/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engine_type: engineType }),
      });
      await refetchState();
    } catch (err) {
      console.error('Failed to set initiative engine', err);
    }
  }, [engineLocked, refetchState]);

  const toggleColumn = useCallback((key: string) => {
    setColumns((prev) => prev.map((c) => (c.key === key ? { ...c, showInTable: !c.showInTable } : c)));
  }, [setColumns]);

  const removeColumn = useCallback((key: string) => {
    setColumns((prev) => prev.filter((c) => c.key !== key));
  }, [setColumns]);

  const moveColumn = useCallback((index: number, dir: 'up' | 'down') => {
    setColumns((prev) => {
      const next = dir === 'up' ? index - 1 : index + 1;
      if (next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      [copy[index], copy[next]] = [copy[next], copy[index]];
      return copy;
    });
  }, [setColumns]);

  const updateColumn = useCallback((key: string, updates: Partial<ColumnConfig>) => {
    setColumns((prev) => prev.map((c) => (c.key === key ? { ...c, ...updates } : c)));
  }, [setColumns]);

  const onAddColumn = useCallback((key: string, label: string) => {
    const k = key.trim();
    const l = label.trim();
    if (!k || !l) return;
    setColumns((prev) => {
      if (prev.some((c) => c.key === k)) return prev;
      return [
        ...prev,
        {
          key: k,
          label: l,
          showInTable: true,
          type: 'number',
          width: '80px',
          log_changes: false,
          show_in_mini_sheet: false,
          is_advanced: false,
          is_readonly: false,
          is_rollable: false,
          roll_formula: undefined,
          computed_formula_id: undefined,
        },
      ];
    });
  }, [setColumns]);

  const loadPreset = useCallback(async (preset: string) => {
    setShowPresets(false);
    await applyCombatSystem(preset);
    try {
      const res = await fetch(`/api/systems/${encodeURIComponent(preset)}/columns`);
      const data = await res.json();
      if (data && Array.isArray(data) && data.length > 0) {
        setColumns(data);
      }
    } catch (err) {
      console.error('Failed to load preset columns', err);
    }
  }, [applyCombatSystem, setColumns]);

  const handleExport = useCallback(() => {
    const blob = new Blob([JSON.stringify(columns, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(localSystemName || systemName).replace(/[^a-z0-9]/gi, '_').toLowerCase()}_columns.json`;
    a.click();
  }, [columns, localSystemName, systemName]);

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string);
        setColumns(imported);
        setNotice(null);
      } catch {
        setNotice({ variant: 'error', text: t('config_modal.import_invalid_json') });
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [setColumns, t]);

  const handleSave = useCallback(async () => {
    const name = localSystemName.trim() || systemName;
    if (!name) return;
    const lang = (i18n.language || 'ru').split('-')[0];
    const columnsToSave = columns.map((c) => {
      const base = {
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
        show_tooltip: c.show_tooltip ?? false,
      };
      if (c.type === 'checkbox_group') {
        return {
          ...base,
          items: c.items ?? [],
          reset_policy: c.reset_policy ?? 'turn_start',
          display_style: c.display_style ?? 'badge',
        };
      }
      return base;
    });
    try {
      const res = await fetch(`/api/systems/${encodeURIComponent(name)}/columns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang, columns: columnsToSave }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detail = err.detail;
        const detailStr =
          typeof detail === 'string'
            ? detail
            : Array.isArray(detail)
              ? detail.map((d: { msg?: string }) => d.msg || JSON.stringify(d)).join('; ')
              : typeof detail === 'object' && detail !== null
                ? JSON.stringify(detail)
                : '';
        const text = detailStr
          ? t('config_modal.columns_save_error', { detail: detailStr })
          : t('config_modal.columns_save_error_status', { status: res.status });
        setNotice({ variant: 'error', text });
        return;
      }
      setNotice({ variant: 'success', text: t('config_modal.columns_saved') });
      setColumns(columnsToSave);
      const listRes = await fetch('/api/systems/list');
      const listData = await listRes.json().catch(() => []);
      setPresets(Array.isArray(listData) ? listData : []);
    } catch (err) {
      const text = t('config_modal.columns_save_network_error');
      setNotice({ variant: 'error', text });
      console.error(text, err);
    }
  }, [columns, i18n.language, labelDrafts, localSystemName, setColumns, systemName, t]);

  const inputClass =
    'py-1 px-2 text-sm bg-zinc-950 border border-zinc-800 rounded hover:border-zinc-700 focus:border-emerald-500 focus:outline-none text-zinc-200';

  const engineType = useMemo(() => (state?.core.engine_type ?? 'standard'), [state?.core.engine_type]);
  const stickyFirstColumn = state?.display.sticky_first_column !== false;
  const stickyLastColumn = state?.display.sticky_last_column !== false;
  const showGroupColors = state?.display.show_group_colors !== false;
  const showFactionColors = state?.display.show_faction_colors !== false;

  const patchCombatSettings = usePatchCombatSettings(refetchState);
  const patchLegend = usePatchLegend(refetchState);

  const onToggleTableCentered = useCallback(
    async (next: boolean) => {
      try {
        await patchCombatSettings({ table_centered: next });
      } catch (err) {
        console.error('Failed to toggle table centering', err);
      }
    },
    [patchCombatSettings],
  );

  const onToggleStickyFirstColumn = useCallback(
    async (next: boolean) => {
      try {
        await patchCombatSettings({ sticky_first_column: next });
      } catch (err) {
        console.error('Failed to set sticky first column', err);
      }
    },
    [patchCombatSettings],
  );

  const onToggleStickyLastColumn = useCallback(
    async (next: boolean) => {
      try {
        await patchCombatSettings({ sticky_last_column: next });
      } catch (err) {
        console.error('Failed to set sticky last column', err);
      }
    },
    [patchCombatSettings],
  );

  const onToggleShowGroupColors = useCallback(
    async (next: boolean) => {
      try {
        await patchLegend({ show_group_colors: next });
      } catch (err) {
        console.error('Failed to toggle group colors', err);
      }
    },
    [patchLegend],
  );

  const onToggleShowFactionColors = useCallback(
    async (next: boolean) => {
      try {
        await patchLegend({ show_faction_colors: next });
      } catch (err) {
        console.error('Failed to toggle faction colors', err);
      }
    },
    [patchLegend],
  );

  const tabs = useMemo(
    () =>
      [
        { id: 'system' as const, label: t('config_modal.tab_system') },
        { id: 'columns' as const, label: t('config_modal.tab_columns') },
        { id: 'table' as const, label: t('config_modal.tab_table') },
        { id: 'language' as const, label: t('config_modal.tab_language') },
      ] as const,
    [t],
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
          <h3 className="text-lg font-medium text-zinc-100">{t('modals.config')}</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100">
            <X size={20} />
          </button>
        </div>

        <div className="px-4 pt-3">
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                    isActive
                      ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-zinc-950/30 text-zinc-300 border-zinc-800 hover:bg-zinc-800/40'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-4 overflow-y-auto flex-1 min-h-0">
          {activeTab === 'system' && (
            <SystemTab
              inputClass={inputClass}
              localSystemName={localSystemName}
              setLocalSystemName={setLocalSystemName}
              commitSystemName={commitSystemName}
              showPresets={showPresets}
              setShowPresets={setShowPresets}
              presets={presets}
              loadPreset={loadPreset}
              applyCombatSystem={applyCombatSystem}
              engineLocked={engineLocked}
              engineType={engineType}
              applyEngineType={applyEngineType}
            />
          )}

          {activeTab === 'columns' && (
            <ColumnsTab
              inputClass={inputClass}
              columns={columns}
              expertMode={expertMode}
              setExpertMode={setExpertMode}
              labelDrafts={labelDrafts}
              setLabelDrafts={setLabelDrafts}
              updateColumn={updateColumn}
              toggleColumn={toggleColumn}
              removeColumn={removeColumn}
              moveColumn={moveColumn}
              onAddColumn={onAddColumn}
              handleExport={handleExport}
              fileInputRef={fileInputRef}
              handleImport={handleImport}
              handleSave={handleSave}
              notice={notice}
              setNotice={setNotice}
            />
          )}

          {activeTab === 'table' && (
            <TableTab
              tableCentered={tableCentered}
              onToggleTableCentered={onToggleTableCentered}
              stickyFirstColumn={stickyFirstColumn}
              onToggleStickyFirstColumn={onToggleStickyFirstColumn}
              stickyLastColumn={stickyLastColumn}
              onToggleStickyLastColumn={onToggleStickyLastColumn}
              showGroupColors={showGroupColors}
              onToggleShowGroupColors={onToggleShowGroupColors}
              showFactionColors={showFactionColors}
              onToggleShowFactionColors={onToggleShowFactionColors}
            />
          )}

          {activeTab === 'language' && (
            <LanguageTab
              languages={languages}
              currentLangCode={currentLangCode}
              currentLangFlag={currentLang?.flag ?? '🌐'}
              flagFontStyle={flagFontStyle}
              onChangeLanguage={changeLanguage}
            />
          )}
        </div>
      </div>
    </div>
  );
}
