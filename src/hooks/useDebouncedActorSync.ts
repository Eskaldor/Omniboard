import {
  useCallback,
  useEffect,
  useRef,
} from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Actor, CombatState } from '../types';
import {
  accumulatePendingActorPatch,
  applyActorPatchOptimistic,
  drainAllPendingActorPatches,
  takeAndClearPendingActorPatch,
} from '../utils/actorPatchMerge';

export { mergeActorPatchBodies, applyActorPatchOptimistic } from '../utils/actorPatchMerge';

export const ACTOR_PATCH_DEBOUNCE_MS = 500;

type SetCombatState = Dispatch<SetStateAction<CombatState | null>>;

export function useDebouncedActorSync(options: {
  setState: SetCombatState;
  refetchState: () => Promise<void>;
  debounceMs?: number;
}) {
  const { setState, refetchState, debounceMs = ACTOR_PATCH_DEBOUNCE_MS } = options;

  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const isMountedRef = useRef(true);
  const refetchRef = useRef(refetchState);
  refetchRef.current = refetchState;

  const flushActor = useCallback(async (actorId: string) => {
    const merged = takeAndClearPendingActorPatch(actorId);
    const existingTimer = timersRef.current.get(actorId);
    if (existingTimer != null) {
      clearTimeout(existingTimer);
      timersRef.current.delete(actorId);
    }
    if (!merged || Object.keys(merged).length === 0) return;

    try {
      await fetch(`/api/actors/${actorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged),
      });
      if (isMountedRef.current) {
        await refetchRef.current();
      }
    } catch {
      if (isMountedRef.current) {
        await refetchRef.current().catch(() => {});
      }
    }
  }, []);

  const scheduleFlush = useCallback(
    (actorId: string) => {
      const existing = timersRef.current.get(actorId);
      if (existing != null) clearTimeout(existing);
      const tid = setTimeout(() => {
        timersRef.current.delete(actorId);
        void flushActor(actorId);
      }, debounceMs);
      timersRef.current.set(actorId, tid);
    },
    [debounceMs, flushActor],
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      for (const t of timersRef.current.values()) clearTimeout(t);
      timersRef.current.clear();

      const toFlush = drainAllPendingActorPatches();
      for (const [actorId, body] of toFlush) {
        if (Object.keys(body).length === 0) continue;
        void fetch(`/api/actors/${actorId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }).catch(() => {});
      }
    };
  }, []);

  const updateActor = useCallback(
    (actorId: string, updates: Partial<Actor>) => {
      const patch = updates as Record<string, unknown>;
      accumulatePendingActorPatch(actorId, patch);

      setState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          actors: prev.actors.map((a) =>
            a.id === actorId ? applyActorPatchOptimistic(a, patch) : a,
          ),
        };
      });

      scheduleFlush(actorId);
    },
    [setState, scheduleFlush],
  );

  const updateActorField = useCallback(
    (actorId: string, field: string, value: unknown) => {
      updateActor(actorId, { [field]: value } as Partial<Actor>);
    },
    [updateActor],
  );

  return { updateActor, updateActorField };
}
