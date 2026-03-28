import {
  useCallback,
  useEffect,
  useRef,
} from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Actor, CombatState } from '../types';

export const ACTOR_PATCH_DEBOUNCE_MS = 500;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Collapse rapid UI edits into one PATCH body; deep-merge `stats` keys. */
export function mergeActorPatchBodies(
  previous: Record<string, unknown> | undefined,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const base = previous ? { ...previous } : {};
  for (const [key, value] of Object.entries(incoming)) {
    if (key === 'stats' && isPlainObject(value)) {
      const prevStats = base['stats'];
      base['stats'] = {
        ...(isPlainObject(prevStats) ? prevStats : {}),
        ...value,
      };
    } else {
      base[key] = value;
    }
  }
  return base;
}

/** Apply one incremental patch to an actor for optimistic UI (single user action). */
export function applyActorPatchOptimistic(actor: Actor, patch: Record<string, unknown>): Actor {
  const next: Actor = { ...actor, stats: { ...actor.stats } };
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'stats' && isPlainObject(value)) {
      next.stats = { ...next.stats, ...value };
    } else {
      (next as unknown as Record<string, unknown>)[key] = value;
    }
  }
  return next;
}

type SetCombatState = Dispatch<SetStateAction<CombatState | null>>;

export function useDebouncedActorSync(options: {
  setState: SetCombatState;
  refetchState: () => Promise<void>;
  debounceMs?: number;
}) {
  const { setState, refetchState, debounceMs = ACTOR_PATCH_DEBOUNCE_MS } = options;

  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingRef = useRef<Map<string, Record<string, unknown>>>(new Map());
  const isMountedRef = useRef(true);
  const refetchRef = useRef(refetchState);
  refetchRef.current = refetchState;

  const flushActor = useCallback(async (actorId: string) => {
    const merged = pendingRef.current.get(actorId);
    pendingRef.current.delete(actorId);
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

      const toFlush = [...pendingRef.current.entries()];
      pendingRef.current.clear();

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
      pendingRef.current.set(
        actorId,
        mergeActorPatchBodies(pendingRef.current.get(actorId), patch),
      );

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
