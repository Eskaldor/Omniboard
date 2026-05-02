import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'motion/react';
import { BookOpen, Bot, ChevronDown, Dices, Plus } from 'lucide-react';
import { useCombatState } from '../../contexts/CombatStateContext';
import { useColumns } from '../../contexts/ColumnsContext';
import { useGMConsole } from '../../contexts/GMConsoleContext';
import type { Actor } from '../../types';
import type { SystemActionDef } from '../../hooks/useSystemActions';
import { useSystemActions } from '../../hooks/useSystemActions';
import { NoteCard } from './NoteCard';

const MODE_CONFIG = {
  note: {
    icon: BookOpen,
    color: 'text-emerald-400',
    ring: 'focus:border-emerald-500 focus:ring-emerald-500/40',
    placeholderKey: 'gm_console.placeholder_note',
  },
  roll: {
    icon: Dices,
    color: 'text-amber-400',
    ring: 'focus:border-amber-500 focus:ring-amber-500/40',
    placeholderKey: 'gm_console.placeholder_roll',
  },
  ai: {
    icon: Bot,
    color: 'text-rose-400',
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

/** Split optional `#` trailing comment (same convention as ``parseRollTerminalInput``). */
function splitHashCommentRoll(text: string): { working: string; hashComment: string | null } {
  const hashIdx = text.indexOf('#');
  if (hashIdx === -1) return { working: text.trim(), hashComment: null };
  const after = text.slice(hashIdx + 1).trim();
  return {
    working: text.slice(0, hashIdx).trimEnd().trim(),
    hashComment: after.length > 0 ? after : null,
  };
}

/**
 * Roll mode: ``@ActorName !macro_key`` uses merged ``actions.json`` for the current system
 * (with per-actor ``formula_override`` / ``comment`` when present).
 */
function tryResolveActorMacroRoll(
  working: string,
  hashComment: string | null,
  actorList: Actor[],
  actions: Record<string, SystemActionDef>,
): { actor: Actor; expression: string; comment: string } | null {
  const m = /^\s*@(.+?)\s+!([\w-]+)\s*$/i.exec(working);
  if (!m) return null;
  const actorName = m[1].trim();
  const macroKey = m[2].trim();
  if (!macroKey) return null;
  const actor = actorList.find((a) => (a.name ?? '').trim().toLowerCase() === actorName.toLowerCase());
  if (!actor) return null;
  const def = actions[macroKey];
  if (!def?.formula?.trim()) return null;
  const ov = actor.actions?.[macroKey];
  const expression = (ov?.formula_override?.trim() || def.formula).trim();
  if (!expression) return null;
  const baseComment = (ov?.comment?.trim() || def.name).trim() || macroKey;
  const comment = [baseComment, hashComment?.trim()].filter(Boolean).join(' · ');
  return { actor, expression, comment };
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
  const combatSystem = ((combatState?.core.system ?? systemName) || '').trim();
  const { actions: systemActions } = useSystemActions(combatSystem);
  const { isFabSummoned, setIsFabSummoned } = useGMConsole();
  const [panelOpen, setPanelOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteColumns, setNoteColumns] = useState<NoteColumn[]>(() => [newColumn()]);
  const [noteFiles, setNoteFiles] = useState<string[]>([]);
  const [command, setCommand] = useState('');
  const [inputMode, setInputMode] = useState<'note' | 'roll' | 'ai'>('note');
  const [actionStatus, setActionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionFixedBottom, setMentionFixedBottom] = useState(0);
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

  useEffect(() => {
    if (mentionQuery === null || !terminalInputRef.current) return;
    const rect = terminalInputRef.current.getBoundingClientRect();
    setMentionFixedBottom(window.innerHeight - rect.top + 8);
  }, [mentionQuery]);

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
        const { working, hashComment } = splitHashCommentRoll(raw);
        const macroRoll = tryResolveActorMacroRoll(working, hashComment, actors, systemActions);
        if (macroRoll) {
          const payloadJson = buildRollRequestPayload(macroRoll.expression, macroRoll.comment || null);
          try {
            const res = await fetch(
              `/api/combat/actors/${encodeURIComponent(macroRoll.actor.id)}/roll`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payloadJson,
              },
            );
            if (!res.ok) throw new Error(String(res.status));
            setCommand('');
            setMentionQuery(null);
            flashActionStatus('success');
          } catch {
            flashActionStatus('error');
          }
          return;
        }

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
    [actors, flashActionStatus, inputMode, mentionQuery, systemActions],
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
    'rounded-lg border border-zinc-700/60 bg-zinc-800/60 px-3 py-2 text-xs font-medium text-zinc-500 cursor-not-allowed';

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
                          className="pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-zinc-200 transition hover:bg-zinc-600"
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

              <div className="relative z-20 flex w-full flex-col pointer-events-auto border-t border-zinc-800 bg-zinc-950 shadow-[0_-8px_40px_rgba(0,0,0,0.6)]">
                <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 bg-zinc-900/80 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setNotesOpen((v) => !v)}
                    aria-expanded={notesOpen}
                    title={t('gm_console.toggle_notes')}
                    className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      notesOpen
                        ? 'bg-emerald-600/20 text-emerald-400 ring-1 ring-emerald-500/50'
                        : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100'
                    }`}
                  >
                    <BookOpen size={15} aria-hidden />
                    <motion.span
                      animate={{ rotate: notesOpen ? 180 : 0 }}
                      transition={springNotes}
                      className="inline-flex"
                    >
                      <ChevronDown size={15} aria-hidden />
                    </motion.span>
                    <span className="hidden sm:inline">{t('gm_console.toggle_notes')}</span>
                  </button>
                  <span className="h-5 w-px shrink-0 bg-zinc-700/60" aria-hidden />
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

                <div className="relative bg-zinc-950 px-3 py-2.5">
                  {inputMode === 'roll' && showRollHelp ? (
                    <div
                      className="pointer-events-none absolute bottom-full right-0 z-50 mb-2 max-w-[min(100%,20rem)] rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-300 shadow-xl"
                      role="status"
                    >
                      {t('gm_console.roll_help_tooltip')}
                    </div>
                  ) : null}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setInputMode((m) => cycleInputMode(m))}
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-700/60 bg-zinc-800 text-zinc-300 transition-colors duration-300 hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500/50 ${statusChrome}`}
                      title={t(placeholderKey)}
                      aria-label={t(placeholderKey)}
                    >
                      <ModeIcon size={17} className={`transition-colors duration-300 ${iconColorClass}`} aria-hidden />
                    </button>
                    <input
                      ref={terminalInputRef}
                      type="text"
                      value={command}
                      onChange={handleCommandChange}
                      onKeyDown={handleCommandKeyDown}
                      className={`min-w-0 flex-1 rounded-md border border-zinc-700/60 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors duration-300 ${actionStatus !== 'idle' ? statusChrome : `focus:ring-2 ${modeRing}`}`}
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
        <motion.div
          className="pointer-events-none fixed left-1/2 z-30 w-full max-w-full -translate-x-1/2"
          animate={{ bottom: panelOpen ? '6rem' : '0.25rem' }}
          transition={springPanel}
        >
          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleFabSingleClick}
              onDoubleClick={handleFabDoubleClick}
              aria-expanded={panelOpen}
              aria-controls={panelOpen ? 'gm-console-panel' : undefined}
              aria-label={panelOpen ? t('gm_console.aria_close_panel') : t('gm_console.aria_open_panel')}
              title={panelOpen ? t('gm_console.aria_close_panel') : t('gm_console.aria_open_panel')}
              className="pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-emerald-600/50 bg-zinc-900 shadow-[0_0_18px_rgba(16,185,129,0.5),0_0_36px_rgba(16,185,129,0.18),0_4px_20px_rgba(0,0,0,0.5)] transition-all duration-200 hover:border-emerald-500/70 hover:shadow-[0_0_22px_rgba(16,185,129,0.65),0_0_44px_rgba(16,185,129,0.22)] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
            >
              {logoTier >= 2 ? (
                <span className="font-serif text-[1.35rem] font-bold leading-none tracking-tight text-zinc-100" aria-hidden>
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
        </motion.div>
      ) : null}

      {inputMode === 'roll' && mentionQuery !== null && createPortal(
        <ul
          id="gm-console-mention-list"
          role="listbox"
          style={{ bottom: mentionFixedBottom }}
          className="fixed left-3 right-3 z-[9999] max-h-48 overflow-y-auto rounded-xl border border-zinc-700/80 bg-zinc-900/95 shadow-2xl backdrop-blur-sm"
        >
          {mentionFilteredActors.length === 0 ? (
            <li className="px-3 py-2 text-xs text-zinc-500">{t('gm_console.mention_no_results')}</li>
          ) : (
            mentionFilteredActors.map((a) => (
              <li key={a.id} role="option">
                <button
                  type="button"
                  className="w-full cursor-pointer px-3 py-2 text-left text-sm text-zinc-200 transition-colors hover:bg-zinc-800"
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
        </ul>,
        document.body,
      )}
    </div>
  );
}
