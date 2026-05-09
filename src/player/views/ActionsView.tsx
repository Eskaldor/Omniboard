import React, { useCallback, useMemo, useState } from 'react';
import { Loader2, Swords, Eye, EyeOff } from 'lucide-react';
import type { PlayerAuth, PublicCombatState } from '../types';
import { useSystemActions } from '../../hooks/useSystemActions';
import {
  useSystemSheetProfiles,
  resolveActiveSheetProfile,
} from '../../hooks/useSystemSheetProfiles';
import { mergeActorActionDefs } from '../../utils/mergeActorActionDefs';
import { ActionsPanel } from '../../components/Modals/ActionsPanel';
import {
  parseRollHttpResponse,
  normalizeRollResult,
  showRollErrorToast,
  showRollResultToast,
} from '../../utils/rollToast';
import { usePlayerActor } from '../hooks/usePlayerActor';
import { hapticTap } from '../../utils/haptics';
import { hasActorRoundOutOfTurnPass } from '../../utils/outOfTurnRoll';

interface Props {
  auth: PlayerAuth;
  state: PublicCombatState | null;
  rollRequestStatus?: { request_id: string; status: 'pending' | 'approved' | 'denied'; reason?: string } | null;
}

export function ActionsView({ auth, state, rollRequestStatus }: Props) {
  const { actor, loading: actorLoading } = usePlayerActor(auth, state);

  const [rolling, setRolling] = useState(false);
  const [isSecret, setIsSecret] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const systemName = (state?.core?.system ?? '').trim();

  // Determine if it's our turn (turn_queue is NOT filtered in public state).
  const isMyTurn =
    (state?.core?.is_active ?? false) &&
    state?.core?.turn_queue != null &&
    state.core.turn_queue[state.core.current_index ?? 0] === auth.actorId;
  const allowOutOfTurn = state?.session?.allow_out_of_turn_rolls === true;
  const roundPass = hasActorRoundOutOfTurnPass(state?.session, state?.core?.round, auth.actorId);
  const canRollNow = isMyTurn || allowOutOfTurn || roundPass;
  const statusForPending =
    pendingId && rollRequestStatus?.request_id === pendingId ? rollRequestStatus.status : null;

  const { actions: systemActions, loading: actionsLoading } = useSystemActions(systemName);
  const { profiles: sheetProfiles } = useSystemSheetProfiles(systemName);

  const mergedActionDefs = useMemo(
    () => (actor ? mergeActorActionDefs(systemActions, actor) : {}),
    [systemActions, actor],
  );

  // Inherit MiniSheetModal grouping/accordions from the active sheet profile.
  // ActionsPanel additionally honours `actor.actions_panel_override` internally.
  const actionsAccordions = useMemo(() => {
    if (!actor) return null;
    const profile = resolveActiveSheetProfile(sheetProfiles, actor.sheet_profile_id);
    return profile?.actions?.accordions ?? null;
  }, [sheetProfiles, actor]);

  const handleRollAction = useCallback(
    async (formula: string, comment: string) => {
      const expr = formula.trim();
      if (!expr || !actor) return;
      setRolling(true);
      try {
        if (!canRollNow) {
          const res = await fetch('/api/player/roll/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Player-Token': auth.token },
            body: JSON.stringify({
              expression: expr,
              comment: comment.trim() || undefined,
              is_secret: isSecret,
            }),
          });
          const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
          const status = typeof raw.status === 'string' ? raw.status : '';
          const request_id = typeof raw.request_id === 'string' ? raw.request_id : '';
          if (status === 'pending' && request_id) {
            setPendingId(request_id);
            return;
          }
          if (status === 'approved') {
            const result = normalizeRollResult(raw.result);
            if (!result) {
              showRollErrorToast('Не удалось выполнить бросок');
              return;
            }
            showRollResultToast({
              result,
              actorName: actor.name,
              comment: comment.trim() || undefined,
            });
            hapticTap('light');
            return;
          }
          showRollErrorToast(typeof raw.detail === 'string' ? raw.detail : 'Не удалось отправить запрос');
          return;
        }
        const res = await fetch(`/api/combat/actors/${encodeURIComponent(auth.actorId)}/roll`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Player-Token': auth.token },
          body: JSON.stringify({
            expression: expr,
            is_secret: isSecret,
            ...(comment.trim() ? { comment: comment.trim() } : {}),
          }),
        });
        const parsed = await parseRollHttpResponse(res);
        if (parsed.ok) {
          showRollResultToast({
            result: parsed.result,
            actorName: actor.name,
            comment: comment.trim() || undefined,
          });
          hapticTap('light');
        } else {
          showRollErrorToast((parsed as { ok: false; message: string }).message);
        }
      } catch {
        showRollErrorToast('Ошибка сети');
      } finally {
        setRolling(false);
      }
    },
    [actor, auth.actorId, auth.token, canRollNow, isSecret],
  );

  if (actorLoading || actionsLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={28} className="animate-spin text-zinc-600" />
      </div>
    );
  }

  if (!actor) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center px-6">
        <Swords size={32} className="text-zinc-700" />
        <p className="text-zinc-500 text-sm">Персонаж не найден</p>
        <p className="text-zinc-600 text-xs">Попробуйте выйти из лобби и зайти снова</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Turn status bar */}
      <div
        className={`mx-4 mt-4 mb-1 rounded-xl px-4 py-2.5 text-center text-sm font-medium border transition-colors ${
          isMyTurn
            ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
            : 'bg-zinc-900/60 border-zinc-800 text-zinc-500'
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="truncate">{isMyTurn ? '⚔️ Твой ход!' : 'Ожидание хода…'}</span>
          <button
            type="button"
            onClick={() => {
              hapticTap('light');
              setIsSecret((v) => !v);
            }}
            className={[
              'shrink-0 w-9 h-9 grid place-items-center rounded-lg border transition-colors',
              isSecret
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                : 'bg-zinc-950/20 border-zinc-800 text-zinc-500 hover:text-zinc-200 hover:border-zinc-700',
            ].join(' ')}
            title="Скрытый бросок"
            aria-pressed={isSecret}
          >
            {isSecret ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      {/* Actions panel — always rendered, disabled when not our turn */}
      <div
        className={`transition-opacity duration-200 ${
          rolling ? 'opacity-50 pointer-events-none' : ''
        } ${statusForPending === 'pending' ? 'opacity-60 pointer-events-none' : ''}`}
      >
        <ActionsPanel
          actor={actor}
          mergedActionDefs={mergedActionDefs}
          onRollAction={handleRollAction}
          actionsAccordions={actionsAccordions}
          variant="player"
        />
      </div>
      {pendingId && statusForPending === 'pending' ? (
        <div className="mx-4 mt-2 text-xs text-zinc-500">Ожидание мастера…</div>
      ) : null}
      {pendingId && statusForPending === 'denied' ? (
        <div className="mx-4 mt-2 text-xs text-rose-300/90">Мастер отклонил бросок</div>
      ) : null}
    </div>
  );
}
