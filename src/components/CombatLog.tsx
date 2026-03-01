import React, { useEffect, useRef } from 'react';

export interface LogEntryView {
  message: string;
}

interface CombatLogProps {
  history: LogEntryView[];
  isOpen: boolean;
  onClose: () => void;
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
          className="max-h-96 overflow-y-auto p-2 space-y-1"
        >
          {history.length === 0 ? (
            <p className="text-zinc-500 text-sm py-4 text-center">No events yet.</p>
          ) : (
            history.map((entry, index) => (
              <div
                key={index}
                className="text-sm text-zinc-300 py-1 px-2 rounded hover:bg-zinc-800/50"
              >
                {entry.message}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
