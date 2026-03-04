import React, { useState, useEffect } from 'react';
import { X, Save, Download, Upload, Trash2, Swords } from 'lucide-react';
import { Actor } from '../../types';
import { useCombatState } from '../../contexts/CombatStateContext';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation('core', { useSuspense: false });
  const [encounters, setEncounters] = useState<{ name: string; filename: string }[]>([]);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const importInputRef = React.useRef<HTMLInputElement>(null);
  const { state } = useCombatState();
  const autosaveEnabled = state?.autosave_enabled ?? true;

  const fetchEncounters = () => {
    fetch(`/api/encounters/list?system_name=${encodeURIComponent(systemName)}`)
      .then((res) => res.json())
      .then((data) => setEncounters(Array.isArray(data) ? data : []))
      .catch((err) => console.error('Failed to fetch encounters', err));
  };

  useEffect(() => {
    fetchEncounters();
  }, [systemName]);

  const handleSave = async () => {
    const name = newName.trim() || t('modals.unnamed_encounter');
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
        const msg = Array.isArray(data.detail)
          ? data.detail.map((d: { msg?: string }) => d.msg).join(', ')
          : (data.detail || `Error ${res.status}`);
        setSaveError(msg);
        return;
      }
      setNewName('');
      fetchEncounters();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
      console.error('Failed to save encounter', err);
    } finally {
      setSaving(false);
    }
  };

  const handleExportJson = () => {
    const name = newName.trim() || t('modals.unnamed_encounter');
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
        const actors = Array.isArray(data.actors) ? data.actors : data && Array.isArray(data) ? data : [];
        if (actors.length === 0) {
          alert(t('modals.no_actors_in_file'));
          e.target.value = '';
          return;
        }
        const res = await fetch('/api/combat/load', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            actors,
            history: Array.isArray(data.history) ? data.history : [],
            round: typeof data.round === 'number' ? data.round : undefined,
            turn_queue: Array.isArray(data.turn_queue) ? data.turn_queue : undefined,
            current_index: typeof data.current_index === 'number' ? data.current_index : undefined,
            is_active: typeof data.is_active === 'boolean' ? data.is_active : undefined,
          }),
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
      const res = await fetch(
        `/api/encounters/get?system_name=${encodeURIComponent(systemName)}&filename=${encodeURIComponent(filename)}`
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || `Error ${res.status}`);
        return;
      }
      const data = await res.json();
      const actors = data?.actors ?? [];
      const history = Array.isArray(data?.history) ? data.history : [];
      const round = typeof data?.round === 'number' ? data.round : undefined;
      const turn_queue = Array.isArray(data?.turn_queue) ? data.turn_queue : undefined;
      const current_index = typeof data?.current_index === 'number' ? data.current_index : undefined;
      const is_active = typeof data?.is_active === 'boolean' ? data.is_active : undefined;
      const loadRes = await fetch('/api/combat/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actors, history, round, turn_queue, current_index, is_active }),
      });
      if (!loadRes.ok) {
        const err = await loadRes.json().catch(() => ({}));
        alert(err.detail || `Error ${loadRes.status}`);
        return;
      }
      await Promise.resolve(onLoad());
      onClose();
    } catch (err) {
      console.error('Failed to load encounter', err);
    } finally {
      setLoading(null);
    }
  };

  const handleDelete = async (filename: string) => {
    if (!confirm(t('modals.delete_this_encounter'))) return;
    try {
      await fetch(
        `/api/encounters/delete?system_name=${encodeURIComponent(systemName)}&filename=${encodeURIComponent(filename)}`,
        { method: 'DELETE' }
      );
      fetchEncounters();
    } catch (err) {
      console.error('Failed to delete encounter', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
          <h3 className="text-lg font-medium text-zinc-100 flex items-center gap-2">
            <Swords size={20} className="text-emerald-400" /> {t('modals.encounters_title')} ({systemName})
          </h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 border-b border-zinc-800 bg-zinc-950/50 space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('modals.encounter_name')}
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
            />
            <button
              onClick={handleSave}
              disabled={saving || currentActors.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Save size={16} /> {t('modals.save_current_combat')}
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            <input
              type="checkbox"
              className="rounded border-zinc-600 bg-zinc-900 text-emerald-500 focus:ring-emerald-500"
              checked={autosaveEnabled}
              onChange={async (e) => {
                const next = e.target.checked;
                try {
                  await fetch('/api/combat/settings', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ autosave_enabled: next }),
                  });
                } catch (err) {
                  console.error('Failed to toggle autosave', err);
                }
              }}
            />
            <span>{t('modals.autosave_encounter_state')}</span>
          </label>
          {saveError && <p className="text-sm text-red-400">{saveError}</p>}
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleExportJson}
              disabled={currentActors.length === 0}
              className="flex items-center gap-2 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-zinc-200 rounded-lg text-sm"
            >
              <Download size={14} /> {t('modals.export_json')}
            </button>
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              className="flex items-center gap-2 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg text-sm"
            >
              <Upload size={14} /> {t('modals.import_json')}
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleImportJson}
            />
          </div>
          {currentActors.length === 0 && <p className="text-xs text-zinc-500">{t('modals.add_actors_first')}</p>}
        </div>

        <div className="flex-1 p-4 overflow-auto bg-zinc-950">
          <div className="space-y-2">
            {encounters.map((enc) => (
              <div
                key={enc.filename}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex items-center justify-between gap-3 hover:border-zinc-700 transition-colors"
              >
                <span className="font-medium text-zinc-200 truncate">{enc.name}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleLoad(enc.filename)}
                    disabled={loading !== null}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 hover:text-white rounded-lg transition-colors disabled:opacity-50 text-sm"
                    title={t('modals.load_into_combat')}
                  >
                    <Download size={14} /> {t('modals.load')}
                  </button>
                  <button
                    onClick={() => handleDelete(enc.filename)}
                    className="p-2 bg-zinc-800 text-zinc-400 hover:bg-red-900/30 hover:text-red-400 rounded-lg transition-colors"
                    title={t('modals.delete_encounter')}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
            {encounters.length === 0 && (
              <div className="text-center py-12 text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
                {t('modals.no_saved_encounters')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
