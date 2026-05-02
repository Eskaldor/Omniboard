import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import { Check, Eye, FilePlus, Pencil, X } from 'lucide-react';

export type NoteCardProps = {
  id: string;
  systemName: string;
  selectedFile: string;
  availableFiles: string[];
  onSelectFile: (columnId: string, file: string) => void;
  onRemove: (columnId: string) => void;
  canRemove: boolean;
};

const mdScrollWrap =
  'max-w-none text-xs leading-relaxed text-zinc-300 [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-600 [&_blockquote]:pl-3 [&_blockquote]:text-zinc-400 [&_code]:rounded [&_code]:bg-zinc-800 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-emerald-300 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-zinc-700 [&_pre]:bg-zinc-950 [&_pre]:p-2 [&_pre]:text-zinc-200';

function markdownComponents(): Components {
  return {
    h1: ({ children, ...props }) => (
      <h1 className="mb-2 mt-3 text-base font-semibold text-zinc-100 first:mt-0" {...props}>
        {children}
      </h1>
    ),
    h2: ({ children, ...props }) => (
      <h2 className="mb-1.5 mt-3 text-sm font-semibold text-zinc-100 first:mt-0" {...props}>
        {children}
      </h2>
    ),
    h3: ({ children, ...props }) => (
      <h3 className="mb-1 mt-2 text-xs font-semibold text-zinc-200 first:mt-0" {...props}>
        {children}
      </h3>
    ),
    p: ({ children, ...props }) => (
      <p className="my-1.5 text-zinc-300 first:mt-0 last:mb-0" {...props}>
        {children}
      </p>
    ),
    ul: ({ children, ...props }) => (
      <ul className="my-2 list-disc space-y-1 pl-5 text-zinc-300" {...props}>
        {children}
      </ul>
    ),
    ol: ({ children, ...props }) => (
      <ol className="my-2 list-decimal space-y-1 pl-5 text-zinc-300" {...props}>
        {children}
      </ol>
    ),
    li: ({ children, ...props }) => (
      <li className="marker:text-zinc-500" {...props}>
        {children}
      </li>
    ),
    table: ({ children, ...props }) => (
      <div className="my-2 overflow-x-auto rounded-md border border-zinc-700">
        <table className="w-full border-collapse text-left text-[11px] text-zinc-300" {...props}>
          {children}
        </table>
      </div>
    ),
    thead: ({ children, ...props }) => <thead className="bg-zinc-800/90 text-zinc-200" {...props}>{children}</thead>,
    tbody: ({ children, ...props }) => <tbody {...props}>{children}</tbody>,
    tr: ({ children, ...props }) => <tr className="border-b border-zinc-700/80 last:border-b-0" {...props}>{children}</tr>,
    th: ({ children, ...props }) => (
      <th className="border border-zinc-700 px-2 py-1.5 font-semibold text-zinc-100" {...props}>
        {children}
      </th>
    ),
    td: ({ children, ...props }) => (
      <td className="border border-zinc-700/70 px-2 py-1.5 align-top text-zinc-300" {...props}>
        {children}
      </td>
    ),
    strong: ({ children, ...props }) => (
      <strong className="font-semibold text-zinc-100" {...props}>
        {children}
      </strong>
    ),
    em: ({ children, ...props }) => (
      <em className="italic text-zinc-200" {...props}>
        {children}
      </em>
    ),
    a: ({ children, ...props }) => (
      <a className="text-emerald-400 underline underline-offset-2 hover:text-emerald-300" {...props}>
        {children}
      </a>
    ),
    hr: (props) => <hr className="my-3 border-zinc-700" {...props} />,
  };
}

function isSafeMdBasename(name: string): boolean {
  if (!name || name.includes('..') || name.includes('/') || name.includes('\\')) return false;
  const lower = name.toLowerCase();
  return lower.endsWith('.md') && name.trim() === name && name.length <= 255;
}

