import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAiSettings } from '../../../hooks/useAiSettings';

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

export function AITab({ inputClass }: { inputClass: string }) {
  const { t } = useTranslation('core', { useSuspense: false });
  const { settings, setSettings, loading, saving, save } = useAiSettings();
  const [notice, setNotice] = useState<{ variant: 'success' | 'error'; text: string } | null>(null);

  const trimmed = useMemo(
    () => ({
      ...settings,
      chat_api_key: settings.chat_api_key ?? '',
      chat_base_url: settings.chat_base_url ?? '',
      chat_model: settings.chat_model ?? '',
      image_api_key: settings.image_api_key ?? '',
      image_base_url: settings.image_base_url ?? '',
      image_model: settings.image_model ?? '',
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
    </div>
  );
}

