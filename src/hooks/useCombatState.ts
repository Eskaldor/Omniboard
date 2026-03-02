import { useEffect, useRef, useState } from 'react';
import type { CombatState } from '../types';

const FALLBACK_THROTTLE_MS = 5000;

export function useCombatState() {
  const [combatState, setCombatState] = useState<CombatState | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const isMountedRef = useRef(true);
  const lastFallbackAtRef = useRef(0);
  const connectRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/master`;

    const fetchStateFallback = () => {
      const now = Date.now();
      if (lastFallbackAtRef.current > 0 && now - lastFallbackAtRef.current < FALLBACK_THROTTLE_MS) return;
      lastFallbackAtRef.current = now;
      fetch('/api/combat/state')
        .then(res => (res.ok ? res.json() : Promise.reject()))
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
  }, []);

  const refetchState = () => {
    return fetch('/api/combat/state')
      .then(res => (res.ok ? res.json() : Promise.reject()))
      .then((data: CombatState) => setCombatState(data))
      .catch(() => {});
  };

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
    refetchState,
    reconnect,
  };
}