export const NoteCard = memo(function NoteCard({
  id,
  systemName,
  selectedFile,
  availableFiles,
  onSelectFile,
  onRemove,
  canRemove,
}: NoteCardProps) {
  const { t } = useTranslation('core', { useSuspense: false });
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [savePending, setSavePending] = useState(false);
  const [localExtraFiles, setLocalExtraFiles] = useState<string[]>([]);
  const [isNaming, setIsNaming] = useState(false);
  const [newFilename, setNewFilename] = useState('');
  const [namingInvalid, setNamingInvalid] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const saveFailTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dropdownFiles = useMemo(() => {
    const merged = new Set<string>([...availableFiles, ...localExtraFiles]);
    return [...merged].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [availableFiles, localExtraFiles]);

  useEffect(() => {
    setIsEditing(false);
  }, [selectedFile]);

  useEffect(() => {
    if (!selectedFile) {
      setContent('');
      setIsLoading(false);
      setLoadFailed(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setLoadFailed(false);
    const q = `/api/assets/notes/content?system=${encodeURIComponent(systemName)}&file=${encodeURIComponent(selectedFile)}`;
    fetch(q)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: unknown) => {
        if (cancelled) return;
        const text =
          typeof data === 'object' && data !== null && 'content' in data && typeof (data as { content: unknown }).content === 'string'
            ? (data as { content: string }).content
            : '';
        setContent(text);
      })
      .catch(() => {
        if (!cancelled) {
          setContent('');
          setLoadFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedFile, systemName]);

  useEffect(() => {
    return () => {
      if (saveFailTimerRef.current) clearTimeout(saveFailTimerRef.current);
    };
  }, []);

  const mdComponents = useMemo(() => markdownComponents(), []);

  const cancelNaming = useCallback(() => {
    setIsNaming(false);
    setNewFilename('');
    setNamingInvalid(false);
  }, []);

  const confirmNewNote = useCallback(() => {
    let fn = newFilename.trim();
    if (!fn) {
      setNamingInvalid(true);
      return;
    }
    if (!fn.toLowerCase().endsWith('.md')) fn += '.md';
    if (!isSafeMdBasename(fn)) {
      setNamingInvalid(true);
      return;
    }
    setNamingInvalid(false);
    setLocalExtraFiles((prev) => (prev.includes(fn) ? prev : [...prev, fn]));
    onSelectFile(id, fn);
    setContent('');
    setIsEditing(true);
    setIsNaming(false);
    setNewFilename('');
  }, [id, newFilename, onSelectFile]);

  const openNaming = useCallback(() => {
    setIsNaming(true);
    setNewFilename('');
    setNamingInvalid(false);
  }, []);

  const handleNamingKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelNaming();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        confirmNewNote();
      }
    },
    [cancelNaming, confirmNewNote],
  );

  const handleSave = useCallback(async () => {
    if (!selectedFile) return;
    setSavePending(true);
    setSaveFailed(false);
    if (saveFailTimerRef.current) {
      clearTimeout(saveFailTimerRef.current);
      saveFailTimerRef.current = null;
    }
    try {
      const res = await fetch('/api/assets/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system: systemName, file: selectedFile, content }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setIsEditing(false);
    } catch {
      setSaveFailed(true);
      saveFailTimerRef.current = setTimeout(() => {
        setSaveFailed(false);
        saveFailTimerRef.current = null;
      }, 1500);
    } finally {
      setSavePending(false);
    }
  }, [content, selectedFile, systemName]);

  const toggleEditView = useCallback(() => {
    if (!selectedFile) return;
    setIsEditing((v) => !v);
  }, [selectedFile]);

  return (
    <div
      id={`gm-note-card-${id}`}
      className="pointer-events-auto flex min-h-[160px] min-w-[250px] max-w-md flex-1 flex-col gap-2 rounded-xl border border-zinc-700/60 bg-zinc-900/95 p-2 shadow-2xl backdrop-blur-md"
    >
      <div className="flex items-start gap-2">
        {isNaming ? (
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={newFilename}
                onChange={(e) => {
                  setNewFilename(e.target.value);
                  if (namingInvalid) setNamingInvalid(false);
                }}
                onKeyDown={handleNamingKeyDown}
                autoFocus
                spellCheck={false}
                placeholder={t('gm_console.enter_filename')}
                aria-label={t('gm_console.enter_filename')}
                className={`min-w-0 flex-1 rounded-md border bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 outline-none transition-colors duration-300 focus:ring-2 ${
                  namingInvalid
                    ? 'border-red-500 ring-red-500/40 focus:border-red-500 focus:ring-red-500/40'
                    : 'border-zinc-700 focus:border-zinc-600 focus:ring-zinc-600/40'
                }`}
              />
              <button
                type="button"
                onClick={confirmNewNote}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-700 bg-zinc-800 text-green-400 transition hover:border-zinc-600 hover:bg-zinc-700"
                title={t('gm_console.confirm_new_note')}
                aria-label={t('gm_console.confirm_new_note')}
              >
                <Check size={16} aria-hidden />
              </button>
              <button
                type="button"
                onClick={cancelNaming}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-700 bg-zinc-800 text-zinc-400 transition hover:border-zinc-600 hover:bg-zinc-700 hover:text-zinc-200"
                title={t('gm_console.cancel_new_note')}
                aria-label={t('gm_console.cancel_new_note')}
              >
                <X size={16} aria-hidden />
              </button>
            </div>
            {namingInvalid ? (
              <p className="text-[10px] leading-tight text-red-400">{t('gm_console.note_filename_invalid')}</p>
            ) : null}
          </div>
        ) : (
          <select
            className="min-w-0 flex-1 rounded-md border border-zinc-700/60 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-zinc-600 focus:ring-2 focus:ring-zinc-600/40"
            value={selectedFile}
            onChange={(e) => onSelectFile(id, e.target.value)}
            aria-label={t('gm_console.select_note_placeholder')}
          >
            <option value="">{t('gm_console.select_note_placeholder')}</option>
            {dropdownFiles.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}
        {!isNaming ? (
          <button
            type="button"
            onClick={openNaming}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-700 bg-zinc-800 text-zinc-400 transition hover:border-zinc-600 hover:bg-zinc-700 hover:text-zinc-200"
            title={t('gm_console.create_new_note')}
            aria-label={t('gm_console.create_new_note')}
          >
            <FilePlus size={16} aria-hidden />
          </button>
        ) : null}
        <button
          type="button"
          onClick={toggleEditView}
          disabled={!selectedFile || isNaming}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-700 bg-zinc-800 text-zinc-400 transition hover:border-zinc-600 hover:bg-zinc-700 hover:text-zinc-200 disabled:pointer-events-none disabled:opacity-40"
          title={isEditing ? t('gm_console.view') : t('gm_console.edit')}
          aria-label={isEditing ? t('gm_console.view') : t('gm_console.edit')}
        >
          {isEditing ? <Eye size={16} aria-hidden /> : <Pencil size={16} aria-hidden />}
        </button>
        {canRemove ? (
          <button
            type="button"
            onClick={() => onRemove(id)}
            disabled={isNaming}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-700 bg-zinc-800 text-zinc-400 transition hover:border-zinc-600 hover:bg-zinc-700 hover:text-zinc-200 disabled:pointer-events-none disabled:opacity-40"
            title={t('gm_console.remove_column')}
            aria-label={t('gm_console.remove_column')}
          >
            <X size={16} aria-hidden />
          </button>
        ) : null}
      </div>

      <div className="flex min-h-[100px] flex-1 flex-col rounded-md border border-dashed border-zinc-700/60 bg-zinc-950/50 p-2">
        {!selectedFile ? (
          <p className="text-xs leading-relaxed text-zinc-500">{t('gm_console.empty_note_placeholder')}</p>
        ) : isLoading ? (
          <p className="text-xs text-zinc-500">{t('gm_console.note_loading')}</p>
        ) : loadFailed ? (
          <p className="text-xs leading-relaxed text-red-400">{t('gm_console.note_load_error')}</p>
        ) : isEditing ? (
          <>
            <textarea
              className={`mb-2 min-h-[140px] w-full flex-1 resize-y rounded-md border bg-zinc-950 px-2 py-1.5 font-mono text-xs text-zinc-100 outline-none transition-colors duration-300 focus:ring-2 ${
                saveFailed
                  ? 'border-red-500 ring-red-500/30 focus:border-red-500 focus:ring-red-500/40'
                  : 'border-zinc-700 focus:border-zinc-600 focus:ring-zinc-600/40'
              }`}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                if (saveFailed) setSaveFailed(false);
              }}
              spellCheck={false}
              aria-label={t('gm_console.note_editor_aria')}
            />
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={handleSave}
                disabled={savePending}
                className="self-start rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
              >
                {savePending ? t('gm_console.saving') : t('gm_console.save')}
              </button>
              {saveFailed ? (
                <p className="text-[10px] text-red-400">{t('gm_console.note_save_error')}</p>
              ) : null}
            </div>
          </>
        ) : (
          <div className={`max-h-[min(40vh,320px)] overflow-y-auto ${mdScrollWrap}`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
              {content || t('gm_console.note_preview_empty')}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
});
