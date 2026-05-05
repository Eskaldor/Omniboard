import { useEffect, useMemo, useState } from 'react';
import type { Actor } from '../../types';
import type { PlayerAuth, PublicCombatState } from '../types';

interface UsePlayerActorResult {
  actor: Actor | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Единственный источник истины об акторе игрока:
 *   1. WS-стейт (`state.core.actors`) — приоритет, реагирует на GM-правки мгновенно.
 *   2. HTTP `/api/player/actor/{id}` — bootstrap/fallback для лобби и первого рендера.
 *
 * Используется в SheetView и ActionsView вместо дублированного паттерна.
 */
export function usePlayerActor(
  auth: PlayerAuth,
  state: PublicCombatState | null | undefined,
): UsePlayerActorResult {
  // Живой актор из персонализированного WS-стейта (приоритет).
  const wsActor = useMemo<Actor | null>(() => {
    const list = state?.core?.actors;
    if (!Array.isArray(list)) return null;
    return (list.find((a) => a.id === auth.actorId) as Actor | undefined) ?? null;
  }, [state, auth.actorId]);

  const [fetchedActor, setFetchedActor] = useState<Actor | null>(null);
  const [fetchedLoading, setFetchedLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActor = () => {
    let cancelled = false;
    setFetchedLoading(true);
    setError(null);

    fetch(`/api/player/actor/${encodeURIComponent(auth.actorId)}`, {
      headers: { 'X-Player-Token': auth.token },
    })
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 403 ? 'Токен устарел' : 'Персонаж не найден');
        return r.json() as Promise<Actor>;
      })
      .then((data) => {
        if (!cancelled) setFetchedActor(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      })
      .finally(() => {
        if (!cancelled) setFetchedLoading(false);
      });

    return () => {
      cancelled = true;
    };
  };

  useEffect(() => {
    const cancel = fetchActor();
    return cancel;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.actorId, auth.token]);

  const actor = wsActor ?? fetchedActor;
  const loading = !actor && fetchedLoading;

  return { actor, loading, error, refetch: fetchActor };
}
