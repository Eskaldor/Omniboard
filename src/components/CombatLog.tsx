import React, { useEffect, useRef } from 'react';
import type { CombatLogEntry } from '../types';

export type LogEntryView = CombatLogEntry;

interface CombatLogProps {
  history: LogEntryView[];
  isOpen: boolean;
  onClose: () => void;
}

function LogEvent({ entry, index }: { entry: LogEntryView; index: number }) {
  switch (entry.type) {
    case 'combat_start':
    case 'combat_end':
      return (
        <div className="py-2 text-center text-xs text-zinc-500">
          {entry.type === 'combat_start' ? 'Combat started.' : 'Combat ended.'}
        </div>
      );
    case 'round_start':
      return (
        <div className="flex items-center gap-2 py-2">
          <div className="flex-1 h-px bg-zinc-700" />
          <span className="shrink-0 px-2 py-0.5 text-xs font-medium text-emerald-300/90 bg-emerald-950/60 border border-emerald-800 rounded">
            Round {entry.round}
          </span>
          <div className="flex-1 h-px bg-zinc-700" />
        </div>
      );
    case 'turn_start':
      return (
        <div className="py-1.5 px-2 rounded border-l-2 border-emerald-600/70 bg-zinc-800/50 text-sm text-zinc-200">
          <span className="text-emerald-400/90">▶</span> Turn: {entry.actor_name ?? 'Unknown'}
        </div>
      );
    case 'hp_change': {
      const delta = entry.details?.delta as number | undefined;
      const isDamage = entry.details?.is_damage as boolean | undefined;
      const absDelta = delta != null ? Math.abs(delta) : 0;
      return (
        <div className="py-1.5 px-2 rounded text-sm">
          <span className="text-zinc-300">{entry.actor_name ?? 'Unknown'}</span>
          {delta != null && (
            <>
              {' '}
              {isDamage ? (
                <span className="text-red-400 font-medium">−{absDelta} damage</span>
              ) : (
                <span className="text-emerald-400 font-medium">+{delta} healing</span>
              )}
            </>
          )}
        </div>
      );
    }
    case 'effect_added':
    case 'effect_removed':
    case 'text':
    default:
      return (
        <div className="py-1 px-2 rounded text-sm text-zinc-400">
          {entry.actor_name && <span className="text-zinc-300">{entry.actor_name}: </span>}
          {entry.type === 'text' && typeof entry.details?.message === 'string'
            ? entry.details.message
            : `${entry.type}`}
        </div>
      );
  }
}

export function CombatLog({ history, isOpen, onClose }: CombatLogProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [isOpen, history]);

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        className="absolute top-full mt-2 w-80 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-50 overflow-hidden"
        role="dialog"
        aria-label="Combat log"
      >
        <div className="px-3 py-2 border-b border-zinc-800 text-xs font-medium text-zinc-400 uppercase tracking-wider">
          Combat Log
        </div>
        <div
          ref={listRef}
          className="max-h-96 overflow-y-auto p-2 space-y-2"
        >
          {history.length === 0 ? (
            <p className="text-zinc-500 text-sm py-4 text-center">No events yet.</p>
          ) : (
            history.map((entry, index) => (
              <div key={index} className="first:pt-0">
                <LogEvent entry={entry} index={index} />
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
