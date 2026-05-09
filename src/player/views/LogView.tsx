import React, { useMemo, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CombatLogEntry } from '../../types';
import type { PlayerAuth, PublicCombatState } from '../types';

interface Props {
  auth: PlayerAuth;
  state: PublicCombatState | null;
}

const LOG_ICONS: Record<string, string> = {
  combat_start: '⚔️',
  combat_end: '🏁',
  round_start: '🔔',
  turn_start: '▶️',
  hp_change: '❤️',
  stat_change: '📊',
  effect_added: '✨',
  effect_removed: '💨',
  actor_joined: '➕',
  actor_left: '➖',
  roll: '🎲',
  text: '💬',
};

function logLabel(entry: CombatLogEntry): string {
  const d = entry.details as Record<string, unknown>;
  switch (entry.type) {
    case 'hp_change': {
      const delta = d['delta'] as number | undefined;
      if (!delta) return `${entry.actor_name ?? '?'}: HP изменился`;
      const sign = delta > 0 ? '+' : '';
      return `${entry.actor_name ?? '?'}: HP ${sign}${delta}`;
    }
    case 'roll': {
      const expr = d['expression'] as string | undefined;
      const total = d['total'] as number | undefined;
      return `${entry.actor_name ?? '?'}: ${expr ?? 'бросок'} → ${total ?? '?'}`;
    }
    case 'effect_added':
      return `${entry.actor_name ?? '?'}: +эффект "${d['effect_name'] ?? '?'}"`;
    case 'effect_removed':
      return `${entry.actor_name ?? '?'}: -эффект "${d['effect_name'] ?? '?'}"`;
    case 'round_start':
      return `Раунд ${entry.round}`;
    case 'turn_start':
      return `Ход: ${entry.actor_name ?? '?'}`;
    case 'combat_start':
      return 'Бой начался';
    case 'combat_end':
      return 'Бой завершён';
    case 'text':
      return (
        (d['text'] as string | undefined) ??
        (d['message'] as string | undefined) ??
        ''
      );
    default:
      return entry.type;
  }
}

export function LogView({ auth, state }: Props) {
  const { t } = useTranslation('core', { useSuspense: false });
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  if (!state) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={28} className="animate-spin text-zinc-600" />
      </div>
    );
  }

  const history = useMemo(() => [...(state.session?.history ?? [])].reverse(), [state.session?.history]);

  const onSend = async () => {
    const msg = text.trim();
    if (!msg || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch('/api/player/log/whisper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Player-Token': auth.token },
        body: JSON.stringify({ text: msg }),
      });
      if (res.ok) {
        setText('');
        return;
      }
      const err = (await res.json().catch(() => ({}))) as { detail?: unknown };
      const detail = typeof err.detail === 'string' ? err.detail : '';
      setSendError(detail || t('player.log.send_failed', 'Не удалось отправить'));
    } catch {
      setSendError(t('player.log.send_failed', 'Не удалось отправить'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="px-4 pt-5 pb-24">
      {history.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <p className="text-zinc-500 text-sm">{t('player.log.empty', 'Лог пуст')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {history.map((entry, i) => {
            const icon = LOG_ICONS[entry.type] ?? '•';
            return (
              <div
                key={i}
                className="flex items-start gap-3 rounded-xl bg-zinc-900/60 border border-zinc-800 px-3 py-2.5"
              >
                <span className="text-base shrink-0">{icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-zinc-200 leading-snug min-w-0 truncate">
                      {logLabel(entry)}
                    </p>
                    {entry.is_secret ? (
                      <span className="shrink-0 text-[10px] px-2 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300">
                        {t('player.log.secret', 'Шёпот')}
                      </span>
                    ) : null}
                  </div>
                  <span className="text-[10px] text-zinc-600">раунд {entry.round}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="fixed bottom-16 inset-x-0 z-40 px-4 pb-3 pt-2 bg-zinc-950/90 backdrop-blur border-t border-zinc-800">
        <div className="flex items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void onSend();
            }}
            placeholder={t('player.log.whisper_placeholder', 'Шёпот мастеру…')}
            className="flex-1 rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-emerald-500"
          />
          <button
            type="button"
            onClick={() => void onSend()}
            disabled={!text.trim() || sending}
            className={[
              'shrink-0 w-11 h-11 grid place-items-center rounded-xl border transition-colors',
              !text.trim() || sending
                ? 'bg-zinc-900/40 border-zinc-800 text-zinc-600'
                : 'bg-emerald-600/20 hover:bg-emerald-600/30 border-emerald-500/40 text-emerald-200',
            ].join(' ')}
            title={t('player.log.send', 'Отправить')}
          >
            <Send size={18} />
          </button>
        </div>
        {sendError ? (
          <div className="mt-2 text-xs text-rose-300/90">{sendError}</div>
        ) : null}
      </div>
    </div>
  );
}
