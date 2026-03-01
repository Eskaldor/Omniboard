import React from 'react';
import { Plus, Trash } from 'lucide-react';
import type { Actor, ColumnConfig, Effect } from '../../types';
import { InlineInput } from './InlineInput';

export interface ActorRowProps {
  actor: Actor;
  isCurrent: boolean;
  isPastTurn: boolean;
  isGrouped: boolean;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  showGroupColorsInTable: boolean;
  showFactionColorsInTable: boolean;
  legendColor: string;
  columns: ColumnConfig[];
  groupSelectMode: boolean;
  isSelectedForGroup: boolean;
  onUpdate: (updates: Partial<Actor>) => void;
  onDelete: () => void;
  onPortraitClick: () => void;
  onRowDoubleClick: () => void;
  onEffectClick: (effect: Effect) => void;
  onAddEffectClick: () => void;
  onToggleGroupSelect: (selected: boolean) => void;
}

export const ActorRow = React.memo(function ActorRow({
  actor,
  isCurrent,
  isPastTurn,
  isGrouped,
  isFirstInGroup,
  isLastInGroup,
  showGroupColorsInTable,
  showFactionColorsInTable,
  legendColor,
  columns,
  groupSelectMode,
  isSelectedForGroup,
  onUpdate,
  onDelete,
  onPortraitClick,
  onRowDoubleClick,
  onEffectClick,
  onAddEffectClick,
  onToggleGroupSelect,
}: ActorRowProps) {
  const visible = columns.filter((c) => c.showInTable);
  const standalone = visible.filter((c) => !c.group || String(c.group).trim() === '');
  const grouped = visible.filter((c) => c.group && String(c.group).trim() !== '');
  const groupNames = [...new Set(grouped.map((c) => String(c.group).trim()))];

  return (
    <div className={`flex items-center gap-4 group ${isPastTurn ? 'opacity-40 grayscale-[50%]' : ''}`}>
      {/* Portrait */}
      <div className="relative w-[54px] h-[96px] shrink-0">
        {actor.portrait ? (
          <div
            className="w-full h-full rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 flex items-center justify-center shadow-md cursor-pointer hover:border-emerald-500 transition-colors group/portrait"
            onClick={() => !groupSelectMode && onPortraitClick()}
          >
            <img src={actor.portrait} alt={actor.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/portrait:opacity-100 flex items-center justify-center transition-opacity">
              <span className="text-[10px] uppercase font-bold text-white tracking-wider">Change</span>
            </div>
          </div>
        ) : (
          <div
            className="w-full h-full rounded-xl bg-zinc-900 border border-dashed border-zinc-700 flex items-center justify-center cursor-pointer hover:border-emerald-500 transition-colors"
            onClick={() => !groupSelectMode && onPortraitClick()}
          >
            <Plus size={16} className="text-zinc-600" />
          </div>
        )}
        {groupSelectMode && (
          <label className="absolute top-1 right-1 z-20 flex items-center justify-center">
            <input
              type="checkbox"
              checked={isSelectedForGroup}
              onChange={(e) => onToggleGroupSelect(e.target.checked)}
              onClick={(e) => e.stopPropagation()}
              className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500"
            />
          </label>
        )}
      </div>

      {/* Data Row */}
      <div
        onDoubleClick={onRowDoubleClick}
        className={`flex-1 flex items-center gap-4 px-4 py-4 min-h-[96px] bg-zinc-900 border rounded-xl cursor-pointer transition-colors relative overflow-hidden shadow-sm ${isCurrent ? 'border-emerald-500/50 bg-zinc-800/50' : 'border-zinc-800 hover:border-zinc-700'}`}
      >
        {showGroupColorsInTable && isGrouped && (
          <div
            className="absolute left-0 top-0 bottom-0 w-1 z-10 opacity-70 group-hover:opacity-90 transition-all duration-200"
            style={{
              backgroundColor: actor.group_color || '#10b981',
              borderTopLeftRadius: isFirstInGroup ? '0.5rem' : '0',
              borderTopRightRadius: isFirstInGroup ? '0.5rem' : '0',
              borderBottomLeftRadius: isLastInGroup ? '0.5rem' : '0',
              borderBottomRightRadius: isLastInGroup ? '0.5rem' : '0',
              boxShadow: 'none',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = `0 0 12px ${actor.group_color || '#10b981'}`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
        )}
        {isCurrent && (
          <div className={`absolute top-0 bottom-0 w-1 bg-emerald-500 ${isGrouped && showGroupColorsInTable ? 'left-1' : 'left-0'}`} />
        )}
        <div
          className="w-[54px] pl-2 font-mono font-bold text-lg shrink-0"
          style={{ color: showFactionColorsInTable ? legendColor : '#a1a1aa' }}
        >
          <InlineInput
            type="number"
            value={actor.initiative}
            onChange={(val) => onUpdate({ initiative: parseInt(val) || 0 })}
            className="w-10 bg-transparent border border-transparent hover:border-zinc-700 focus:border-emerald-500 rounded px-1 py-0.5 font-mono text-sm focus:outline-none transition-colors"
          />
        </div>
        <div className="w-48">
          <InlineInput
            type="text"
            value={actor.name}
            onChange={(val) => onUpdate({ name: val })}
            className="w-full bg-transparent border border-transparent hover:border-zinc-700 focus:border-emerald-500 rounded px-1 py-0.5 text-zinc-200 font-medium focus:outline-none transition-colors truncate"
          />
        </div>

        <>
          {standalone.map((col) => (
            <div key={col.key} className="w-24">
              <InlineInput
                type="number"
                value={actor.stats[col.key] ?? 0}
                onChange={(val) => onUpdate({ stats: { ...actor.stats, [col.key]: parseInt(val) } })}
                maxValue={
                  col.maxKey != null && typeof actor.stats[col.maxKey] === 'number' ? actor.stats[col.maxKey] : undefined
                }
                className="w-16 bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
          ))}
          {groupNames.map((grp) => (
            <div
              key={grp}
              className="flex flex-wrap gap-2 px-2 py-1 bg-zinc-800/50 rounded-lg border border-zinc-700/50 w-48 max-w-[12rem]"
            >
              {grouped.filter((c) => String(c.group).trim() === grp).map((col) => (
                <div key={col.key} className="flex items-center gap-1">
                  <span className="text-[10px] text-zinc-500">{col.label}:</span>
                  <InlineInput
                    type="number"
                    value={actor.stats[col.key] ?? 0}
                    onChange={(val) => onUpdate({ stats: { ...actor.stats, [col.key]: parseInt(val) } })}
                    maxValue={
                      col.maxKey != null && typeof actor.stats[col.maxKey] === 'number'
                        ? actor.stats[col.maxKey]
                        : undefined
                    }
                    className="w-10 bg-zinc-950 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              ))}
            </div>
          ))}
          <div className="flex-1 flex gap-1 flex-wrap items-center">
            {actor.effects.map((eff) => (
              <button
                key={eff.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEffectClick(eff);
                }}
                className="text-xs px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded-full border border-indigo-500/30 hover:bg-indigo-500/30 hover:border-indigo-400/50 transition-colors cursor-pointer"
                title={eff.description || eff.name}
              >
                {eff.name} {eff.duration != null ? `(${eff.duration})` : ''}
              </button>
            ))}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddEffectClick();
              }}
              className="w-5 h-5 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-emerald-400 transition-colors"
              title="Add Effect"
            >
              <Plus size={12} />
            </button>
          </div>
        </>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="w-8 h-8 rounded-lg bg-zinc-800/50 hover:bg-red-900/50 flex items-center justify-center text-zinc-500 hover:text-red-400 transition-colors ml-2 shrink-0"
          title="Delete Actor"
        >
          <Trash size={14} />
        </button>
      </div>
    </div>
  );
});
