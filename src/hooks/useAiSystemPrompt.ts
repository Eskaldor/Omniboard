import { useCallback, useEffect, useState } from 'react';

export type AiSystemPromptSource = 'system' | 'default' | 'missing';

type Response = { content: string; source: AiSystemPromptSource };

function parseApiErrorBody(status: number, text: string): string {
  let detail = `HTTP ${status}`;
  try {
    const j = JSON.parse(text) as { detail?: unknown };
    const d = j?.detail;
    if (typeof d === 'string' && d.trim()) detail = d;
    else if (Array.isArray(d)) {
      const parts = d
        .map((item: unknown) => {
          if (
            item &&
            typeof item === 'object' &&
            'msg' in item &&
            typeof (item as { msg?: unknown }).msg === 'string'
          ) {
            return (item as { msg: string }).msg;
          }
          return JSON.stringify(item);
        })
        .filter(Boolean);
      if (parts.length) detail = parts.join('; ');
    }
  } catch {
    if (text.trim()) detail = text.trim().slice(0, 500);
  }
  return detail;
}

export function useAiSystemPrompt(systemName: string) {
  const [content, setContent] = useState<string>('');
  const [source, setSource] = useState<AiSystemPromptSource>('missing');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const url = `/api/ai/system_prompt?system=${encodeURIComponent(systemName ?? '')}`;
      const res = await fetch(url);
      const text = await res.text();
      if (!res.ok) {
        setContent('');
        setSource('missing');
        return;
      }
      try {
        const j = JSON.parse(text) as Partial<Response>;
        setContent(typeof j.content === 'string' ? j.content : '');
        const src = j.source;
        setSource(
          src === 'system' || src === 'default' || src === 'missing' ? src : 'missing',
        );
      } catch {
        setContent('');
        setSource('missing');
      }
    } catch {
      setContent('');
      setSource('missing');
    } finally {
      setLoading(false);
    }
  }, [systemName]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const save = useCallback(
    async (next: string) => {
      if (!systemName || !systemName.trim()) {
        return { ok: false as const, error: 'No active system' };
      }
      setSaving(true);
      try {
        const res = await fetch('/api/ai/system_prompt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ system: systemName, content: next }),
        });
        const text = await res.text();
        if (!res.ok) {
          return { ok: false as const, error: parseApiErrorBody(res.status, text) };
        }
        try {
          const j = JSON.parse(text) as Partial<Response>;
          setContent(typeof j.content === 'string' ? j.content : next);
          const src = j.source;
          setSource(
            src === 'system' || src === 'default' || src === 'missing' ? src : 'system',
          );
        } catch {
          setContent(next);
          setSource('system');
        }
        return { ok: true as const };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false as const, error: msg };
      } finally {
        setSaving(false);
      }
    },
    [systemName],
  );

  return { content, setContent, source, loading, saving, refetch, save };
}
