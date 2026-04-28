import React from 'react';
import { useTranslation } from 'react-i18next';
import { InfoTooltip } from '../../UI/InfoTooltip';

export function TableTab({
  tableCentered,
  onToggleTableCentered,
  stickyFirstColumn,
  onToggleStickyFirstColumn,
  stickyLastColumn,
  onToggleStickyLastColumn,
  showGroupColors,
  onToggleShowGroupColors,
  showFactionColors,
  onToggleShowFactionColors,
}: {
  tableCentered: boolean;
  onToggleTableCentered: (next: boolean) => Promise<void>;
  stickyFirstColumn: boolean;
  onToggleStickyFirstColumn: (next: boolean) => Promise<void>;
  stickyLastColumn: boolean;
  onToggleStickyLastColumn: (next: boolean) => Promise<void>;
  showGroupColors: boolean;
  onToggleShowGroupColors: (next: boolean) => Promise<void>;
  showFactionColors: boolean;
  onToggleShowFactionColors: (next: boolean) => Promise<void>;
}) {
  const { t } = useTranslation('core', { useSuspense: false });
  const helpStickyFirst = t('config.table.help.stickyFirst');
  const helpStickyLast = t('config.table.help.stickyLast');
  const helpFactionColors = t('config.table.help.factionColors');

  const itemClass = 'flex items-center justify-between py-2 border-b border-zinc-800/50 last:border-0';
  const checkboxClass =
    'w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-900';

  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
        {t('config_modal.section_display')}
      </div>

      <div className="bg-zinc-950/40 border border-zinc-800 rounded-xl p-3">
        <div className={itemClass}>
          <span className="text-sm text-zinc-300">{t('config_modal.center_table')}</span>
          <input
            type="checkbox"
            checked={tableCentered}
            onChange={(e) => void onToggleTableCentered(e.target.checked)}
            className={checkboxClass}
          />
        </div>

        <div className={itemClass}>
          <span className="text-sm text-zinc-300 flex items-center gap-2 min-w-0">
            <span className="truncate">
              {t('config_modal.sticky_first_column')}
            </span>
            <InfoTooltip text={helpStickyFirst} />
          </span>
          <input
            type="checkbox"
            checked={stickyFirstColumn}
            onChange={(e) => void onToggleStickyFirstColumn(e.target.checked)}
            className={checkboxClass}
          />
        </div>

        <div className={itemClass}>
          <span className="text-sm text-zinc-300 flex items-center gap-2 min-w-0">
            <span className="truncate">
              {t('config_modal.sticky_last_column')}
            </span>
            <InfoTooltip text={helpStickyLast} />
          </span>
          <input
            type="checkbox"
            checked={stickyLastColumn}
            onChange={(e) => void onToggleStickyLastColumn(e.target.checked)}
            className={checkboxClass}
          />
        </div>

        <div className={itemClass}>
          <span className="text-sm text-zinc-300">
            {t('config_modal.show_group_colors')}
          </span>
          <input
            type="checkbox"
            checked={showGroupColors}
            onChange={(e) => void onToggleShowGroupColors(e.target.checked)}
            className={checkboxClass}
          />
        </div>

        <div className={itemClass}>
          <span className="text-sm text-zinc-300 flex items-center gap-2 min-w-0">
            <span className="truncate">
              {t('config_modal.show_faction_colors')}
            </span>
            <InfoTooltip text={helpFactionColors} />
          </span>
          <input
            type="checkbox"
            checked={showFactionColors}
            onChange={(e) => void onToggleShowFactionColors(e.target.checked)}
            className={checkboxClass}
          />
        </div>
      </div>
    </div>
  );
}

