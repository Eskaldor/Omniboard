import React, { useMemo } from 'react';
import type { Actor, ColumnConfig } from '../../types';
import { DefaultSystemSheet } from '../Modals/DefaultSystemSheet';
import { resolveActiveSheetProfile, useSystemSheetProfiles } from '../../hooks/useSystemSheetProfiles';
import { getCustomActorSheet } from './SheetRegistry';

export function ActorFullSheet({
  actor,
  columns,
  systemName,
  onUpdate,
  onPatchActor,
  onOpenPortraitPicker,
  sheetProfiles,
  sheetProfilesLoading,
}: {
  actor: Actor;
  columns: ColumnConfig[];
  systemName: string;
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
      onUpdate={onUpdate}
      onPatchActor={onPatchActor}
      onOpenPortraitPicker={onOpenPortraitPicker}
      sheetProfiles={profiles}
      sheetProfilesLoading={profilesLoading}
    />
  );
}

