import React from 'react';
import type { Actor, ColumnConfig, Effect } from '../../types';
import { ActorRow } from './ActorRow';

export interface InitiativeTableProps {
  actors: Actor[];
  turnQueue: string[];
  currentIndex: number;
  isActive: boolean;
  columns: ColumnConfig[];
  showGroupColorsInTable: boolean;
  showFactionColorsInTable: boolean;
  getLegendColor: (role: Actor['role']) => string;
  groupSelectMode: boolean;
  selectedActorIds: Set<string>;
  onUpdateActor: (id: string, updates: Partial<Actor>) => void;
  onDeleteActor: (id: string) => void;
  onPortraitClick: (actorId: string) => void;
  onRowDoubleClick: (actor: Actor) => void;
  onEffectClick: (actorId: string, effect: Effect) => void;
  onAddEffectClick: (actor: Actor) => void;
  onToggleGroupSelect: (actorId: string, selected: boolean) => void;
}

export function InitiativeTable({
  actors,
  turnQueue,
  currentIndex,
  isActive,
  columns,
  showGroupColorsInTable,
  showFactionColorsInTable,
  getLegendColor,
  groupSelectMode,
  selectedActorIds,
  onUpdateActor,
  onDeleteActor,
  onPortraitClick,
  onRowDoubleClick,
  onEffectClick,
  onAddEffectClick,
  onToggleGroupSelect,
}: InitiativeTableProps) {
  const visible = columns.filter((c) => c.showInTable);
  const standalone = visible.filter((c) => !c.group || String(c.group).trim() === '');
  const grouped = visible.filter((c) => c.group && String(c.group).trim() !== '');
  const groupNames = [...new Set(grouped.map((c) => String(c.group).trim()))];

  const rows = isActive
    ? turnQueue
        .map((id, index) => ({ actor: actors.find((a) => a.id === id), index }))
        .filter((x): x is { actor: Actor; index: number } => !!x.actor)
    : [...actors]
        .sort((a, b) => b.initiative - a.initiative)
        .map((actor, index) => ({ actor, index }));

  const sortedActors = rows.map((r) => r.actor);

  const activeActorIds = (() => {
    if (!isActive || !turnQueue.length) return new Set<string>();
    const idx = currentIndex;
    const aid = turnQueue[idx];
    const actor = actors.find((a) => a.id === aid);
    if (!actor?.group_id || actor.group_mode !== 'simultaneous') return new Set([aid]);
    const ids = new Set<string>();
    const gid = actor.group_id;
    for (let i = idx; i < turnQueue.length; i++) {
      const a = actors.find((x) => x.id === turnQueue[i]);
      if (!a || a.group_id !== gid || a.group_mode !== 'simultaneous') break;
      ids.add(a.id);
    }
    return ids;
  })();

  return (
    <>
      {/* Header Row — same structure as before (BUG-1: column groups) */}
      <div className="flex items-center gap-4 px-3 mb-2 text-sm font-medium text-zinc-400">
        <div className="w-[54px] shrink-0" />
        <div className="flex-1 flex items-center gap-4 px-4">
          <div className="w-[54px]">Init</div>
          <div className="w-48">Name</div>
          {standalone.map((col) => (
            <div key={col.key} className="w-24">
              {col.label}
            </div>
          ))}
          {groupNames.map((grp) => (
            <div
              key={grp}
              className="flex flex-wrap items-center gap-2 px-2 py-1 bg-zinc-800/50 rounded-lg border border-zinc-700/50 max-w-[12rem]"
            >
              <span className="text-[10px] text-zinc-500 uppercase">{grp}</span>
              {grouped.filter((c) => String(c.group).trim() === grp).map((col) => (
                <span key={col.key} className="text-[10px] text-zinc-400">
                  {col.label}
                </span>
              ))}
            </div>
          ))}
          <div className="flex-1">Effects</div>
        </div>
      </div>

      {/* Rows */}
      <div className="space-y-2">
        {rows.map(({ actor, index }) => {
          const isPastTurn = isActive && index < currentIndex;
          const isGrouped = !!(actor.group_id && actor.group_mode === 'simultaneous');
          const prevActor = sortedActors[index - 1];
          const nextActor = sortedActors[index + 1];
          const isFirstInGroup = !prevActor || prevActor.group_id !== actor.group_id;
          const isLastInGroup = !nextActor || nextActor.group_id !== actor.group_id;
          const isSelectedForGroup = groupSelectMode && selectedActorIds.has(actor.id);
          const isCurrent = activeActorIds.has(actor.id);

          return (
            <ActorRow
              key={actor.id}
              actor={actor}
              isCurrent={isCurrent}
              isPastTurn={isPastTurn}
              isGrouped={isGrouped}
              isFirstInGroup={isFirstInGroup}
              isLastInGroup={isLastInGroup}
              showGroupColorsInTable={showGroupColorsInTable}
              showFactionColorsInTable={showFactionColorsInTable}
              legendColor={getLegendColor(actor.role)}
              columns={columns}
              groupSelectMode={groupSelectMode}
              isSelectedForGroup={isSelectedForGroup}
              onUpdate={(updates) => onUpdateActor(actor.id, updates)}
              onDelete={() => onDeleteActor(actor.id)}
              onPortraitClick={() => onPortraitClick(actor.id)}
              onRowDoubleClick={() => onRowDoubleClick(actor)}
              onEffectClick={(effect) => onEffectClick(actor.id, effect)}
              onAddEffectClick={() => onAddEffectClick(actor)}
              onToggleGroupSelect={(selected) => onToggleGroupSelect(actor.id, selected)}
            />
          );
        })}
        {actors.length === 0 && (
          <div className="text-center p-8 text-zinc-500 bg-zinc-900/50 rounded-xl border border-zinc-800 border-dashed">
            No actors in combat.
          </div>
        )}
      </div>
    </>
  );
}
