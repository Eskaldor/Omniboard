import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function TextEditorModal({
  isOpen,
  title,
  value,
  onSave,
  onCancel,
}: {
  isOpen: boolean;
  title?: string;
  value: string;
  onSave: (nextValue: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('core', { useSuspense: false });
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!isOpen) return;
    setDraft(value);
  }, [isOpen, value]);

  const effectiveTitle = useMemo(
    () => title ?? t('text_editor.title'),
    [title, t],
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onCancel}
    >
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
          <h3 className="text-lg font-medium text-zinc-100 min-w-0 truncate">{effectiveTitle}</h3>
          <button onClick={onCancel} className="text-zinc-400 hover:text-zinc-100" aria-label={t('common.close')}>
            <X size={20} />
          </button>
        </div>

        <div className="p-4 flex-1 min-h-0 flex flex-col gap-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full flex-1 min-h-[280px] resize-none bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
            autoFocus
          />

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm text-zinc-200 transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => onSave(draft)}
              className="px-4 py-2 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 rounded-lg text-sm transition-colors"
            >
              {t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

