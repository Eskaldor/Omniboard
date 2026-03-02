import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ColumnConfig } from '../types';
import { useCombatState } from './CombatStateContext';

const columnsCache: Record<string, ColumnConfig[]> = {};

function normalizeSystemKey(system: string): string {
  return system.replace(/\s+/g, '').trim() || 'D&D5e';
}

type ColumnsContextValue = {
  columns: ColumnConfig[];
  setColumns: React.Dispatch<React.SetStateAction<ColumnConfig[]>>;
  systemName: string;
  normalizeSystemKey: (s: string) => string;
};

const ColumnsContext = createContext<ColumnsContextValue | null>(null);

export function useColumns(): ColumnsContextValue {
  const ctx = useContext(ColumnsContext);
  if (!ctx) throw new Error('useColumns must be used within ColumnsProvider');
  return ctx;
}

export function ColumnsProvider({ children }: { children: React.ReactNode }) {
  const { state } = useCombatState();
  const systemName = state?.system || 'D&D 5e';
  const cacheKey = normalizeSystemKey(systemName);
  const [columns, setColumnsState] = useState<ColumnConfig[]>(() => columnsCache[cacheKey] ?? []);
  const prevKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const prev = prevKeyRef.current;
    if (prev === cacheKey) return;
    prevKeyRef.current = cacheKey;

    const cached = columnsCache[cacheKey];
    if (cached && cached.length) setColumnsState(cached);

    let cancelled = false;
    fetch(`/api/systems/${encodeURIComponent(systemName)}/columns`)
      .then(res => res.json())
      .then(data => {
        const next = data && Array.isArray(data) ? (data.length > 0 ? data : []) : [];
        columnsCache[cacheKey] = next;
        if (!cancelled) setColumnsState(next);
      })
      .catch(err => {
        const fallback: ColumnConfig[] = [];
        columnsCache[cacheKey] = fallback;
        if (!cancelled) {
          console.error('Failed to fetch columns', err);
          setColumnsState(fallback);
        }
      });

    return () => { cancelled = true; };
  }, [systemName, cacheKey]);

  const setColumns = React.useCallback((action: React.SetStateAction<ColumnConfig[]>) => {
    setColumnsState(prev => {
      const next = typeof action === 'function' ? action(prev) : action;
      columnsCache[cacheKey] = next;
      return next;
    });
  }, [cacheKey]);

  const value: ColumnsContextValue = {
    columns,
    setColumns,
    systemName,
    normalizeSystemKey,
  };

  return (
    <ColumnsContext.Provider value={value}>
      {children}
    </ColumnsContext.Provider>
  );
}
