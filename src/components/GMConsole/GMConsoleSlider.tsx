import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'motion/react';
import { BookOpen, ChevronDown, Plus, Terminal, X } from 'lucide-react';
import { useColumns } from '../../contexts/ColumnsContext';
import { useGMConsole } from '../../contexts/GMConsoleContext';

const springPanel = { type: 'spring' as const, stiffness: 380, damping: 32 };
const springNotes = { type: 'spring' as const, stiffness: 360, damping: 28 };

const MAX_NOTE_COLUMNS = 3;
const FAB_CLICK_DELAY_MS = 280;

type NoteColumn = { id: string; selected: string };

function newColumn(): NoteColumn {
  return { id: crypto.randomUUID(), selected: '' };
}

export function GMConsoleSlider() {
  const { t } = useTranslation('core', { useSuspense: false });
  const { systemName } = useColumns();
  const { isFabSummoned, setIsFabSummoned } = useGMConsole();
  const [panelOpen, setPanelOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteColumns, setNoteColumns] = useState<NoteColumn[]>(() => [newColumn()]);
  const [noteFiles, setNoteFiles] = useState<string[]>([]);
  const [logoTier, setLogoTier] = useState(0);
  const fabClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const systemLogoSrc = useMemo(
    () => `/api/assets/systems/${encodeURIComponent(systemName)}/ui/logo.png`,
    [systemName],
  );
  const defaultLogoSrc = '/api/assets/default/ui/logo.png';

  const fabLogoSrc = logoTier >= 2 ? null : logoTier === 0 ? systemLogoSrc : defaultLogoSrc;

  useEffect(() => {
    setLogoTier(0);
  }, [systemLogoSrc]);

  useEffect(() => {
    if (!panelOpen || !notesOpen) return;
    let cancelled = false;
    fetch(`/api/assets/notes?system=${encodeURIComponent(systemName)}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: unknown) => {
        if (cancelled) return;
        const list = Array.isArray(data)
          ? data.filter((x): x is string => typeof x === 'string')
          : [];
        setNoteFiles(list);
      })
      .catch(() => {
        if (!cancelled) setNoteFiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [panelOpen, notesOpen, systemName]);

  useEffect(() => {
    return () => {
      if (fabClickTimerRef.current) clearTimeout(fabClickTimerRef.current);
    };
  }, []);

  const setColumnSelected = useCallback((id: string, selected: string) => {
    setNoteColumns((prev) => prev.map((c) => (c.id === id ? { ...c, selected } : c)));
  }, []);

  const addNoteColumn = useCallback(() => {
    setNoteColumns((prev) => (prev.length >= MAX_NOTE_COLUMNS ? prev : [...prev, newColumn()]));
  }, []);

  const removeColumn = useCallback((id: string) => {
    setNoteColumns((cols) => cols.filter((c) => c.id !== id));
  }, []);

  const handleFabSingleClick = useCallback(() => {
    if (fabClickTimerRef.current) clearTimeout(fabClickTimerRef.current);
    fabClickTimerRef.current = setTimeout(() => {
      fabClickTimerRef.current = null;
      setPanelOpen((v) => !v);
    }, FAB_CLICK_DELAY_MS);
  }, []);

  const handleFabDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (fabClickTimerRef.current) {
        clearTimeout(fabClickTimerRef.current);
        fabClickTimerRef.current = null;
      }
      setPanelOpen(false);
      setIsFabSummoned(false);
    },
    [setIsFabSummoned],
  );

  const toolBtnClass =
    'rounded-lg border border-slate-800 bg-slate-800/80 px-3 py-2 text-xs font-medium text-slate-400 opacity-80';

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[35] flex flex-col justify-end">
      <div className="relative flex w-full min-h-0 flex-col justify-end">
        <AnimatePresence initial={false}>
          {panelOpen ? (
            <motion.div
              id="gm-console-panel"
              key="gm-console-panel"
              role="region"
              aria-label={t('gm_console.panel_region')}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={springPanel}
              className="pointer-events-none flex w-full flex-col justify-end origin-bottom overflow-hidden"
            >
              <AnimatePresence initial={false}>
                {notesOpen ? (
                  <motion.div
                    key="gm-console-notes-layer"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={springNotes}
                    className="pointer-events-none w-full origin-bottom overflow-hidden bg-transparent"
                  >
                    <div className="pointer-events-none flex w-full flex-row items-end gap-4 overflow-x-auto px-4 pb-4">
                      {noteColumns.map((col) => (
                        <div
                          key={col.id}
                          className="pointer-events-auto flex min-h-[160px] min-w-[250px] max-w-md flex-1 flex-col gap-2 rounded-xl border border-slate-700 bg-slate-900/95 p-2 shadow-2xl backdrop-blur-md"
                        >
                          <div className="flex items-center gap-2">
                            <select
                              className="min-w-0 flex-1 rounded-md border border-slate-800 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-600/40"
                              value={col.selected}
                              onChange={(e) => setColumnSelected(col.id, e.target.value)}
                              aria-label={t('gm_console.select_note_placeholder')}
                            >
                              <option value="">{t('gm_console.select_note_placeholder')}</option>
                              {noteFiles.map((name) => (
                                <option key={name} value={name}>
                                  {name}
                                </option>
                              ))}
                            </select>
                            {noteColumns.length > 1 ? (
                              <button
                                type="button"
                                onClick={() => removeColumn(col.id)}
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-800 text-slate-400 transition hover:border-slate-600 hover:bg-slate-700 hover:text-slate-200"
                                title={t('gm_console.remove_column')}
                                aria-label={t('gm_console.remove_column')}
                              >
                                <X size={16} aria-hidden />
                              </button>
                            ) : null}
                          </div>
                          <div className="min-h-[100px] flex-1 rounded-md border border-dashed border-slate-700/70 bg-slate-950/50 p-2 text-xs leading-relaxed text-slate-500">
                            {col.selected === ''
                              ? t('gm_console.empty_note_placeholder')
                              : t('gm_console.note_preview_placeholder')}
                          </div>
                        </div>
                      ))}
                      {noteColumns.length < MAX_NOTE_COLUMNS ? (
                        <button
                          type="button"
                          onClick={addNoteColumn}
                          className="pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-700 text-slate-200 transition hover:bg-slate-600"
                          title={t('gm_console.add_note_column')}
                          aria-label={t('gm_console.add_note_column')}
                        >
                          <Plus size={18} strokeWidth={2} aria-hidden />
                        </button>
                      ) : null}
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              <div className="relative z-20 flex w-full flex-col pointer-events-auto border-t border-slate-800 bg-slate-950 shadow-[0_-8px_32px_rgba(0,0,0,0.45)]">
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-800/50 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setNotesOpen((v) => !v)}
                    aria-expanded={notesOpen}
                    title={t('gm_console.toggle_notes')}
                    className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      notesOpen
                        ? 'bg-yellow-500 text-yellow-950 ring-2 ring-yellow-400/80 ring-offset-2 ring-offset-slate-950'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-slate-100'
                    }`}
                  >
                    <BookOpen size={16} aria-hidden />
                    <motion.span
                      animate={{ rotate: notesOpen ? 180 : 0 }}
                      transition={springNotes}
                      className="inline-flex"
                    >
                      <ChevronDown size={16} aria-hidden />
                    </motion.span>
                    <span className="hidden sm:inline">{t('gm_console.toggle_notes')}</span>
                  </button>
                  <span className="h-6 w-px shrink-0 bg-slate-700" aria-hidden />
                  <button type="button" disabled className={toolBtnClass}>
                    {t('gm_console.placeholder_initiative')}
                  </button>
                  <button type="button" disabled className={toolBtnClass}>
                    {t('gm_console.roll_matrix')}
                  </button>
                  <button type="button" disabled className={toolBtnClass}>
                    {t('gm_console.placeholder_monster_attack')}
                  </button>
                </div>

                <div className="flex items-center gap-2 border-t border-slate-800/80 bg-slate-950 px-3 py-2.5">
                  <Terminal size={18} className="shrink-0 text-slate-400" aria-hidden />
                  <input
                    type="text"
                    className="min-w-0 flex-1 rounded-md border border-slate-800 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-slate-600 focus:ring-2 focus:ring-slate-600/40"
                    placeholder={t('gm_console.command_placeholder')}
                    aria-label={t('gm_console.command_aria')}
                  />
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {isFabSummoned ? (
        <div className="pointer-events-none fixed bottom-20 left-1/2 z-30 w-full max-w-full -translate-x-1/2">
          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleFabSingleClick}
              onDoubleClick={handleFabDoubleClick}
              aria-expanded={panelOpen}
              aria-controls={panelOpen ? 'gm-console-panel' : undefined}
              aria-label={panelOpen ? t('gm_console.aria_close_panel') : t('gm_console.aria_open_panel')}
              title={panelOpen ? t('gm_console.aria_close_panel') : t('gm_console.aria_open_panel')}
              className="pointer-events-auto flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-slate-600 bg-slate-800 shadow-lg ring-slate-700/50 transition hover:border-slate-500 hover:ring-4 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-500/50"
            >
              {logoTier >= 2 ? (
                <span className="font-serif text-2xl font-semibold tracking-tight text-slate-100" aria-hidden>
                  O
                </span>
              ) : (
                <img
                  key={`${fabLogoSrc}`}
                  src={fabLogoSrc ?? undefined}
                  alt=""
                  aria-hidden
                  className="h-full w-full object-cover"
                  onError={() => setLogoTier((tier) => Math.min(2, tier + 1))}
                />
              )}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
