import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicCombatState } from '../types';

const RECONNECT_DELAY_MS = 2000;
const FALLBACK_THROTTLE_MS = 5000;

export function usePlayerSocket() {
  const [state, setState] = useState<PublicCombatState | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const lastFallbackRef = useRef(0);
  const connectRef = useRef<(() => void) | null>(null);

  const fetchFallback = useCallback(() => {
    const now = Date.now();
    if (now - lastFallbackRef.current < FALLBACK_THROTTLE_MS) return;
    lastFallbackRef.current = now;
    fetch('/api/combat/state')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: PublicCombatState) => {
        if (isMountedRef.current) setState(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/player`;

    const connect = () => {
      if (!isMountedRef.current) return;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => {
        if (isMountedRef.current) setIsConnected(true);
      };
      ws.onmessage = (ev: MessageEvent) => {
        const msg = JSON.parse(ev.data as string) as { type: string; payload: PublicCombatState };
        if (msg.type === 'state_update' && isMountedRef.current) {
          setState(msg.payload);
        }
      };
      ws.onerror = () => fetchFallback();
      ws.onclose = () => {
        if (!isMountedRef.current) return;
        setIsConnected(false);
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
  }, [fetchFallback]);

  return { state, isConnected };
}
