import type React from 'react';

import { GenericLoreSheet, type LoreSheetProps } from './Default/GenericLoreSheet';
import { LoreSheet as DnD5eLoreSheet } from './DnD5e/LoreSheet';

type LoreSheetComponent = React.ComponentType<LoreSheetProps>;

function normalizeSystemKey(systemName: string): string {
  return systemName.replace(/\s+/g, '').trim().toLowerCase();
}

export function getSystemSheet(systemName: string): LoreSheetComponent {
  const key = normalizeSystemKey(systemName || '');

  switch (key) {
    case 'd&d5e':
    case 'dnd5e':
    case 'dungeons&dragons5e':
    case 'dungeonsanddragons5e':
      return DnD5eLoreSheet;
    default:
      return GenericLoreSheet;
  }
}

