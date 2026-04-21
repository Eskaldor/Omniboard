import React, { useEffect, useRef, useState } from 'react';
import { FolderOpen, Trash2, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CombatLogEntry } from '../types';

export type LogEntryView = CombatLogEntry;

interface CombatLogProps {
  history: LogEntryView[];
  isOpen: boolean;
  onClose: () => void;
  enableLogging?: boolean;
  onRefetch: () => void;
}

function LogEvent({ entry, index }: { entry: LogEntryView; index: number }) {
  const { t } = useTranslation('core', { useSuspense: false });
  const isGmNote = entry.type === 'text' && entry.details?.is_gm_note === true;

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
    case 'stat_change': {
      const color = typeof entry.details?.color === 'string' ? entry.details.color : '#a1a1aa';
      const customMessage = entry.details?.message;
      if (typeof customMessage === 'string' && customMessage.trim() !== '') {
        return (
          <div className="py-1.5 px-2 rounded text-sm">
            <span className="text-zinc-300">{entry.actor_name ?? 'Unknown'}</span>
            {' '}
            <span style={{ color }} className="font-medium">
              {customMessage.trim()}
            </span>
          </div>
        );
      }
      const statName = (entry.details?.stat_name as string) ?? (entry.details?.stat_key as string) ?? '?';
      const amount = typeof entry.details?.amount === 'number' ? entry.details.amount : 0;
      const absCount = Math.abs(amount);
      const isIncrease = amount > 0;
      const messageKey = isIncrease ? 'log.stat_increased' : 'log.stat_decreased';
      const message = t(messageKey, { stat: statName, count: absCount });
      return (
        <div className="py-1.5 px-2 rounded text-sm">
          <span className="text-zinc-300">{entry.actor_name ?? 'Unknown'}</span>
          {' '}
          <span style={{ color }} className="font-medium">{message}</span>
        </div>
      );
    }
    case 'effect_added':
      return (
        <div className="py-1.5 px-2 rounded text-sm">
          <span className="text-zinc-300">{entry.actor_name ?? 'Unknown'}</span>
          <span className="text-zinc-400"> gained effect: </span>
          <span className="text-indigo-400">{entry.details?.effect_name ?? '?'}</span>
        </div>
      );
    case 'effect_removed':
      return (
        <div className="py-1.5 px-2 rounded text-sm">
          <span className="text-zinc-300">{entry.actor_name ?? 'Unknown'}</span>
          <span className="text-zinc-400"> lost effect: </span>
          <span className="text-zinc-500 line-through">{entry.details?.effect_name ?? '?'}</span>
        </div>
      );
    case 'actor_joined':
      return (
        <div className="py-1.5 px-2 rounded text-sm text-zinc-400 border-l-2 border-emerald-700/50 bg-emerald-950/20">
          <span className="text-zinc-300">{entry.actor_name ?? 'Unknown'}</span>
          <span className="text-emerald-400/90"> joined the battle.</span>
        </div>
      );
    case 'actor_left':
      return (
        <div className="py-1.5 px-2 rounded text-sm text-zinc-400 border-l-2 border-red-800/50 bg-red-950/20">
          <span className="text-zinc-300">{entry.actor_name ?? 'Unknown'}</span>
          <span className="text-red-400/90"> left the battle.</span>
        </div>
      );
    case 'text':
    default:
      if (isGmNote) {
        const message = typeof entry.details?.message === 'string' ? entry.details.message : '';
        return (
          <div className="py-1.5 px-2 rounded border-l-2 border-amber-600/70 bg-amber-900/20 text-sm text-amber-200/90 italic">
            {message || 'GM note'}
          </div>
        );
      }
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

export function CombatLog({ history, isOpen, onClose, enableLogging = true, onRefetch }: CombatLogProps) {
  const { t } = useTranslation('core', { useSuspense: false });
  const listRef = useRef<HTMLDivElement>(null);
  const [noteInput, setNoteInput] = useState('');
  const [sendingNote, setSendingNote] = useState(false);

  useEffect(() => {
    if (isOpen && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [isOpen, history]);

  const setEnableLogging = async (checked: boolean) => {
    await fetch('/api/combat/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enable_logging: checked }),
    });
    onRefetch();
  };

  const openFolder = async () => {
    await fetch('/api/logs/open_folder', { method: 'POST' });
  };

  const clearLog = async () => {
    if (!confirm('Clear all combat logs?')) return;
    await fetch('/api/combat/log', { method: 'DELETE' });
    onRefetch();
  };

  const sendNote = async () => {
    const msg = noteInput.trim();
    if (!msg || sendingNote) return;
    setSendingNote(true);
    try {
      await fetch('/api/combat/log/note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      });
      setNoteInput('');
      onRefetch();
    } finally {
      setSendingNote(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        className="absolute top-full mt-2 w-[26rem] max-w-[90vw] bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col"
        role="dialog"
        aria-label={t('header.combat_log')}
      >
        {/* Header */}
        <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">{t('header.combat_log')}</span>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 cursor-pointer text-xs text-zinc-400 hover:text-zinc-300">
              <input
                type="checkbox"
                checked={enableLogging}
                onChange={(e) => setEnableLogging(e.target.checked)}
                className="rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500/50"
              />
              {t('combat_log.record_log')}
            </label>
            <button
              type="button"
              onClick={openFolder}
              className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              title={t('combat_log.open_logs_folder')}
            >
              <FolderOpen size={16} />
            </button>
            <button
              type="button"
              onClick={clearLog}
              className="p-1.5 rounded-md text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors"
              title={t('combat_log.clear_all_logs')}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div
          ref={listRef}
          className="max-h-[28rem] overflow-y-auto p-2 space-y-2 flex-1 min-h-0"
        >
          {history.length === 0 ? (
            <p className="text-zinc-500 text-sm py-4 text-center">{t('combat_log.no_events_yet')}</p>
          ) : (
            history.map((entry, index) => (
              <div key={index} className="first:pt-0">
                <LogEvent entry={entry} index={index} />
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-2 py-2 border-t border-zinc-800 flex gap-2">
          <input
            type="text"
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') sendNote(); }}
            placeholder="Add GM note..."
            className="flex-1 min-w-0 px-2 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50"
          />
          <button
            type="button"
            onClick={sendNote}
            disabled={!noteInput.trim() || sendingNote}
            className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
            title="Send note"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </>
  );
}
