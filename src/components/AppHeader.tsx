import { Settings, BookImage, MonitorSmartphone, Layers, Link2, ChevronDown, Lightbulb, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import type { CombatLogEntry, LegendConfig } from '../types';
import { useCombatState } from '../contexts/CombatStateContext';
import { CombatLog } from './CombatLog';

export type LogEntry = CombatLogEntry;

function toRomanNumeral(n: number): string {
  if (!Number.isFinite(n) || n < 1) return '';
  if (n > 3999) return String(Math.floor(n));
  const pairs: [number, string][] = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let rest = Math.floor(n);
  let out = '';
  for (const [v, sym] of pairs) {
    while (rest >= v) {
      out += sym;
      rest -= v;
    }
  }
  return out;
}

export interface AppHeaderProps {
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
  const { state } = useCombatState();
  const {
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

  const core = state?.core;
  const engineType = (core?.engine_type ?? 'standard').toLowerCase();
  const isManualMode = core?.is_manual_mode ?? false;
  const isCombatActive = core?.is_active ?? false;
  const order = core?.turn_queue ?? [];
  const orderLen = Math.max(order.length, 1);
  const roundNumber = core?.round ?? 1;
  const currentIndex = core?.current_index ?? 0;
  const currentPass = core?.current_pass ?? 1;
  const systemNorm = (core?.system ?? '').toLowerCase();

  const actorsById = useMemo(() => {
    const m = new Map<string, { has_acted?: boolean }>();
    for (const a of core?.actors ?? []) {
      m.set(a.id, { has_acted: a.has_acted });
    }
    return m;
  }, [core?.actors]);

  const useActedProgress = engineType === 'phase' || engineType === 'popcorn' || isManualMode;

  const turnProgress = useMemo(() => {
    if (!useActedProgress) {
      return Math.min(Math.max(currentIndex, 0), orderLen);
    }
    let n = 0;
    for (const id of order) {
      if (actorsById.get(id)?.has_acted) n += 1;
    }
    return Math.min(n, orderLen);
  }, [useActedProgress, currentIndex, order, orderLen, actorsById]);

  const progressPct = Math.min(100, Math.max(0, (turnProgress / orderLen) * 100));
  const turnDisplayNum = order.length ? Math.min(order.length, turnProgress + 1) : 1;
  const phaseDigit = currentPass >= 1 ? currentPass : currentIndex + 1;

  const phaseLabel = useMemo(() => {
    if (engineType !== 'phase') return null;
    const sotdl =
      systemNorm.includes('shadow of the demon lord') ||
      systemNorm.includes('sotdl') ||
      systemNorm.includes('demon lord');
    if (sotdl) {
      if (currentPass === 1) return t('combat.phase.fast');
      if (currentPass === 2) return t('combat.phase.slow');
      return t('combat.phase_index', { n: currentPass });
    }
    if (systemNorm.includes('shadowrun')) {
      const roman = toRomanNumeral(phaseDigit);
      return roman || String(phaseDigit);
    }
    return t('combat.phase_index', { n: phaseDigit });
  }, [engineType, systemNorm, currentPass, phaseDigit, t]);

  const handleRoundClick = useCallback(() => {
    onToggleLog();
  }, [onToggleLog]);

  const roundButtonAria = t('combat.round_open_log_aria', { round: roundNumber });

  const appAuthor = i18n.t('_meta.app_author', { ns: 'core' });
  const appName = i18n.t('_meta.app_name_short', { ns: 'core' });

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
        <div className="relative mt-1 inline-block">
          <div className="flex h-8 items-center">
            <button
              type="button"
              onClick={handleRoundClick}
              title={t('combat.open_log_hint')}
              aria-label={roundButtonAria}
              className="relative z-10 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-zinc-900 bg-zinc-800 text-base font-semibold tabular-nums leading-none text-zinc-100 shadow-none ring-[3px] ring-zinc-900 transition-transform duration-200 ease-out hover:scale-[1.04] hover:text-emerald-200/95 active:scale-[0.97] focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500/80"
            >
              <motion.span
                key={roundNumber}
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                {roundNumber}
              </motion.span>
            </button>
            <div className="relative z-0 -ml-4 flex h-8 min-w-[6.75rem] max-w-[13rem] items-center overflow-hidden rounded-md bg-zinc-800 pl-7 pr-2">
              {isCombatActive ? (
                <div className="flex min-w-0 flex-1 items-center gap-x-1.5 text-xs leading-none">
                  <span className="shrink-0 text-[9px] font-medium uppercase tracking-wide text-zinc-500">
                    {t('combat.turn')}
                  </span>
                  <motion.span
                    key={turnDisplayNum}
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="shrink-0 font-semibold tabular-nums text-zinc-100"
                  >
                    {turnDisplayNum}
                  </motion.span>
                  {phaseLabel != null ? (
                    <motion.span
                      key={phaseLabel}
                      initial={{ opacity: 0, y: 3 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className="min-w-0 truncate font-medium text-emerald-400/90"
                      title={phaseLabel}
                    >
                      {phaseLabel}
                    </motion.span>
                  ) : null}
                </div>
              ) : null}
              <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-px bg-zinc-700/60">
                <div
                  className="h-full bg-emerald-500 transition-[width] duration-500 ease-out"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
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
              {t('header.edit_led_profiles')}
            </button>
            <button
              type="button"
              onClick={() => handleMiniaturesAction(onShowLedTriggers)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
            >
              <Zap size={16} className="text-zinc-400 shrink-0" />
              {t('header.configure_led_triggers')}
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
          <Settings size={16} /> {t('header.config')}
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
