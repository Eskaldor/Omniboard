import React, { createContext, useContext } from 'react';
import type { CombatState } from '../types';
import { useCombatState as useCombatStateHook } from '../hooks/useCombatState';

type CombatStateContextValue = {
  state: CombatState | null;
  setState: React.Dispatch<React.SetStateAction<CombatState | null>>;
  wsError: string | null;
  isConnected: boolean;
  refetchState: () => Promise<void>;
  reconnect: () => void;
};

const CombatStateContext = createContext<CombatStateContextValue | null>(null);

export function useCombatState(): CombatStateContextValue {
  const ctx = useContext(CombatStateContext);
  if (!ctx) throw new Error('useCombatState must be used within CombatStateProvider');
  return ctx;
}

export function CombatStateProvider({ children }: { children: React.ReactNode }) {
  const value = useCombatStateHook();
  return (
    <CombatStateContext.Provider
      value={{
        state: value.state,
        setState: value.setState,
        wsError: value.wsError,
        isConnected: value.isConnected,
        refetchState: value.refetchState,
        reconnect: value.reconnect,
      }}
    >
      {children}
    </CombatStateContext.Provider>
  );
}
