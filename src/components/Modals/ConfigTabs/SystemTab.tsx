import React from 'react';
import { ChevronDown, Download, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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

export function SystemTab({
  inputClass,
  localSystemName,
  setLocalSystemName,
  commitSystemName,
  showPresets,
  setShowPresets,
  presets,
  loadPreset,
  engineLocked,
  engineType,
  applyEngineType,
  onExport,
  onImport,
  fileInputRef,
}: {
  inputClass: string;
  localSystemName: string;
  setLocalSystemName: (v: string) => void;
  commitSystemName: () => void;
  showPresets: boolean;
  setShowPresets: (v: boolean) => void;
  presets: string[];
  loadPreset: (preset: string) => Promise<void>;
  engineLocked: boolean;
  engineType: string;
  applyEngineType: (engineType: string) => Promise<void>;
  onExport: () => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
}) {
  const { t } = useTranslation('core', { useSuspense: false });

  return (
    <div className="space-y-3">
      <SectionCard title={t('config_modal.system')}>
        <div className="relative flex items-center gap-2">
          <input
            type="text"
            value={localSystemName}
            onChange={(e) => setLocalSystemName(e.target.value)}
            onBlur={commitSystemName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
                commitSystemName();
              }
            }}
            className={`${inputClass} flex-1 min-w-0`}
            placeholder={t('config_modal.system_name')}
          />
          <button
            type="button"
            onClick={() => setShowPresets(!showPresets)}
            className="px-2 py-1 rounded-lg border border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:text-emerald-400 hover:border-zinc-700 transition-colors flex items-center gap-1 text-xs shrink-0"
            title={t('config_modal.choose_system')}
          >
            {t('config_modal.choose_system')}
            <ChevronDown size={14} className={`transition-transform ${showPresets ? 'rotate-180' : ''}`} />
          </button>

          {showPresets && (
            <div className="absolute top-full right-0 mt-2 w-56 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl overflow-hidden z-10">
              <div className="px-3 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider bg-zinc-900/50">
                {t('config_modal.saved_systems')}
              </div>
              {presets.length === 0 ? (
                <div className="px-4 py-2 text-sm text-zinc-500">{t('config_modal.no_systems_yet')}</div>
              ) : (
                presets.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => loadPreset(p)}
                    className="w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
                  >
                    {p}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onExport}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs transition-colors"
          >
            <Download size={14} /> {t('config_modal.export')}
          </button>
          <input type="file" ref={fileInputRef} onChange={onImport} className="hidden" accept=".json" />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs transition-colors"
          >
            <Upload size={14} /> {t('config_modal.import')}
          </button>
        </div>
      </SectionCard>

      <SectionCard
        title={t('config_modal.initiative_engine')}
        hint={t('config_modal.initiative_engine_hint')}
      >
        <select
          disabled={engineLocked}
          value={engineLocked ? 'custom' : engineType}
          onChange={(e) => void applyEngineType(e.target.value)}
          className={`${inputClass} w-full disabled:opacity-60 disabled:cursor-not-allowed`}
          title={t('config_modal.initiative_engine')}
        >
          {engineLocked ? (
            <option value="custom">{t('config_modal.engine_custom_system')}</option>
          ) : (
            <>
              <option value="standard">{t('config_modal.engine_standard')}</option>
              <option value="phase">{t('config_modal.engine_phase')}</option>
              <option value="popcorn">{t('config_modal.engine_popcorn')}</option>
            </>
          )}
        </select>
      </SectionCard>
    </div>
  );
}
