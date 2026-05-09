import { memo, useEffect, useMemo, useRef } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import { Bot, Loader2 } from 'lucide-react';
import type { AiChatMessage } from '../../hooks/useAiChat';

const mdScrollWrap =
  'max-w-none text-xs leading-relaxed text-zinc-300 [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-600 [&_blockquote]:pl-3 [&_blockquote]:text-zinc-400 [&_code]:rounded [&_code]:bg-zinc-800 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-emerald-300 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-zinc-700 [&_pre]:bg-zinc-950 [&_pre]:p-2 [&_pre]:text-zinc-200';

function markdownComponents(): Components {
  return {
    p: ({ children, ...props }) => (
      <p className="my-1.5 text-zinc-300 first:mt-0 last:mb-0" {...props}>
        {children}
      </p>
    ),
    ul: ({ children, ...props }) => (
      <ul className="my-2 list-disc space-y-1 pl-5 text-zinc-300" {...props}>
        {children}
      </ul>
    ),
    ol: ({ children, ...props }) => (
      <ol className="my-2 list-decimal space-y-1 pl-5 text-zinc-300" {...props}>
        {children}
      </ol>
    ),
    li: ({ children, ...props }) => (
      <li className="marker:text-zinc-500" {...props}>
        {children}
      </li>
    ),
    strong: ({ children, ...props }) => (
      <strong className="font-semibold text-zinc-100" {...props}>
        {children}
      </strong>
    ),
    a: ({ children, ...props }) => (
      <a className="text-emerald-400 underline underline-offset-2 hover:text-emerald-300" {...props}>
        {children}
      </a>
    ),
    code: ({ children, className, ...props }) => (
      <code className={className ?? 'rounded bg-zinc-800 px-1 py-0.5 text-emerald-300'} {...props}>
        {children}
      </code>
    ),
    pre: ({ children, ...props }) => (
      <pre
        className="my-2 overflow-x-auto rounded-md border border-zinc-700 bg-zinc-950 p-2 text-zinc-200 text-[11px]"
        {...props}
      >
        {children}
      </pre>
    ),
  };
}

export const AIChatDrawer = memo(function AIChatDrawer({
  messages,
  isLoading,
}: {
  messages: AiChatMessage[];
  isLoading: boolean;
}) {
  const { t } = useTranslation('core', { useSuspense: false });
  const bottomRef = useRef<HTMLDivElement>(null);
  const mdComponents = useMemo(() => markdownComponents(), []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, isLoading]);

  return (
    <div
      className="pointer-events-auto flex max-h-[min(40vh,420px)] min-h-[12rem] flex-col rounded-xl border border-zinc-800/90 bg-zinc-950/95 px-3 py-2 shadow-inner backdrop-blur-md mx-4 mb-2"
      role="region"
      aria-label={t('gm_console.ai_chat_title')}
    >
      <div className="flex-1 space-y-3 overflow-y-auto pr-1 pb-2">
        {messages.length === 0 && !isLoading ? (
          <p className="text-center text-xs text-zinc-600 py-6">{t('gm_console.ai_chat_empty')}</p>
        ) : null}

        {messages.map((m, i) => {
          if (m.role === 'user') {
            return (
              <div key={i} className="flex justify-end">
                <div className="max-w-[min(100%,28rem)] rounded-2xl rounded-br-md bg-rose-600/25 px-3 py-2 text-xs text-rose-50 ring-1 ring-rose-500/35 whitespace-pre-wrap">
                  {m.content}
                </div>
              </div>
            );
          }

          if (m.role === 'system') {
            return (
              <div key={i} className="flex justify-center px-2">
                <div className="rounded-lg border border-zinc-700/80 bg-zinc-900/80 px-3 py-2 text-center text-[11px] text-zinc-500 whitespace-pre-wrap">
                  {m.content}
                </div>
              </div>
            );
          }

          return (
            <div key={i} className="flex justify-start gap-2">
              <div className="mt-0.5 shrink-0 rounded-lg bg-zinc-800/90 p-1.5 text-rose-300 ring-1 ring-zinc-700/80">
                <Bot size={14} strokeWidth={2} aria-hidden />
              </div>
              <div className="max-w-[min(100%,32rem)] rounded-2xl rounded-bl-md bg-zinc-900/90 px-3 py-2 ring-1 ring-zinc-700/70">
                <div className={mdScrollWrap}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                    {m.content}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          );
        })}

        {isLoading ? (
          <div className="flex items-center gap-2 px-1 text-xs text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin shrink-0 text-rose-400/90" aria-hidden />
            <span>{t('gm_console.ai_chat_thinking')}</span>
          </div>
        ) : null}

        <div ref={bottomRef} />
      </div>
    </div>
  );
});
