import { Settings, BookImage, MonitorSmartphone, Layers } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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

  return (
    <header className="relative bg-zinc-900 border-b border-zinc-800 p-4 flex justify-between items-center">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-zinc-100">Omniboard</h1>
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
            Round: {round}
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
        <button onClick={onShowMiniatures} className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-md text-sm transition-colors">
          <MonitorSmartphone size={16} /> Miniatures
        </button>
        <button onClick={onShowLibrary} className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-md text-sm transition-colors">
          <BookImage size={16} /> Library
        </button>
        <button onClick={onShowConfig} className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-md text-sm transition-colors">
          <Settings size={16} /> {t('config', 'Config')}
        </button>
        <button
          onClick={onToggleLegendPanel}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${showLegendPanel ? 'bg-emerald-600/30 text-emerald-400' : 'bg-zinc-800 hover:bg-zinc-700'}`}
          title="Groups"
        >
          <Layers size={16} /> Groups
        </button>
      </div>
      <div
        className={`absolute top-full right-4 mt-2 w-80 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl overflow-hidden z-50 transition-all duration-300 ease-out ${
          showLegendPanel ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'
        }`}
      >
        <div className="p-4 border-b border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-100">Groups</h3>
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
              <span className="text-sm text-zinc-300">Display group colors</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showFactionColors}
                onChange={(e) => onShowFactionColorsChange(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500"
              />
              <span className="text-sm text-zinc-300">Display faction (role) colors</span>
            </label>
          </div>
          <div>
            <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Legend (role colors)</h4>
            <div className="space-y-2">
              {(['player', 'enemy', 'ally', 'neutral'] as const).map((role) => (
                <div key={role} className="flex items-center justify-between gap-2">
                  <label className="text-sm text-zinc-300 capitalize">{role === 'player' ? 'Player' : role}</label>
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
            <Layers size={16} /> Create Group
          </button>
          <button
            onClick={onSaveLegend}
            className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </header>
  );
}
