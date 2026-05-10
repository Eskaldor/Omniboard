import { useCallback, useEffect, useState } from 'react';

export type AiUsageBucket = {
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

export type AiUsageLastCall = {
  ts?: string | null;
  mode?: string | null;
  model?: string | null;
  latency_ms?: number | null;
  applied_count?: number | null;
  usage?: {
    prompt_tokens?: number | null;
    completion_tokens?: number | null;
    total_tokens?: number | null;
  } | null;
} | null;

export type AiUsageSummary = {
  today: AiUsageBucket;
  window: AiUsageBucket & { days: number };
  last_call: AiUsageLastCall;
};

const ZERO_BUCKET: AiUsageBucket = {
  calls: 0,
  prompt_tokens: 0,
  completion_tokens: 0,
  total_tokens: 0,
};

const DEFAULT_SUMMARY: AiUsageSummary = {
  today: ZERO_BUCKET,
  window: { ...ZERO_BUCKET, days: 7 },
  last_call: null,
};

function coerceBucket(raw: unknown, fallback: AiUsageBucket): AiUsageBucket {
  if (!raw || typeof raw !== 'object') return fallback;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    calls: num(r.calls),
    prompt_tokens: num(r.prompt_tokens),
    completion_tokens: num(r.completion_tokens),
    total_tokens: num(r.total_tokens),
  };
}

export function useAiUsage(windowDays = 7) {
  const [summary, setSummary] = useState<AiUsageSummary>(DEFAULT_SUMMARY);
  const [loading, setLoading] = useState<boolean>(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ai/usage/summary?days=${windowDays}`);
      if (!res.ok) {
        setSummary({ ...DEFAULT_SUMMARY, window: { ...ZERO_BUCKET, days: windowDays } });
        return;
      }
      const j = (await res.json()) as Partial<AiUsageSummary> & { window?: unknown };
      const today = coerceBucket(j.today, ZERO_BUCKET);
      const winRaw = (j.window ?? {}) as Record<string, unknown>;
      const winDays = typeof winRaw.days === 'number' ? winRaw.days : windowDays;
      const window = { ...coerceBucket(winRaw, ZERO_BUCKET), days: winDays };
      const last_call = (j.last_call ?? null) as AiUsageLastCall;
      setSummary({ today, window, last_call });
    } catch {
      setSummary({ ...DEFAULT_SUMMARY, window: { ...ZERO_BUCKET, days: windowDays } });
    } finally {
      setLoading(false);
    }
  }, [windowDays]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { summary, loading, refetch };
}
