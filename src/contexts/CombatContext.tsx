import { createContext, useContext, type ReactNode } from 'react';
import type { CombatState } from '../types';
import { useCombatState } from './CombatStateContext';

export interface CombatContextValue {
  state: CombatState | null;
  isConnected: boolean;
  // можно добавить методы типа updateActor() позже
}

export const CombatContext = createContext<CombatContextValue | null>(null);

export function CombatProvider({ children }: { children: ReactNode }) {
  const { state, isConnected } = useCombatState();
  return (
    <CombatContext.Provider value={{ state, isConnected }}>
      {children}
    </CombatContext.Provider>
  );
}

export function useCombat(): CombatContextValue {
  const ctx = useContext(CombatContext);
  if (!ctx) throw new Error('useCombat must be used within CombatProvider');
  return ctx;
}
