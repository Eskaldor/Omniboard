import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export type AiChatMessage = { role: string; content: string };

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

export function useAiChat() {
  const { t } = useTranslation('core', { useSuspense: false });
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const loadingRef = useRef(false);

  const sendMessage = useCallback(
    async (text: string): Promise<boolean> => {
      const trimmed = text.trim();
      if (!trimmed || loadingRef.current) return false;

      const outbound: AiChatMessage[] = [...messages, { role: 'user', content: trimmed }];
      setMessages(outbound);

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
        try {
          const j = JSON.parse(rawText) as { role?: string; content?: string };
          if (typeof j.content === 'string') assistantContent = j.content;
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
          setMessages((prev) => [...prev, { role: 'system', content: sys }]);
          return false;
        }

        setMessages((prev) => [...prev, { role: 'assistant', content: assistantContent }]);
        return true;
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            role: 'system',
            content: t('gm_console.ai_chat_request_failed', { detail: t('stat_editor.roll_network_error') }),
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

  return { messages, isLoading, sendMessage };
}
