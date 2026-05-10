import { useCallback, useEffect, useState } from 'react';
import type { AISettings } from '../types';

const DEFAULT_SETTINGS: AISettings = {
  chat_api_key: '',
  chat_base_url: '',
  chat_model: '',
  image_api_key: '',
  image_base_url: '',
  image_model: '',
  ai_mode: 'standard',
};

function parseApiErrorBody(status: number, text: string): string {
  let detail = `HTTP ${status}`;
  try {
    const j = JSON.parse(text) as { detail?: unknown };
    const d = j?.detail;
    if (typeof d === 'string' && d.trim()) detail = d;
    else if (Array.isArray(d)) {
      const parts = d
        .map((item: unknown) => {
          if (item && typeof item === 'object' && 'msg' in item && typeof (item as { msg?: unknown }).msg === 'string') {
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

export function useAiSettings() {
  const [settings, setSettings] = useState<AISettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/settings');
      const text = await res.text();
      if (!res.ok) {
        setSettings(DEFAULT_SETTINGS);
        return;
      }
      let data: Partial<AISettings> = {};
      try {
        data = JSON.parse(text) as Partial<AISettings>;
      } catch {
        data = {};
      }
      setSettings({ ...DEFAULT_SETTINGS, ...data });
    } catch {
      setSettings(DEFAULT_SETTINGS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const save = useCallback(async (next: AISettings) => {
    setSaving(true);
    try {
      const res = await fetch('/api/ai/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      const text = await res.text();
      if (!res.ok) {
        const detail = parseApiErrorBody(res.status, text);
        return { ok: false as const, error: detail };
      }
      let data: Partial<AISettings> = {};
      try {
        data = JSON.parse(text) as Partial<AISettings>;
      } catch {
        data = {};
      }
      setSettings({ ...DEFAULT_SETTINGS, ...data });
      return { ok: true as const };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false as const, error: msg };
    } finally {
      setSaving(false);
    }
  }, []);

  return { settings, setSettings, loading, saving, refetch, save };
}

