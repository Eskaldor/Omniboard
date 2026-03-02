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
  const visibleKeys = new Set(visible.map((c) => c.key));
  const mergedMaxKeys = new Set(
    visible
      .filter((c) => c.maxKey && visibleKeys.has(c.maxKey))
      .map((c) => c.maxKey as string),
  );
  const standalone = visible.filter(
    (c) => (!c.group || String(c.group).trim() === '') && !mergedMaxKeys.has(c.key),
  );
  const grouped = visible.filter(
    (c) => c.group && String(c.group).trim() !== '' && !mergedMaxKeys.has(c.key),
  );
  const groupNames = [...new Set(grouped.map((c) => String(c.group).trim()))];
  const columnCount = 1 + 1 + 1 + standalone.length + groupNames.length + 1 + 1;

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
    <div className="w-full overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      <table className="w-max min-w-full border-collapse text-left whitespace-nowrap text-sm text-zinc-200">
        <thead>
          <tr>
            {/* Portrait column */}
            <th className="px-2 py-1 align-middle w-[54px] sticky left-0 z-20 bg-zinc-950 shadow-[8px_0_15px_-3px_rgba(0,0,0,0.5)] border-r border-zinc-800/50" />
            {/* Initiative */}
            <th className="px-2 py-1 text-center align-middle font-medium text-zinc-400 bg-zinc-900 w-[54px]">Init</th>
            {/* Name */}
            <th className="px-2 py-1 text-left align-middle font-medium text-zinc-400 bg-zinc-900 w-32">Name</th>
            {/* Standalone stat columns */}
            {standalone.map((col) => (
              <th
                key={col.key}
                className="px-2 py-1 text-center align-middle font-medium text-zinc-400 bg-zinc-900 min-w-[5rem] w-20"
              >
                {col.label}
              </th>
            ))}
            {/* Grouped stat columns */}
            {groupNames.map((grp) => (
              <th
                key={grp}
                className="px-2 py-1 text-center align-middle font-medium text-zinc-400 bg-zinc-900 min-w-[7rem] w-28"
              >
                <div className="flex flex-wrap items-center justify-center gap-1 px-1.5 py-0.5 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
                  <span className="text-[10px] text-zinc-500 uppercase">{grp}</span>
                  {grouped.filter((c) => String(c.group).trim() === grp).map((col) => (
                    <span key={col.key} className="text-[10px] text-zinc-400">
                      {col.label}
                    </span>
                  ))}
                </div>
              </th>
            ))}
            {/* Effects */}
            <th className="px-2 py-1 text-left align-middle font-medium text-zinc-400 bg-zinc-900 max-w-[14rem] w-[14rem]">Effects</th>
            {/* Actions (delete) */}
            <th className="sticky right-0 z-20 bg-zinc-950 shadow-[-8px_0_15px_-3px_rgba(0,0,0,0.5)] border-l border-zinc-800/50 p-2 align-middle" />
          </tr>
        </thead>
        <tbody>
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
            <tr>
              <td
                colSpan={columnCount}
                className="text-center py-6 px-2 text-zinc-500 bg-zinc-900/50 border-t border-zinc-800 border-dashed"
              >
                No actors in combat.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
