import { useEffect, useState } from 'react';
import type { ColumnConfig } from '../types';

/** Fetch column definitions for a system folder (same source as ColumnsContext). */
export function useSystemColumns(systemName: string) {
  const [columns, setColumns] = useState<ColumnConfig[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const name = (systemName || '').trim();
    if (!name) {
      setColumns([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(`/api/systems/${encodeURIComponent(name)}/columns`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: unknown) => {
        if (cancelled) return;
        setColumns(Array.isArray(data) ? (data as ColumnConfig[]) : []);
      })
      .catch(() => {
        if (!cancelled) setColumns([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [systemName]);

  return { columns, loading };
}
