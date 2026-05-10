import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import type { CombatState } from '../types';
import { applyPendingPatchesToCombatState } from '../utils/actorPatchMerge';
import { showRollResultToast, showRollRequestToast, normalizeRollResult } from '../utils/rollToast';
import { showWhisperToast } from '../utils/whisperToast';

const FALLBACK_THROTTLE_MS = 5000;

export type PendingRollRequest = {
  request_id: string;
  actor_id: string;
  actor_name?: string;
  expression: string;
  comment?: string | null;
  is_secret: boolean;
  created_at?: string;
};

export function useCombatState() {
  const [combatState, setCombatStateRaw] = useState<CombatState | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);
  const [pendingRollRequests, setPendingRollRequests] = useState<PendingRollRequest[]>([]);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const rollRequestToastSeenRef = useRef<Set<string>>(new Set());
  const isMountedRef = useRef(true);
  const lastFallbackAtRef = useRef(0);
  const connectRef = useRef<(() => void) | null>(null);

  /** Merge debounced actor PATCH payloads into server snapshots so WS/refetch does not flash stale stats. */
  const setCombatState = useCallback((action: SetStateAction<CombatState | null>) => {
    setCombatStateRaw((prev) => {
      const next = typeof action === 'function' ? action(prev) : action;
      return applyPendingPatchesToCombatState(next);
    });
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/master`;

    const fetchStateFallback = () => {
      const now = Date.now();
      if (lastFallbackAtRef.current > 0 && now - lastFallbackAtRef.current < FALLBACK_THROTTLE_MS) return;
      lastFallbackAtRef.current = now;
      fetch('/api/combat/state')
        .then((res) => (res.ok ? res.json() : Promise.reject()))
        .then((data: CombatState) => {
          if (isMountedRef.current) {
            setCombatState(data);
            setWsError(null);
          }
        })
        .catch(() => {
          if (isMountedRef.current) setWsError('Бэкенд недоступен. Проверьте, что сервер запущен (npm run dev).');
        });
    };

    const connect = () => {
      if (!isMountedRef.current) return;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => {
        if (isMountedRef.current) {
          setWsConnected(true);
          setWsError(null);
        }
      };
      ws.onmessage = (event: MessageEvent) => {
        const data = JSON.parse(event.data as string);
        if (data.type === 'state_update') {
          setCombatState(data.payload);
          setWsError(null);
          return;
        }
        if (data.type === 'ai_image_ready') {
          // Phase-3 AI Composer library job — bridge to a window event so
          // LibraryModal can react without opening a second WS connection.
          try {
            window.dispatchEvent(
              new CustomEvent('omniboard:ai-image-ready', { detail: data }),
            );
          } catch {
            /* no-op */
          }
          return;
        }
        if (data.type === 'roll_event') {
          const payload = data.payload as Record<string, unknown> | null;
          const result = normalizeRollResult(payload);
          if (!result) return;
          const actorName = typeof payload?.actor_name === 'string' ? payload.actor_name : undefined;
          showRollResultToast({
            result,
            actorName,
            comment: payload?.is_secret === true ? 'Скрытый бросок' : undefined,
          });
          return;
        }
        if (data.type === 'whisper_event') {
          const payload = data.payload as Record<string, unknown> | null;
          const actorName = typeof payload?.actor_name === 'string' ? payload.actor_name : 'Игрок';
          const text = typeof payload?.text === 'string' ? payload.text : '';
          if (!text.trim()) return;
          showWhisperToast({ actorName, text });
          return;
        }
        if (data.type === 'roll_request') {
          const payload = data.payload as Record<string, unknown> | null;
          const request_id = typeof payload?.request_id === 'string' ? payload.request_id : '';
          const actor_id = typeof payload?.actor_id === 'string' ? payload.actor_id : '';
          const expression = typeof payload?.expression === 'string' ? payload.expression : '';
          if (!request_id || !actor_id || !expression) return;
          const next: PendingRollRequest = {
            request_id,
            actor_id,
            actor_name: typeof payload?.actor_name === 'string' ? payload.actor_name : undefined,
            expression,
            comment: typeof payload?.comment === 'string' ? payload.comment : null,
            is_secret: payload?.is_secret === true,
            created_at: typeof payload?.created_at === 'string' ? payload.created_at : undefined,
          };
          setPendingRollRequests((prev) => {
            if (prev.some((r) => r.request_id === request_id)) return prev;
            return [next, ...prev].slice(0, 25);
          });
          if (!rollRequestToastSeenRef.current.has(request_id)) {
            rollRequestToastSeenRef.current.add(request_id);
            showRollRequestToast({
              actorName: next.actor_name,
              expression: next.expression,
              comment: next.comment,
              isSecret: next.is_secret,
            });
          }
        }
      };
      ws.onerror = () => fetchStateFallback();
      ws.onclose = () => {
        if (!isMountedRef.current) return;
        setWsConnected(false);
        fetchStateFallback();
        reconnectTimeoutRef.current = setTimeout(connect, 2000);
      };
    };

    connectRef.current = connect;
    connect();

    return () => {
      isMountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [setCombatState]);

  const refetchState = useCallback(() => {
    return fetch('/api/combat/state')
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: CombatState) => setCombatState(data))
      .catch(() => {});
  }, [setCombatState]);

  const reconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    connectRef.current?.();
  };

  return {
    state: combatState,
    setState: setCombatState,
    isConnected: wsConnected,
    wsError,
    pendingRollRequests,
    setPendingRollRequests,
    refetchState,
    reconnect,
  };
}
