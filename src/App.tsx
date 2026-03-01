import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, BookImage, Play, SkipForward, Plus, Square, RotateCcw, MonitorSmartphone, Users, Trash, Swords, Undo, Redo } from 'lucide-react';
import { CombatState, Actor, ColumnConfig, Effect } from './types';
import { MiniSheetModal, ConfigModal, LibraryModal, AddEffectModal, MiniaturesModal, ActorRosterModal, EncountersModal } from './components/Modals';

function InlineInput({ value, onChange, type = "text", className = "", maxValue }: { value: string | number, onChange: (val: string) => void, type?: string, className?: string, maxValue?: number }) {
  const [localVal, setLocalVal] = useState(value);

  useEffect(() => {
    setLocalVal(value);
  }, [value]);

  const commitValue = () => {
    if (type !== "number") {
      onChange(localVal.toString());
      return;
    }
    const str = localVal.toString().trim();
    const base = typeof value === "string" ? parseFloat(value) || 0 : Number(value);
    let newNum: number;
    if (str.startsWith("+") || str.startsWith("-")) {
      const delta = parseFloat(str) || 0;
      newNum = base + delta;
    } else {
      const parsed = parseFloat(str);
      newNum = Number.isNaN(parsed) ? 0 : parsed;
    }
    if (maxValue !== undefined && maxValue !== null && !Number.isNaN(maxValue)) {
      newNum = Math.min(newNum, maxValue);
    }
    const newValStr = String(newNum);
    onChange(newValStr);
    setLocalVal(newValStr);
  };

  return (
    <input
      type={type === "number" ? "text" : type}
      inputMode={type === "number" ? "decimal" : undefined}
      value={localVal}
      onChange={(e) => setLocalVal(e.target.value)}
      onBlur={commitValue}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
      }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className={`${className} ${type === "number" ? "[&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" : ""}`}
    />
  );
}

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { key: 'hp', label: 'HP', showInTable: true },
  { key: 'ac', label: 'AC', showInTable: true },
  { key: 'speed', label: 'Speed', showInTable: true },
];

