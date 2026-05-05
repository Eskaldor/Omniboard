import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BookOpen, List, Swords, X } from 'lucide-react';
import { Actor, ColumnConfig } from '../../types';
import { useCombatState } from '../../contexts/CombatStateContext';
import { useTranslation } from 'react-i18next';
import { DefaultSystemSheet } from './DefaultSystemSheet';
import { ActionsPanel } from './ActionsPanel';
import { ActorActionEditor } from './ActorActionEditor';
import { ActorFullSheet } from '../Sheets/ActorFullSheet';
import {
  resolveActiveSheetProfile,
  useSystemSheetProfiles,
} from '../../hooks/useSystemSheetProfiles';
import { useSystemActions } from '../../hooks/useSystemActions';
import { mergeActorActionDefs } from '../../utils/mergeActorActionDefs';
import {
  parseRollHttpResponse,
  showRollErrorToast,
  showRollResultToast,
} from '../../utils/rollToast';

export function MiniSheetModal({
  actor,
  columns,
  systemName,
  onClose,
  onUpdate,
  onPatchActor,
  onPortraitClick,
}: {
  actor: Actor;
  columns: ColumnConfig[];
  systemName: string;
  onClose: () => void;
  onUpdate?: (id: string, field: string, value: unknown) => void;
  /** Debounced PATCH merge (preferred over raw fetch). */
  onPatchActor: (updates: Partial<Actor>) => void;
  onPortraitClick?: () => void;
}) {
  const { t } = useTranslation('core', { useSuspense: false });
  const { state } = useCombatState();
  const liveActor = state?.core.actors.find((a) => a.id === actor.id) ?? actor;
  const [localName, setLocalName] = useState(liveActor.name);
  const [sheetSidebar, setSheetSidebar] = useState<'lore' | 'gm'>('gm');
  const [isEditingActions, setIsEditingActions] = useState(false);
  const [activeTab, setActiveTab] = useState<'stats' | 'actions'>('stats');
  const miniSheetCols = columns.filter((c) => c.show_in_mini_sheet);

  const combatSystem = ((state?.core.system ?? systemName) || '').trim();
  const { profiles: sheetProfiles, loading: sheetProfilesLoading } = useSystemSheetProfiles(combatSystem);
  const { actions: systemActions, loading: actionsLoading } = useSystemActions(combatSystem);

  const mergedActionDefs = useMemo(
    () => mergeActorActionDefs(systemActions, liveActor),
    [systemActions, liveActor],
  );

  const activeProfile = useMemo(
    () => resolveActiveSheetProfile(sheetProfiles, liveActor.sheet_profile_id),
    [sheetProfiles, liveActor.sheet_profile_id],
  );

  useEffect(() => {
    setLocalName(liveActor.name);
  }, [liveActor.name]);

  const handleRollAction = useCallback(
    async (formula: string, comment: string) => {
      const expr = formula.trim();
      if (!expr) return;
      try {
        const res = await fetch(`/api/combat/actors/${encodeURIComponent(liveActor.id)}/roll`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expression: expr,
            is_preroll: false,
            ...(comment.trim() ? { comment: comment.trim() } : {}),
          }),
        });
        const parsed = await parseRollHttpResponse(res);
        if (!parsed.ok) {
          showRollErrorToast(parsed.message);
          return;
        }
        showRollResultToast({
          result: parsed.result,
          actorName: liveActor.name,
          comment: comment.trim() || undefined,
        });
      } catch {
        showRollErrorToast(t('stat_editor.roll_network_error'));
      }
    },
    [liveActor.id, t],
  );

  const gmTabBtnClass = (active: boolean) =>
    `flex-1 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
      active
        ? 'border-emerald-500 text-emerald-300 bg-zinc-900/40'
        : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30'
    }`;

  const selectLore = () => {
    setSheetSidebar('lore');
    setIsEditingActions(false);
  };

  const selectGm = () => {
    setSheetSidebar('gm');
    setIsEditingActions(false);
  };

  const selectActionEditor = () => {
    setIsEditingActions(true);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl">
        <div className="px-3 py-2 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[11px] uppercase tracking-wider text-zinc-500 shrink-0">
              {t('modals.mini_sheet')}
            </span>
            <input
              type="text"
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              onBlur={() => onUpdate?.(liveActor.id, 'name', localName)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              autoFocus
              className="bg-transparent border-b border-dashed border-zinc-700 hover:border-zinc-500 focus:border-emerald-500 focus:outline-none text-base font-medium text-zinc-100 px-1 py-0.5 min-w-0 flex-1 max-w-[20rem] transition-colors"
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onClose}
              className="p-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-colors"
              title={t('common.close')}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {!isEditingActions && sheetSidebar === 'gm' && (
          <div className="flex border-b border-zinc-800 bg-zinc-950/30">
            <button
              type="button"
              className={gmTabBtnClass(activeTab === 'stats')}
              onClick={() => setActiveTab('stats')}
            >
              {t('modals.mini_sheet_tab_stats')}
            </button>
            <button
              type="button"
              className={gmTabBtnClass(activeTab === 'actions')}
              onClick={() => setActiveTab('actions')}
            >
              {t('modals.mini_sheet_tab_actions')}
            </button>
          </div>
        )}

        <div className="flex flex-row">
          <div className="w-10 border-r border-zinc-800 bg-zinc-950/40 flex flex-col items-center py-2 gap-1">
            <button
              type="button"
              title={t('modals.tab_lore')}
              onClick={selectLore}
              className={`p-1.5 rounded-md transition-colors ${
                sheetSidebar === 'lore' && !isEditingActions
                  ? 'text-emerald-400 bg-zinc-800/60'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30'
              }`}
            >
              <BookOpen size={16} />
            </button>
            <button
              type="button"
              title={t('modals.tab_gm')}
              onClick={selectGm}
              className={`p-1.5 rounded-md transition-colors ${
                sheetSidebar === 'gm' && !isEditingActions
                  ? 'text-emerald-400 bg-zinc-800/60'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30'
              }`}
            >
              <List size={16} />
            </button>
            <button
              type="button"
              title={t('modals.tab_action_editor')}
              onClick={selectActionEditor}
              className={`p-1.5 rounded-md transition-colors ${
                isEditingActions
                  ? 'text-emerald-400 bg-zinc-800/60'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30'
              }`}
            >
              <Swords size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[75vh] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {isEditingActions ? (
              actionsLoading ? (
                <div className="p-4 text-sm text-zinc-500">{t('modals.mini_sheet_layout_loading')}</div>
              ) : (
                <ActorActionEditor
                  actor={liveActor}
                  systemActions={systemActions}
                  mergedActionDefs={mergedActionDefs}
                  profileActionsAccordions={activeProfile?.actions?.accordions}
                  onPatchActor={onPatchActor}
                />
              )
            ) : sheetSidebar === 'lore' ? (
              <ActorFullSheet
                actor={liveActor}
                columns={miniSheetCols}
                systemName={systemName}
                onUpdate={onUpdate}
                onPatchActor={onPatchActor}
                onOpenPortraitPicker={onPortraitClick}
                sheetProfiles={sheetProfiles}
                sheetProfilesLoading={sheetProfilesLoading}
              />
            ) : activeTab === 'actions' ? (
              actionsLoading ? (
                <div className="p-4 text-sm text-zinc-500">{t('modals.mini_sheet_layout_loading')}</div>
              ) : (
                <ActionsPanel
                  actor={liveActor}
                  mergedActionDefs={mergedActionDefs}
                  onRollAction={handleRollAction}
                  actionsAccordions={activeProfile?.actions?.accordions}
                />
              )
            ) : (
              <DefaultSystemSheet
                actor={liveActor}
                columns={miniSheetCols}
                systemName={systemName}
                onUpdate={onUpdate}
                onOpenPortraitPicker={onPortraitClick}
                onPatchActor={onPatchActor}
                sheetProfiles={sheetProfiles}
                sheetProfilesLoading={sheetProfilesLoading}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
