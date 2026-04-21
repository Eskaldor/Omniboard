import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { CombatState, LayoutProfile } from '../types';
import { useCombatState } from './CombatStateContext';

export interface CombatContextValue {
  state: CombatState | null;
  isConnected: boolean;
  /** Merge default/config + system override (GET /api/systems/…/layouts). */
  systemLayoutProfiles: LayoutProfile[];
  refetchLayoutProfiles: () => Promise<void>;
  /** ``selected_layout_id`` из сессии, если есть в профилях; иначе ``default``. */
  effectiveSelectedLayoutId: string;
}

export const CombatContext = createContext<CombatContextValue | null>(null);

export function CombatProvider({ children }: { children: ReactNode }) {
  const { state, isConnected } = useCombatState();
  const [systemLayoutProfiles, setSystemLayoutProfiles] = useState<LayoutProfile[]>([]);

  const refetchLayoutProfiles = useCallback((): Promise<void> => {
    const system = (state?.core.system || '').trim();
    if (!system) {
      setSystemLayoutProfiles([]);
      return Promise.resolve();
    }
    return fetch(`/api/systems/${encodeURIComponent(system)}/layouts`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: LayoutProfile[]) => {
        setSystemLayoutProfiles(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        setSystemLayoutProfiles([]);
      });
  }, [state?.core.system]);

  useEffect(() => {
    setSystemLayoutProfiles([]);
    let cancelled = false;
    const system = (state?.core.system || '').trim();
    if (!system) {
      return undefined;
    }
    fetch(`/api/systems/${encodeURIComponent(system)}/layouts`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: LayoutProfile[]) => {
        if (!cancelled) setSystemLayoutProfiles(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setSystemLayoutProfiles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [state?.core.system]);

  const effectiveSelectedLayoutId = useMemo(() => {
    const sid = ((state?.display?.selected_layout_id ?? 'default') as string).trim() || 'default';
    if (systemLayoutProfiles.some((p) => p.id === sid)) return sid;
    return 'default';
  }, [state?.display?.selected_layout_id, systemLayoutProfiles]);

  return (
    <CombatContext.Provider
      value={{
        state,
        isConnected,
        systemLayoutProfiles,
        refetchLayoutProfiles,
        effectiveSelectedLayoutId,
      }}
    >
      {children}
    </CombatContext.Provider>
  );
}

export function useCombat(): CombatContextValue {
  const ctx = useContext(CombatContext);
  if (!ctx) throw new Error('useCombat must be used within CombatProvider');
  return ctx;
}
