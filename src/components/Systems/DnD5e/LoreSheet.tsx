import React from 'react';
import type { LoreSheetProps } from '../Default/GenericLoreSheet';
import { GenericLoreSheet } from '../Default/GenericLoreSheet';

export function LoreSheet(props: LoreSheetProps) {
  return (
    <div className="p-4">
      <div className="rounded-2xl border border-zinc-800 bg-[#fdf6e3] text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 overflow-hidden">
        <div className="border-b border-black/10 dark:border-zinc-800 bg-black/5 dark:bg-zinc-900/40 h-8" />
        <div className="bg-white/40 dark:bg-transparent">
          <GenericLoreSheet {...props} />
        </div>
      </div>
    </div>
  );
}

