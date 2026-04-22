import React from 'react';
import { Info } from 'lucide-react';

export function InfoTooltip({
  text,
  className = '',
}: {
  text: string;
  className?: string;
}) {
  if (!text) return null;

  return (
    <span className={`relative inline-flex items-center shrink-0 ${className}`}>
      <span className="group relative inline-flex items-center">
        <button
          type="button"
          className="inline-flex items-center justify-center text-gray-400 hover:text-gray-200 transition-colors cursor-help focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 rounded"
          aria-label={text}
        >
          <Info size={14} aria-hidden />
        </button>
        <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-64 -translate-x-1/2 rounded-lg border border-zinc-700 bg-zinc-900/95 px-3 py-2 text-xs text-zinc-200 shadow-xl opacity-0 translate-y-1 transition-all duration-150 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0">
          {text}
        </span>
      </span>
    </span>
  );
}

