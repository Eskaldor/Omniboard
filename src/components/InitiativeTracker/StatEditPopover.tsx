import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Dices } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Actor, ColumnConfig } from '../../types';
import {
  buildQuickRollExpression,
  getStatNumeric,
  parseStatValueDraft,
  type StatOverrideDraft,
  type StatValueDraft,
} from '../../utils/stats';

function clampPopoverPosition(rect: DOMRect, popW: number, popH: number) {
  const pad = 8;
  let top = rect.bottom + pad + window.scrollY;
  let left = rect.left + window.scrollX;
  const maxL = window.scrollX + window.innerWidth - popW - pad;
  const maxT = window.scrollY + window.innerHeight - popH - pad;
  if (left > maxL) left = Math.max(pad + window.scrollX, maxL);
  if (top > maxT) top = Math.max(pad + window.scrollY, rect.top + window.scrollY - popH - pad);
  return { top, left };
}

interface StatEditPanelProps {
  columnKey: string;
  columnLabel: string;
  actorId: string;
  draft: StatValueDraft;
  anchorRect: DOMRect;
  systemName: string;
  onClose: () => void;
  onSave: (statsPatch: Record<string, unknown>) => void;
  onRollComplete?: () => void | Promise<void>;
}

function StatEditPanel({
  columnKey,
  columnLabel,
  actorId,
  draft: initialDraft,
  anchorRect,
  systemName,
  onClose,
  onSave,
  onRollComplete,
}: StatEditPanelProps) {
  const { t } = useTranslation('core', { useSuspense: false });
  const [base, setBase] = useState<number>(initialDraft.base);
  const [formulaId, setFormulaId] = useState(initialDraft.formula_id ?? '');
  const [overrides, setOverrides] = useState<StatOverrideDraft[]>(initialDraft.overrides);
  const [newSource, setNewSource] = useState('');
  const [newValue, setNewValue] = useState('');
  const [rolling, setRolling] = useState(false);
  const [rollFlash, setRollFlash] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const removeOverride = useCallback((index: number) => {
    setOverrides((o) => o.filter((_, i) => i !== index));
  }, []);

  const addOverride = useCallback(() => {
    const src = newSource.trim();
    const v = parseFloat(newValue.replace(',', '.'));
    if (!src || Number.isNaN(v)) return;
    setOverrides((o) => [...o, { source: src, value: v }]);
    setNewSource('');
    setNewValue('');
  }, [newSource, newValue]);

  const previewApprox =
    formulaId.trim() !== ''
      ? null
      : Math.round(base + overrides.reduce((s, o) => s + o.value, 0));

  const handleSave = useCallback(() => {
    const fid = formulaId.trim();
    const optimisticValue = fid
      ? initialDraft.value
      : Math.round(base + overrides.reduce((s, o) => s + o.value, 0));
    onSave({
      [columnKey]: {
        base,
        formula_id: fid || null,
        overrides: overrides.map((o) => ({ source: o.source, value: o.value })),
        value: optimisticValue,
      },
    });
    onClose();
  }, [base, columnKey, formulaId, initialDraft.value, onClose, onSave, overrides]);

  const handleRoll = useCallback(async () => {
    const expr = buildQuickRollExpression(systemName, columnKey);
    setRolling(true);
    setRollFlash(null);
    try {
      const res = await fetch(`/api/combat/actors/${encodeURIComponent(actorId)}/roll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expression: expr, is_preroll: false }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        const d = data.detail;
        const msg =
          typeof d === 'string'
            ? d
            : Array.isArray(d)
              ? d.map((x) => (typeof x === 'object' && x && 'msg' in x ? String((x as { msg: unknown }).msg) : String(x))).join('; ')
              : t('stat_editor.roll_failed');
        setRollFlash(msg);
        return;
      }
      const bits = [`${data.total ?? t('stat_editor.unknown_total')}`];
      if (data.details) bits.push(String(data.details));
      if (data.is_crit_glitch === true) bits.push(t('stat_editor.roll_critical_glitch'));
      else if (data.is_glitch === true) bits.push(t('stat_editor.roll_glitch'));
      setRollFlash(bits.join(' — '));
      await onRollComplete?.();
    } catch {
      setRollFlash(t('stat_editor.roll_network_error'));
    } finally {
      setRolling(false);
    }
  }, [actorId, columnKey, onRollComplete, systemName, t]);

  const pos = useMemo(() => {
    const w = 280;
    const h = 360;
    return clampPopoverPosition(anchorRect, w, h);
  }, [anchorRect]);

  const panel = (
    <div
      className="fixed inset-0 z-[1000]"
      style={{ pointerEvents: 'auto' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="absolute z-[1001] w-[280px] rounded-lg border border-zinc-600 bg-zinc-900 p-3 shadow-xl text-xs text-zinc-200"
        style={{ top: pos.top, left: pos.left }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="font-medium text-sm text-zinc-100 mb-2 truncate" title={columnLabel}>
          {columnLabel}
        </div>

        <div className="space-y-2 mb-3">
          <div className="flex justify-between gap-2">
            <span className="text-zinc-500 shrink-0">{t('stat_editor.value_server')}</span>
            <span className="font-mono text-emerald-400 tabular-nums">{initialDraft.value}</span>
          </div>
          {previewApprox != null && (
            <div className="flex justify-between gap-2 text-[10px] text-zinc-500">
              <span>{t('stat_editor.preview_base_overrides')}</span>
              <span className="font-mono text-zinc-400">{previewApprox}</span>
            </div>
          )}
          <label className="block">
            <span className="text-zinc-500">{t('stat_editor.base')}</span>
            <input
              type="number"
              className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-100"
              value={Number.isFinite(base) ? base : 0}
              onChange={(e) => setBase(parseInt(e.target.value, 10) || 0)}
            />
          </label>
          <label className="block">
            <span className="text-zinc-500">{t('stat_editor.formula_id')}</span>
            <input
              type="text"
              className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-100"
              value={formulaId}
              onChange={(e) => setFormulaId(e.target.value)}
              placeholder={t('stat_editor.formula_id_placeholder')}
            />
          </label>
        </div>

        <div className="border-t border-zinc-800 pt-2 mb-2">
          <div className="text-zinc-500 mb-1">{t('stat_editor.overrides')}</div>
          <ul className="max-h-24 overflow-y-auto space-y-1 mb-2">
            {overrides.length === 0 && (
              <li className="text-zinc-600 italic">{t('stat_editor.overrides_none')}</li>
            )}
            {overrides.map((o, i) => (
              <li key={`${o.source}-${i}`} className="flex items-center justify-between gap-1">
                <span className="truncate text-zinc-300">{o.source}</span>
                <span className="font-mono text-zinc-400">{o.value}</span>
                <button
                  type="button"
                  className="text-red-400 hover:text-red-300 px-1"
                  onClick={() => removeOverride(i)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="flex gap-1">
            <input
              type="text"
              placeholder={t('stat_editor.source_placeholder')}
              className="flex-1 min-w-0 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-1"
              value={newSource}
              onChange={(e) => setNewSource(e.target.value)}
            />
            <input
              type="number"
              placeholder={t('stat_editor.value_modifier_placeholder')}
              className="w-14 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-1"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
            />
            <button
              type="button"
              className="rounded bg-zinc-700 px-2 py-1 hover:bg-zinc-600"
              onClick={addOverride}
            >
              {t('common.add')}
            </button>
          </div>
        </div>

        {rollFlash && (
          <div className="mb-2 rounded border border-zinc-700 bg-zinc-950/80 px-2 py-1 text-[11px] text-zinc-400 break-words">
            {rollFlash}
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-t border-zinc-800 pt-2">
          <button
            type="button"
            disabled={rolling}
            className="inline-flex items-center gap-1 rounded bg-indigo-600/80 px-2 py-1.5 text-[11px] hover:bg-indigo-500 disabled:opacity-50"
            onClick={() => void handleRoll()}
          >
            <Dices size={14} />
            {rolling ? t('stat_editor.rolling') : t('stat_editor.roll')}
          </button>
          <button
            type="button"
            className="ml-auto rounded bg-emerald-700 px-3 py-1.5 text-[11px] hover:bg-emerald-600"
            onClick={handleSave}
          >
            {t('common.save')}
          </button>
          <button type="button" className="rounded bg-zinc-700 px-2 py-1.5 text-[11px] hover:bg-zinc-600" onClick={onClose}>
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}

export interface StatNumericCellProps {
  actor: Actor;
  column: ColumnConfig;
  columnLabel: string;
  systemName: string;
  onUpdate: (updates: Partial<Actor>) => void;
  onRollComplete?: () => void | Promise<void>;
  /** tighter layout inside grouped cell */
  compact?: boolean;
}

export function StatNumericCell({
  actor,
  column,
  columnLabel,
  systemName,
  onUpdate,
  onRollComplete,
  compact = false,
}: StatNumericCellProps) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const raw = actor.stats?.[column.key];
  const display = getStatNumeric(raw, 0);

  const openEditor = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    setRect(el.getBoundingClientRect());
    setOpen(true);
  }, []);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          openEditor();
        }}
        className={`rounded border border-zinc-700/80 bg-zinc-950 tabular-nums text-zinc-200 hover:border-emerald-600/60 hover:bg-zinc-900 ${
          compact ? 'px-1 py-0.5 text-[11px] min-w-[2rem]' : 'px-2 py-1 text-sm min-w-[3rem]'
        }`}
      >
        {display}
      </button>
      {open && rect && (
        <StatEditPanel
          columnKey={column.key}
          columnLabel={columnLabel}
          actorId={actor.id}
          draft={parseStatValueDraft(raw)}
          anchorRect={rect}
          systemName={systemName}
          onClose={() => setOpen(false)}
          onSave={(statsSlice) => onUpdate({ stats: statsSlice })}
          onRollComplete={onRollComplete}
        />
      )}
    </>
  );
}
