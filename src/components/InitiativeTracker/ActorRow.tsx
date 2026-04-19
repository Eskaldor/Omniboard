import React from 'react';
import { Plus, Trash } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import type { Actor, ColumnConfig, Effect } from '../../types';
import { getMaxKey, buildStatUpdate as buildStatUpdateUtil } from '../../utils/stats';
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
  systemName: string;
  groupSelectMode: boolean;
  isSelectedForGroup: boolean;
  onUpdate: (updates: Partial<Actor>) => void;
  onDelete: () => void;
  onPortraitClick: () => void;
  onRowDoubleClick: () => void;
  onEffectClick: (effect: Effect) => void;
  onAddEffectClick: () => void;
  onToggleGroupSelect: (selected: boolean) => void;
  /** When false, portrait column is hidden (cell not rendered). When true, portrait cell is shown only if actor.show_portrait. */
  showPortraitColumn: boolean;
  /** Hide initiative column (e.g. Popcorn engine) */
  showInitColumn?: boolean;
  /** Manual / Popcorn / Phase: table uses has_acted for past-turn styling */
  clickToActEngine?: boolean;
  /** Whether this row accepts a click to assign turn (manual: always true; phase: current phase only) */
  rowClickEnabled?: boolean;
  /** Phase engine: wrong phase, not yet acted — light dim, no pointer/hover */
  phaseRowInactive?: boolean;
  isActiveCombat?: boolean;
  onManualRowActivate?: () => void | Promise<void>;
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
  systemName,
  groupSelectMode,
  isSelectedForGroup,
  onUpdate,
  onDelete,
  onPortraitClick,
  onRowDoubleClick,
  onEffectClick,
  onAddEffectClick,
  onToggleGroupSelect,
  showPortraitColumn,
  showInitColumn = true,
  clickToActEngine = false,
  rowClickEnabled = false,
  phaseRowInactive = false,
  isActiveCombat = false,
  onManualRowActivate,
}: ActorRowProps) {
  const { t } = useTranslation('core', { useSuspense: false });
  const colLabel = (col: ColumnConfig) =>
    i18n.t(`${col.key}.name`, { ns: `systems/${systemName}`, defaultValue: col.label });
  const visible = columns.filter((c) => c.showInTable);
  const buildStatUpdate = (col: ColumnConfig, baseKey: string, newVal: number) =>
    buildStatUpdateUtil(actor, col, baseKey, newVal);
  const standalone = visible.filter(
    (c) => !c.group || String(c.group).trim() === '',
  );
  const grouped = visible.filter(
    (c) => c.group && String(c.group).trim() !== '',
  );
  const groupNames = [...new Set(grouped.map((c) => String(c.group).trim()))];

  const manualRowActive = rowClickEnabled && isActiveCombat && !!onManualRowActivate;
  const hasActedDim = clickToActEngine && !!actor.has_acted;

  const handleRowClick = (e: React.MouseEvent<HTMLTableRowElement>) => {
    if (!manualRowActive) return;
    if (e.detail !== 1) return;
    const t = e.target as HTMLElement;
    if (t.closest('button, input, textarea, select, a')) return;
    void onManualRowActivate?.();
  };

  return (
    <tr
      onClick={handleRowClick}
      onDoubleClick={onRowDoubleClick}
      className={`group transition-colors [&>td:not(:first-child):not(:last-child)]:border-b [&>td:not(:first-child):not(:last-child)]:border-zinc-800/50 ${
        isCurrent
          ? 'rounded-lg ring-1 ring-inset ring-zinc-500 bg-zinc-800/40'
          : `bg-zinc-900/50 ${
              phaseRowInactive && !hasActedDim
                ? 'opacity-[0.88] cursor-default hover:bg-zinc-900/50'
                : 'hover:bg-zinc-800/50'
            }`
      } ${isPastTurn ? 'opacity-40 grayscale-[50%]' : ''} ${hasActedDim ? 'opacity-55 grayscale' : ''} ${
        manualRowActive ? 'cursor-pointer' : ''
      }`}
    >
      {/* Portrait: only render when column is shown and actor has show_portrait */}
      {showPortraitColumn && (
        <td className="px-2 py-1 align-middle sticky left-0 z-10 bg-zinc-950 shadow-[8px_0_15px_-3px_rgba(0,0,0,0.5)] border-r border-zinc-800/50">
          {actor.show_portrait ? (
            <div className="relative w-[54px] h-[96px]">
              {actor.portrait || actor.miniature_id ? (
                <div
                  className={`w-full h-full rounded-xl overflow-hidden bg-zinc-900 flex items-center justify-center shadow-md ${
                    actor.miniature_id ? 'border border-emerald-500/50' : 'border border-zinc-800'
                  }`}
                >
                  <img
                    src={actor.miniature_id ? `/api/render/${actor.id}?t=${Date.now()}` : actor.portrait!}
                    alt={actor.name}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
              ) : (
                <div className="w-full h-full rounded-xl bg-zinc-900 border border-dashed border-zinc-700 flex items-center justify-center">
                  <Plus size={16} className="text-zinc-600" />
                </div>
              )}
            </div>
          ) : (
            <div className="w-0 min-w-0 h-[96px]" aria-hidden />
          )}
        </td>
      )}

      {showInitColumn && (
        <td className="relative px-2 py-1 text-center align-middle">
          {showGroupColorsInTable && !!actor.group_id && (
            <div
              className="absolute left-0 top-1 bottom-1 w-1 z-10 opacity-70"
              style={{
                backgroundColor: actor.group_color || '#10b981',
                borderRadius: '9999px',
              }}
            />
          )}
          <div className="flex items-center justify-center gap-2">
            {groupSelectMode && (
              <input
                type="checkbox"
                checked={isSelectedForGroup}
                onChange={(e) => onToggleGroupSelect(e.target.checked)}
                onClick={(e) => e.stopPropagation()}
                className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500"
              />
            )}
            <div
              className="w-[54px] mx-auto font-mono font-bold text-lg"
              style={{ color: showFactionColorsInTable ? legendColor : '#a1a1aa' }}
            >
              <InlineInput
                type="number"
                value={actor.initiative}
                onChange={(val) => onUpdate({ initiative: parseInt(val) || 0 })}
                className="w-10 bg-transparent border border-transparent hover:border-zinc-700 focus:border-emerald-500 rounded px-1 py-0.5 font-mono text-sm focus:outline-none transition-colors"
              />
            </div>
          </div>
        </td>
      )}

      {/* Name */}
      <td className="relative px-2 py-1 align-middle">
        {!showInitColumn && showGroupColorsInTable && !!actor.group_id && (
          <div
            className="absolute left-0 top-1 bottom-1 w-1 z-10 opacity-70"
            style={{
              backgroundColor: actor.group_color || '#10b981',
              borderRadius: '9999px',
            }}
          />
        )}
        <div className="flex items-center gap-2">
          {!showInitColumn && groupSelectMode && (
            <input
              type="checkbox"
              checked={isSelectedForGroup}
              onChange={(e) => onToggleGroupSelect(e.target.checked)}
              onClick={(e) => e.stopPropagation()}
              className="w-4 h-4 shrink-0 rounded border-zinc-600 bg-zinc-800 text-emerald-500"
            />
          )}
          <div className="w-32">
            <InlineInput
              type="text"
              value={actor.name}
              onChange={(val) => onUpdate({ name: val })}
              className="w-full bg-transparent border border-transparent hover:border-zinc-700 focus:border-emerald-500 rounded px-1 py-0.5 text-zinc-200 font-medium focus:outline-none transition-colors truncate"
            />
          </div>
        </div>
      </td>

      {/* Standalone stats */}
      {standalone.map((col) => {
        const maxKey = getMaxKey(col);
        const hasMaxKey = !!maxKey;
        const showAsFraction = (col.display_as_fraction ?? false) && hasMaxKey;

        if (showAsFraction) {
          const maxVal = actor.stats[maxKey!];
          return (
            <td key={col.key} className="px-2 py-1 text-center align-middle">
              <div className="min-w-[5rem] w-20 mx-auto flex items-center justify-center gap-1 whitespace-nowrap">
                <InlineInput
                  type="number"
                  value={actor.stats[col.key] ?? 0}
                  onChange={(val) =>
                    onUpdate({
                      stats: buildStatUpdate(col, col.key, parseInt(val)),
                    })
                  }
                  maxValue={
                    typeof maxVal === 'number' ? maxVal : (col.max_value ?? undefined)
                  }
                  className="w-10 bg-zinc-950 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
                />
                <span className="text-xs text-zinc-500">/</span>
                <span className="min-w-[1.5rem] text-xs text-zinc-400 tabular-nums">
                  {maxVal != null ? String(maxVal) : '—'}
                </span>
              </div>
            </td>
          );
        }

        return (
          <td key={col.key} className="px-2 py-1 text-center align-middle">
            <div className="min-w-[5rem] w-20 mx-auto flex items-center justify-center gap-1">
              <InlineInput
                type="number"
                value={actor.stats[col.key] ?? 0}
                onChange={(val) =>
                  onUpdate({
                    stats: buildStatUpdate(col, col.key, parseInt(val)),
                  })
                }
                maxValue={
                  maxKey && typeof actor.stats[maxKey] === 'number'
                    ? (actor.stats[maxKey] as number)
                    : col.max_value
                }
                className="w-16 bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </td>
        );
      })}

      {/* Grouped stats */}
      {groupNames.map((grp) => (
        <td key={grp} className="px-2 py-1 text-center align-middle">
          <div className="min-w-[7rem] w-28 mx-auto flex flex-wrap items-center justify-center gap-1 px-1.5 py-0.5 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
            {grouped
              .filter((c) => String(c.group).trim() === grp)
              .map((col) => {
                const maxKey = getMaxKey(col);
                const hasMaxKey = !!maxKey;
                const showAsFraction = (col.display_as_fraction ?? false) && hasMaxKey;

                if (showAsFraction) {
                  const maxVal = actor.stats[maxKey!];
                  return (
                    <div
                      key={col.key}
                      className="flex items-center justify-center gap-1 whitespace-nowrap text-xs text-zinc-200"
                    >
                      <span className="text-[10px] text-zinc-500">{colLabel(col)}:</span>
                      <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                        <InlineInput
                          type="number"
                          value={actor.stats[col.key] ?? 0}
                          onChange={(val) =>
                            onUpdate({
                              stats: buildStatUpdate(col, col.key, parseInt(val)),
                            })
                          }
                          maxValue={
                            typeof maxVal === 'number' ? maxVal : (col.max_value ?? undefined)
                          }
                          className="w-8 bg-zinc-950 border border-zinc-700 rounded px-1 py-0.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
                        />
                        <span className="text-[10px] text-zinc-500">/</span>
                        <span className="min-w-[1.25rem] text-[10px] text-zinc-400 tabular-nums">
                          {maxVal != null ? String(maxVal) : '—'}
                        </span>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={col.key}
                    className="flex items-center justify-center gap-1 whitespace-nowrap text-xs text-zinc-200"
                  >
                    <span className="text-[10px] text-zinc-500">{colLabel(col)}:</span>
                    <InlineInput
                      type="number"
                      value={actor.stats[col.key] ?? 0}
                      onChange={(val) =>
                        onUpdate({
                          stats: buildStatUpdate(col, col.key, parseInt(val)),
                        })
                      }
                      maxValue={
                        maxKey != null && typeof actor.stats[maxKey] === 'number'
                          ? (actor.stats[maxKey] as number)
                          : col.max_value
                      }
                      className="w-10 bg-zinc-950 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                );
              })}
          </div>
        </td>
      ))}

      {/* Effects */}
      <td className="px-2 py-1 align-middle max-w-[14rem] whitespace-normal">
        <div className="flex flex-wrap items-center gap-1 min-w-0 py-1">
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
            title={t('main.add_effect')}
          >
            <Plus size={12} />
          </button>
        </div>
      </td>

      {/* Delete */}
      <td className="sticky right-0 z-10 bg-zinc-950 shadow-[-8px_0_15px_-3px_rgba(0,0,0,0.5)] border-l border-zinc-800/50 px-2 py-1 text-center align-middle">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="w-8 h-8 rounded-lg bg-zinc-800/50 hover:bg-red-900/50 flex items-center justify-center text-zinc-500 hover:text-red-400 transition-colors"
          title={t('main.delete_actor')}
        >
          <Trash size={14} />
        </button>
      </td>
    </tr>
  );
});
