import { Settings, BookImage, MonitorSmartphone, Layers, Link2, ChevronDown, Lightbulb, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRef, useState, useEffect } from 'react';
import i18n from '../i18n';
import type { CombatLogEntry, LegendConfig } from '../types';
import { CombatLog } from './CombatLog';

export type LogEntry = CombatLogEntry;

export interface AppHeaderProps {
  round: number;
  history: LogEntry[];
  showLog: boolean;
  onToggleLog: () => void;
  enableLogging: boolean;
  onRefetch: () => void;
  onShowMiniatures: () => void;
  onShowHardware: () => void;
  onShowLedProfiles: () => void;
  onShowLedTriggers: () => void;
  onShowLibrary: () => void;
  onShowConfig: () => void;
  showLegendPanel: boolean;
  onToggleLegendPanel: () => void;
  legendConfig: LegendConfig;
  editingLegend: LegendConfig;
  showGroupColors: boolean;
  showFactionColors: boolean;
  onLegendColorChange: (role: keyof LegendConfig, color: string) => void;
  onShowGroupColorsChange: (val: boolean) => void;
  onShowFactionColorsChange: (val: boolean) => void;
  onCreateGroup: () => void;
  onSaveLegend: () => void;
}

export function AppHeader(props: AppHeaderProps) {
  const { t } = useTranslation('core', { useSuspense: false });
  const {
    round,
    history,
    showLog,
    onToggleLog,
    enableLogging,
    onRefetch,
    onShowMiniatures,
    onShowHardware,
    onShowLedProfiles,
    onShowLedTriggers,
    onShowLibrary,
    onShowConfig,
    showLegendPanel,
    onToggleLegendPanel,
    editingLegend,
    showGroupColors,
    showFactionColors,
    onLegendColorChange,
    onShowGroupColorsChange,
    onShowFactionColorsChange,
    onCreateGroup,
    onSaveLegend,
  } = props;

  const appAuthor = i18n.t('_meta.app_author', { ns: 'core', defaultValue: 'Nevrar' });
  const appName = i18n.t('_meta.app_name_short', { ns: 'core', defaultValue: 'Omniboard' });

  const [miniaturesDropdownOpen, setMiniaturesDropdownOpen] = useState(false);
  const miniaturesDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!miniaturesDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (miniaturesDropdownRef.current && !miniaturesDropdownRef.current.contains(e.target as Node)) {
        setMiniaturesDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [miniaturesDropdownOpen]);

  const handleMiniaturesAction = (fn: () => void) => {
    fn();
    setMiniaturesDropdownOpen(false);
  };

  return (
    <header className="relative bg-zinc-900 border-b border-zinc-800 p-4 flex justify-between items-center">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-zinc-100">
          <span className="text-base italic text-zinc-400 font-normal">{appAuthor}'s</span>{' '}
          {appName}
        </h1>
        <div className="relative inline-block">
          <div
            role="button"
            tabIndex={0}
            onClick={onToggleLog}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onToggleLog();
              }
            }}
            className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-300 transition-colors"
          >
            {t('header.round')}: {round}
          </div>
          <CombatLog
            history={history}
            isOpen={showLog}
            onClose={onToggleLog}
            enableLogging={enableLogging}
            onRefetch={onRefetch}
          />
        </div>
      </div>
      <div className="flex gap-3">
        <div className="relative" ref={miniaturesDropdownRef}>
          <button
            type="button"
            onClick={() => setMiniaturesDropdownOpen((v) => !v)}
            className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-md text-sm transition-colors"
            aria-expanded={miniaturesDropdownOpen}
            aria-haspopup="true"
          >
            <MonitorSmartphone size={16} />
            {t('header.miniatures')}
            <ChevronDown size={14} className={`transition-transform ${miniaturesDropdownOpen ? 'rotate-180' : ''}`} />
          </button>
          <div
            className={`absolute top-full left-0 mt-1 min-w-[200px] py-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 transition-all duration-200 ${
              miniaturesDropdownOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1 pointer-events-none'
            }`}
          >
            <button
              type="button"
              onClick={() => handleMiniaturesAction(onShowMiniatures)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
            >
              <Link2 size={16} className="text-zinc-400 shrink-0" />
              {t('header.table_binding')}
            </button>
            <button
              type="button"
              onClick={() => handleMiniaturesAction(onShowLedProfiles)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
            >
              <Lightbulb size={16} className="text-zinc-400 shrink-0" />
              {t('miniature_layout.edit_led_profiles', { defaultValue: 'Edit LED profiles' })}
            </button>
            <button
              type="button"
              onClick={() => handleMiniaturesAction(onShowLedTriggers)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
            >
              <Zap size={16} className="text-zinc-400 shrink-0" />
              {t('led_triggers.configure_triggers', { defaultValue: 'Configure event triggers' })}
            </button>
            <button
              type="button"
              onClick={() => handleMiniaturesAction(onShowHardware)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
            >
              <MonitorSmartphone size={16} className="text-zinc-400 shrink-0" />
              {t('header.device_manager')}
            </button>
          </div>
        </div>
        <button onClick={onShowLibrary} className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-md text-sm transition-colors">
          <BookImage size={16} /> {t('header.library')}
        </button>
        <button onClick={onShowConfig} className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-md text-sm transition-colors">
          <Settings size={16} /> {t('config')}
        </button>
        <button
          onClick={onToggleLegendPanel}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${showLegendPanel ? 'bg-emerald-600/30 text-emerald-400' : 'bg-zinc-800 hover:bg-zinc-700'}`}
          title={t('header.groups')}
        >
          <Layers size={16} /> {t('header.groups')}
        </button>
      </div>
      <div
        className={`absolute top-full right-4 mt-2 w-80 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl overflow-hidden z-50 transition-all duration-300 ease-out ${
          showLegendPanel ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'
        }`}
      >
        <div className="p-4 border-b border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-100">{t('header.groups')}</h3>
        </div>
        <div className="p-4 space-y-4">
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showGroupColors}
                onChange={(e) => onShowGroupColorsChange(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500"
              />
              <span className="text-sm text-zinc-300">{t('toolbar.display_group_colors')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showFactionColors}
                onChange={(e) => onShowFactionColorsChange(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500"
              />
              <span className="text-sm text-zinc-300">{t('toolbar.display_faction_colors')}</span>
            </label>
          </div>
          <div>
            <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">{t('toolbar.legend')}</h4>
            <div className="space-y-2">
              {(['player', 'enemy', 'ally', 'neutral'] as const).map((role) => (
                <div key={role} className="flex items-center justify-between gap-2">
                  <label className="text-sm text-zinc-300 capitalize">{role === 'player' ? t('toolbar.player') : t(`toolbar.${role}`)}</label>
                  <input
                    type="color"
                    value={editingLegend[role]}
                    onChange={(e) => onLegendColorChange(role, e.target.value)}
                    className="w-10 h-8 rounded bg-zinc-800 border border-zinc-700 cursor-pointer"
                  />
                </div>
              ))}
            </div>
          </div>
          <button
            onClick={onCreateGroup}
            className="w-full py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Layers size={16} /> {t('toolbar.create_group')}
          </button>
          <button
            onClick={onSaveLegend}
            className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            {t('common.save')}
          </button>
        </div>
      </div>
    </header>
  );
}
