import React from 'react';
import toast from 'react-hot-toast';
import { X } from 'lucide-react';

export function showWhisperToast(opts: { actorName?: string; text: string; durationMs?: number }) {
  const { actorName, text, durationMs = 5200 } = opts;
  const name = (actorName ?? '').trim();
  const msg = (text ?? '').trim();
  if (!msg) return;

  toast.custom(
    (t) => (
      <div className="rounded-xl border border-amber-500/30 bg-zinc-900 px-4 py-3 shadow-lg shadow-black/40 max-w-[22rem] relative">
        <button
          type="button"
          onClick={() => toast.dismiss(t.id)}
          className="absolute right-2 top-2 w-7 h-7 grid place-items-center rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/70 transition-colors"
          title="Закрыть"
        >
          <X size={14} />
        </button>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-300/90 mb-1 pr-8">
          Шёпот
        </div>
        {name ? (
          <div className="text-xs text-zinc-400 mb-1 truncate pr-8" title={name}>
            {name}
          </div>
        ) : null}
        <div className="text-sm text-zinc-100 whitespace-pre-wrap break-words">{msg}</div>
      </div>
    ),
    { duration: durationMs },
  );
}

