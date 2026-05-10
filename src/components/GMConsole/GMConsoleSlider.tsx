import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'motion/react';
import { BookOpen, Bot, ChevronDown, Dices, Lock, MessageSquare, Plus } from 'lucide-react';
import { useCombatState } from '../../contexts/CombatStateContext';
import { useColumns } from '../../contexts/ColumnsContext';
import { useGMConsole } from '../../contexts/GMConsoleContext';
import type { Actor, ColumnConfig } from '../../types';
import { useSystemActions } from '../../hooks/useSystemActions';
import { mergeActorActionDefs } from '../../utils/mergeActorActionDefs';
import { getStatNumeric, getSystemDice } from '../../utils/stats';
import {
  findCaretToken,
  parseRollInput,
  planSegmentsForActor,
  replaceTokenInText,
  uniqActors,
  type CaretToken,
  type ResolveContext,
  type SegmentPlan,
} from '../../utils/rollTerminal';
import {
  formatFastApiDetail,
  parseRollHttpResponse,
  showRollBatchToast,
  showRollErrorToast,
  toastInitiativeRollOutcome,
  type RollBatchRow,
} from '../../utils/rollToast';
import { useAiChat } from '../../hooks/useAiChat';
import { AIChatDrawer } from './AIChatDrawer';
import { RollMatrixDrawer } from './RollMatrixDrawer';
import { NoteCard } from './NoteCard';
import {
  RollTokenPopup,
  type RollTokenItem,
  type RollTokenJoiner,
  type RollTokenKind,
} from './RollTokenPopup';

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

function buildRollRequestPayload(expression: string, comment: string | null): string {
  const body: { expression: string; is_preroll: false; comment?: string } = {
    expression,
    is_preroll: false,
  };
  const c = comment?.trim();
  if (c) body.comment = c;
  return JSON.stringify(body);
}

function joinComments(...parts: Array<string | null | undefined>): string | null {
  const cleaned = parts
    .map((p) => (p ?? '').trim())
    .filter((p) => p.length > 0);
  return cleaned.length > 0 ? cleaned.join(' · ') : null;
}

