import React, { useEffect, useMemo } from 'react';
import type { Actor, ColumnConfig } from '../../types';
import { DefaultSystemSheet } from '../Modals/DefaultSystemSheet';
import { resolveActiveSheetProfile, useSystemSheetProfiles } from '../../hooks/useSystemSheetProfiles';
import { getCustomActorSheet } from './SheetRegistry';
import i18n from '../../i18n';
import type { PublicCombatState } from '../../player/types';

export function ActorFullSheet({
  actor,
  columns,
  systemName,
  playerAuthToken,
  playerActorId,
  playerState,
  onUpdate,
  onPatchActor,
  onOpenPortraitPicker,
  sheetProfiles,
  sheetProfilesLoading,
}: {
  actor: Actor;
  columns: ColumnConfig[];
  systemName: string;
  playerAuthToken?: string;
  playerActorId?: string;
  playerState?: PublicCombatState | null;
  onUpdate?: (id: string, field: string, value: unknown) => void;
  onPatchActor?: (updates: Partial<Actor>) => void;
  onOpenPortraitPicker?: () => void;
  sheetProfiles?: import('../../hooks/useSystemSheetProfiles').SystemSheetProfile[];
  sheetProfilesLoading?: boolean;
}) {
  const resolvedSystemName = (systemName || '').trim();
  const injectedProfiles = sheetProfiles;
  const injectedLoading = sheetProfilesLoading;
  const hook = useSystemSheetProfiles(resolvedSystemName);
  const profiles = injectedProfiles ?? hook.profiles;
  const profilesLoading = injectedLoading ?? hook.loading;

  const resolvedProfile = useMemo(
    () => resolveActiveSheetProfile(profiles, actor.sheet_profile_id),
    [profiles, actor.sheet_profile_id],
  );

  const systemNamespace = `systems/${resolvedSystemName}`;
  useEffect(() => {
    if (!resolvedSystemName) return;
    try {
      const lang = i18n.language || (i18n.options?.fallbackLng as string) || 'en';
      const langCode = typeof lang === 'string' ? lang.split('-')[0] : 'en';
      if (langCode && !i18n.hasResourceBundle(langCode, systemNamespace)) {
        i18n.loadNamespaces(systemNamespace).catch(() => {});
      }
    } catch {
      // ignore
    }
  }, [resolvedSystemName, systemNamespace]);

  const Custom = getCustomActorSheet(resolvedProfile?.custom_component_id);
  if (Custom) {
    return (
      <Custom
        actor={actor}
        columns={columns}
        systemName={resolvedSystemName}
        resolvedProfile={resolvedProfile}
        onUpdate={onUpdate}
        onPatchActor={onPatchActor}
        onOpenPortraitPicker={onOpenPortraitPicker}
      />
    );
  }

  return (
    <DefaultSystemSheet
      actor={actor}
      columns={columns}
      systemName={resolvedSystemName}
      variant="player"
      playerAuthToken={playerAuthToken}
      playerActorId={playerActorId}
      playerState={playerState}
      onUpdate={onUpdate}
      onPatchActor={onPatchActor}
      onOpenPortraitPicker={onOpenPortraitPicker}
      sheetProfiles={profiles}
      sheetProfilesLoading={profilesLoading}
    />
  );
}

