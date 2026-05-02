import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'motion/react';
import { BookOpen, Bot, ChevronDown, Dices, Plus } from 'lucide-react';
import { useCombatState } from '../../contexts/CombatStateContext';
import { useColumns } from '../../contexts/ColumnsContext';
import { useGMConsole } from '../../contexts/GMConsoleContext';
import type { Actor } from '../../types';
import { NoteCard } from './NoteCard';

const MODE_CONFIG = {
  note: {
    icon: BookOpen,
    color: 'text-blue-400',
    ring: 'focus:border-blue-500 focus:ring-blue-500/40',
    placeholderKey: 'gm_console.placeholder_note',
  },
  roll: {
    icon: Dices,
    color: 'text-yellow-400',
    ring: 'focus:border-yellow-500 focus:ring-yellow-500/40',
    placeholderKey: 'gm_console.placeholder_roll',
  },
  ai: {
    icon: Bot,
    color: 'text-rose-500',
    ring: 'focus:border-rose-500 focus:ring-rose-500/40',
    placeholderKey: 'gm_console.placeholder_ai',
  },
} as const;

function cycleInputMode(m: 'note' | 'roll' | 'ai'): 'note' | 'roll' | 'ai' {
  if (m === 'note') return 'roll';
  if (m === 'roll') return 'ai';
  return 'note';
}

const springPanel = { type: 'spring' as const, stiffness: 380, damping: 32 };
const springNotes = { type: 'spring' as const, stiffness: 360, damping: 28 };

const MAX_NOTE_COLUMNS = 3;
const FAB_CLICK_DELAY_MS = 280;

type NoteColumn = { id: string; selected: string };

