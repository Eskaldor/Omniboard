import React from 'react';
import { useTranslation } from 'react-i18next';

export function LanguageTab({
  languages,
  currentLangCode,
  currentLangFlag,
  flagFontStyle,
  onChangeLanguage,
}: {
  languages: { code: string; name: string; flag: string }[];
  currentLangCode: string;
  currentLangFlag: string;
  flagFontStyle: React.CSSProperties;
  onChangeLanguage: (code: string) => void;
}) {
  const { t } = useTranslation('core', { useSuspense: false });

  return (
    <div className="space-y-4">
      <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
        {t('language')}
      </div>

      <div className="flex flex-col gap-2">
        {languages.map((lang) => {
          const isActive = currentLangCode === lang.code;
          return (
            <button
              key={lang.code}
              type="button"
              onClick={() => onChangeLanguage(lang.code)}
              className={`w-full px-4 py-3 text-left rounded-xl border transition-colors flex items-center gap-3 ${
                isActive
                  ? 'border-emerald-500/50 bg-emerald-600/10 text-emerald-200'
                  : 'border-zinc-800 bg-zinc-950/40 text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <span className="text-2xl inline-block min-w-[2rem] text-center" style={flagFontStyle} role="img" aria-hidden>
                {lang.flag}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{lang.name}</div>
                <div className="text-xs text-zinc-500">{lang.code}</div>
              </div>
              {isActive && (
                <span className="text-xs font-semibold text-emerald-400">
                  {t('common.selected')}
                </span>
              )}
            </button>
          );
        })}

        {languages.length === 0 && (
          <div className="text-sm text-zinc-500">
            {t('config_modal.languages_unavailable')}
            <span className="ml-2 text-lg inline-block" style={flagFontStyle} aria-hidden>
              {currentLangFlag}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

