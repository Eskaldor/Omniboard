import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAiSettings } from '../../../hooks/useAiSettings';
import { useAiSystemPrompt } from '../../../hooks/useAiSystemPrompt';
import { useAiUsage } from '../../../hooks/useAiUsage';
import {
  useAiProviderModels,
  type AiProviderModel,
  type ProviderKind,
} from '../../../hooks/useAiProviderModels';
import type { AiMode } from '../../../types';

function optionalBaseUrlInvalid(url: string): boolean {
  const u = url.trim().replace(/\/+$/, '');
  if (!u) return false;
  return !/^https?:\/\//i.test(u);
}

function aiSettingsAllBlank(s: {
  chat_api_key: string;
  chat_base_url: string;
  chat_model: string;
  image_api_key: string;
  image_base_url: string;
  image_model: string;
}): boolean {
  return !Object.values(s).some((v) => String(v ?? '').trim() !== '');
}

type UsageBucketLike = {
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

type UsageWindowLike = UsageBucketLike & { days: number };

function UsageBucketBlock({
  label,
  bucket,
  t,
}: {
  label: string;
  bucket: UsageBucketLike;
  t: (k: string) => string;
}) {
  const fmt = (n: number) => n.toLocaleString();
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</span>
        <span className="text-[11px] text-zinc-400">
          {fmt(bucket.calls)} {t('config_modal.ai_usage_calls')}
        </span>
      </div>
      <div className="mt-1 grid grid-cols-3 gap-2 text-[11px] font-mono">
        <div className="flex flex-col">
          <span className="text-zinc-500">{t('config_modal.ai_usage_prompt')}</span>
          <span className="text-zinc-200">{fmt(bucket.prompt_tokens)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-zinc-500">{t('config_modal.ai_usage_completion')}</span>
          <span className="text-zinc-200">{fmt(bucket.completion_tokens)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-zinc-500">{t('config_modal.ai_usage_total')}</span>
          <span className="text-emerald-300">{fmt(bucket.total_tokens)}</span>
        </div>
      </div>
    </div>
  );
}

type LastCallLike = {
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

function UsageGrid({
  today,
  windowBucket,
  lastCall,
  loading,
  onRefresh,
  t,
}: {
  today: UsageBucketLike;
  windowBucket: UsageWindowLike;
  lastCall: LastCallLike;
  loading: boolean;
  onRefresh: () => void;
  t: (k: string, v?: Record<string, unknown>) => string;
}) {
  const noData =
    !loading &&
    today.calls === 0 &&
    windowBucket.calls === 0 &&
    !lastCall;
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onRefresh}
          className="text-[11px] text-zinc-400 hover:text-zinc-200 underline underline-offset-2"
          disabled={loading}
        >
          {loading ? '…' : '⟳'}
        </button>
      </div>
      {noData ? (
        <div className="rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-4 text-center text-xs text-zinc-500">
          {t('config_modal.ai_usage_unavailable')}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <UsageBucketBlock
            label={t('config_modal.ai_usage_today')}
            bucket={today}
            t={t}
          />
          <UsageBucketBlock
            label={`${t('config_modal.ai_usage_recent')} (${windowBucket.days}d)`}
            bucket={windowBucket}
            t={t}
          />
        </div>
      )}
      {lastCall && lastCall.usage ? (
        <div className="rounded-md border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-[11px] font-mono text-zinc-400">
          <span className="text-zinc-500">{t('config_modal.ai_usage_last_call')}: </span>
          <span className="text-zinc-300">
            {(lastCall.usage.prompt_tokens ?? 0)} +{' '}
            {(lastCall.usage.completion_tokens ?? 0)} ={' '}
            <span className="text-emerald-300">
              {lastCall.usage.total_tokens ?? 0}
            </span>
          </span>
          {typeof lastCall.latency_ms === 'number' ? (
            <span className="ml-2 text-zinc-500">· {lastCall.latency_ms}ms</span>
          ) : null}
          {lastCall.mode ? (
            <span className="ml-2 text-zinc-500">· {lastCall.mode}</span>
          ) : null}
          {typeof lastCall.applied_count === 'number' && lastCall.applied_count > 0 ? (
            <span className="ml-2 text-emerald-400">
              · {lastCall.applied_count} mut.
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Diagnostic panel that lists models advertised by a provider (chat or image)
 * and lets the GM pick one with a click. Shared between chat and image
 * SectionCards — the only difference is which capability is highlighted and
 * which settings field gets populated on click. */
function ProviderModelsPanel({
  kind,
  models,
  loading,
  error,
  hasUrl,
  hasKey,
  currentModelId,
  onFetch,
  onReset,
  onSelect,
  t,
}: {
  kind: ProviderKind;
  models: ReturnType<typeof useAiProviderModels>['data'];
  loading: boolean;
  error: string | null;
  hasUrl: boolean;
  hasKey: boolean;
  currentModelId: string;
  onFetch: () => void;
  onReset: () => void;
  onSelect: (id: string) => void;
  t: (k: string, v?: Record<string, unknown>) => string;
}) {
  const disabled = loading || !hasUrl || !hasKey;
  const isCapable = (m: AiProviderModel) =>
    kind === 'image' ? m.supports_image : m.supports_chat;
  return (
    <>
      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          onClick={onFetch}
          disabled={disabled}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] transition-colors ${
            disabled
              ? 'bg-zinc-800/40 text-zinc-500 cursor-not-allowed'
              : 'bg-violet-600/20 text-violet-300 hover:bg-violet-600/30'
          }`}
          title={t('config_modal.ai_list_models_tooltip')}
        >
          {loading ? '…' : '⟲'} {t('config_modal.ai_list_models')}
        </button>
        {models && (
          <button
            type="button"
            onClick={onReset}
            className="text-[11px] text-zinc-500 hover:text-zinc-300 underline underline-offset-2"
          >
            {t('config_modal.ai_list_models_clear')}
          </button>
        )}
      </div>

      {error && (
        <div className="rounded border border-red-700/50 bg-red-950/40 px-2 py-1 text-[11px] text-red-200">
          {error}
        </div>
      )}

      {models && (
        <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-2 max-h-64 overflow-y-auto">
          <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500">
            <span>
              {models.provider} · {models.models.length}{' '}
              {t('config_modal.ai_list_models_count')}
            </span>
            <span className="font-mono text-zinc-600 truncate ml-2 max-w-[60%]">
              {models.endpoint}
            </span>
          </div>
          {models.models.length === 0 ? (
            <div className="py-2 text-center text-[11px] text-zinc-500">
              {t('config_modal.ai_list_models_empty')}
            </div>
          ) : (
            <ul className="space-y-0.5 font-mono text-[11px]">
              {models.models.map((m) => {
                const capable = isCapable(m);
                return (
                  <li
                    key={m.id}
                    className="flex items-center gap-1.5 cursor-pointer rounded px-1 py-0.5 hover:bg-zinc-900"
                    onClick={() => onSelect(m.id)}
                    title={t('config_modal.ai_list_models_apply_tooltip')}
                  >
                    <span
                      className={
                        capable
                          ? 'text-emerald-400 w-3 inline-block'
                          : 'text-zinc-700 w-3 inline-block'
                      }
                      aria-hidden
                    >
                      {capable ? '✓' : '·'}
                    </span>
                    <span className={capable ? 'text-zinc-200' : 'text-zinc-500'}>
                      {m.id}
                    </span>
                    {m.id === currentModelId && (
                      <span className="ml-auto text-[10px] text-violet-400">
                        {t('config_modal.ai_list_models_active')}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </>
  );
}

function SectionCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-zinc-950/40 border border-zinc-800 rounded-xl p-3 space-y-2">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{title}</span>
        {hint && <span className="text-xs text-zinc-500">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function AITab({
  inputClass,
  systemName = '',
}: {
  inputClass: string;
  systemName?: string;
}) {
  const { t } = useTranslation('core', { useSuspense: false });
  const { settings, setSettings, loading, saving, save } = useAiSettings();
  const { summary: usage, loading: usageLoading, refetch: refetchUsage } = useAiUsage(7);
  const imageModels = useAiProviderModels('image');
  const chatModels = useAiProviderModels('chat');
  const [notice, setNotice] = useState<{ variant: 'success' | 'error'; text: string } | null>(null);

  const {
    content: contractContent,
    setContent: setContractContent,
    source: contractSource,
    loading: contractLoading,
    saving: contractSaving,
    save: saveContract,
  } = useAiSystemPrompt(systemName);
  const [contractNotice, setContractNotice] = useState<{
    variant: 'success' | 'error';
    text: string;
  } | null>(null);

  const onSaveContract = useCallback(async () => {
    if (!systemName.trim()) {
      setContractNotice({
        variant: 'error',
        text: t('config_modal.ai_contract_save_error', { detail: 'No active system' }),
      });
      return;
    }
    const res = await saveContract(contractContent);
    if (res.ok) {
      setContractNotice({ variant: 'success', text: t('config_modal.ai_contract_saved') });
    } else {
      setContractNotice({
        variant: 'error',
        text: t('config_modal.ai_contract_save_error', { detail: res.error || '' }),
      });
    }
  }, [contractContent, saveContract, systemName, t]);

  const trimmed = useMemo(
    () => ({
      ...settings,
      chat_api_key: settings.chat_api_key ?? '',
      chat_base_url: settings.chat_base_url ?? '',
      chat_model: settings.chat_model ?? '',
      image_api_key: settings.image_api_key ?? '',
      image_base_url: settings.image_base_url ?? '',
      image_model: settings.image_model ?? '',
      ai_mode: (settings.ai_mode ?? 'standard') as AiMode,
    }),
    [settings],
  );

  const chatUrlInvalid = useMemo(() => optionalBaseUrlInvalid(trimmed.chat_base_url), [trimmed.chat_base_url]);
  const imageUrlInvalid = useMemo(() => optionalBaseUrlInvalid(trimmed.image_base_url), [trimmed.image_base_url]);
  const showOpenAiHint = useMemo(() => aiSettingsAllBlank(trimmed), [trimmed]);

  const onSave = useCallback(async () => {
    if (chatUrlInvalid || imageUrlInvalid) {
      const parts: string[] = [];
      if (chatUrlInvalid) parts.push(t('config_modal.ai_chat_url_invalid'));
      if (imageUrlInvalid) parts.push(t('config_modal.ai_image_url_invalid'));
      setNotice({ variant: 'error', text: parts.join(' ') });
      return;
    }
    const res = await save(trimmed);
    if (res.ok) {
      setNotice({ variant: 'success', text: t('config_modal.ai_saved') });
    } else {
      setNotice({
        variant: 'error',
        text: t('config_modal.ai_save_error', { detail: res.error || '' }),
      });
    }
  }, [chatUrlInvalid, imageUrlInvalid, save, t, trimmed]);

  return (
    <div className="space-y-3">
      {notice && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            notice.variant === 'success'
              ? 'border-emerald-700/50 bg-emerald-950/50 text-emerald-100'
              : 'border-red-700/50 bg-red-950/40 text-red-100'
          }`}
          role="status"
        >
          {notice.text}
        </div>
      )}

      {showOpenAiHint && (
        <div
          className="rounded-lg border border-zinc-700/60 bg-zinc-950/50 text-zinc-300 px-3 py-2 text-sm leading-relaxed"
          role="note"
        >
          {t('config_modal.ai_openai_format_hint')}
        </div>
      )}

      <SectionCard title={t('config_modal.ai_mode_title')} hint={t('config_modal.ai_mode_hint')}>
        <div className="flex flex-col gap-1.5">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              name="ai_mode"
              value="standard"
              checked={trimmed.ai_mode === 'standard'}
              onChange={() => setSettings((p) => ({ ...p, ai_mode: 'standard' }))}
              className="mt-0.5 accent-emerald-500"
            />
            <span className="flex flex-col">
              <span className="text-xs font-medium text-zinc-200">
                {t('config_modal.ai_mode_standard')}
              </span>
              <span className="text-[11px] text-zinc-500">
                {t('config_modal.ai_mode_standard_hint')}
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              name="ai_mode"
              value="red_knight"
              checked={trimmed.ai_mode === 'red_knight'}
              onChange={() => setSettings((p) => ({ ...p, ai_mode: 'red_knight' }))}
              className="mt-0.5 accent-rose-500"
            />
            <span className="flex flex-col">
              <span className="text-xs font-medium text-zinc-200">
                {t('config_modal.ai_mode_red_knight')}
              </span>
              <span className="text-[11px] text-zinc-500">
                {t('config_modal.ai_mode_red_knight_hint')}
              </span>
              {trimmed.ai_mode === 'red_knight' && (
                <span className="mt-1 inline-block rounded border border-amber-700/50 bg-amber-950/40 px-2 py-0.5 text-[10px] text-amber-200">
                  {t('config_modal.ai_mode_rag_warning')}
                </span>
              )}
            </span>
          </label>
        </div>
      </SectionCard>

      <SectionCard title={t('config_modal.ai_chat_provider')} hint={t('config_modal.ai_hint_stream')}>
        <div className="grid grid-cols-1 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">{t('config_modal.ai_chat_base_url')}</span>
            <input
              className={inputClass}
              type="text"
              value={trimmed.chat_base_url}
              placeholder="https://api.openai.com/v1"
              autoComplete="off"
              onChange={(e) => setSettings((p) => ({ ...p, chat_base_url: e.target.value }))}
            />
            {chatUrlInvalid && (
              <span className="text-xs text-red-400">{t('config_modal.ai_chat_url_invalid')}</span>
            )}
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">{t('config_modal.ai_chat_api_key')}</span>
            <input
              className={inputClass}
              type="password"
              value={trimmed.chat_api_key}
              autoComplete="off"
              onChange={(e) => setSettings((p) => ({ ...p, chat_api_key: e.target.value }))}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">{t('config_modal.ai_chat_model')}</span>
            <input
              className={inputClass}
              type="text"
              value={trimmed.chat_model}
              placeholder="gpt-4o-mini"
              autoComplete="off"
              onChange={(e) => setSettings((p) => ({ ...p, chat_model: e.target.value }))}
            />
          </label>

          <ProviderModelsPanel
            kind="chat"
            models={chatModels.data}
            loading={chatModels.loading}
            error={chatModels.error}
            hasUrl={!!trimmed.chat_base_url}
            hasKey={!!trimmed.chat_api_key}
            currentModelId={trimmed.chat_model}
            onFetch={() => void chatModels.fetchModels()}
            onReset={chatModels.reset}
            onSelect={(id) => setSettings((p) => ({ ...p, chat_model: id }))}
            t={t}
          />
        </div>
      </SectionCard>

      <SectionCard title={t('config_modal.ai_image_provider')} hint={t('config_modal.ai_image_hint_optional_url')}>
        <div className="grid grid-cols-1 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">{t('config_modal.ai_image_base_url')}</span>
            <input
              className={inputClass}
              type="text"
              value={trimmed.image_base_url}
              placeholder="(optional)"
              autoComplete="off"
              onChange={(e) => setSettings((p) => ({ ...p, image_base_url: e.target.value }))}
            />
            {imageUrlInvalid && (
              <span className="text-xs text-red-400">{t('config_modal.ai_image_url_invalid')}</span>
            )}
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">{t('config_modal.ai_image_api_key')}</span>
            <input
              className={inputClass}
              type="password"
              value={trimmed.image_api_key}
              autoComplete="off"
              onChange={(e) => setSettings((p) => ({ ...p, image_api_key: e.target.value }))}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-400">{t('config_modal.ai_image_model')}</span>
            <input
              className={inputClass}
              type="text"
              value={trimmed.image_model}
              autoComplete="off"
              onChange={(e) => setSettings((p) => ({ ...p, image_model: e.target.value }))}
            />
          </label>

          <ProviderModelsPanel
            kind="image"
            models={imageModels.data}
            loading={imageModels.loading}
            error={imageModels.error}
            hasUrl={!!trimmed.image_base_url}
            hasKey={!!trimmed.image_api_key}
            currentModelId={trimmed.image_model}
            onFetch={() => void imageModels.fetchModels()}
            onReset={imageModels.reset}
            onSelect={(id) => setSettings((p) => ({ ...p, image_model: id }))}
            t={t}
          />
        </div>
      </SectionCard>

      <div className="flex justify-end pt-1">
        <button
          type="button"
          disabled={loading || saving || chatUrlInvalid || imageUrlInvalid}
          onClick={() => void onSave()}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
            loading || saving || chatUrlInvalid || imageUrlInvalid
              ? 'bg-zinc-800/40 text-zinc-500 cursor-not-allowed'
              : 'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30'
          }`}
        >
          {saving ? t('common.saving') : t('config_modal.ai_save')}
        </button>
      </div>

      <SectionCard
        title={t('config_modal.ai_usage_title')}
        hint={t('config_modal.ai_usage_hint')}
      >
        <UsageGrid
          today={usage.today}
          windowBucket={usage.window}
          lastCall={usage.last_call}
          loading={usageLoading}
          onRefresh={() => void refetchUsage()}
          t={t}
        />
      </SectionCard>

      <SectionCard
        title={t('config_modal.ai_system_contract')}
        hint={t('config_modal.ai_system_contract_hint', { system: systemName || '—' })}
      >
        {contractNotice && (
          <div
            className={`rounded-lg border px-3 py-2 text-sm ${
              contractNotice.variant === 'success'
                ? 'border-emerald-700/50 bg-emerald-950/50 text-emerald-100'
                : 'border-red-700/50 bg-red-950/40 text-red-100'
            }`}
            role="status"
          >
            {contractNotice.text}
          </div>
        )}
        <div className="text-[11px] text-zinc-500">
          {contractSource === 'system'
            ? t('config_modal.ai_contract_source_override', { system: systemName })
            : contractSource === 'default'
              ? t('config_modal.ai_contract_source_default')
              : t('config_modal.ai_contract_source_missing')}
        </div>
        <textarea
          className={`${inputClass} block w-full font-mono text-[12px] leading-snug min-h-[28rem] resize-y`}
          style={{ tabSize: 2 }}
          rows={24}
          value={contractContent}
          spellCheck={false}
          disabled={contractLoading}
          onChange={(e) => setContractContent(e.target.value)}
        />
        <div className="flex justify-end">
          <button
            type="button"
            disabled={contractLoading || contractSaving || !systemName.trim()}
            onClick={() => void onSaveContract()}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
              contractLoading || contractSaving || !systemName.trim()
                ? 'bg-zinc-800/40 text-zinc-500 cursor-not-allowed'
                : 'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30'
            }`}
          >
            {contractSaving ? t('common.saving') : t('config_modal.ai_save_contract')}
          </button>
        </div>
      </SectionCard>
    </div>
  );
}

