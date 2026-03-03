import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Users, Trash, Swords } from 'lucide-react';
import { CombatState, Actor, Effect, LegendConfig } from './types';
import i18n from './i18n';
import { MiniSheetModal, ConfigModal, LibraryModal, AddEffectModal, MiniaturesModal, ActorRosterModal, EncountersModal } from './components/Modals';
import { CombatLog } from './components/CombatLog';
import { InitiativeTable } from './components/InitiativeTracker/InitiativeTable';
import { AppHeader } from './components/AppHeader';
import { CombatToolbar } from './components/CombatToolbar';
import { useCombatState } from './contexts/CombatStateContext';
import { useColumns } from './contexts/ColumnsContext';
import { CombatProvider } from './contexts/CombatContext';

// Survives remounts and HMR: when context state is temporarily null, keep showing last state
let lastKnownState: CombatState | null = null;
const STORAGE_KEY = 'omniboard_combat_state';

function getRehydratedState(): CombatState | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const s = sessionStorage.getItem(STORAGE_KEY);
    return s ? (JSON.parse(s) as CombatState) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const { state, wsError, refetchState } = useCombatState();
  const { columns, setColumns, systemName } = useColumns();
  if (state != null) {
    lastKnownState = state;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }
  const effectiveState = state ?? lastKnownState ?? (lastKnownState = getRehydratedState());

  const [selectedActor, setSelectedActor] = useState<Actor | null>(null);
  const [effectModalActor, setEffectModalActor] = useState<Actor | null>(null);
  const [selectedEffect, setSelectedEffect] = useState<{ actorId: string; effect: Effect } | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showMiniatures, setShowMiniatures] = useState(false);
  const [showRoster, setShowRoster] = useState(false);
  const [showEncounters, setShowEncounters] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [portraitSelectActorId, setPortraitSelectActorId] = useState<string | null>(null);
  const [showLegendPanel, setShowLegendPanel] = useState(false);
  const [legendLocal, setLegendLocal] = useState<LegendConfig | null>(null);
  const [showGroupColorsLocal, setShowGroupColorsLocal] = useState<boolean | null>(null);
  const [showFactionColorsLocal, setShowFactionColorsLocal] = useState<boolean | null>(null);
  const [groupSelectMode, setGroupSelectMode] = useState(false);
  const [selectedActorIds, setSelectedActorIds] = useState<Set<string>>(new Set());
  const [createGroupModal, setCreateGroupModal] = useState<{ name: string; color: string; groupId?: string } | null>(null);
  const { t } = useTranslation('core', { useSuspense: false });

  // Ленивая загрузка локалей активной системы
  const loadSystemLocale = async (name: string) => {
    const ns = `systems/${name}`;
    if (!i18n.hasResourceBundle(i18n.language, ns)) {
      await i18n.loadNamespaces(ns);
    }
  };
  useEffect(() => {
    if (systemName) loadSystemLocale(systemName);
  }, [systemName]);

  const legendConfig = effectiveState?.legend ?? { player: '#10b981', enemy: '#ef4444', ally: '#3b82f6', neutral: '#a1a1aa' };
  const showGroupColors = showGroupColorsLocal ?? effectiveState?.show_group_colors ?? true;
  const showFactionColors = showFactionColorsLocal ?? effectiveState?.show_faction_colors ?? true;
  const roleToLegendKey: Record<Actor['role'], keyof LegendConfig> = { character: 'player', enemy: 'enemy', ally: 'ally', neutral: 'neutral' };
  const getLegendColor = (role: Actor['role']) => legendConfig[roleToLegendKey[role]] ?? '#a1a1aa';
  const showGroupColorsInTable = effectiveState?.show_group_colors !== false;
  const showFactionColorsInTable = effectiveState?.show_faction_colors !== false;

  const updateActorField = async (actorId: string, field: string, value: any) => {
    await fetch(`/api/actors/${actorId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value })
    });
    refetchState();
  };

  const updateActor = async (actorId: string, updates: Partial<Actor>) => {
    await fetch(`/api/actors/${actorId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    refetchState();
  };

  const nextTurn = async () => {
    await fetch('/api/combat/next-turn', { method: 'POST' });
    // State is pushed via WebSocket broadcast; no refetch to avoid UI freeze
  };

  const startCombat = async () => {
    await fetch('/api/combat/start', { method: 'POST' });
    // State is pushed via WebSocket broadcast; no refetch to avoid UI freeze
  };

  const endCombat = async () => {
    await fetch('/api/combat/end', { method: 'POST' });
    // State is pushed via WebSocket broadcast; no refetch to avoid UI freeze
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
      await fetch('/api/combat/clear', { method: 'POST' });
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

  if (wsError && !effectiveState) {
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

  if (!effectiveState) return <div className="min-h-screen bg-zinc-950 text-zinc-200 flex items-center justify-center">Loading...</div>;

  return (
    <CombatProvider>
    <div className="min-h-screen bg-zinc-950 text-zinc-200 flex flex-col font-sans">
      <AppHeader
        round={effectiveState.round}
        history={effectiveState.history ?? []}
        showLog={showLog}
        onToggleLog={() => setShowLog((v) => !v)}
        enableLogging={effectiveState.enable_logging !== false}
        onRefetch={refetchState}
        onShowMiniatures={() => setShowMiniatures(true)}
        onShowLibrary={() => setShowLibrary(true)}
        onShowConfig={() => setShowConfig(true)}
        showLegendPanel={showLegendPanel}
        onToggleLegendPanel={() => setShowLegendPanel((v) => !v)}
        legendConfig={legendConfig}
        editingLegend={legendLocal ?? legendConfig}
        showGroupColors={showGroupColors}
        showFactionColors={showFactionColors}
        onLegendColorChange={(role, color) =>
          setLegendLocal((prev) => ({ ...(prev ?? legendConfig), [role]: color }))
        }
        onShowGroupColorsChange={setShowGroupColorsLocal}
        onShowFactionColorsChange={setShowFactionColorsLocal}
        onCreateGroup={() => {
          const name = prompt('Group name', '');
          if (name == null) return;
          const color = prompt('Group color (hex)', '#10b981') || '#10b981';
          setCreateGroupModal({ name: name.trim() || 'Group', color: color.trim() || '#10b981', groupId: crypto.randomUUID() });
          setGroupSelectMode(true);
          setSelectedActorIds(new Set());
          setShowLegendPanel(false);
        }}
        onSaveLegend={async () => {
          const payload: Record<string, unknown> = { ...(legendLocal ?? legendConfig) };
          payload.show_group_colors = showGroupColorsLocal ?? effectiveState?.show_group_colors ?? true;
          payload.show_faction_colors = showFactionColorsLocal ?? effectiveState?.show_faction_colors ?? true;
          await fetch('/api/combat/legend', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          setLegendLocal(null);
          setShowGroupColorsLocal(null);
          setShowFactionColorsLocal(null);
          refetchState();
        }}
      />

      {/* Main Content */}
      <main className="flex-1 p-6 overflow-auto">
        <div className="w-full px-8">
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

          {groupSelectMode && createGroupModal && (
            <div className="mb-4 p-3 bg-zinc-800/80 border border-zinc-700 rounded-xl flex items-center justify-between gap-4">
              <span className="text-sm text-zinc-300">
                Assign selected to group &quot;{createGroupModal.name}&quot;
                {selectedActorIds.size > 0 && ` (${selectedActorIds.size} selected)`}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setGroupSelectMode(false);
                    setCreateGroupModal(null);
                    setSelectedActorIds(new Set());
                  }}
                  className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm text-zinc-200"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    const gid = createGroupModal.groupId ?? crypto.randomUUID();
                    const color = createGroupModal.color;
                    for (const actorId of selectedActorIds) {
                      await fetch(`/api/actors/${actorId}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ group_id: gid, group_mode: 'simultaneous', group_color: color }),
                      });
                    }
                    setGroupSelectMode(false);
                    setCreateGroupModal(null);
                    setSelectedActorIds(new Set());
                    refetchState();
                  }}
                  disabled={selectedActorIds.size === 0}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
                >
                  Assign to Group
                </button>
              </div>
            </div>
          )}

          <InitiativeTable
            actors={effectiveState.actors ?? []}
            turnQueue={effectiveState.turn_queue}
            currentIndex={effectiveState.current_index}
            isActive={effectiveState.is_active}
            columns={columns}
            showGroupColorsInTable={showGroupColorsInTable}
            showFactionColorsInTable={showFactionColorsInTable}
            getLegendColor={getLegendColor}
            groupSelectMode={groupSelectMode}
            selectedActorIds={selectedActorIds}
            tableCentered={effectiveState?.table_centered !== false}
            onUpdateActor={updateActor}
            onDeleteActor={deleteActor}
            onPortraitClick={(id) => setPortraitSelectActorId(id)}
            onRowDoubleClick={setSelectedActor}
            onEffectClick={(actorId, effect) => setSelectedEffect({ actorId, effect })}
            onAddEffectClick={(actor) => setEffectModalActor(actor)}
            onToggleGroupSelect={(actorId, selected) => {
              setSelectedActorIds((prev) => {
                const next = new Set(prev);
                if (selected) next.add(actorId);
                else next.delete(actorId);
                return next;
              });
            }}
          />
        </div>
      </main>

      <CombatToolbar
        isActive={effectiveState.is_active}
        canUndo={effectiveState?.can_undo ?? false}
        canRedo={effectiveState?.can_redo ?? false}
        onStartCombat={startCombat}
        onEndCombat={endCombat}
        onNextTurn={nextTurn}
        onReset={resetCombat}
        onClearCombat={clearCombat}
        onUndo={undoCombat}
        onRedo={redoCombat}
      />

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
                const actor = effectiveState?.actors.find(a => a.id === selectedEffect.actorId);
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
      {showMiniatures && <MiniaturesModal layout={effectiveState.layout} columns={columns} onClose={() => setShowMiniatures(false)} />}
      {showRoster && <ActorRosterModal systemName={systemName} onClose={() => setShowRoster(false)} onAdd={addFromRoster} />}
      {showEncounters && (
        <EncountersModal
          systemName={systemName}
          currentActors={effectiveState.actors}
          onClose={() => setShowEncounters(false)}
          onLoad={refetchState}
        />
      )}
    </div>
    </CombatProvider>
  );
}
