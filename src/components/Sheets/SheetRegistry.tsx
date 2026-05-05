import React from 'react';
import type { Actor, ColumnConfig } from '../../types';
import type { SystemSheetProfile } from '../../hooks/useSystemSheetProfiles';
import { ExampleCustomSheet } from './ExampleCustomSheet';

export type RegisteredActorSheetProps = {
  actor: Actor;
  columns: ColumnConfig[];
  systemName: string;
  /** Resolved sheet profile for this actor (may be null when no profiles exist). */
  resolvedProfile: SystemSheetProfile | null;
  onUpdate?: (id: string, field: string, value: unknown) => void;
  onPatchActor?: (updates: Partial<Actor>) => void;
  onOpenPortraitPicker?: () => void;
};

const REGISTRY: Record<string, React.ComponentType<RegisteredActorSheetProps>> = {
  example_custom: ExampleCustomSheet,
};

export function listCustomActorSheetIds(): string[] {
  return Object.keys(REGISTRY).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

export function getCustomActorSheet(
  customComponentId: string | null | undefined,
): React.ComponentType<RegisteredActorSheetProps> | null {
  const id = (customComponentId ?? '').trim();
  if (!id) return null;
  return REGISTRY[id] ?? null;
}