function newColumn(): NoteColumn {
  return { id: crypto.randomUUID(), selected: '' };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Parse roll terminal: `#` comment, all `@Actor` mentions (case-insensitive), then sanitize leftover `@` tokens. */
function parseRollTerminalInput(
  text: string,
  actorList: Actor[],
): { expression: string; comment: string | null; matchedActors: Actor[] } {
  const hashIdx = text.indexOf('#');
  let comment: string | null = null;
  let working: string;
  if (hashIdx === -1) {
    working = text;
  } else {
    const afterHash = text.slice(hashIdx + 1).trim();
    comment = afterHash.length > 0 ? afterHash : null;
    working = text.slice(0, hashIdx).trimEnd();
  }
  const namedActors = actorList.filter((a) => (a.name ?? '').trim().length > 0);
  const sorted = [...namedActors].sort((a, b) => b.name.length - a.name.length);
  const matchedActors: Actor[] = [];
  for (const a of sorted) {
    const name = (a.name ?? '').trim();
    if (!name) continue;
    const needleRe = new RegExp(`@${escapeRegExp(name)}`, 'gi');
    const occ = (working.match(needleRe) ?? []).length;
    for (let i = 0; i < occ; i += 1) {
      matchedActors.push(a);
    }
    working = working.replace(needleRe, '');
  }
  working = working.replace(/@[^\s#]+/g, '').trim();
  return { expression: working.trim(), comment, matchedActors };
}

function buildRollRequestPayload(expression: string, comment: string | null): string {
  const body: { expression: string; is_preroll: false; comment?: string } = {
    expression,
    is_preroll: false,
  };
  const c = comment?.trim();
  if (c) body.comment = c;
  return JSON.stringify(body);
}

export function GMConsoleSlider() {
  const { t } = useTranslation('core', { useSuspense: false });
  const { state: combatState } = useCombatState();
  const { systemName } = useColumns();
  const { isFabSummoned, setIsFabSummoned } = useGMConsole();
  const [panelOpen, setPanelOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteColumns, setNoteColumns] = useState<NoteColumn[]>(() => [newColumn()]);
  const [noteFiles, setNoteFiles] = useState<string[]>([]);
  const [command, setCommand] = useState('');
  const [inputMode, setInputMode] = useState<'note' | 'roll' | 'ai'>('note');
  const [actionStatus, setActionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [showRollHelp, setShowRollHelp] = useState(false);
  const [logoTier, setLogoTier] = useState(0);
  const fabClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rollHelpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commandRef = useRef(command);
  const terminalInputRef = useRef<HTMLInputElement>(null);
  commandRef.current = command;

  const actors = combatState?.core?.actors ?? [];

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
      if (actionStatusTimerRef.current) clearTimeout(actionStatusTimerRef.current);
      if (rollHelpTimerRef.current) clearTimeout(rollHelpTimerRef.current);
    };
  }, []);

  const flashActionStatus = useCallback((status: 'success' | 'error') => {
    setActionStatus(status);
    if (actionStatusTimerRef.current) clearTimeout(actionStatusTimerRef.current);
    actionStatusTimerRef.current = setTimeout(() => {
      setActionStatus('idle');
      actionStatusTimerRef.current = null;
    }, 1500);
  }, []);

  const updateMentionFromValue = useCallback(
    (value: string, mode: 'note' | 'roll' | 'ai') => {
      if (mode !== 'roll') {
        setMentionQuery(null);
        return;
      }
      const m = /@([^\s]*)$/.exec(value);
      setMentionQuery(m ? m[1] : null);
    },
    [],
  );

  useEffect(() => {
    if (inputMode !== 'roll') {
      setMentionQuery(null);
      return;
    }
    updateMentionFromValue(commandRef.current, 'roll');
  }, [inputMode, updateMentionFromValue]);

  const mentionFilteredActors = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return actors.filter((a) => a.name.toLowerCase().includes(q));
  }, [actors, mentionQuery]);

  const handleCommandChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setCommand(value);
      updateMentionFromValue(value, inputMode);
    },
    [inputMode, updateMentionFromValue],
  );

  const selectMentionActor = useCallback(
    (actor: Actor) => {
      const v = commandRef.current;
      const next = v.replace(/@[^\s]*$/, `@${actor.name} `);
      setCommand(next);
      setMentionQuery(null);
      queueMicrotask(() => terminalInputRef.current?.focus());
    },
    [],
  );

  const setColumnSelected = useCallback((id: string, selected: string) => {
    setNoteColumns((prev) => prev.map((c) => (c.id === id ? { ...c, selected } : c)));
  }, []);

  const addNoteColumn = useCallback(() => {
    setNoteColumns((prev) => (prev.length >= MAX_NOTE_COLUMNS ? prev : [...prev, newColumn()]));
  }, []);

  const removeColumn = useCallback((id: string) => {
    setNoteColumns((cols) => cols.filter((c) => c.id !== id));
  }, []);

  const handleNoteSelectFile = useCallback((columnId: string, file: string) => {
    setColumnSelected(columnId, file);
  }, [setColumnSelected]);

  const handleNoteRemove = useCallback((columnId: string) => {
    removeColumn(columnId);
  }, [removeColumn]);

  const handleFabSingleClick = useCallback(() => {
    if (fabClickTimerRef.current) clearTimeout(fabClickTimerRef.current);
    fabClickTimerRef.current = setTimeout(() => {
      fabClickTimerRef.current = null;
      setPanelOpen((v) => !v);
    }, FAB_CLICK_DELAY_MS);
  }, []);

  const handleCommandKeyDown = useCallback(
    async (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape' && mentionQuery !== null) {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }

      if (e.key === 'Tab' && commandRef.current.trim() === '') {
        e.preventDefault();
        setInputMode((m) => cycleInputMode(m));
        return;
      }

      if (e.key !== 'Enter') return;
      const trimmed = commandRef.current.trim();
      if (!trimmed) return;
      e.preventDefault();

      if (inputMode === 'note') {
        try {
          const res = await fetch('/api/combat/log/note', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: trimmed }),
          });
          if (!res.ok) throw new Error(String(res.status));
          setCommand('');
          flashActionStatus('success');
        } catch {
          flashActionStatus('error');
        }
        return;
      }

      if (inputMode === 'roll') {
        const trimmedRoll = commandRef.current.trim();
        if (trimmedRoll === '?') {
          setShowRollHelp(true);
          setCommand('');
          flashActionStatus('success');
          if (rollHelpTimerRef.current) clearTimeout(rollHelpTimerRef.current);
          rollHelpTimerRef.current = setTimeout(() => {
            setShowRollHelp(false);
            rollHelpTimerRef.current = null;
          }, 5000);
          return;
        }
        const raw = commandRef.current;
        const { expression, comment, matchedActors } = parseRollTerminalInput(raw, actors);
        if (!expression) {
          flashActionStatus('error');
          return;
        }
        const payloadJson = buildRollRequestPayload(expression, comment);
        try {
          if (matchedActors.length > 0) {
            const responses = await Promise.all(
              matchedActors.map((actor) =>
                fetch(`/api/combat/actors/${encodeURIComponent(actor.id)}/roll`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: payloadJson,
                }),
              ),
            );
            if (responses.some((r) => !r.ok)) throw new Error('roll failed');
          } else {
            const res = await fetch('/api/combat/roll', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: payloadJson,
            });
            if (!res.ok) throw new Error(String(res.status));
          }
          setCommand('');
          setMentionQuery(null);
          flashActionStatus('success');
        } catch {
          flashActionStatus('error');
        }
        return;
      }

      setCommand('');
      flashActionStatus('success');
    },
    [actors, flashActionStatus, inputMode, mentionQuery],
  );

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

  const ModeIcon = MODE_CONFIG[inputMode].icon;
  const modeRing = MODE_CONFIG[inputMode].ring;
  const placeholderKey = MODE_CONFIG[inputMode].placeholderKey;

  const iconColorClass =
    actionStatus === 'success'
      ? 'text-green-400'
      : actionStatus === 'error'
        ? 'text-red-400'
        : MODE_CONFIG[inputMode].color;

  const statusChrome =
    actionStatus === 'success'
      ? '!border-green-500 !ring-2 !ring-green-500 focus:!border-green-500 focus:!ring-green-500'
      : actionStatus === 'error'
        ? '!border-red-500 !ring-2 !ring-red-500 focus:!border-red-500 focus:!ring-red-500'
        : '';

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
                        <NoteCard
                          key={col.id}
                          id={col.id}
                          systemName={systemName}
                          selectedFile={col.selected}
                          availableFiles={noteFiles}
                          onSelectFile={handleNoteSelectFile}
                          onRemove={handleNoteRemove}
                          canRemove={noteColumns.length > 1}
                        />
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

                <div className="relative border-t border-slate-800/80 bg-slate-950 px-3 py-2.5">
                  {inputMode === 'roll' && showRollHelp ? (
                    <div
                      className="pointer-events-none absolute bottom-full right-0 z-50 mb-2 max-w-[min(100%,20rem)] rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-300 shadow-xl"
                      role="status"
                    >
                      {t('gm_console.roll_help_tooltip')}
                    </div>
                  ) : null}
                  {inputMode === 'roll' && mentionQuery !== null ? (
                    <ul
                      id="gm-console-mention-list"
                      role="listbox"
                      className="pointer-events-auto absolute bottom-full left-3 right-3 z-30 mb-2 max-h-48 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800 shadow-xl"
                    >
                      {mentionFilteredActors.length === 0 ? (
                        <li className="px-3 py-2 text-xs text-slate-500">{t('gm_console.mention_no_results')}</li>
                      ) : (
                        mentionFilteredActors.map((a) => (
                          <li key={a.id} role="option">
                            <button
                              type="button"
                              className="w-full cursor-pointer px-3 py-2 text-left text-sm text-slate-200 transition-colors hover:bg-slate-700"
                              onMouseDown={(ev) => {
                                ev.preventDefault();
                                selectMentionActor(a);
                              }}
                            >
                              {a.name}
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  ) : null}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setInputMode((m) => cycleInputMode(m))}
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-800 bg-slate-800/80 text-slate-300 transition-colors duration-300 hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/50 ${statusChrome}`}
                      title={t(placeholderKey)}
                      aria-label={t(placeholderKey)}
                    >
                      <ModeIcon size={18} className={`transition-colors duration-300 ${iconColorClass}`} aria-hidden />
                    </button>
                    <input
                      ref={terminalInputRef}
                      type="text"
                      value={command}
                      onChange={handleCommandChange}
                      onKeyDown={handleCommandKeyDown}
                      className={`min-w-0 flex-1 rounded-md border border-slate-800 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition-colors duration-300 ${actionStatus !== 'idle' ? statusChrome : `focus:ring-2 ${modeRing}`}`}
                      placeholder={t(placeholderKey)}
                      aria-label={t('gm_console.command_aria')}
                      aria-expanded={inputMode === 'roll' && mentionQuery !== null}
                      aria-controls="gm-console-mention-list"
                      autoComplete="off"
                    />
                  </div>
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
                  {t('gm_console.fab_fallback')}
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
