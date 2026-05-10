import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export type AiChatUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

export type AiChatMessage = {
  role: string;
  content: string;
  system_report?: string[];
  usage?: AiChatUsage;
  // UI-only message that must NOT be sent back to the LLM (config errors, network
  // failures, anything we synthesize locally). Filtering these out of the outbound
  // payload prevents context poisoning + invalid empty content blocks per OpenAI spec.
  isLocal?: boolean;
};

function parseFastApiDetail(rawText: string): string {
  try {
    const j = JSON.parse(rawText) as { detail?: unknown };
    const d = j?.detail;
    if (typeof d === 'string' && d.trim()) return d.trim();
    if (Array.isArray(d)) {
      const parts = d
        .map((item: unknown) =>
          item && typeof item === 'object' && 'msg' in item && typeof (item as { msg?: unknown }).msg === 'string'
            ? (item as { msg: string }).msg
            : '',
        )
        .filter(Boolean);
      if (parts.length) return parts.join('; ');
    }
  } catch {
    /* ignore */
  }
  return '';
}

function pickUsage(value: unknown): AiChatUsage | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const u = value as Record<string, unknown>;
  const out: AiChatUsage = {};
  if (typeof u.prompt_tokens === 'number') out.prompt_tokens = u.prompt_tokens;
  if (typeof u.completion_tokens === 'number') out.completion_tokens = u.completion_tokens;
  if (typeof u.total_tokens === 'number') out.total_tokens = u.total_tokens;
  return Object.keys(out).length > 0 ? out : undefined;
}

function coerceServerMessage(raw: unknown): AiChatMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.role !== 'string') return null;
  const out: AiChatMessage = {
    role: r.role,
    content: typeof r.content === 'string' ? r.content : '',
  };
  if (Array.isArray(r.system_report)) {
    const lines = r.system_report.filter((x): x is string => typeof x === 'string');
    if (lines.length) out.system_report = lines;
  }
  const u = pickUsage(r.usage);
  if (u) out.usage = u;
  return out;
}

export function useAiChat() {
  const { t } = useTranslation('core', { useSuspense: false });
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const loadingRef = useRef(false);

  // Hydrate from the server-side history file on mount so a page refresh
  // doesn't lose the conversation. The server keeps it in sync via /api/ai/chat.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/ai/chat/history');
        if (!res.ok) return;
        const j = (await res.json()) as { messages?: unknown };
        if (cancelled) return;
        if (Array.isArray(j.messages)) {
          const restored = j.messages
            .map(coerceServerMessage)
            .filter((m): m is AiChatMessage => m !== null);
          if (restored.length) setMessages(restored);
        }
      } catch {
        /* network or parse error — start with an empty chat, not fatal */
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const clearChat = useCallback(async () => {
    setMessages([]);
    try {
      await fetch('/api/ai/chat/history', { method: 'DELETE' });
    } catch {
      /* swallow — the local view is the truth, server will catch up next turn */
    }
  }, []);

  const sendMessage = useCallback(
    async (text: string): Promise<boolean> => {
      const trimmed = text.trim();
      if (!trimmed || loadingRef.current) return false;

      const newUserMsg: AiChatMessage = { role: 'user', content: trimmed };
      const localView: AiChatMessage[] = [...messages, newUserMsg];
      setMessages(localView);

      // Outbound to backend: drop any UI-only messages so we never poison the LLM
      // context with our own config-error notices or network-failure placeholders.
      const outbound = localView
        .filter((m) => !m.isLocal)
        .map(({ role, content }) => ({ role, content }));

      loadingRef.current = true;
      setIsLoading(true);
      try {
        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: outbound }),
        });
        const rawText = await res.text();

        let assistantContent = '';
        let systemReport: string[] | undefined;
        let usage: AiChatUsage | undefined;
        try {
          const j = JSON.parse(rawText) as {
            role?: string;
            content?: string;
            system_report?: unknown;
            usage?: unknown;
          };
          if (typeof j.content === 'string') assistantContent = j.content;
          if (Array.isArray(j.system_report)) {
            const lines = j.system_report.filter((x): x is string => typeof x === 'string');
            if (lines.length > 0) systemReport = lines;
          }
          usage = pickUsage(j.usage);
        } catch {
          /* ignore */
        }

        if (!res.ok) {
          const detailStr = parseFastApiDetail(rawText);
          const sys =
            res.status === 400
              ? t('gm_console.ai_chat_configure_keys')
              : t('gm_console.ai_chat_request_failed', {
                  detail: detailStr || `HTTP ${res.status}`,
                });
          setMessages((prev) => [...prev, { role: 'system', content: sys, isLocal: true }]);
          return false;
        }

        const assistantMessage: AiChatMessage = {
          role: 'assistant',
          content: assistantContent,
        };
        if (systemReport) assistantMessage.system_report = systemReport;
        if (usage) assistantMessage.usage = usage;
        setMessages((prev) => [...prev, assistantMessage]);
        return true;
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            role: 'system',
            content: t('gm_console.ai_chat_request_failed', { detail: t('stat_editor.roll_network_error') }),
            isLocal: true,
          },
        ]);
        return false;
      } finally {
        loadingRef.current = false;
        setIsLoading(false);
      }
    },
    [t, messages],
  );

  return { messages, isLoading, hydrated, sendMessage, clearChat };
}
