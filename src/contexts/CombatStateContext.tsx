import React, { createContext, useContext, useEffect, useState } from 'react';
import type { CombatState } from '../types';

type CombatStateContextValue = {
  state: CombatState | null;
  setState: React.Dispatch<React.SetStateAction<CombatState | null>>;
  wsError: string | null;
  refetchState: () => Promise<void>;
};

const CombatStateContext = createContext<CombatStateContextValue | null>(null);

export function useCombatState(): CombatStateContextValue {
  const ctx = useContext(CombatStateContext);
  if (!ctx) throw new Error('useCombatState must be used within CombatStateProvider');
  return ctx;
}

export function CombatStateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CombatState | null>(null);
  const [wsError, setWsError] = useState<string | null>(null);

  useEffect(() => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/master`;
    let ws: WebSocket;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let isMounted = true;
    let lastFallbackAt = 0;
    const FALLBACK_THROTTLE_MS = 5000;

    const fetchStateFallback = () => {
      const now = Date.now();
      if (lastFallbackAt > 0 && now - lastFallbackAt < FALLBACK_THROTTLE_MS) return;
      lastFallbackAt = now;
      fetch('/api/combat/state')
        .then(res => res.ok ? res.json() : Promise.reject())
        .then(data => { if (isMounted) { setState(data); setWsError(null); } })
        .catch(() => { if (isMounted) setWsError("Бэкенд недоступен. Проверьте, что сервер запущен (npm run dev)."); });
    };

    const connect = () => {
      if (!isMounted) return;
      ws = new WebSocket(wsUrl);
      ws.onopen = () => setWsError(null);
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'state_update') {
          setState(data.payload);
          setWsError(null);
        }
      };
      ws.onerror = () => fetchStateFallback();
      ws.onclose = () => {
        if (!isMounted) return;
        fetchStateFallback();
        reconnectTimeout = setTimeout(connect, 2000);
      };
    };

    connect();
    return () => {
      isMounted = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      ws?.close();
    };
  }, []);

  const refetchState = () => {
    return fetch('/api/combat/state')
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(setState)
      .catch(() => {});
  };

  return (
    <CombatStateContext.Provider value={{ state, setState, wsError, refetchState }}>
      {children}
    </CombatStateContext.Provider>
  );
}