/** True when the segment between the last `;` and `pos` has no dice expression yet. */
function isAtStartOfSegment(text: string, pos: number): boolean {
  const head = text.slice(0, pos);
  const lastSemi = head.lastIndexOf(';');
  const segment = lastSemi >= 0 ? head.slice(lastSemi + 1) : head;
  const stripped = segment.replace(/@[^\s#]+/g, '').trim();
  return stripped.length === 0;
}

export function GMConsoleSlider() {
  const { t } = useTranslation('core', { useSuspense: false });
  const { state: combatState, refetchState, pendingRollRequests, setPendingRollRequests } =
    useCombatState();
  const { systemName, columns } = useColumns();
  const combatSystem = ((combatState?.core.system ?? systemName) || '').trim();
  const { actions: systemActions } = useSystemActions(combatSystem);
  const { isFabSummoned, setIsFabSummoned } = useGMConsole();
  const { messages: aiMessages, isLoading: aiLoading, sendMessage: sendAiMessage } = useAiChat();
  const [panelOpen, setPanelOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [initiativeStripOpen, setInitiativeStripOpen] = useState(false);
  const [rollRequestsOpen, setRollRequestsOpen] = useState(false);
  const [rollMatrixOpen, setRollMatrixOpen] = useState(false);
  const [bulkInitiativeRolling, setBulkInitiativeRolling] = useState(false);
  const [noteColumns, setNoteColumns] = useState<NoteColumn[]>(() => [newColumn()]);
  const [noteFiles, setNoteFiles] = useState<string[]>([]);
  const [command, setCommand] = useState('');
  const [inputMode, setInputMode] = useState<'note' | 'roll' | 'ai'>('note');
  const [actionStatus, setActionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [popupToken, setPopupToken] = useState<CaretToken | null>(null);
  const [popupBottom, setPopupBottom] = useState(0);
  const [showRollHelp, setShowRollHelp] = useState(false);
  const [logoTier, setLogoTier] = useState(0);
  const [systemDice, setSystemDice] = useState<string>('1d20');
  const fabClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rollHelpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commandRef = useRef(command);
  const terminalInputRef = useRef<HTMLInputElement>(null);
  commandRef.current = command;

  const actors = combatState?.core?.actors ?? [];

  const columnsByKey = useMemo<Record<string, ColumnConfig>>(() => {
    const out: Record<string, ColumnConfig> = {};
    for (const c of columns) out[c.key] = c;
    return out;
  }, [columns]);

  const systemLogoSrc = useMemo(
    () => `/api/assets/systems/${encodeURIComponent(systemName)}/ui/logo.png`,
    [systemName],
  );
  const defaultLogoSrc = '/api/assets/default/ui/logo.png';

  const fabLogoSrc = logoTier >= 2 ? null : logoTier === 0 ? systemLogoSrc : defaultLogoSrc;

  useEffect(() => {
    setLogoTier(0);
  }, [systemLogoSrc]);

  // Preload system dice for column-template fallback.
  useEffect(() => {
    let cancelled = false;
    getSystemDice(combatSystem)
      .then((dice) => {
        if (!cancelled) setSystemDice(dice);
      })
      .catch(() => {
        if (!cancelled) setSystemDice('1d20');
      });
    return () => {
      cancelled = true;
    };
  }, [combatSystem]);

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

  /** Recompute popup token from caret position; called on input/click/key events. */
  const refreshPopupToken = useCallback(
    (value: string, caret: number, mode: 'note' | 'roll' | 'ai') => {
      if (mode !== 'roll') {
        setPopupToken(null);
        return;
      }
      const tok = findCaretToken(value, caret);
      setPopupToken(tok);
    },
    [],
  );

  useEffect(() => {
    if (inputMode !== 'roll') {
      setPopupToken(null);
      return;
    }
    const el = terminalInputRef.current;
    const caret = el?.selectionStart ?? commandRef.current.length;
    refreshPopupToken(commandRef.current, caret, 'roll');
  }, [inputMode, refreshPopupToken]);

  useEffect(() => {
    if (popupToken === null || !terminalInputRef.current) return;
    const rect = terminalInputRef.current.getBoundingClientRect();
    setPopupBottom(window.innerHeight - rect.top + 8);
  }, [popupToken]);

  /* ----------------------------- popup data ----------------------------- */

  /** Actors mentioned anywhere in the current input — drive popup scope. */
  const scopeActors = useMemo(() => {
    if (inputMode !== 'roll') return [];
    const parsed = parseRollInput(command, actors);
    return uniqActors(parsed.matchedActors);
  }, [actors, inputMode, command]);

  const popupItems = useMemo<RollTokenItem[]>(() => {
    if (popupToken === null) return [];
    if (popupToken.kind === 'at') {
      return actors
        .filter((a) => (a.name ?? '').trim().length > 0)
        .map<RollTokenItem>((a) => ({ key: a.name, label: a.name }));
    }
    if (popupToken.kind === 'bang') {
      // Only columns explicitly marked `is_rollable: true` in the system's
      // columns.json appear here. Custom actor-only stats and non-rollable
      // columns are intentionally hidden — typing `!stat` still resolves them
      // at submit time, but the popup stays focused on intended-to-roll stats.
      const out: RollTokenItem[] = [];
      for (const col of columns) {
        if (col.is_rollable !== true) continue;
        const key = col.key;
        const label = col.label?.trim() || key;
        const preview: Record<string, string> = {};
        const presentIn: string[] = [];
        for (const a of scopeActors) {
          const has = a.stats && Object.prototype.hasOwnProperty.call(a.stats, key);
          preview[a.id] = String(has ? getStatNumeric(a.stats[key], 0) : 0);
          presentIn.push(a.id);
        }
        out.push({ key, label, preview, presentIn });
      }
      return out;
    }
    // dollar — union of merged action defs across scope actors.
    const seen = new Set<string>();
    const out: RollTokenItem[] = [];
    const allEntries = scopeActors.map((a) => ({
      actor: a,
      merged: mergeActorActionDefs(systemActions, a),
    }));
    const addKey = (key: string) => {
      if (seen.has(key)) return;
      seen.add(key);
      let label = key;
      const preview: Record<string, string> = {};
      const presentIn: string[] = [];
      for (const { actor, merged } of allEntries) {
        const def = merged[key];
        if (!def) continue;
        const ovr = actor.actions?.[key]?.formula_override?.trim();
        const formula = (ovr || def.formula || '').trim();
        if (label === key && def.name?.trim()) label = def.name.trim();
        preview[actor.id] = formula;
        presentIn.push(actor.id);
      }
      if (presentIn.length > 0) out.push({ key, label, preview, presentIn });
    };
    for (const { merged } of allEntries) {
      for (const k of Object.keys(merged)) addKey(k);
    }
    return out;
  }, [actors, columns, columnsByKey, popupToken, scopeActors, systemActions]);

  const popupEmptyMessage = useMemo<string | undefined>(() => {
    if (popupToken === null) return undefined;
    if (popupToken.kind !== 'at' && scopeActors.length === 0) {
      return t('gm_console.popup_need_actor');
    }
    return undefined;
  }, [popupToken, scopeActors.length, t]);

  /* ----------------------------- popup callbacks ----------------------------- */

  const insertText = useCallback(
    (start: number, end: number, insert: string, caretAdjust = 0) => {
      const v = commandRef.current;
      const { text, caret } = replaceTokenInText(v, start, end, insert);
      setCommand(text);
      queueMicrotask(() => {
        const el = terminalInputRef.current;
        if (!el) return;
        el.focus();
        const pos = caret + caretAdjust;
        el.setSelectionRange(pos, pos);
        refreshPopupToken(text, pos, 'roll');
      });
    },
    [refreshPopupToken],
  );

  const onPopupSingleSelect = useCallback(
    (key: string) => {
      if (popupToken === null) return;
      const prefix = popupToken.kind === 'at' ? '@' : popupToken.kind === 'bang' ? '!' : '$';
      insertText(popupToken.start, popupToken.end, `${prefix}${key} `);
      setPopupToken(null);
    },
    [insertText, popupToken],
  );

  /** Build the column-template form of a single `!key` (used for `+` aggregation). */
  const expandBangTemplate = useCallback(
    (key: string): string => {
      const col = columnsByKey[key];
      const tmpl = col?.roll_formula?.trim()
        ? col.roll_formula.replace(/\[value\]/g, `!${key}`)
        : `${systemDice} + !${key}`;
      return `(${tmpl})`;
    },
    [columnsByKey, systemDice],
  );

  const onPopupMultiSelect = useCallback(
    (keys: string[], joiner: RollTokenJoiner) => {
      if (popupToken === null || popupToken.kind === 'at') return;
      const isBang = popupToken.kind === 'bang';
      let inserted: string;

      if (joiner === '+') {
        // Sum of ROLLS, not values:
        //   `!`  → each token expands to its column-template `(1d20 + !key)`,
        //          all joined with ` + ` so the dice engine rolls each separately.
        //   `$`  → each macro is itself a formula; resolver wraps in `(...)`,
        //          so plain `$a + $b` already produces a sum of macro rolls.
        const parts = isBang
          ? keys.map(expandBangTemplate)
          : keys.map((k) => `$${k}`);
        inserted = parts.join(' + ');
      } else {
        // Series — each token becomes its own segment via `;`. Bang-alone and
        // dollar-alone segments expand at submit time, no popup-side templating.
        const prefix = isBang ? '!' : '$';
        const body = keys.map((k) => `${prefix}${k}`).join('; ');
        const atStart = isAtStartOfSegment(commandRef.current, popupToken.start);
        inserted = atStart ? body : `; ${body}`;
      }

      insertText(popupToken.start, popupToken.end, `${inserted} `);
      setPopupToken(null);
    },
    [expandBangTemplate, insertText, popupToken],
  );

  /* ----------------------------- input handlers ----------------------------- */

  const handleCommandChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setCommand(value);
      const caret = e.target.selectionStart ?? value.length;
      refreshPopupToken(value, caret, inputMode);
    },
    [inputMode, refreshPopupToken],
  );

  const handleCommandClick = useCallback(
    (e: React.MouseEvent<HTMLInputElement>) => {
      const el = e.currentTarget;
      const caret = el.selectionStart ?? el.value.length;
      refreshPopupToken(el.value, caret, inputMode);
    },
    [inputMode, refreshPopupToken],
  );

  const handleCommandKeyUp = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight' ||
        e.key === 'Home' ||
        e.key === 'End'
      ) {
        const el = e.currentTarget;
        refreshPopupToken(el.value, el.selectionStart ?? el.value.length, inputMode);
      }
    },
    [inputMode, refreshPopupToken],
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

  const handleNoteSelectFile = useCallback(
    (columnId: string, file: string) => {
      setColumnSelected(columnId, file);
    },
    [setColumnSelected],
  );

  const handleNoteRemove = useCallback(
    (columnId: string) => {
      removeColumn(columnId);
    },
    [removeColumn],
  );

  const handleFabSingleClick = useCallback(() => {
    if (fabClickTimerRef.current) clearTimeout(fabClickTimerRef.current);
    fabClickTimerRef.current = setTimeout(() => {
      fabClickTimerRef.current = null;
      setPanelOpen((v) => !v);
    }, FAB_CLICK_DELAY_MS);
  }, []);

  /** Roll-mode submit: parse @mentions/comment, plan per-actor segments, fire requests. */
  const submitRoll = useCallback(async () => {
    const raw = commandRef.current;
    if (raw.trim() === '?') {
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

    const { working, comment, matchedActors } = parseRollInput(raw, actors);
    const distinctActors = uniqActors(matchedActors);

    const hasBang = /(^|[\s+\-*/(),;])![\p{L}_]/u.test(working);
    const hasDollar = /(^|[\s+\-*/(),;])\$[\w-]/.test(working);

    if ((hasBang || hasDollar) && distinctActors.length === 0) {
      flashActionStatus('error');
      return;
    }
    if (!working) {
      flashActionStatus('error');
      return;
    }

    try {
      if (distinctActors.length > 0) {
        type Pending = { promise: Promise<Response>; prefix: string; comment?: string };
        const pending: Pending[] = [];
        let anyMissing = false;
        for (const actor of distinctActors) {
          const ctx: ResolveContext = {
            actor,
            columnsByKey,
            mergedActions: mergeActorActionDefs(systemActions, actor),
            systemDice,
          };
          const segments: SegmentPlan[] = planSegmentsForActor(working, ctx);
          for (const seg of segments) {
            if (seg.missing.length > 0) {
              anyMissing = true;
              continue;
            }
            if (!seg.expression) continue;
            const finalComment = joinComments(seg.autoComment, comment);
            pending.push({
              promise: fetch(`/api/combat/actors/${encodeURIComponent(actor.id)}/roll`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: buildRollRequestPayload(seg.expression, finalComment),
              }),
              prefix: actor.name,
              comment: finalComment ?? undefined,
            });
          }
        }
        if (pending.length === 0 || anyMissing) {
          flashActionStatus('error');
          return;
        }
        const responses = await Promise.all(pending.map((p) => p.promise));
        const rows: RollBatchRow[] = [];
        for (let i = 0; i < responses.length; i++) {
          const parsed = await parseRollHttpResponse(responses[i]);
          if (!parsed.ok) {
            showRollErrorToast(parsed.message);
            flashActionStatus('error');
            return;
          }
          rows.push({
            prefix: pending[i].prefix,
            comment: pending[i].comment,
            result: parsed.result,
          });
        }
        showRollBatchToast(rows);
      } else {
        const segments = working
          .split(';')
          .map((s) => s.trim())
          .filter(Boolean);
        if (segments.length === 0) {
          flashActionStatus('error');
          return;
        }
        type Pending = { promise: Promise<Response>; prefix: string; comment?: string };
        const pending: Pending[] = segments.map((seg) => ({
          promise: fetch('/api/combat/roll', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: buildRollRequestPayload(seg, comment),
          }),
          prefix: t('roll_toast.gm_prefix'),
          comment: joinComments(seg, comment) ?? undefined,
        }));
        const responses = await Promise.all(pending.map((p) => p.promise));
        const rows: RollBatchRow[] = [];
        for (let i = 0; i < responses.length; i++) {
          const parsed = await parseRollHttpResponse(responses[i]);
          if (!parsed.ok) {
            showRollErrorToast(parsed.message);
            flashActionStatus('error');
            return;
          }
          rows.push({
            prefix: pending[i].prefix,
            comment: pending[i].comment,
            result: parsed.result,
          });
        }
        showRollBatchToast(rows);
      }
      setCommand('');
      setPopupToken(null);
    } catch {
      showRollErrorToast(t('stat_editor.roll_network_error'));
      flashActionStatus('error');
    }
  }, [actors, columnsByKey, flashActionStatus, systemActions, systemDice, t]);

  const handleCommandKeyDown = useCallback(
    async (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape' && popupToken !== null) {
        e.preventDefault();
        setPopupToken(null);
        return;
      }

      if (e.key === 'Tab' && commandRef.current.trim() === '') {
        e.preventDefault();
        setInputMode((m) => cycleInputMode(m));
        setPopupToken(null);
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
        await submitRoll();
        return;
      }

      if (inputMode === 'ai') {
        const toSend = trimmed;
        setCommand('');
        setAiChatOpen(true);
        void (async () => {
          const ok = await sendAiMessage(toSend);
          flashActionStatus(ok ? 'success' : 'error');
        })();
        return;
      }

      setCommand('');
      flashActionStatus('success');
    },
    [flashActionStatus, inputMode, popupToken, sendAiMessage, submitRoll],
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

  const engineKeyCombat = (combatState?.core?.engine_type ?? 'standard').toLowerCase();
  const hideInitiativeConsole = engineKeyCombat === 'popcorn';
  const initiativeRollAvailable = combatState?.initiative_roll_available ?? true;
  const iniSess = combatState?.session;
  const inclCharacter = iniSess?.initiative_include_character ?? false;
  const inclEnemy = iniSess?.initiative_include_enemy ?? true;
  const inclAlly = iniSess?.initiative_include_ally ?? true;
  const inclNeutral = iniSess?.initiative_include_neutral ?? true;
  const iniLocked = iniSess?.initiative_reroll_locked ?? false;
  const iniShowRowDice = iniSess?.initiative_show_per_actor_dice !== false;
  const allowOutOfTurn = iniSess?.allow_out_of_turn_rolls === true;

  const toggleOutOfTurnPolicy = useCallback(async () => {
    try {
      await fetch('/api/combat/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allow_out_of_turn_rolls: !allowOutOfTurn }),
      });
      await refetchState();
    } catch {
      // ignore
    }
  }, [allowOutOfTurn, refetchState]);

  const resolveRollRequest = useCallback(
    async (requestId: string, decision: 'approve_once' | 'deny' | 'grant_actor_round') => {
      try {
        await fetch(`/api/combat/roll-requests/${encodeURIComponent(requestId)}/resolve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision }),
        });
      } catch {
        // ignore
      } finally {
        setPendingRollRequests((prev) => prev.filter((r) => r.request_id !== requestId));
        await refetchState();
      }
    },
    [refetchState, setPendingRollRequests],
  );

  useEffect(() => {
    if (!panelOpen) {
      setNotesOpen(false);
      setAiChatOpen(false);
      setInitiativeStripOpen(false);
      setRollMatrixOpen(false);
    }
  }, [panelOpen]);

  const patchInitiativeSettings = useCallback(
    async (patch: Record<string, boolean>) => {
      try {
        const res = await fetch('/api/combat/initiative/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        const raw = await res.json().catch(() => ({}));
        if (!res.ok) {
          showRollErrorToast(formatFastApiDetail(raw) || t('gm_console.initiative_settings_error'));
          return;
        }
        await refetchState();
      } catch {
        showRollErrorToast(t('stat_editor.roll_network_error'));
      }
    },
    [refetchState, t],
  );

  const rollBulkInitiative = useCallback(async () => {
    if (!initiativeRollAvailable || bulkInitiativeRolling || hideInitiativeConsole) return;
    setBulkInitiativeRolling(true);
    try {
      const res = await fetch('/api/combat/initiative/roll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const raw = await res.json().catch(() => ({}));
      if (!res.ok) {
        showRollErrorToast(formatFastApiDetail(raw));
        return;
      }
      toastInitiativeRollOutcome(raw, t('combat.initiative'));
      await refetchState();
    } catch {
      showRollErrorToast(t('stat_editor.roll_network_error'));
    } finally {
      setBulkInitiativeRolling(false);
    }
  }, [bulkInitiativeRolling, hideInitiativeConsole, initiativeRollAvailable, refetchState, t]);

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

  const popupKind: RollTokenKind | null = popupToken?.kind ?? null;
  const popupVisible =
    popupToken !== null &&
    inputMode === 'roll' &&
    (popupToken.kind === 'at' || scopeActors.length > 0);

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
              className={`pointer-events-none flex w-full flex-col justify-end origin-bottom ${
                rollRequestsOpen ? 'overflow-visible' : 'overflow-hidden'
              }`}
            >
              <AnimatePresence initial={false}>
                {initiativeStripOpen && !hideInitiativeConsole ? (
                  <motion.div
                    key="gm-console-initiative-layer"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={springNotes}
                    className="pointer-events-none w-full origin-bottom overflow-hidden bg-transparent"
                  >
                    <div className="pointer-events-auto flex flex-col gap-2 border-b border-zinc-800 bg-zinc-900/95 px-4 py-3">
                      {!initiativeRollAvailable ? (
                        <p className="text-xs text-zinc-500">{t('gm_console.initiative_disabled_hint')}</p>
                      ) : (
                        <button
                          type="button"
                          disabled={bulkInitiativeRolling}
                          onClick={() => void rollBulkInitiative()}
                          className="self-start rounded-lg bg-emerald-600/25 px-3 py-1.5 text-xs font-medium text-emerald-200 ring-1 ring-emerald-500/40 hover:bg-emerald-600/35 disabled:opacity-50"
                        >
                          {t('gm_console.initiative_roll_button')}
                        </button>
                      )}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] uppercase tracking-wide text-zinc-500 w-full sm:w-auto">
                          {t('gm_console.initiative_roles_label')}
                        </span>
                        <button
                          type="button"
                          onClick={() => void patchInitiativeSettings({ initiative_include_character: !inclCharacter })}
                          className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                            inclCharacter
                              ? 'bg-emerald-600/25 text-emerald-300 ring-1 ring-emerald-500/45'
                              : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700'
                          }`}
                        >
                          {t('gm_console.initiative_role_character')}
                        </button>
                        <button
                          type="button"
                          onClick={() => void patchInitiativeSettings({ initiative_include_enemy: !inclEnemy })}
                          className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                            inclEnemy
                              ? 'bg-emerald-600/25 text-emerald-300 ring-1 ring-emerald-500/45'
                              : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700'
                          }`}
                        >
                          {t('gm_console.initiative_role_enemy')}
                        </button>
                        <button
                          type="button"
                          onClick={() => void patchInitiativeSettings({ initiative_include_ally: !inclAlly })}
                          className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                            inclAlly
                              ? 'bg-emerald-600/25 text-emerald-300 ring-1 ring-emerald-500/45'
                              : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700'
                          }`}
                        >
                          {t('gm_console.initiative_role_ally')}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void patchInitiativeSettings({ initiative_include_neutral: !inclNeutral })
                          }
                          className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                            inclNeutral
                              ? 'bg-emerald-600/25 text-emerald-300 ring-1 ring-emerald-500/45'
                              : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700'
                          }`}
                        >
                          {t('gm_console.initiative_role_neutral')}
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void patchInitiativeSettings({ initiative_reroll_locked: !iniLocked })}
                          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                            iniLocked
                              ? 'bg-emerald-600/20 text-emerald-300 ring-1 ring-emerald-500/45'
                              : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                          }`}
                          title={t('gm_console.initiative_lock_hint')}
                        >
                          <Lock size={14} strokeWidth={2} aria-hidden />
                          {t('gm_console.initiative_lock_reroll')}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void patchInitiativeSettings({
                              initiative_show_per_actor_dice: !iniShowRowDice,
                            })
                          }
                          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                            iniShowRowDice
                              ? 'bg-emerald-600/20 text-emerald-300 ring-1 ring-emerald-500/45'
                              : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                          }`}
                        >
                          <Dices size={14} strokeWidth={2} aria-hidden />
                          {t('gm_console.initiative_show_row_dice')}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>

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

              <AnimatePresence initial={false}>
                {aiChatOpen ? (
                  <motion.div
                    key="gm-console-ai-chat-layer"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={springNotes}
                    className="pointer-events-none w-full origin-bottom overflow-hidden bg-transparent"
                  >
                    <AIChatDrawer messages={aiMessages} isLoading={aiLoading} />
                  </motion.div>
                ) : null}
              </AnimatePresence>

              <AnimatePresence initial={false}>
                {rollMatrixOpen ? (
                  <motion.div
                    key="gm-console-roll-matrix-layer"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={springNotes}
                    className="pointer-events-none w-full origin-bottom overflow-hidden bg-transparent"
                  >
                    <RollMatrixDrawer combatSession={combatState} onRefetch={refetchState} />
                  </motion.div>
                ) : null}
              </AnimatePresence>

              <div className="relative z-20 flex w-full flex-col pointer-events-auto border-t border-zinc-800 bg-zinc-950 shadow-[0_-8px_40px_rgba(0,0,0,0.6)]">
                <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 bg-zinc-900/80 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => {
                      setNotesOpen((v) => !v);
                      setInitiativeStripOpen(false);
                      setAiChatOpen(false);
                      setRollMatrixOpen(false);
                    }}
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
                  <button
                    type="button"
                    disabled={hideInitiativeConsole}
                    onClick={() => {
                      if (hideInitiativeConsole) return;
                      setInitiativeStripOpen((v) => !v);
                      setNotesOpen(false);
                      setAiChatOpen(false);
                      setRollMatrixOpen(false);
                    }}
                    aria-expanded={initiativeStripOpen}
                    title={t('gm_console.placeholder_initiative')}
                    className={
                      hideInitiativeConsole
                        ? toolBtnClass
                        : `flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                            initiativeStripOpen
                              ? 'bg-emerald-600/20 text-emerald-400 ring-1 ring-emerald-500/50'
                              : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100'
                          }`
                    }
                  >
                    <Dices size={15} aria-hidden />
                    <motion.span
                      animate={{ rotate: initiativeStripOpen ? 180 : 0 }}
                      transition={springNotes}
                      className="inline-flex"
                    >
                      <ChevronDown size={15} aria-hidden />
                    </motion.span>
                    <span className="hidden sm:inline">{t('gm_console.placeholder_initiative')}</span>
                  </button>
                  <span className="h-5 w-px shrink-0 bg-zinc-700/60" aria-hidden />
                  <button
                    type="button"
                    onClick={() => {
                      setAiChatOpen((v) => !v);
                      setNotesOpen(false);
                      setInitiativeStripOpen(false);
                      setRollMatrixOpen(false);
                    }}
                    aria-expanded={aiChatOpen}
                    title={t('gm_console.ai_chat_toggle')}
                    className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      aiChatOpen
                        ? 'bg-rose-600/20 text-rose-300 ring-1 ring-rose-500/50'
                        : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100'
                    }`}
                  >
                    <MessageSquare size={15} aria-hidden />
                    <motion.span
                      animate={{ rotate: aiChatOpen ? 180 : 0 }}
                      transition={springNotes}
                      className="inline-flex"
                    >
                      <ChevronDown size={15} aria-hidden />
                    </motion.span>
                    <span className="hidden sm:inline">{t('gm_console.ai_chat_toggle')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRollMatrixOpen((v) => !v);
                      setNotesOpen(false);
                      setInitiativeStripOpen(false);
                      setAiChatOpen(false);
                    }}
                    aria-expanded={rollMatrixOpen}
                    title={t('gm_console.roll_matrix')}
                    className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      rollMatrixOpen
                        ? 'bg-amber-600/20 text-amber-200 ring-1 ring-amber-500/50'
                        : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100'
                    }`}
                  >
                    <Dices size={15} aria-hidden />
                    <motion.span
                      animate={{ rotate: rollMatrixOpen ? 180 : 0 }}
                      transition={springNotes}
                      className="inline-flex"
                    >
                      <ChevronDown size={15} aria-hidden />
                    </motion.span>
                    <span className="hidden sm:inline">{t('gm_console.roll_matrix')}</span>
                  </button>
                  <div className="relative pointer-events-auto">
                    <button
                      type="button"
                      onClick={() => setRollRequestsOpen((v) => !v)}
                      aria-expanded={rollRequestsOpen}
                      className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                        rollRequestsOpen || allowOutOfTurn
                          ? 'bg-emerald-600/20 text-emerald-400 ring-1 ring-emerald-500/50 hover:bg-emerald-600/30'
                          : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100'
                      }`}
                      title={t('gm_console.out_of_turn_button')}
                    >
                      {t('gm_console.out_of_turn_button')}
                      {pendingRollRequests.length > 0 ? (
                        <span className="ml-2 rounded-full bg-amber-500/20 text-amber-300 px-2 py-0.5 text-[10px]">
                          {pendingRollRequests.length}
                        </span>
                      ) : null}
                    </button>

                    {rollRequestsOpen ? (
                      <div className="absolute right-0 bottom-full z-[60] mb-2 w-[22rem] max-w-[90vw] rounded-xl border border-zinc-800 bg-zinc-950/95 backdrop-blur shadow-2xl overflow-hidden">
                        <div className="px-3 py-2 border-b border-zinc-800">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                            {t('gm_console.out_of_turn_button')}
                          </div>
                          <div className="mt-3 flex items-start gap-3">
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="text-xs font-medium text-zinc-200 leading-snug">
                                {t('gm_console.out_of_turn_no_requests_label')}
                              </div>
                              <p className="text-[11px] text-zinc-500 leading-snug">
                                {t('gm_console.out_of_turn_no_requests_hint')}
                              </p>
                            </div>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={allowOutOfTurn}
                              onClick={() => void toggleOutOfTurnPolicy()}
                              title={t('gm_console.out_of_turn_no_requests_label')}
                              className={`relative mt-0.5 h-7 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${
                                allowOutOfTurn ? 'bg-emerald-600/60' : 'bg-zinc-700'
                              }`}
                            >
                              <span
                                aria-hidden
                                className={`pointer-events-none absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out ${
                                  allowOutOfTurn ? 'translate-x-4' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          </div>
                        </div>
                        <div className="max-h-64 overflow-y-auto p-2 space-y-2">
                          {pendingRollRequests.length === 0 ? (
                            <div className="text-xs text-zinc-600 px-2 py-3">{t('gm_console.roll_requests_empty')}</div>
                          ) : (
                            pendingRollRequests.map((r) => (
                              <div
                                key={r.request_id}
                                className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2"
                              >
                                <div className="text-xs text-zinc-200 truncate">
                                  {(r.actor_name ?? r.actor_id) || r.actor_id}
                                  {r.is_secret ? (
                                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300">
                                      secret
                                    </span>
                                  ) : null}
                                </div>
                                <div className="text-[11px] font-mono text-zinc-500 break-words">
                                  {r.expression}
                                </div>
                                {r.comment ? (
                                  <div className="text-[11px] text-zinc-400 mt-1 break-words">{r.comment}</div>
                                ) : null}
                                <div className="mt-2 flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void resolveRollRequest(r.request_id, 'approve_once')}
                                    className="flex-1 rounded-md border border-emerald-500/30 bg-emerald-600/15 text-emerald-300 text-xs py-1.5 hover:bg-emerald-600/25"
                                  >
                                    {t('gm_console.roll_request_ok')}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void resolveRollRequest(r.request_id, 'deny')}
                                    className="flex-1 rounded-md border border-rose-500/30 bg-rose-600/10 text-rose-300 text-xs py-1.5 hover:bg-rose-600/15"
                                  >
                                    {t('gm_console.roll_request_deny')}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void resolveRollRequest(r.request_id, 'grant_actor_round')}
                                    className="flex-1 rounded-md border border-amber-500/30 bg-amber-600/10 text-amber-300 text-xs py-1.5 hover:bg-amber-600/15"
                                  >
                                    {t('gm_console.roll_request_round_pass')}
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="relative bg-zinc-950 px-3 py-2.5">
                  {inputMode === 'roll' && showRollHelp ? (
                    <div
                      className="pointer-events-none absolute bottom-full right-0 z-50 mb-2 max-w-[min(100%,22rem)] rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-300 shadow-xl"
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
                      onClick={handleCommandClick}
                      onKeyDown={handleCommandKeyDown}
                      onKeyUp={handleCommandKeyUp}
                      className={`min-w-0 flex-1 rounded-md border border-zinc-700/60 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors duration-300 ${actionStatus !== 'idle' ? statusChrome : `focus:ring-2 ${modeRing}`}`}
                      placeholder={t(placeholderKey)}
                      aria-label={t('gm_console.command_aria')}
                      aria-expanded={popupVisible}
                      aria-controls="gm-console-roll-popup"
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

      {popupVisible && popupKind && popupToken ? (
        <RollTokenPopup
          kind={popupKind}
          items={popupItems}
          scopeActors={scopeActors}
          partial={popupToken.partial}
          bottomPx={popupBottom}
          onSingleSelect={onPopupSingleSelect}
          onMultiSelect={onPopupMultiSelect}
          emptyMessage={popupEmptyMessage}
        />
      ) : null}
    </div>
  );
}
