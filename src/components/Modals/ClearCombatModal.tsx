import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { X } from 'lucide-react';

export interface ClearCombatModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** After clear (and optional auto-start) requests finish; refetch or sync local UI. */
  onSettled?: () => void | Promise<void>;
}

export function ClearCombatModal({ isOpen, onClose, onSettled }: ClearCombatModalProps) {
  const { t } = useTranslation('core', { useSuspense: false });
  const [keepPinned, setKeepPinned] = useState(true);
  const [autoStart, setAutoStart] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setKeepPinned(true);
      setAutoStart(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const clearRes = await fetch('/api/combat/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keep_pinned: keepPinned }),
      });
      if (!clearRes.ok) {
        throw new Error(`clear failed: HTTP ${clearRes.status}`);
      }
      if (autoStart) {
        const startRes = await fetch('/api/combat/start', { method: 'POST' });
        if (!startRes.ok) {
          throw new Error(`start failed: HTTP ${startRes.status}`);
        }
      }
      await onSettled?.();
      onClose();
    } catch {
      toast.error(t('modals.clear_combat.request_failed'));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl"
        onClick={(ev) => ev.stopPropagation()}
        role="dialog"
        aria-labelledby="clear-combat-title"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/50 p-4">
          <h2 id="clear-combat-title" className="text-lg font-medium text-zinc-100">
            {t('modals.clear_combat.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-400 transition-colors hover:text-zinc-100"
            aria-label={t('common.close')}
          >
            <X size={20} aria-hidden />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 p-6">
          <label className="flex cursor-pointer items-start gap-3 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={keepPinned}
              onChange={(e) => setKeepPinned(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 rounded border-zinc-600 bg-zinc-800 text-indigo-500 focus:ring-2 focus:ring-indigo-500/40"
            />
            <span>{t('modals.clear_combat.keep_pinned')}</span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 text-sm text-zinc-300">
            <input
              type="checkbox"
              checked={autoStart}
              onChange={(e) => setAutoStart(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 rounded border-zinc-600 bg-zinc-800 text-indigo-500 focus:ring-2 focus:ring-indigo-500/40"
            />
            <span>{t('modals.clear_combat.auto_start')}</span>
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="rounded-lg border border-red-900/50 bg-red-900/30 px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-900/50"
            >
              {t('toolbar.clear_combat')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
