import React from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function SystemTab({
  inputClass,
  localSystemName,
  setLocalSystemName,
  commitSystemName,
  showPresets,
  setShowPresets,
  presets,
  loadPreset,
  applyCombatSystem,
  engineLocked,
  engineType,
  applyEngineType,
}: {
  inputClass: string;
  localSystemName: string;
  setLocalSystemName: (v: string) => void;
  commitSystemName: () => void;
  showPresets: boolean;
  setShowPresets: (v: boolean) => void;
  presets: string[];
  loadPreset: (preset: string) => Promise<void>;
  applyCombatSystem: (name: string) => Promise<void>;
  engineLocked: boolean;
  engineType: string;
  applyEngineType: (engineType: string) => Promise<void>;
}) {
  const { t } = useTranslation('core', { useSuspense: false });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-2 border-b border-zinc-800/50">
        <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider shrink-0">
          {t('config_modal.combat_system')}
        </span>
        <div className="relative flex items-center gap-2 min-w-0">
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
            className="bg-transparent text-sm font-medium text-zinc-100 border-none outline-none min-w-[8rem] flex-1 placeholder-zinc-500"
            placeholder={t('config_modal.system_name')}
          />
          <button
            type="button"
            onClick={() => setShowPresets(!showPresets)}
            className="p-1 text-zinc-400 hover:text-emerald-400 transition-colors"
            title={t('config_modal.load_preset')}
          >
            <ChevronDown size={16} className={`transition-transform ${showPresets ? 'rotate-180' : ''}`} />
          </button>

          {showPresets && (
            <div className="absolute top-full left-0 mt-2 w-56 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl overflow-hidden z-10">
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
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-2 border-b border-zinc-800/50">
        <div className="flex flex-col gap-0.5 min-w-0 shrink-0">
          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
            {t('config_modal.initiative_engine')}
          </span>
          <span className="text-xs text-zinc-500">{t('config_modal.initiative_engine_hint')}</span>
        </div>
        <select
          disabled={engineLocked}
          value={engineLocked ? 'custom' : engineType}
          onChange={(e) => void applyEngineType(e.target.value)}
          className={`${inputClass} min-w-[12rem] max-w-full disabled:opacity-60 disabled:cursor-not-allowed`}
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
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-2">
        <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider shrink-0">
          {t('config_modal.combat_system')}
        </span>
        <select
          value={localSystemName}
          onChange={(e) => void applyCombatSystem(e.target.value)}
          className={`${inputClass} min-w-[12rem] max-w-full`}
          title={t('config_modal.combat_system')}
        >
          {!presets.includes(localSystemName) && localSystemName.trim() ? (
            <option value={localSystemName}>{localSystemName}</option>
          ) : null}
          {presets.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

