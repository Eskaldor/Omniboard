import React from 'react';
import type { RegisteredActorSheetProps } from './SheetRegistry';

export function ExampleCustomSheet({ actor, systemName, resolvedProfile }: RegisteredActorSheetProps) {
  return (
    <div className="p-5 space-y-3">
      <div className="text-xs text-zinc-500 uppercase tracking-wider">ExampleCustomSheet</div>
      <div className="text-lg font-semibold text-zinc-100 truncate">{actor.name}</div>
      <div className="text-sm text-zinc-400">
        system: <span className="font-mono text-zinc-200">{systemName}</span>
      </div>
      <div className="text-sm text-zinc-400">
        profile:{' '}
        <span className="font-mono text-zinc-200">
          {resolvedProfile?.id ?? '—'} ({resolvedProfile?.custom_component_id ?? 'universal'})
        </span>
      </div>
      <div className="text-xs text-zinc-500">
        This is a placeholder custom sheet component wired through the registry.
      </div>
    </div>
  );
}

