import React, { createContext, useContext } from 'react';
import type { CombatState } from '../types';
import { useCombatState as useCombatStateHook } from '../hooks/useCombatState';

type CombatStateContextValue = {
  state: CombatState | null;
  setState: React.Dispatch<React.SetStateAction<CombatState | null>>;
  wsError: string | null;
  isConnected: boolean;
  pendingRollRequests: import('../hooks/useCombatState').PendingRollRequest[];
  setPendingRollRequests: React.Dispatch<React.SetStateAction<import('../hooks/useCombatState').PendingRollRequest[]>>;
  refetchState: () => Promise<void>;
  reconnect: () => void;
};

export const CombatStateContext = createContext<CombatStateContextValue | null>(null);

export function useCombatState(): CombatStateContextValue {
  const ctx = useContext(CombatStateContext);
  if (!ctx) throw new Error('useCombatState must be used within CombatStateProvider');
  return ctx;
}

/** Variant of {@link useCombatState} that returns null instead of throwing when there is no provider. */
export function useCombatStateOptional(): CombatStateContextValue | null {
  return useContext(CombatStateContext);
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
        pendingRollRequests: value.pendingRollRequests,
        setPendingRollRequests: value.setPendingRollRequests,
        refetchState: value.refetchState,
        reconnect: value.reconnect,
      }}
    >
      {children}
    </CombatStateContext.Provider>
  );
}
