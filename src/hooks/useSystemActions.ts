import { useEffect, useState } from 'react';

export type SystemActionDef = { name: string; formula: string };

function parseSystemActions(data: unknown): Record<string, SystemActionDef> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const out: Record<string, SystemActionDef> = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    const key = (k || '').trim();
    if (!key) continue;
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    const o = v as Record<string, unknown>;
    const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim() : key;
    const formula = typeof o.formula === 'string' ? o.formula.trim() : '';
    if (!formula) continue;
    out[key] = { name, formula };
  }
  return out;
}

export function useSystemActions(systemName: string) {
  const [actions, setActions] = useState<Record<string, SystemActionDef>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const name = (systemName || '').trim();
    if (!name) {
      setActions({});
      setLoading(false);
      return;
    }

    const ac = new AbortController();
    setLoading(true);

    fetch(`/api/systems/${encodeURIComponent(name)}/actions`, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: unknown) => {
        if (!ac.signal.aborted) setActions(parseSystemActions(data));
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        if (!ac.signal.aborted) setActions({});
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });

    return () => ac.abort();
  }, [systemName]);

  return { actions, loading };
}
