import React from 'react';
import { Download, Upload, Trash2, Plus, ChevronDown, ChevronUp, Save, X } from 'lucide-react';
import type { ColumnConfig } from '../../../types';
import { useTranslation } from 'react-i18next';
import { InfoTooltip } from '../../UI/InfoTooltip';

const DEFAULT_CHECKBOX_GROUP_ITEMS: NonNullable<ColumnConfig['items']> = [
  { id: 'res1', label: '1', color: '#52525b' },
  { id: 'res2', label: '2', color: '#737373' },
  { id: 'res3', label: '3', color: '#a3a3a3' },
];

export function ColumnsTab({
  inputClass,
  columns,
  expertMode,
  setExpertMode,
  labelDrafts,
  setLabelDrafts,
  updateColumn,
  toggleColumn,
  removeColumn,
  moveColumn,
  onAddColumn,
  handleExport,
  fileInputRef,
  handleImport,
  handleSave,
  notice,
  setNotice,
}: {
  inputClass: string;
  columns: ColumnConfig[];
  expertMode: boolean;
  setExpertMode: (v: boolean) => void;
  labelDrafts: Record<string, string>;
  setLabelDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  updateColumn: (key: string, updates: Partial<ColumnConfig>) => void;
  toggleColumn: (key: string) => void;
  removeColumn: (key: string) => void;
  moveColumn: (index: number, dir: 'up' | 'down') => void;
  onAddColumn: (key: string, label: string) => void;
  handleExport: () => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSave: () => Promise<void>;
  notice: { variant: 'success' | 'error'; text: string } | null;
  setNotice: (v: { variant: 'success' | 'error'; text: string } | null) => void;
}) {
  const { t } = useTranslation('core', { useSuspense: false });
  const [newKey, setNewKey] = React.useState('');
  const [newLabel, setNewLabel] = React.useState('');
  const helpPath = t('config.columns.help.path');
  const helpType = t('config.columns.help.type');
  const helpTooltip = t('config.columns.help.tooltip');
  const helpGroup = t('config.columns.help.group');
  const helpMinMax = t('config.columns.help.minMax');
  const helpFraction = t('config.columns.help.fraction');
  const helpAdvanced = t('config.columns.help.advanced');
  const helpLog = t('config.columns.help.log');
  const helpMiniSheet = t('config.columns.help.miniSheet');

  const headerCell = 'text-[10px] font-semibold text-zinc-500 uppercase tracking-wider';
  const cellGrid = 'grid grid-cols-[26px_1fr_140px_140px_120px_90px_96px] gap-2 items-center';
  const mechanicsTypes = new Set<ColumnConfig['type']>(['number', 'fraction']);

  return (
    <div className="space-y-3">
      {notice && (
        <div
          className={`mb-3 flex items-start justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
            notice.variant === 'success'
              ? 'border-emerald-700/50 bg-emerald-950/50 text-emerald-100'
              : 'border-red-700/50 bg-red-950/40 text-red-100'
          }`}
          role="status"
        >
          <span className="min-w-0 break-words">{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="shrink-0 rounded p-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            aria-label={t('common.close')}
          >
            <X size={16} />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between py-2 border-b border-zinc-800/50">
        <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
          {t('config_modal.column_mode')}
        </span>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-sm text-zinc-400">{t('config_modal.simple_mode')}</span>
          <input
            type="checkbox"
            checked={expertMode}
            onChange={(e) => setExpertMode(e.target.checked)}
            className="sr-only peer"
          />
          <div className="relative w-10 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:border-zinc-300 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500" />
          <span className="text-sm text-zinc-300">{t('config_modal.expert_mode')}</span>
        </label>
      </div>

      <div className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
        {t('config_modal.fields_columns')}
      </div>

      <div className="hidden sm:block px-2">
        <div className={`${cellGrid} pb-2 border-b border-zinc-800/50`}>
          <div className={headerCell} />
          <div className="flex items-center gap-1">
            <span className={headerCell}>{t('config_modal.label_placeholder')}</span>
          </div>
          <div className="flex items-center gap-1 justify-start">
            <span className={headerCell}>{t('config_modal.type')}</span>
            <InfoTooltip text={helpType} />
          </div>
          <div className="flex items-center gap-1 justify-start">
            <span className={headerCell}>{t('config_modal.key_placeholder')}</span>
            <InfoTooltip text={helpPath} />
          </div>
          <div className="flex items-center gap-1 justify-start">
            <span className={headerCell}>{t('config_modal.group')}</span>
            <InfoTooltip text={helpGroup} />
          </div>
          <div className="flex items-center gap-1 justify-start">
            <span className={headerCell}>{t('config_modal.width')}</span>
          </div>
          <div className="flex items-center gap-1 justify-end">
            <span className={headerCell}>{t('config_modal.actions')}</span>
          </div>
        </div>
      </div>

      {columns.map((col, index) => (
        <div key={col.key} className="py-3 border-b border-zinc-800/50 last:border-0 space-y-2">
          <div className={`${cellGrid} px-2`}>
            <div className="flex flex-col shrink-0">
              <button
                type="button"
                onClick={() => moveColumn(index, 'up')}
                disabled={index === 0}
                className="p-0.5 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed"
                title={t('config_modal.move_up')}
              >
                <ChevronUp size={14} />
              </button>
              <button
                type="button"
                onClick={() => moveColumn(index, 'down')}
                disabled={index === columns.length - 1}
                className="p-0.5 text-zinc-500 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed"
                title={t('config_modal.move_down')}
              >
                <ChevronDown size={14} />
              </button>
            </div>

            <input
              type="text"
              value={labelDrafts[col.key] ?? col.label}
              onChange={(e) => {
                const v = e.target.value;
                setLabelDrafts((prev) => ({ ...prev, [col.key]: v }));
              }}
              placeholder={t('config_modal.label_placeholder')}
              className={`${inputClass} w-full min-w-0`}
            />

            <select
              value={col.type ?? 'number'}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'checkbox_group') {
                  updateColumn(col.key, {
                    type: 'checkbox_group',
                    reset_policy: col.reset_policy ?? 'turn_start',
                    display_style: col.display_style ?? 'badge',
                    items: col.items && col.items.length > 0 ? col.items : [...DEFAULT_CHECKBOX_GROUP_ITEMS],
                  });
                } else {
                  updateColumn(col.key, {
                    type: v as 'number' | 'fraction' | 'text' | 'string',
                    show_tooltip: undefined,
                  });
                }
              }}
              className={`${inputClass} w-full min-w-0`}
            >
              <option value="number">{t('config_modal.type_number')}</option>
              <option value="fraction">{t('config_modal.type_fraction')}</option>
              <option value="text">{t('config_modal.type_text')}</option>
              <option value="string">{t('config_modal.type_string')}</option>
              <option value="checkbox_group">
                {t('config_modal.type_checkbox_group')}
              </option>
            </select>

            <input
              type="text"
              value={col.key}
              onChange={(e) => updateColumn(col.key, { key: e.target.value })}
              placeholder={t('config_modal.key_placeholder')}
              className={`${inputClass} w-full min-w-0 font-mono`}
            />

            <input
              type="text"
              value={col.group ?? ''}
              onChange={(e) => updateColumn(col.key, { group: e.target.value.trim() || undefined })}
              placeholder={t('config_modal.group_placeholder_column')}
              className={`${inputClass} w-full min-w-0`}
            />

            <input
              type="text"
              value={col.width ?? '80px'}
              onChange={(e) => updateColumn(col.key, { width: e.target.value.trim() || '80px' })}
              placeholder={t('config_modal.width_placeholder')}
              className={`${inputClass} w-full min-w-0 font-mono`}
              title={t('config_modal.width')}
            />

            <div className="flex items-center justify-end gap-2 shrink-0">
              <input
                type="checkbox"
                checked={col.showInTable}
                onChange={() => toggleColumn(col.key)}
                className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-900"
                title={t('config_modal.show_in_table')}
              />
              <button
                type="button"
                onClick={() => removeColumn(col.key)}
                className="p-1 text-zinc-600 hover:text-red-400 transition-colors"
                title={t('config_modal.remove_field')}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          {(col.type === 'text' || col.type === 'string') && (
            <div className="pl-8 flex items-center gap-2 text-sm border-l border-zinc-800/50 ml-2 py-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={col.show_tooltip === true}
                  onChange={(e) => updateColumn(col.key, { show_tooltip: e.target.checked })}
                  className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-900"
                />
                <span className="text-zinc-300">
                  {t('config_modal.show_as_tooltip')}
                </span>
              </label>
              <InfoTooltip text={helpTooltip} />
              <span className="text-xs text-zinc-500">
                {t('config_modal.show_as_tooltip_hint')}
              </span>
            </div>
          )}

          {col.type === 'checkbox_group' && (
            <div className="pl-8 flex flex-col gap-2 text-sm border-l border-zinc-800/50 ml-2 py-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-zinc-500 text-xs shrink-0">
                  {t('config_modal.reset_policy')}
                </span>
                <select
                  value={col.reset_policy ?? 'turn_start'}
                  onChange={(e) => updateColumn(col.key, { reset_policy: e.target.value as ColumnConfig['reset_policy'] })}
                  className={`${inputClass} min-w-[10rem]`}
                >
                  <option value="turn_start">{t('config_modal.reset_turn_start')}</option>
                  <option value="round_start">{t('config_modal.reset_round_start')}</option>
                  <option value="manual">{t('config_modal.reset_manual')}</option>
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-zinc-500 text-xs shrink-0">
                  {t('config_modal.display_style')}
                </span>
                <select
                  value={col.display_style ?? 'badge'}
                  onChange={(e) => updateColumn(col.key, { display_style: e.target.value as ColumnConfig['display_style'] })}
                  className={`${inputClass} min-w-[10rem]`}
                >
                  <option value="badge">
                    {t('config_modal.display_style_badge')}
                  </option>
                  <option value="dot">{t('config_modal.display_style_dot')}</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <span className="text-zinc-500 text-xs">
                  {t('config_modal.checkbox_items')}
                </span>
                {(col.items ?? []).map((item, itemIdx) => (
                  <div key={`${col.key}-item-${itemIdx}`} className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={item.id}
                      onChange={(e) => {
                        const next = [...(col.items ?? [])];
                        next[itemIdx] = { ...item, id: e.target.value };
                        updateColumn(col.key, { items: next });
                      }}
                      className={`${inputClass} w-24 font-mono`}
                      placeholder={t('config_modal.item_id')}
                    />
                    <input
                      type="text"
                      value={item.label}
                      onChange={(e) => {
                        const next = [...(col.items ?? [])];
                        next[itemIdx] = { ...item, label: e.target.value };
                        updateColumn(col.key, { items: next });
                      }}
                      className={`${inputClass} w-14`}
                      placeholder={t('config_modal.item_label')}
                    />
                    <input
                      type="color"
                      value={item.color}
                      onChange={(e) => {
                        const next = [...(col.items ?? [])];
                        next[itemIdx] = { ...item, color: e.target.value };
                        updateColumn(col.key, { items: next });
                      }}
                      className="w-9 h-8 rounded bg-zinc-800 border border-zinc-700 cursor-pointer shrink-0"
                      title={t('config_modal.item_color')}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const next = (col.items ?? []).filter((_, i) => i !== itemIdx);
                        updateColumn(col.key, { items: next });
                      }}
                      className="p-1 text-zinc-600 hover:text-red-400 transition-colors"
                      title={t('config_modal.remove_field')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => {
                    const cur = col.items ?? [];
                    const nextIdx = cur.length + 1;
                    updateColumn(col.key, {
                      items: [
                        ...cur,
                        {
                          id: `res${nextIdx}`,
                          label: String(nextIdx),
                          color: '#a3a3a3',
                        },
                      ],
                    });
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-800/80 text-zinc-400 hover:text-emerald-400 text-xs"
                >
                  <Plus size={14} /> {t('config_modal.add_checkbox_item')}
                </button>
              </div>
            </div>
          )}

          {expertMode && mechanicsTypes.has(col.type ?? 'number') && (
            <div className="pl-8 flex flex-col gap-3 text-sm border-l border-amber-900/40 ml-2 py-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-amber-500/80 uppercase tracking-wider">
                <span>{t('config.columns.mechanics_title')}</span>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <label
                  className="flex items-center gap-2 cursor-pointer"
                  title={t('config.columns.mechanics_readonly_hint')}
                >
                  <input
                    type="checkbox"
                    checked={col.is_readonly === true}
                    onChange={(e) => updateColumn(col.key, { is_readonly: e.target.checked })}
                    className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-900"
                  />
                  <span className="text-zinc-400">
                    {t('config.columns.mechanics_readonly')}
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={col.is_rollable === true}
                    onChange={(e) =>
                      updateColumn(col.key, {
                        is_rollable: e.target.checked,
                        roll_formula: e.target.checked ? col.roll_formula : undefined,
                      })
                    }
                    className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-900"
                  />
                  <span className="text-zinc-400">
                    {t('config.columns.mechanics_rollable')}
                  </span>
                </label>

                <label
                  className="flex items-center gap-2 cursor-pointer"
                  title={t('config.columns.mechanics_computed_hint')}
                >
                  <input
                    type="checkbox"
                    checked={col.computed_formula_id !== undefined}
                    onChange={(e) =>
                      updateColumn(col.key, {
                        computed_formula_id: e.target.checked ? (col.computed_formula_id ?? '') : undefined,
                        ...(e.target.checked ? { is_readonly: true } : {}),
                      })
                    }
                    className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-900"
                  />
                  <span className="text-zinc-400">
                    {t('config.columns.mechanics_computed')}
                  </span>
                </label>
              </div>

              {col.is_rollable === true && (
                <label className="flex flex-col gap-1 max-w-md">
                  <span className="text-xs text-zinc-500">
                    {t('config.columns.mechanics_roll_formula')}
                  </span>
                  <input
                    type="text"
                    value={col.roll_formula ?? ''}
                    onChange={(e) =>
                      updateColumn(col.key, { roll_formula: e.target.value.trim() || undefined })
                    }
                    placeholder={t('config.columns.mechanics_roll_formula_placeholder')}
                    className={`${inputClass} font-mono`}
                  />
                  <span className="text-[10px] text-zinc-600">
                    {t('config.columns.mechanics_roll_formula_hint')}
                  </span>
                </label>
              )}

              {col.computed_formula_id !== undefined && (
                <label
                  className="flex flex-col gap-1 max-w-md"
                  title={t('config.columns.mechanics_computed_hint')}
                >
                  <span className="text-xs text-zinc-500">
                    {t('config.columns.mechanics_computed_formula_id')}
                  </span>
                  <input
                    type="text"
                    value={col.computed_formula_id ?? ''}
                    onChange={(e) =>
                      updateColumn(col.key, {
                        computed_formula_id: e.target.value.trim() || '',
                      })
                    }
                    placeholder={t('config.columns.mechanics_computed_formula_placeholder')}
                    className={`${inputClass} font-mono`}
                  />
                  <span className="text-[10px] text-zinc-600">
                    {t('config.columns.mechanics_computed_hint')}
                  </span>
                </label>
              )}
            </div>
          )}

          {expertMode && (
            <div className="pl-8 flex flex-wrap items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 uppercase tracking-wider w-full">
                <span>{t('config_modal.expert_mode')}</span>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-zinc-500 text-xs flex items-center gap-1.5">
                  <span>{t('config_modal.min_value')}</span>
                  <InfoTooltip text={helpMinMax} />
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={col.min_key ?? ''}
                    onChange={(e) => updateColumn(col.key, { min_key: e.target.value.trim() || undefined })}
                    placeholder={t('config_modal.min_key_placeholder')}
                    className={`${inputClass} w-28 font-mono`}
                  />
                  <input
                    type="number"
                    value={col.min_value ?? ''}
                    onChange={(e) =>
                      updateColumn(col.key, {
                        min_value: e.target.value === '' ? undefined : parseInt(e.target.value, 10) || undefined,
                      })
                    }
                    placeholder={t('config_modal.static_limit')}
                    className={`${inputClass} w-16`}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-zinc-500 text-xs flex items-center gap-1.5">
                  <span>{t('config_modal.max_value')}</span>
                  <InfoTooltip text={helpMinMax} />
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={col.max_key ?? col.maxKey ?? ''}
                    onChange={(e) => updateColumn(col.key, { max_key: e.target.value.trim() || undefined })}
                    placeholder={t('config_modal.max_key_placeholder')}
                    className={`${inputClass} w-28 font-mono`}
                  />
                  <input
                    type="number"
                    value={col.max_value ?? ''}
                    onChange={(e) =>
                      updateColumn(col.key, {
                        max_value: e.target.value === '' ? undefined : parseInt(e.target.value, 10) || undefined,
                      })
                    }
                    placeholder={t('config_modal.static_limit')}
                    className={`${inputClass} w-16`}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={col.display_as_fraction ?? false}
                  onChange={(e) => updateColumn(col.key, { display_as_fraction: e.target.checked })}
                  className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-900"
                />
                <span className="text-zinc-400 flex items-center gap-1.5">
                  <span>{t('config_modal.display_as_fraction')}</span>
                  <InfoTooltip text={helpFraction} />
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={col.show_in_mini_sheet ?? false}
                  onChange={(e) => updateColumn(col.key, { show_in_mini_sheet: e.target.checked })}
                  className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-900"
                />
                <span className="text-zinc-400 flex items-center gap-1.5">
                  <span>{t('config_modal.show_in_mini_sheet')}</span>
                  <InfoTooltip text={helpMiniSheet} />
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={col.is_advanced ?? false}
                  onChange={(e) => updateColumn(col.key, { is_advanced: e.target.checked })}
                  className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-900"
                />
                <span className="text-zinc-400 flex items-center gap-1.5">
                  <span>{t('config_modal.is_advanced')}</span>
                  <InfoTooltip text={helpAdvanced} />
                </span>
              </label>

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={col.log_changes ?? false}
                    onChange={(e) => updateColumn(col.key, { log_changes: e.target.checked })}
                    className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-900"
                  />
                  <span className="text-zinc-400 flex items-center gap-1.5">
                    <span>{t('config_modal.log_changes')}</span>
                    <InfoTooltip text={helpLog} />
                  </span>
                </label>
                {(col.log_changes ?? false) && (
                  <input
                    type="color"
                    value={col.log_color ?? '#eab308'}
                    onChange={(e) => updateColumn(col.key, { log_color: e.target.value })}
                    className="w-8 h-7 rounded bg-zinc-800 border border-zinc-700 cursor-pointer"
                    title={t('config_modal.log_color')}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      ))}

      <div className="flex items-center gap-2 py-2 mt-2 border-t border-zinc-800">
        <span className="text-xs text-zinc-500 shrink-0">{t('config_modal.add_field')}</span>
        <input
          type="text"
          placeholder={t('config_modal.label_placeholder')}
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          className={`${inputClass} w-28`}
        />
        <input
          type="text"
          placeholder={t('config_modal.key_placeholder')}
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          className={`${inputClass} w-24 font-mono`}
        />
        <button
          type="button"
          onClick={() => {
            const k = newKey.trim();
            const l = newLabel.trim();
            if (!k || !l) return;
            onAddColumn(k, l);
            setNewKey('');
            setNewLabel('');
          }}
          disabled={!newKey || !newLabel}
          className="p-1.5 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors flex items-center justify-center"
          title={t('config_modal.add_column')}
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="flex gap-2 pt-4 border-t border-zinc-800 mt-2">
        <button
          type="button"
          onClick={handleExport}
          className="flex-1 flex items-center justify-center gap-2 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs transition-colors"
        >
          <Download size={14} /> {t('config_modal.export')}
        </button>
        <input type="file" ref={fileInputRef} onChange={handleImport} className="hidden" accept=".json" />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 flex items-center justify-center gap-2 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs transition-colors"
        >
          <Upload size={14} /> {t('config_modal.import')}
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          className="flex-1 flex items-center justify-center gap-2 py-2 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 rounded-lg text-xs transition-colors"
        >
          <Save size={14} /> {t('common.save')}
        </button>
      </div>
    </div>
  );
}

