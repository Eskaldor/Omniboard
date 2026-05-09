import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicCombatState } from '../types';
import { normalizeRollResult, showRollResultToast } from '../../utils/rollToast';

const RECONNECT_DELAY_MS = 2000;
const FALLBACK_THROTTLE_MS = 5000;

export function usePlayerSocket(token?: string) {
  const [state, setState] = useState<PublicCombatState | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [syncMode, setSyncMode] = useState<'ws' | 'http' | 'none'>('none');
  const [rollRequestStatus, setRollRequestStatus] = useState<{
    request_id: string;
    status: 'pending' | 'approved' | 'denied';
    reason?: string;
  } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const lastFallbackRef = useRef(0);
  const connectRef = useRef<(() => void) | null>(null);

  const fetchFallback = useCallback(() => {
    const now = Date.now();
    if (now - lastFallbackRef.current < FALLBACK_THROTTLE_MS) return;
    lastFallbackRef.current = now;
    fetch('/api/player/combat-state', {
      headers: token ? { 'X-Player-Token': token } : undefined,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: PublicCombatState) => {
        if (isMountedRef.current) {
          setState(data);
          setSyncMode('http');
        }
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    isMountedRef.current = true;
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/player${tokenParam}`;

    const connect = () => {
      if (!isMountedRef.current) return;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => {
        if (isMountedRef.current) {
          setIsConnected(true);
        }
      };
      ws.onmessage = (ev: MessageEvent) => {
        const msg = JSON.parse(ev.data as string) as { type: string; payload: unknown };
        if (msg.type === 'state_update' && isMountedRef.current) {
          setState(msg.payload as PublicCombatState);
          setSyncMode('ws');
          return;
        }
        if (msg.type === 'roll_event' && isMountedRef.current) {
          const payload = msg.payload as Record<string, unknown> | null;
          const result = normalizeRollResult(payload);
          if (!result) return;
          const actorName = typeof payload?.actor_name === 'string' ? payload.actor_name : undefined;
          const comment = payload?.is_secret === true ? 'Скрытый бросок' : undefined;
          showRollResultToast({ result, actorName, comment });
          return;
        }
        if (msg.type === 'roll_request_status' && isMountedRef.current) {
          const p = msg.payload as Record<string, unknown> | null;
          const request_id = typeof p?.request_id === 'string' ? p.request_id : '';
          const statusRaw = typeof p?.status === 'string' ? p.status : '';
          if (!request_id) return;
          if (statusRaw !== 'pending' && statusRaw !== 'approved' && statusRaw !== 'denied') return;
          const reason = typeof p?.reason === 'string' ? p.reason : undefined;
          setRollRequestStatus({ request_id, status: statusRaw, reason });
        }
      };
      ws.onerror = () => fetchFallback();
      ws.onclose = () => {
        if (!isMountedRef.current) return;
        setIsConnected(false);
        setSyncMode((m) => (m === 'ws' ? 'http' : m));
        fetchFallback();
        reconnectRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
      };
    };

    connectRef.current = connect;
    connect();

    return () => {
      isMountedRef.current = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
    // token is included so the socket reconnects with the personalized URL after claim.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, fetchFallback]);

  return { state, isConnected, syncMode, rollRequestStatus };
}
