import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Swords } from 'lucide-react';
import type { Actor } from '../../types';
import type { PlayerAuth, PublicCombatState } from '../types';
import { useSystemActions } from '../../hooks/useSystemActions';
import { mergeActorActionDefs } from '../../utils/mergeActorActionDefs';
import { ActionsPanel } from '../../components/Modals/ActionsPanel';
import {
  parseRollHttpResponse,
  showRollErrorToast,
  showRollResultToast,
} from '../../utils/rollToast';

interface Props {
  auth: PlayerAuth;
  state: PublicCombatState | null;
}

export function ActionsView({ auth, state }: Props) {
  const [actor, setActor] = useState<Actor | null>(null);
  const [actorLoading, setActorLoading] = useState(true);
  const [rolling, setRolling] = useState(false);

  const systemName = (state?.core?.system ?? '').trim();

  // Определяем: наш ход?
  const isMyTurn =
    (state?.core?.is_active ?? false) &&
    state?.core?.turn_queue != null &&
    state.core.turn_queue[state.core.current_index ?? 0] === auth.actorId;

  // Полные данные актора (с actions) берём из защищённого эндпоинта,
  // не из публичного WS-стейта — там actions могут быть неполными.
  useEffect(() => {
    let cancelled = false;
    setActorLoading(true);

    fetch(`/api/player/actor/${encodeURIComponent(auth.actorId)}`, {
      headers: { 'X-Player-Token': auth.token },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: Actor) => {
        if (!cancelled) setActor(data);
      })
      .catch(() => {
        if (!cancelled) setActor(null);
      })
      .finally(() => {
        if (!cancelled) setActorLoading(false);
      });

    return () => { cancelled = true; };
  }, [auth.actorId, auth.token]);

  const { actions: systemActions, loading: actionsLoading } = useSystemActions(systemName);

  const mergedActionDefs = React.useMemo(
    () => (actor ? mergeActorActionDefs(systemActions, actor) : {}),
    [systemActions, actor],
  );

  const handleRollAction = useCallback(
    async (formula: string, comment: string) => {
      const expr = formula.trim();
      if (!expr || !actor) return;
      setRolling(true);
      try {
        const res = await fetch(`/api/combat/actors/${encodeURIComponent(auth.actorId)}/roll`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expression: expr,
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
        } else {
          showRollErrorToast((parsed as { ok: false; message: string }).message);
        }
      } catch {
        showRollErrorToast('Ошибка сети');
      } finally {
        setRolling(false);
      }
    },
    [auth.actorId, actor],
  );

  const isLoading = actorLoading || actionsLoading;

  if (isLoading) {
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
        {isMyTurn ? '⚔️ Твой ход!' : 'Ожидание хода…'}
      </div>

      {/* Actions panel — always rendered, disabled when not our turn */}
      <div
        className={`transition-opacity duration-200 ${
          rolling ? 'opacity-50 pointer-events-none' : ''
        } ${!isMyTurn ? 'opacity-60 pointer-events-none' : ''}`}
      >
        <ActionsPanel
          actor={actor}
          mergedActionDefs={mergedActionDefs}
          onRollAction={handleRollAction}
          actionsTab={undefined}
        />
      </div>
    </div>
  );
}
