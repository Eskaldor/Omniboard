import React, { useState, useEffect } from 'react';
import { X, Save, Download, Upload, Trash2, Plus, ChevronDown, ChevronUp, Check, Search, Swords } from 'lucide-react';
import { Actor, ColumnConfig, Effect, MiniatureLayout, DisplayField } from '../types';
import { slugify } from 'transliteration';

export function MiniaturesModal({ 
  layout, columns, onClose 
}: { 
  layout: MiniatureLayout, columns: ColumnConfig[], onClose: () => void 
}) {
  const [localLayout, setLocalLayout] = useState<MiniatureLayout>(layout);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await fetch('/api/combat/layout', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(localLayout)
      });
      onClose();
    } catch (err) {
      console.error("Failed to save layout", err);
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
        color: field.color ?? current?.color ?? '#00b400'
      }
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
            <span className="text-xs text-zinc-500">Enable</span>
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
                <label className="block text-xs text-zinc-500 mb-1">Field</label>
                <select 
                  value={slot.value_path}
                  onChange={(e) => updateSlot(slotName, { value_path: e.target.value })}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                >
                  {columns.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs text-zinc-500 mb-1">Display As</label>
                <select 
                  value={slot.type}
                  onChange={(e) => updateSlot(slotName, { type: e.target.value as 'text' | 'bar' })}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="text">Text Value</option>
                  <option value="bar">Progress Bar</option>
                </select>
              </div>
            </div>

            {slot.type === 'bar' && (
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs text-zinc-500 mb-1">Max Value Field</label>
                  <select 
                    value={slot.max_value_path || ''}
                    onChange={(e) => updateSlot(slotName, { max_value_path: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">Same as Field (No Max)</option>
                    {columns.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                    <option value="custom_max_hp">max_hp (Custom)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Color</label>
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
          <h3 className="text-lg font-medium text-zinc-100">Miniature Layout Config</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100"><X size={20} /></button>
        </div>
        
        <div className="p-6 overflow-y-auto space-y-6">
          <div className="flex items-center justify-between bg-zinc-950 p-4 rounded-xl border border-zinc-800">
            <div>
              <h4 className="font-medium text-zinc-200">Show Portrait</h4>
              <p className="text-xs text-zinc-500">Display the actor's portrait on the miniature screen.</p>
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
            {renderSlotConfig('top1', 'Top Left (1)')}
            {renderSlotConfig('top2', 'Top Right (2)')}
            {renderSlotConfig('bottom1', 'Bottom Left (1)')}
            {renderSlotConfig('bottom2', 'Bottom Right (2)')}
          </div>

          <div className="pt-4 border-t border-zinc-800 flex justify-end">
            <button 
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
            >
              <Save size={18} /> {isSaving ? 'Saving...' : 'Save Layout'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MiniSheetModal({ 
  actor, columns, systemName, onClose, onUpdate, onPortraitClick 
}: { 
  actor: Actor, columns: ColumnConfig[], systemName: string, onClose: () => void, onUpdate?: (id: string, field: string, value: any) => void, onPortraitClick?: () => void 
}) {
  const [localName, setLocalName] = useState(actor.name);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalName(actor.name);
  }, [actor.name]);

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(actor, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${actor.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`;
    a.click();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string);
        const { id, ...updates } = imported;
        if (onUpdate) {
          // Send a PATCH request with all imported fields except ID
          await fetch(`/api/actors/${actor.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
          });
        }
      } catch (err) {
        alert('Invalid JSON file');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSaveToRoster = async () => {
    try {
      await fetch(`/api/systems/${encodeURIComponent(systemName)}/actors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(actor)
      });
      alert('Actor saved to roster!');
    } catch (err) {
      console.error('Failed to save actor', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
          <div className="flex items-center gap-2">
            <span className="text-zinc-500 font-medium">Mini-Sheet:</span>
            <input 
              type="text"
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              onBlur={() => onUpdate && onUpdate(actor.id, 'name', localName)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              autoFocus
              className="bg-transparent border-b border-dashed border-zinc-600 hover:border-zinc-400 focus:border-emerald-500 focus:outline-none text-lg font-medium text-zinc-100 px-1 w-48 transition-colors"
            />
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-6">
          <div className="flex gap-4 items-start">
            <div onClick={onPortraitClick} className="cursor-pointer group relative">
              <img src={actor.portrait} alt={actor.name} className="w-24 h-24 rounded-xl object-cover border border-zinc-700 group-hover:opacity-80 transition-opacity" referrerPolicy="no-referrer" />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="bg-black/70 text-white text-xs px-2 py-1 rounded">Change</span>
              </div>
            </div>
            <div className="flex-1 space-y-2">
              <div className="text-sm text-zinc-400">Role: <span className="text-zinc-200 capitalize">{actor.role}</span></div>
              <div className="text-sm text-zinc-400">Initiative: <span className="text-zinc-200">{actor.initiative}</span></div>
            </div>
          </div>
          
          <div>
            <h4 className="text-sm font-medium text-zinc-500 uppercase tracking-wider mb-3">All Stats</h4>
            <div className="grid grid-cols-2 gap-3">
              {columns.map(col => (
                <div key={col.key} className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 flex justify-between items-center">
                  <span className="text-sm text-zinc-400">{col.label}</span>
                  <span className="font-mono text-zinc-200">{actor.stats[col.key] || 0}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-4 border-t border-zinc-800">
            <button onClick={handleExport} className="flex-1 flex items-center justify-center gap-2 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs transition-colors">
              <Download size={14} /> Export
            </button>
            <input type="file" ref={fileInputRef} onChange={handleImport} className="hidden" accept=".json" />
            <button onClick={() => fileInputRef.current?.click()} className="flex-1 flex items-center justify-center gap-2 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs transition-colors">
              <Upload size={14} /> Import
            </button>
            <button onClick={handleSaveToRoster} className="flex-1 flex items-center justify-center gap-2 py-2 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 rounded-lg text-xs transition-colors">
              <Save size={14} /> Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ConfigModal({ 
  columns, setColumns, 
  systemName, setSystemName,
  onClose 
}: { 
  columns: ColumnConfig[], setColumns: (c: ColumnConfig[]) => void, 
  systemName: string, setSystemName: (s: string) => void,
  onClose: () => void 
}) {
  const [localSystemName, setLocalSystemName] = useState(systemName);
  const [newKey, setNewKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [showPresets, setShowPresets] = useState(false);
  const [presets, setPresets] = useState<string[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalSystemName(systemName);
  }, [systemName]);

  useEffect(() => {
    fetch('/api/systems/list')
      .then(res => res.json())
      .then(data => setPresets(Array.isArray(data) ? data : []))
      .catch(() => setPresets([]));
  }, []);

  const commitSystemName = () => {
    const trimmed = localSystemName.trim();
    if (trimmed) setSystemName(trimmed);
  };

  const toggleColumn = (key: string) => {
    setColumns(columns.map(c => c.key === key ? { ...c, showInTable: !c.showInTable } : c));
  };

  const removeColumn = (key: string) => {
    setColumns(columns.filter(c => c.key !== key));
  };

  const moveColumn = (index: number, dir: 'up' | 'down') => {
    const next = dir === 'up' ? index - 1 : index + 1;
    if (next < 0 || next >= columns.length) return;
    const copy = [...columns];
    [copy[index], copy[next]] = [copy[next], copy[index]];
    setColumns(copy);
  };

  const updateColumn = (key: string, updates: Partial<ColumnConfig>) => {
    setColumns(columns.map(c => c.key === key ? { ...c, ...updates } : c));
  };

  const addColumn = () => {
    if (newKey && newLabel && !columns.find(c => c.key === newKey)) {
      setColumns([...columns, { key: newKey, label: newLabel, showInTable: true }]);
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
      console.error("Failed to load preset columns", err);
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
    try {
      const res = await fetch(`/api/systems/${encodeURIComponent(name)}/columns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(columns)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detail = err.detail;
        const msg = typeof detail === 'string'
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
      // Refresh saved systems list so the new system appears in the dropdown
      const listRes = await fetch('/api/systems/list');
      const listData = await listRes.json().catch(() => []);
      setPresets(Array.isArray(listData) ? listData : []);
    } catch (err) {
      console.error('Failed to save columns', err);
      alert('Не удалось сохранить. Проверьте консоль.');
    }
  };

  const inputClass = "py-1 px-2 text-sm bg-zinc-950 border border-zinc-800 rounded hover:border-zinc-700 focus:border-emerald-500 focus:outline-none text-zinc-200";

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
              placeholder="System name"
            />
            <button
              onClick={() => setShowPresets(!showPresets)}
              className="p-1 text-zinc-400 hover:text-emerald-400 transition-colors"
              title="Load preset"
            >
              <ChevronDown size={16} className={`transition-transform ${showPresets ? 'rotate-180' : ''}`} />
            </button>

            {showPresets && (
              <div className="absolute top-full left-0 mt-2 w-48 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl overflow-hidden z-10">
                <div className="px-3 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider bg-zinc-900/50">Saved systems</div>
                {presets.length === 0 ? (
                  <div className="px-4 py-2 text-sm text-zinc-500">No systems yet</div>
                ) : (
                  presets.map(p => (
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
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100"><X size={20} /></button>
        </div>
        
        <div className="p-4 overflow-y-auto space-y-1">
          <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Fields / Columns</div>
          {columns.map((col, index) => (
            <div key={col.key} className="flex items-center gap-2 py-1.5 border-b border-zinc-800/50 last:border-0">
              <div className="flex flex-col shrink-0">
                <button
                  type="button"
                  onClick={() => moveColumn(index, 'up')}
                  disabled={index === 0}
                  className="p-0.5 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Move up"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => moveColumn(index, 'down')}
                  disabled={index === columns.length - 1}
                  className="p-0.5 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Move down"
                >
                  <ChevronDown size={14} />
                </button>
              </div>
              <input
                type="text"
                value={col.label}
                onChange={(e) => updateColumn(col.key, { label: e.target.value })}
                placeholder="Label"
                className={`${inputClass} w-24 min-w-0 flex-1 max-w-[120px]`}
              />
              <input
                type="text"
                value={col.key}
                onChange={(e) => updateColumn(col.key, { key: e.target.value })}
                placeholder="Key"
                className={`${inputClass} w-20 min-w-0 font-mono max-w-[100px]`}
              />
              <input
                type="text"
                value={col.group ?? ''}
                onChange={(e) => updateColumn(col.key, { group: e.target.value.trim() || undefined })}
                placeholder="Group"
                className={`${inputClass} w-20 min-w-0 flex-1 max-w-[100px]`}
              />
              <input
                type="text"
                value={col.maxKey ?? ''}
                onChange={(e) => updateColumn(col.key, { maxKey: e.target.value.trim() || undefined })}
                placeholder="Max key"
                className={`${inputClass} w-20 min-w-0 font-mono max-w-[100px]`}
              />
              <div className="flex items-center gap-1 shrink-0 w-16 justify-center">
                <input
                  type="checkbox"
                  checked={col.showInTable}
                  onChange={() => toggleColumn(col.key)}
                  className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-900"
                  title="Show in table"
                />
                <button
                  type="button"
                  onClick={() => removeColumn(col.key)}
                  className="p-1 text-zinc-600 hover:text-red-400 transition-colors"
                  title="Remove field"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}

          <div className="flex items-center gap-2 py-2 mt-2 border-t border-zinc-800">
            <span className="text-xs text-zinc-500 shrink-0">Add field:</span>
            <input
              type="text"
              placeholder="Label"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              className={`${inputClass} w-28`}
            />
            <input
              type="text"
              placeholder="Key"
              value={newKey}
              onChange={e => setNewKey(e.target.value)}
              className={`${inputClass} w-24 font-mono`}
            />
            <button
              onClick={addColumn}
              disabled={!newKey || !newLabel}
              className="p-1.5 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors flex items-center justify-center"
              title="Add column"
            >
              <Plus size={16} />
            </button>
          </div>

          <div className="flex gap-2 pt-4 border-t border-zinc-800 mt-2">
            <button onClick={handleExport} className="flex-1 flex items-center justify-center gap-2 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs transition-colors">
              <Download size={14} /> Export
            </button>
            <input type="file" ref={fileInputRef} onChange={handleImport} className="hidden" accept=".json" />
            <button onClick={() => fileInputRef.current?.click()} className="flex-1 flex items-center justify-center gap-2 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs transition-colors">
              <Upload size={14} /> Import
            </button>
            <button onClick={handleSave} className="flex-1 flex items-center justify-center gap-2 py-2 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 rounded-lg text-xs transition-colors">
              <Save size={14} /> Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AddEffectModal({ 
  actor, systemName, onClose, onAdd 
}: { 
  actor: Actor, systemName: string, onClose: () => void, onAdd: (effect: Effect) => void 
}) {
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
      .then(res => res.json())
      .then(data => setSystemEffects(data))
      .catch(err => console.error("Failed to load system effects", err));
  }, [systemName]);

  const handleSelectEffect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);
    const selected = systemEffects.find(eff => eff.name === val);
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
      show_on_miniature: showOnMiniature
    };
    
    try {
      await fetch(`/api/systems/${encodeURIComponent(systemName)}/effects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEffect)
      });
      setIsSavedToSystem(true);
      setTimeout(() => setIsSavedToSystem(false), 2000);
    } catch (err) {
      console.error("Failed to save effect to system", err);
    }
  };

  const handleAdd = () => {
    if (!name || !technicalId) return;
    onAdd({
      id: technicalId,
      name,
      description,
      duration: isInfinite ? null : (duration === '' ? 1 : duration),
      show_on_miniature: showOnMiniature
    });
  };

  const isCustom = name && !systemEffects.some(e => e.name === name);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
          <h3 className="text-lg font-medium text-zinc-100">Add Effect to {actor.name}</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100"><X size={20} /></button>
        </div>
        
        <div className="p-6 space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Display Name</label>
              <div className="relative">
                <input 
                  type="text" 
                  value={name}
                  onChange={handleSelectEffect}
                  placeholder="Type or select effect..."
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
                  list="effect-suggestions"
                />
                <datalist id="effect-suggestions">
                  {systemEffects.map(eff => (
                    <option key={eff.id} value={eff.name} />
                  ))}
                </datalist>
              </div>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Technical ID</label>
              <input 
                type="text" 
                value={technicalId}
                onChange={handleTechnicalIdChange}
                placeholder="e.g. v_plenu"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Description</label>
            <textarea 
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Effect details..."
              rows={3}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500 resize-none"
            />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Duration (Rounds)</label>
              <input 
                type="number" 
                value={duration}
                onChange={e => setDuration(parseInt(e.target.value) || '')}
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
                  onChange={e => setIsInfinite(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-900"
                />
                <span className="text-sm text-zinc-300">Infinite</span>
              </label>
            </div>
          </div>

          <div className="pt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="checkbox" 
                checked={showOnMiniature}
                onChange={e => setShowOnMiniature(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-900"
              />
              <span className="text-sm text-zinc-300">Show on Miniature</span>
            </label>
          </div>

          <div className="flex gap-3 pt-4 border-t border-zinc-800 items-center justify-between">
            {isCustom ? (
              <button 
                onClick={handleSaveToSystem}
                className="flex items-center gap-1 text-xs text-zinc-400 hover:text-emerald-400 transition-colors"
                title="Save this effect to the system JSON for future use"
              >
                {isSavedToSystem ? <Check size={14} className="text-emerald-500" /> : <Save size={14} />}
                {isSavedToSystem ? 'Saved!' : 'Save to System'}
              </button>
            ) : <div></div>}
            
            <button 
              onClick={handleAdd}
              disabled={!name || !technicalId}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Add Effect
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LibraryModal({ onClose, onSelect, systemName }: { onClose: () => void, onSelect?: (url: string) => void, systemName: string }) {
  const [activeTab, setActiveTab] = useState<'portraits' | 'frames' | 'effects'>('portraits');
  const [assets, setAssets] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [technicalId, setTechnicalId] = useState('');
  const [isCustomId, setIsCustomId] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const fetchAssets = () => {
    fetch(`/api/assets/${activeTab}?system=${encodeURIComponent(systemName)}`)
      .then(res => res.json())
      .then(data => setAssets(data))
      .catch(err => console.error("Failed to fetch assets", err));
  };

  useEffect(() => {
    fetchAssets();
  }, [activeTab, systemName]);

  const handleDisplayNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDisplayName(val);
    if (!isCustomId) {
      setTechnicalId(slugify(val, { separator: '_' }));
    }
  };

  const handleTechnicalIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTechnicalId(e.target.value);
    setIsCustomId(true);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    
    if (technicalId) {
      const ext = file.name.split('.').pop();
      const newFile = new File([file], `${technicalId}.${ext}`, { type: file.type });
      formData.append('file', newFile);
    } else {
      formData.append('file', file);
    }

    setIsUploading(true);
    try {
      await fetch(`/api/assets/${activeTab}?system=${encodeURIComponent(systemName)}`, {
        method: 'POST',
        body: formData
      });
      fetchAssets();
      setDisplayName('');
      setTechnicalId('');
      setIsCustomId(false);
    } catch (err) {
      console.error("Upload failed", err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (url: string) => {
    if (!confirm('Delete this asset?')) return;
    const filename = url.split('/').pop();
    const isDefault = url.includes('/assets/default/');
    const queryParam = isDefault ? '' : `?system=${encodeURIComponent(systemName)}`;
    try {
      await fetch(`/api/assets/${activeTab}/${filename}${queryParam}`, { method: 'DELETE' });
      fetchAssets();
    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl h-[600px] flex flex-col overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
          <h3 className="text-lg font-medium text-zinc-100">Asset Library</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100"><X size={20} /></button>
        </div>
        
        <div className="flex justify-between items-center border-b border-zinc-800 bg-zinc-950/50 px-4">
          <div className="flex">
            {(['portraits', 'frames', 'effects'] as const).map(tab => (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 text-sm font-medium capitalize border-b-2 transition-colors ${activeTab === tab ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-zinc-900 border-b border-zinc-800 p-4 flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Display Name</label>
            <input 
              type="text" 
              value={displayName}
              onChange={handleDisplayNameChange}
              placeholder="e.g. В плену"
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">Technical ID</label>
            <input 
              type="text" 
              value={technicalId}
              onChange={handleTechnicalIdChange}
              placeholder="e.g. v_plenu"
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div className="pb-0.5">
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" />
            <button 
              onClick={() => fileInputRef.current?.click()} 
              disabled={isUploading || (!technicalId && activeTab === 'effects')} 
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Upload size={16} /> {isUploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </div>

        <div className="flex-1 p-6 overflow-auto bg-zinc-950">
          <div className="grid grid-cols-4 gap-4">
            {assets.map((url, i) => (
              <div key={i} onClick={() => onSelect && onSelect(url)} className={`aspect-square bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-center overflow-hidden group relative ${onSelect ? 'cursor-pointer hover:border-emerald-500' : ''}`}>
                <img src={url} alt="Asset" className="w-full h-full object-cover" />
                {onSelect && (
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <span className="text-xs font-medium text-white">Select</span>
                  </div>
                )}
                {!onSelect && (
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDelete(url); }} 
                      className="p-1.5 bg-red-500/80 text-white rounded-md hover:bg-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
            {assets.length === 0 && (
              <div className="col-span-4 text-center py-12 text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
                No assets found in this category. Upload some!
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ActorRosterModal({ systemName, onClose, onAdd }: { systemName: string, onClose: () => void, onAdd: (actor: Actor) => void }) {
  const [actors, setActors] = useState<Actor[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch(`/api/systems/${encodeURIComponent(systemName)}/actors`)
      .then(res => res.json())
      .then(data => setActors(data))
      .catch(err => console.error("Failed to fetch actors", err));
  }, [systemName]);

  const filtered = actors.filter(a => a.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl h-[600px] flex flex-col overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
          <h3 className="text-lg font-medium text-zinc-100">Actor Roster ({systemName})</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100"><X size={20} /></button>
        </div>
        
        <div className="p-4 border-b border-zinc-800 bg-zinc-950/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
            <input 
              type="text" 
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search actors..."
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="flex-1 p-4 overflow-auto bg-zinc-950">
          <div className="grid grid-cols-2 gap-3">
            {filtered.map(actor => (
              <div key={actor.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex items-center gap-3 hover:border-zinc-700 transition-colors">
                <img src={actor.portrait} alt={actor.name} className="w-12 h-12 rounded-lg object-cover" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-zinc-200 truncate">{actor.name}</div>
                  <div className="text-xs text-zinc-500 capitalize">{actor.role}</div>
                </div>
                <button 
                  onClick={() => onAdd(actor)}
                  className="p-2 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 hover:text-white rounded-lg transition-colors"
                  title="Add to Combat"
                >
                  <Plus size={16} />
                </button>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="col-span-2 text-center py-12 text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
                No actors found in the roster.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function EncountersModal({
  systemName,
  currentActors,
  onClose,
  onLoad,
}: {
  systemName: string;
  currentActors: Actor[];
  onClose: () => void;
  onLoad: () => void | Promise<unknown>;
}) {
  const [encounters, setEncounters] = useState<{ name: string; filename: string }[]>([]);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const importInputRef = React.useRef<HTMLInputElement>(null);

  const fetchEncounters = () => {
    fetch(`/api/encounters/list?system_name=${encodeURIComponent(systemName)}`)
      .then(res => res.json())
      .then(data => setEncounters(Array.isArray(data) ? data : []))
      .catch(err => console.error("Failed to fetch encounters", err));
  };

  useEffect(() => {
    fetchEncounters();
  }, [systemName]);

  const handleSave = async () => {
    const name = newName.trim() || 'Unnamed Encounter';
    setSaveError(null);
    setSaving(true);
    try {
      const actorsJson = JSON.parse(JSON.stringify(currentActors));
      const res = await fetch('/api/encounters/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system_name: systemName, name, actors: actorsJson }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = Array.isArray(data.detail) ? data.detail.map((d: { msg?: string }) => d.msg).join(', ') : (data.detail || `Error ${res.status}`);
        setSaveError(msg);
        return;
      }
      setNewName('');
      fetchEncounters();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
      console.error("Failed to save encounter", err);
    } finally {
      setSaving(false);
    }
  };

  const handleExportJson = () => {
    const name = newName.trim() || 'Exported Encounter';
    const payload = { name, actors: JSON.parse(JSON.stringify(currentActors)) };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_') + '.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const text = reader.result as string;
        const data = JSON.parse(text);
        const actors = Array.isArray(data.actors) ? data.actors : (data && Array.isArray(data) ? data : []);
        if (actors.length === 0) {
          alert('No actors in file.');
          e.target.value = '';
          return;
        }
        const res = await fetch('/api/combat/load', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actors }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          alert(err.detail || `Error ${res.status}`);
          e.target.value = '';
          return;
        }
        await Promise.resolve(onLoad());
        onClose();
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Invalid JSON file.');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  const handleLoad = async (filename: string) => {
    setLoading(filename);
    try {
      const res = await fetch(`/api/encounters/get?system_name=${encodeURIComponent(systemName)}&filename=${encodeURIComponent(filename)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || `Error ${res.status}`);
        return;
      }
      const data = await res.json();
      const actors = data?.actors ?? [];
      const loadRes = await fetch('/api/combat/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actors }),
      });
      if (!loadRes.ok) {
        const err = await loadRes.json().catch(() => ({}));
        alert(err.detail || `Error ${loadRes.status}`);
        return;
      }
      await Promise.resolve(onLoad());
      onClose();
    } catch (err) {
      console.error("Failed to load encounter", err);
    } finally {
      setLoading(null);
    }
  };

  const handleDelete = async (filename: string) => {
    if (!confirm('Delete this encounter?')) return;
    try {
      await fetch(`/api/encounters/delete?system_name=${encodeURIComponent(systemName)}&filename=${encodeURIComponent(filename)}`, { method: 'DELETE' });
      fetchEncounters();
    } catch (err) {
      console.error("Failed to delete encounter", err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
          <h3 className="text-lg font-medium text-zinc-100 flex items-center gap-2">
            <Swords size={20} className="text-emerald-400" /> Encounters ({systemName})
          </h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100"><X size={20} /></button>
        </div>

        <div className="p-4 border-b border-zinc-800 bg-zinc-950/50 space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Encounter name"
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
            />
            <button
              onClick={handleSave}
              disabled={saving || currentActors.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Save size={16} /> Save Current Combat
            </button>
          </div>
          {saveError && <p className="text-sm text-red-400">{saveError}</p>}
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleExportJson}
              disabled={currentActors.length === 0}
              className="flex items-center gap-2 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-zinc-200 rounded-lg text-sm"
            >
              <Download size={14} /> Export JSON
            </button>
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              className="flex items-center gap-2 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg text-sm"
            >
              <Upload size={14} /> Import JSON
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleImportJson}
            />
          </div>
          {currentActors.length === 0 && (
            <p className="text-xs text-zinc-500">Add actors to combat first to save an encounter.</p>
          )}
        </div>

        <div className="flex-1 p-4 overflow-auto bg-zinc-950">
          <div className="space-y-2">
            {encounters.map(enc => (
              <div key={enc.filename} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex items-center justify-between gap-3 hover:border-zinc-700 transition-colors">
                <span className="font-medium text-zinc-200 truncate">{enc.name}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleLoad(enc.filename)}
                    disabled={loading !== null}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 hover:text-white rounded-lg transition-colors disabled:opacity-50 text-sm"
                    title="Load into combat"
                  >
                    <Download size={14} /> Load
                  </button>
                  <button
                    onClick={() => handleDelete(enc.filename)}
                    className="p-2 bg-zinc-800 text-zinc-400 hover:bg-red-900/30 hover:text-red-400 rounded-lg transition-colors"
                    title="Delete encounter"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
            {encounters.length === 0 && (
              <div className="text-center py-12 text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
                No saved encounters. Save current combat to create one.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
