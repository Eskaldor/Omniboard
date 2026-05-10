import { useCallback, useState } from 'react';

export type ProviderKind = 'chat' | 'image';

export type AiProviderModel = {
  id: string;
  display_name: string;
  description: string;
  supports_image: boolean;
  supports_chat: boolean;
  methods: string[];
};

export type AiProviderModelsResponse = {
  provider: 'gemini' | 'openai' | string;
  endpoint: string;
  kind: ProviderKind | string;
  models: AiProviderModel[];
};

function parseFastApiDetail(rawText: string, status: number): string {
  let detail = `HTTP ${status}`;
  try {
    const j = JSON.parse(rawText) as { detail?: unknown };
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
          return '';
        })
        .filter(Boolean);
      if (parts.length) detail = parts.join('; ');
    }
  } catch {
    if (rawText.trim()) detail = rawText.trim().slice(0, 500);
  }
  return detail;
}

/**
 * Lists the model catalogue advertised by the chat OR image provider.
 *
 * Backed by ``GET /api/ai/{kind}/models`` — the API key never leaves the
 * backend; the frontend only sees the resulting list with capability flags.
 * Each entry carries both ``supports_chat`` and ``supports_image`` so the
 * caller can highlight the capability relevant to the panel it's drawn in.
 */
export function useAiProviderModels(kind: ProviderKind) {
  const [data, setData] = useState<AiProviderModelsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchModels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ai/${kind}/models`);
      const text = await res.text();
      if (!res.ok) {
        setError(parseFastApiDetail(text, res.status));
        setData(null);
        return;
      }
      try {
        const j = JSON.parse(text) as Partial<AiProviderModelsResponse>;
        const provider = (j.provider as string) || '';
        const endpoint = (j.endpoint as string) || '';
        const k = (j.kind as string) || kind;
        const models = Array.isArray(j.models)
          ? (j.models.filter(
              (m): m is AiProviderModel =>
                !!m &&
                typeof m === 'object' &&
                typeof (m as AiProviderModel).id === 'string',
            ) as AiProviderModel[])
          : [];
        setData({ provider, endpoint, kind: k, models });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'parse error');
        setData(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [kind]);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setLoading(false);
  }, []);

  return { data, loading, error, fetchModels, reset };
}
