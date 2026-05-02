import { useEffect, useState } from 'react';

/** Merged `sheet_layout.json` (ADR-4). */
export interface SystemSheetLayoutAccordion {
  name: string;
  columns: string[];
}

export interface SystemSheetLayoutTab {
  id: string;
  name?: string;
  accordions?: SystemSheetLayoutAccordion[];
  content?: string;
}

export interface SystemSheetLayout {
  tabs?: SystemSheetLayoutTab[];
}

function parseLayout(data: unknown): SystemSheetLayout | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  return data as SystemSheetLayout;
}

export function useSystemSheetLayout(systemName: string) {
  const [layout, setLayout] = useState<SystemSheetLayout | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const name = (systemName || '').trim();
    if (!name) {
      setLayout(null);
      setLoading(false);
      return;
    }

    const ac = new AbortController();
    setLoading(true);

    fetch(`/api/systems/${encodeURIComponent(name)}/layouts/sheet`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: unknown) => {
        if (!ac.signal.aborted) setLayout(parseLayout(data));
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        if (!ac.signal.aborted) setLayout(null);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });

    return () => ac.abort();
  }, [systemName]);

  return { layout, loading };
}
