import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SheetSummaryEditor } from './SheetSummaryEditor';
import { SheetActionsEditor } from './SheetActionsEditor';
import { SheetHeroEditor } from './SheetHeroEditor';
import { useCombatState } from '../../../contexts/CombatStateContext';
import {
  saveSystemSheetProfiles,
  useSystemSheetProfiles,
  type SystemSheetProfile,
} from '../../../hooks/useSystemSheetProfiles';
import {
  cloneSheetProfiles,
  normalizeSheetProfilesForSave,
} from '../../../utils/sheetProfilesPersistence';
import { listCustomActorSheetIds } from '../../Sheets/SheetRegistry';

export type SheetMode = 'raw' | 'universal' | 'system';

type SheetSubTabId = 'system_view' | 'summary' | 'actions';

const SHEET_SUB_TABS: SheetSubTabId[] = ['system_view', 'summary', 'actions'];

export function SheetTab() {
  const { t } = useTranslation('core', { useSuspense: false });
  const { state } = useCombatState();
  const system = ((state?.core.system ?? '') || '').trim();
  const [activeSubTab, setActiveSubTab] = useState<SheetSubTabId>('summary');

  const { profiles: serverProfiles, loading: profilesLoading, refetchProfiles } =
    useSystemSheetProfiles(system);
  const [localProfiles, setLocalProfiles] = useState<SystemSheetProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState('default');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profilesLoading) return;
    setLocalProfiles(cloneSheetProfiles(serverProfiles));
  }, [serverProfiles, profilesLoading]);

  useEffect(() => {
    setSelectedProfileId((cur) => {
      if (localProfiles.length === 0) return cur;
      if (localProfiles.some((p) => p.id === cur)) return cur;
      return (
        localProfiles.find((p) => p.is_default)?.id ??
        localProfiles.find((p) => p.id === 'default')?.id ??
        localProfiles[0].id
      );
    });
  }, [localProfiles]);

  const canSave = Boolean(system) && localProfiles.length > 0 && !profilesLoading;

  const createProfile = () => {
    const raw = window.prompt(t('config_modal.sheet_profiles_prompt_name'), '');
    if (raw === null) return;
    const name = raw.trim();
    if (!name) return;
    const base = name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_-]/g, '') || 'profile';
    let id = base;
    let n = 2;
    while (localProfiles.some((p) => p.id === id)) {
      id = `${base}_${n}`;
      n += 1;
    }
    setLocalProfiles((prev) => [
      ...prev,
      { id, name, stats: { accordions: [] }, actions: { accordions: [] }, hero_columns: [] },
    ]);
    setSelectedProfileId(id);
  };

  const saveAll = useCallback(async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const payload = normalizeSheetProfilesForSave(localProfiles);
      const ok = await saveSystemSheetProfiles(system, payload);
      if (ok) refetchProfiles();
    } finally {
      setSaving(false);
    }
  }, [canSave, saving, localProfiles, system, refetchProfiles]);

  const pillBase =
    'px-3 py-2 rounded-lg text-sm font-medium border transition-colors whitespace-nowrap';
  const pillInactive = 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700/80 hover:border-zinc-600';
  const pillActive = 'bg-emerald-600 text-white border-emerald-500 shadow-sm shadow-emerald-900/30';

  const selectClass =
    'flex-1 min-w-[180px] py-2 px-2 text-sm bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-200 focus:border-emerald-500 focus:outline-none disabled:opacity-50';

  const selectedProfileOk = localProfiles.some((p) => p.id === selectedProfileId);
  const selectedProfile = localProfiles.find((p) => p.id === selectedProfileId) ?? null;
  const customSheetIds = listCustomActorSheetIds();
  const customSelectValue = (selectedProfile?.custom_component_id ?? '').trim();
  const customSelectKey = `custom-sheet-${selectedProfile?.id ?? ''}-${customSheetIds.join(',')}`;

  const setSelectedProfileCustomComponentId = (id: string) => {
    const nextId = id.trim();
    setLocalProfiles((prev) =>
      prev.map((p) => {
        if (p.id !== selectedProfileId) return p;
        if (!nextId) {
          const { custom_component_id: _removed, ...rest } = p;
          return rest;
        }
        return { ...p, custom_component_id: nextId };
      }),
    );
  };

  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
        {t('config_modal.section_sheet')}
      </div>

      <div className="flex flex-wrap gap-2 items-stretch sm:items-center">
        <select
          value={selectedProfileOk ? selectedProfileId : ''}
          onChange={(e) => setSelectedProfileId(e.target.value)}
          disabled={profilesLoading || localProfiles.length === 0}
          className={selectClass}
          aria-label={t('config_modal.sheet_profiles_select_aria')}
          title={t('config_modal.sheet_profiles_select_aria')}
        >
          {localProfiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={createProfile}
          disabled={profilesLoading || !system}
          className="shrink-0 px-3 py-2 text-xs font-medium rounded-lg border border-emerald-500/40 bg-emerald-600/15 text-emerald-200 hover:bg-emerald-600/25 disabled:opacity-50 disabled:pointer-events-none transition-colors"
        >
          {t('config_modal.sheet_profiles_create')}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 items-stretch sm:items-center">
        <select
          key={customSelectKey}
          value={customSelectValue}
          onChange={(e) => setSelectedProfileCustomComponentId(e.target.value)}
          disabled={!selectedProfile || profilesLoading}
          className={selectClass}
          aria-label={t('config_modal.sheet_custom_component_select_aria')}
          title={t('config_modal.sheet_custom_component_select_aria')}
        >
          <option value="">{t('config_modal.sheet_custom_component_universal')}</option>
          {customSheetIds.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        {SHEET_SUB_TABS.map((id) => {
          const active = activeSubTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveSubTab(id)}
              className={`${pillBase} ${active ? pillActive : pillInactive}`}
            >
              {t(`config_modal.sheet_subtab_${id === 'system_view' ? 'system' : id}`)}
            </button>
          );
        })}
      </div>

      <div className="bg-zinc-950/40 border border-zinc-800 rounded-xl p-4 min-h-[140px]">
        {activeSubTab === 'system_view' && (
          <SheetHeroEditor
            system={system}
            localProfiles={localProfiles}
            setLocalProfiles={setLocalProfiles}
            selectedProfileId={selectedProfileId}
            profilesLoading={profilesLoading}
            saving={saving}
            canSave={canSave}
            onSave={saveAll}
          />
        )}
        {activeSubTab === 'summary' && (
          <SheetSummaryEditor
            system={system}
            localProfiles={localProfiles}
            setLocalProfiles={setLocalProfiles}
            selectedProfileId={selectedProfileId}
            profilesLoading={profilesLoading}
            saving={saving}
            canSave={canSave}
            onSave={saveAll}
          />
        )}
        {activeSubTab === 'actions' && (
          <SheetActionsEditor
            system={system}
            localProfiles={localProfiles}
            setLocalProfiles={setLocalProfiles}
            selectedProfileId={selectedProfileId}
            profilesLoading={profilesLoading}
            saving={saving}
            canSave={canSave}
            onSave={saveAll}
          />
        )}
      </div>
    </div>
  );
}