export default function App() {
  const [state, setState] = useState<CombatState | null>(null);
  const [columns, setColumns] = useState<ColumnConfig[]>(DEFAULT_COLUMNS);
  const systemName = state?.system || "D&D 5e";
  const [wsError, setWsError] = useState<string | null>(null);
  
  const [selectedActor, setSelectedActor] = useState<Actor | null>(null);
  const [effectModalActor, setEffectModalActor] = useState<Actor | null>(null);
  const [selectedEffect, setSelectedEffect] = useState<{ actorId: string; effect: Effect } | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showMiniatures, setShowMiniatures] = useState(false);
  const [showRoster, setShowRoster] = useState(false);
  const [showEncounters, setShowEncounters] = useState(false);
  const [portraitSelectActorId, setPortraitSelectActorId] = useState<string | null>(null);
  const { t } = useTranslation('core');

  useEffect(() => {
    fetch(`/api/systems/${encodeURIComponent(systemName)}/columns`)
      .then(res => res.json())
      .then(data => {
        if (data && Array.isArray(data) && data.length > 0) {
          setColumns(data);
        }
        // If empty, do not fallback: keep current columns (or DEFAULT_COLUMNS from initial state)
      })
      .catch(err => console.error("Failed to fetch columns", err));
  }, [systemName]);

  useEffect(() => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/master`;
    let ws: WebSocket;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let isMounted = true;
    let lastFallbackAt = 0;
    const FALLBACK_THROTTLE_MS = 5000;

    const fetchStateFallback = () => {
      const now = Date.now();
      if (lastFallbackAt > 0 && now - lastFallbackAt < FALLBACK_THROTTLE_MS) return;
      lastFallbackAt = now;
      fetch('/api/combat/state')
        .then(res => res.ok ? res.json() : Promise.reject())
        .then(data => { if (isMounted) { setState(data); setWsError(null); } })
        .catch(() => { if (isMounted) setWsError("Бэкенд недоступен. Проверьте, что сервер запущен (npm run dev)."); });
    };

    const connect = () => {
      if (!isMounted) return;
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setWsError(null);
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'state_update') {
          setState(data.payload);
          setWsError(null);
        }
      };

      ws.onerror = () => {
        fetchStateFallback();
      };

      ws.onclose = () => {
        if (!isMounted) return;
        fetchStateFallback();
        reconnectTimeout = setTimeout(connect, 2000);
      };
    };

    connect();

    return () => {
      isMounted = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      ws?.close();
    };
  }, []);

  const refetchState = () => {
    return fetch('/api/combat/state')
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(setState)
      .catch(() => {});
  };

  const updateActorStat = async (actorId: string, statKey: string, value: any) => {
    await fetch(`/api/actors/${actorId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stats: { [statKey]: value } })
    });
    refetchState();
  };

  const updateActorField = async (actorId: string, field: string, value: any) => {
    await fetch(`/api/actors/${actorId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value })
    });
    refetchState();
  };

  const nextTurn = async () => {
    await fetch('/api/combat/next-turn', { method: 'POST' });
    refetchState();
  };

  const startCombat = async () => {
    await fetch('/api/combat/start', { method: 'POST' });
    refetchState();
  };

  const endCombat = async () => {
    await fetch('/api/combat/end', { method: 'POST' });
    refetchState();
  };

  const resetCombat = async () => {
    if (confirm("Reset combat? This will clear the queue, reset the round to 1, and remove all effects.")) {
      await fetch('/api/combat/reset', { method: 'POST' });
      refetchState();
    }
  };

  const undoCombat = async () => {
    await fetch('/api/combat/undo', { method: 'POST' });
    refetchState();
  };
  const redoCombat = async () => {
    await fetch('/api/combat/redo', { method: 'POST' });
    refetchState();
  };

  const clearCombat = async () => {
    if (confirm("Clear combat? This will remove all actors and reset the combat state.")) {
      await fetch('/api/combat/reset', { method: 'POST' });
      refetchState();
    }
  };

  const deleteActor = async (actorId: string) => {
    if (confirm("Delete this actor?")) {
      await fetch(`/api/actors/${actorId}`, { method: 'DELETE' });
      refetchState();
    }
  };

  const addActor = async () => {
    await fetch('/api/actors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        name: 'New Actor',
        role: 'enemy',
        portrait: '',
        stats: { hp: 10, ac: 10, speed: 30 },
        initiative: Math.floor(Math.random() * 20) + 1,
        effects: [],
        visibility: { hp: true, stats: true, effects: true, name: true },
        hotbar: []
      })
    });
    refetchState();
  };

  const addFromRoster = async (template: Actor) => {
    const newActor = { ...template, id: crypto.randomUUID(), initiative: 0 };
    try {
      await fetch('/api/actors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newActor)
      });
      setShowRoster(false);
      refetchState();
    } catch (err) {
      console.error("Failed to add actor from roster", err);
    }
  };

  if (wsError && !state) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-200 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-zinc-900 border border-red-500/30 p-6 rounded-xl max-w-md">
          <h2 className="text-red-400 font-bold mb-4 text-xl">Ошибка подключения</h2>
          <p className="text-zinc-300 mb-4">{wsError}</p>
          <p className="text-zinc-400 text-sm">
            AI Studio песочница поддерживает только Node.js. Так как вы строго запретили использовать Node.js на бэкенде и потребовали Python 3.11+, 
            бэкенд не может быть запущен в этой среде. 
            <br/><br/>
            Чтобы запустить проект, скачайте код и запустите его локально:
            <br/>
            <code className="bg-black/50 p-1 rounded mt-2 block text-left">
              1. pip install -r requirements.txt<br/>
              2. uvicorn backend.main:app --reload<br/>
              3. npm install && npm run dev
            </code>
          </p>
        </div>
      </div>
    );
  }

  if (!state) return <div className="min-h-screen bg-zinc-950 text-zinc-200 flex items-center justify-center">Loading...</div>;

  const activeActorId = state.is_active && state.turn_queue.length > 0 ? state.turn_queue[state.current_index] : null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-zinc-900 border-b border-zinc-800 p-4 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100">Omniboard</h1>
          <div className="text-xs text-zinc-500">Round: {state.round}</div>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setShowMiniatures(true)} className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-md text-sm transition-colors">
            <MonitorSmartphone size={16} /> Miniatures
          </button>
          <button onClick={() => setShowLibrary(true)} className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-md text-sm transition-colors">
            <BookImage size={16} /> Library
          </button>
          <button onClick={() => setShowConfig(true)} className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-md text-sm transition-colors">
            <Settings size={16} /> {t('config', 'Config')}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-5xl mx-auto">
          <div className="flex justify-between items-end mb-4">
            <h2 className="text-lg font-medium text-zinc-300">Initiative Tracker</h2>
            <div className="flex gap-4">
              <button onClick={addActor} className="flex items-center gap-1 text-sm text-emerald-400 hover:text-emerald-300">
                <Plus size={16} /> Add Actor
              </button>
              <button onClick={() => setShowEncounters(true)} className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-300">
                <Swords size={16} /> Encounters
              </button>
              <button onClick={() => setShowRoster(true)} className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-300">
                <Users size={16} /> Roster
              </button>
            </div>
          </div>
          
          {/* Header Row */}
          <div className="flex items-center gap-4 px-3 mb-2 text-sm font-medium text-zinc-400">
            <div className="w-[54px] shrink-0"></div>
            <div className="flex-1 flex items-center gap-4 px-4">
              <div className="w-[54px]">Init</div>
              <div className="w-48">Name</div>
              {(() => {
                const visible = columns.filter(c => c.showInTable);
                const standalone = visible.filter(c => !c.group || String(c.group).trim() === '');
                const grouped = visible.filter(c => c.group && String(c.group).trim() !== '');
                const groupNames = [...new Set(grouped.map(c => String(c.group).trim()))];
                return (
                  <>
                    {standalone.map(col => (
                      <div key={col.key} className="w-24">{col.label}</div>
                    ))}
                    {groupNames.map(grp => (
                      <div key={grp} className="flex flex-wrap items-center gap-2 px-2 py-1 bg-zinc-800/50 rounded-lg border border-zinc-700/50 max-w-[12rem]">
                        <span className="text-[10px] text-zinc-500 uppercase">{grp}</span>
                        {grouped.filter(c => String(c.group).trim() === grp).map(col => (
                          <span key={col.key} className="text-[10px] text-zinc-400">{col.label}</span>
                        ))}
                      </div>
                    ))}
                    <div className="flex-1">Effects</div>
                  </>
                );
              })()}
            </div>
          </div>

          {/* Rows */}
          <div className="space-y-2">
            {(state.is_active
              ? state.turn_queue.map((id, index) => ({ actor: state.actors.find(a => a.id === id), index })).filter((x): x is { actor: Actor; index: number } => !!x.actor)
              : [...state.actors].sort((a, b) => b.initiative - a.initiative).map(actor => ({ actor, index: -1 }))
            ).map(({ actor, index }) => {
              const isPastTurn = state.is_active && index < state.current_index;
              return (
              <div key={actor.id} className={`flex items-center gap-4 group ${isPastTurn ? 'opacity-40 grayscale-[50%]' : ''}`}>
                {/* Portrait Outside */}
                {actor.portrait ? (
                  <div 
                    className="w-[54px] h-[96px] shrink-0 rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 flex items-center justify-center shadow-md cursor-pointer hover:border-emerald-500 transition-colors relative group/portrait"
                    onClick={() => setPortraitSelectActorId(actor.id)}
                  >
                    <img src={actor.portrait} alt={actor.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/portrait:opacity-100 flex items-center justify-center transition-opacity">
                      <span className="text-[10px] uppercase font-bold text-white tracking-wider">Change</span>
                    </div>
                  </div>
                ) : (
                  <div 
                    className="w-[54px] h-[96px] shrink-0 rounded-xl bg-zinc-900 border border-dashed border-zinc-700 flex items-center justify-center cursor-pointer hover:border-emerald-500 transition-colors"
                    onClick={() => setPortraitSelectActorId(actor.id)}
                  >
                    <Plus size={16} className="text-zinc-600" />
                  </div>
                )}

                {/* Data Row */}
                <div 
                  onDoubleClick={() => setSelectedActor(actor)}
                  className={`flex-1 flex items-center gap-4 px-4 py-4 min-h-[96px] bg-zinc-900 border rounded-xl cursor-pointer transition-colors relative overflow-hidden shadow-sm ${activeActorId === actor.id ? 'border-emerald-500/50 bg-zinc-800/50' : 'border-zinc-800 hover:border-zinc-700'}`}
                >
                  {activeActorId === actor.id && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500"></div>
                  )}
                  <div className="w-[54px] pl-2">
                    <InlineInput 
                      type="number" 
                      value={actor.initiative}
                      onChange={(val) => updateActorField(actor.id, 'initiative', parseInt(val) || 0)}
                      className="w-10 bg-transparent border border-transparent hover:border-zinc-700 focus:border-emerald-500 rounded px-1 py-0.5 text-zinc-300 font-mono text-sm focus:outline-none transition-colors"
                    />
                  </div>
                  <div className="w-48">
                    <InlineInput 
                      type="text" 
                      value={actor.name}
                      onChange={(val) => updateActorField(actor.id, 'name', val)}
                      className="w-full bg-transparent border border-transparent hover:border-zinc-700 focus:border-emerald-500 rounded px-1 py-0.5 text-zinc-200 font-medium focus:outline-none transition-colors truncate"
                    />
                  </div>
                  
                  {(() => {
                    const visible = columns.filter(c => c.showInTable);
                    const standalone = visible.filter(c => !c.group || String(c.group).trim() === '');
                    const grouped = visible.filter(c => c.group && String(c.group).trim() !== '');
                    const groupNames = [...new Set(grouped.map(c => String(c.group).trim()))];
                    return (
                      <>
                        {standalone.map(col => (
                          <div key={col.key} className="w-24">
                            <InlineInput
                              type="number"
                              value={actor.stats[col.key] ?? 0}
                              onChange={(val) => updateActorStat(actor.id, col.key, parseInt(val))}
                              maxValue={col.maxKey != null && typeof actor.stats[col.maxKey] === 'number' ? actor.stats[col.maxKey] : undefined}
                              className="w-16 bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          </div>
                        ))}
                        {groupNames.map(grp => (
                          <div key={grp} className="flex flex-wrap gap-2 px-2 py-1 bg-zinc-800/50 rounded-lg border border-zinc-700/50 w-48 max-w-[12rem]">
                            {grouped.filter(c => String(c.group).trim() === grp).map(col => (
                              <div key={col.key} className="flex items-center gap-1">
                                <span className="text-[10px] text-zinc-500">{col.label}:</span>
                                <InlineInput
                                  type="number"
                                  value={actor.stats[col.key] ?? 0}
                                  onChange={(val) => updateActorStat(actor.id, col.key, parseInt(val))}
                                  maxValue={col.maxKey != null && typeof actor.stats[col.maxKey] === 'number' ? actor.stats[col.maxKey] : undefined}
                                  className="w-10 bg-zinc-950 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                              </div>
                            ))}
                          </div>
                        ))}
                        <div className="flex-1 flex gap-1 flex-wrap items-center">
                    {actor.effects.map(eff => (
                      <button
                        key={eff.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedEffect({ actorId: actor.id, effect: eff });
                        }}
                        className="text-xs px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded-full border border-indigo-500/30 hover:bg-indigo-500/30 hover:border-indigo-400/50 transition-colors cursor-pointer"
                        title={eff.description || eff.name}
                      >
                        {eff.name} {eff.duration != null ? `(${eff.duration})` : ''}
                      </button>
                    ))}
                    <button 
                      onClick={(e) => { e.stopPropagation(); setEffectModalActor(actor); }}
                      className="w-5 h-5 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-emerald-400 transition-colors"
                      title="Add Effect"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                      </>
                    );
                  })()}
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteActor(actor.id); }}
                    className="w-8 h-8 rounded-lg bg-zinc-800/50 hover:bg-red-900/50 flex items-center justify-center text-zinc-500 hover:text-red-400 transition-colors ml-2 shrink-0"
                    title="Delete Actor"
                  >
                    <Trash size={14} />
                  </button>
                </div>
              </div>
            );})}
            {state.actors.length === 0 && (
              <div className="text-center p-8 text-zinc-500 bg-zinc-900/50 rounded-xl border border-zinc-800 border-dashed">
                No actors in combat.
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer Controls */}
      <footer className="bg-zinc-900 border-t border-zinc-800 p-4 flex justify-between items-center">
        <div className="flex gap-2">
          <button
            onClick={undoCombat}
            disabled={!state?.can_undo}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-300 rounded-lg font-medium transition-colors text-sm"
            title="Undo"
          >
            <Undo size={16} /> Undo
          </button>
          <button
            onClick={redoCombat}
            disabled={!state?.can_redo}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-300 rounded-lg font-medium transition-colors text-sm"
            title="Redo"
          >
            <Redo size={16} /> Redo
          </button>
          <button onClick={resetCombat} className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg font-medium transition-colors text-sm">
            <RotateCcw size={16} /> Reset
          </button>
          <button onClick={clearCombat} className="flex items-center gap-2 px-4 py-2 bg-red-900/20 hover:bg-red-900/40 text-red-400 rounded-lg font-medium transition-colors text-sm border border-red-900/30">
            <Trash size={16} /> Clear Combat
          </button>
          {state.is_active && (
            <button onClick={endCombat} className="flex items-center gap-2 px-4 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-lg font-medium transition-colors text-sm border border-red-900/50">
              <Square size={16} /> End Combat
            </button>
          )}
        </div>
        
        <div className="flex gap-4">
          {!state.is_active ? (
            <button onClick={startCombat} className="flex items-center gap-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors">
              <Play size={18} /> {t('start_combat', 'Start Combat')}
            </button>
          ) : (
            <button onClick={nextTurn} className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors">
              <SkipForward size={18} /> Next Turn
            </button>
          )}
        </div>
      </footer>

      {/* Modals */}
      {selectedActor && (
        <MiniSheetModal 
          actor={selectedActor} 
          columns={columns} 
          systemName={systemName}
          onClose={() => setSelectedActor(null)} 
          onUpdate={updateActorField}
          onPortraitClick={() => {
            setPortraitSelectActorId(selectedActor.id);
            setSelectedActor(null);
          }}
        />
      )}
      {effectModalActor && (
        <AddEffectModal 
          actor={effectModalActor} 
          systemName={systemName} 
          onClose={() => setEffectModalActor(null)} 
          onAdd={async (effect) => {
            const newEffects = [...effectModalActor.effects, effect];
            await fetch(`/api/actors/${effectModalActor.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ effects: newEffects })
            });
            setEffectModalActor(null);
            refetchState();
          }} 
        />
      )}
      {selectedEffect && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setSelectedEffect(null)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl max-w-sm w-full p-4 flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-zinc-100">{selectedEffect.effect.name}</h3>
            {selectedEffect.effect.duration != null && (
              <p className="text-sm text-zinc-400">Duration: {selectedEffect.effect.duration} round{selectedEffect.effect.duration !== 1 ? 's' : ''}</p>
            )}
            {selectedEffect.effect.description && (
              <p className="text-sm text-zinc-300">{selectedEffect.effect.description}</p>
            )}
            <button
              type="button"
              onClick={async () => {
                const actor = state?.actors.find(a => a.id === selectedEffect.actorId);
                if (!actor) return;
                const newEffects = actor.effects.filter(e => e.id !== selectedEffect.effect.id);
                await fetch(`/api/actors/${selectedEffect.actorId}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ effects: newEffects })
                });
                setSelectedEffect(null);
                refetchState();
              }}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium text-sm transition-colors"
            >
              Remove Effect
            </button>
            <button type="button" onClick={() => setSelectedEffect(null)} className="text-sm text-zinc-400 hover:text-zinc-300">
              Close
            </button>
          </div>
        </div>
      )}
      {showConfig && (
          <ConfigModal
            columns={columns}
            setColumns={setColumns}
            systemName={systemName}
            setSystemName={(val) =>
              fetch('/api/combat/system', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ system: val })
              })
            }
            onClose={() => setShowConfig(false)}
          />
        )}
      {showLibrary && <LibraryModal onClose={() => setShowLibrary(false)} systemName={systemName} />}
      {portraitSelectActorId && (
        <LibraryModal 
          onClose={() => setPortraitSelectActorId(null)} 
          onSelect={(url) => {
            updateActorField(portraitSelectActorId, 'portrait', url);
            setPortraitSelectActorId(null);
          }} 
          systemName={systemName}
        />
      )}
      {showMiniatures && <MiniaturesModal layout={state.layout} columns={columns} onClose={() => setShowMiniatures(false)} />}
      {showRoster && <ActorRosterModal systemName={systemName} onClose={() => setShowRoster(false)} onAdd={addFromRoster} />}
      {showEncounters && (
        <EncountersModal
          systemName={systemName}
          currentActors={state.actors}
          onClose={() => setShowEncounters(false)}
          onLoad={refetchState}
        />
      )}
    </div>
  );
}
