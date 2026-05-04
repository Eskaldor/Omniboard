/**
 * Compendium — roster/bestiary panel for adding NPCs & monsters to the initiative tracker.
 * Data-driven: filter controls are generated from systemColumns.roster_filter config.
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Search,
  ChevronDown,
  Plus,
  Users,
  Skull,
  ArrowUp,
  ArrowDown,
  SlidersHorizontal,
  Download,
  Loader2,
  Swords,
  UserRound,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Actor, ColumnConfig } from '../../types';
import { useCombatState } from '../../contexts/CombatStateContext';

// ─── Extended column type ─────────────────────────────────────────────────────

export interface CompendiumColumnConfig extends ColumnConfig {
  roster_filter?: {
    enabled: boolean;
    filter_type: 'select' | 'text' | 'number';
    /** Optional override label for the filter control */
    label?: string;
  };
}

// ─── Internal types ───────────────────────────────────────────────────────────

type FilterState = Record<string, string | [string, string]>;
type SortDir = 'asc' | 'desc';
type TabId = 'npc' | 'characters';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function roleColor(role: Actor['role']) {
  switch (role) {
    case 'enemy':     return 'bg-red-500';
    case 'ally':      return 'bg-emerald-500';
    case 'character': return 'bg-blue-400';
    default:          return 'bg-zinc-500';
  }
}

function formatStatValue(actor: Actor, col: CompendiumColumnConfig): string {
  const val = actor.stats[col.key];
  if (val === undefined || val === null) return '—';
  if (col.display_as_fraction && col.max_key) {
    const max = actor.stats[col.max_key];
    return max !== undefined ? `${val}/${max}` : String(val);
  }
  return String(val);
}

// ─── DefaultSystemSheetPlaceholder ───────────────────────────────────────────

function DefaultSystemSheetPlaceholder({ actor }: { actor: Actor }) {
  const statEntries = Object.entries(actor.stats).filter(
    ([, v]) => v !== null && v !== undefined && typeof v !== 'object',
  );

  return (
    <div className="p-4 space-y-3">
      {/* Role + initiative row */}
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider border ${
            actor.role === 'enemy'
              ? 'bg-red-500/10 text-red-400 border-red-500/20'
              : actor.role === 'ally'
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : actor.role === 'character'
              ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
              : 'bg-zinc-700/40 text-zinc-400 border-zinc-700'
          }`}
        >
          {actor.role}
        </span>
        <span className="text-xs text-zinc-500">
          Инициатива:{' '}
          <span className="text-zinc-300 font-mono">{actor.initiative}</span>
        </span>
      </div>

      {/* Stats grid */}
      {statEntries.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2 font-medium">
            Характеристики
          </div>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
            {statEntries.map(([key, val]) => (
              <div
                key={key}
                className="bg-zinc-900 rounded-md px-2 py-1.5 flex flex-col items-center border border-zinc-800 hover:border-zinc-700 transition-colors"
              >
                <span className="text-[9px] uppercase text-zinc-600 tracking-wider truncate w-full text-center">
                  {key}
                </span>
                <span className="text-zinc-100 font-semibold text-sm mt-0.5 tabular-nums">
                  {String(val)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Effects */}
      {actor.effects && actor.effects.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-1.5 font-medium">
            Эффекты
          </div>
          <div className="flex flex-wrap gap-1">
            {actor.effects.map((eff) => (
              <span
                key={eff.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20"
              >
                {eff.icon && <span>{eff.icon}</span>}
                {eff.name}
                {eff.duration !== null && (
                  <span className="text-indigo-400/60 text-[9px]">×{eff.duration}</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="pt-1 text-center">
        <span className="text-[10px] text-zinc-700 italic">
          Полный статблок монстра будет здесь
        </span>
      </div>
    </div>
  );
}

// ─── RosterRow ────────────────────────────────────────────────────────────────

interface RosterRowProps {
  actor: Actor;
  columns: CompendiumColumnConfig[];
  onAdd: (actor: Actor, count: number, keepId?: boolean) => void;
  isExpanded: boolean;
  onToggle: () => void;
}

const RosterRow = React.memo(function RosterRow({
  actor,
  columns,
  onAdd,
  isExpanded,
  onToggle,
}: RosterRowProps) {
  const [count, setCount] = useState(1);

  const visibleCols = useMemo(
    () =>
      columns.filter(
        (c) =>
          c.showInTable &&
          c.type !== 'checkbox_group' &&
          actor.stats[c.key] !== undefined &&
          actor.stats[c.key] !== null,
      ),
    [columns, actor.stats],
  );

  const handleCountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value, 10);
    setCount(Number.isFinite(v) && v > 0 ? Math.min(v, 99) : 1);
  }, []);

  const handleAdd = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onAdd(actor, count);
    },
    [actor, count, onAdd],
  );

  return (
    <div
      className={`border rounded-lg overflow-hidden transition-colors duration-150 ${
        isExpanded
          ? 'border-zinc-600 bg-zinc-900'
          : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
      }`}
    >
      {/* Main row */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none hover:bg-zinc-800/40 transition-colors duration-100"
        onClick={onToggle}
        role="button"
        aria-expanded={isExpanded}
      >
        {/* Chevron */}
        <span
          className="text-zinc-600 flex-shrink-0 transition-transform duration-200"
          style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          <ChevronDown size={13} />
        </span>

        {/* Role indicator */}
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${roleColor(actor.role)}`} />

        {/* Name */}
        <span className="font-medium text-zinc-100 text-sm truncate w-40 flex-shrink-0">
          {actor.name}
        </span>

        {/* Dynamic stat columns */}
        <div className="flex-1 flex items-center gap-x-4 gap-y-0 min-w-0 overflow-hidden">
          {visibleCols.map((col) => (
            <div key={col.key} className="flex items-baseline gap-1 flex-shrink-0">
              <span className="text-[9px] text-zinc-600 uppercase tracking-wider hidden xl:block">
                {col.label}
              </span>
              <span className="text-zinc-400 text-xs font-mono tabular-nums">
                {formatStatValue(actor, col)}
              </span>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div
          className="flex items-center gap-1.5 flex-shrink-0 ml-2"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="number"
            min={1}
            max={99}
            value={count}
            onChange={handleCountChange}
            onClick={(e) => e.stopPropagation()}
            className="w-10 bg-zinc-800 border border-zinc-700 rounded text-center text-zinc-200 text-xs py-1 focus:outline-none focus:border-emerald-500 tabular-nums"
            aria-label="Количество"
          />
          <button
            onClick={handleAdd}
            className="p-1.5 bg-emerald-600/15 text-emerald-400 hover:bg-emerald-600 hover:text-white rounded transition-colors duration-150"
            title="Добавить на стол"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Accordion body */}
      <div
        className="overflow-hidden transition-[max-height] duration-200 ease-in-out"
        style={{ maxHeight: isExpanded ? '480px' : '0px' }}
      >
        <div className="border-t border-zinc-800 bg-zinc-950/70">
          <DefaultSystemSheetPlaceholder actor={actor} />
        </div>
      </div>
    </div>
  );
});

// ─── ActorList ────────────────────────────────────────────────────────────────

interface ActorListProps {
  actors: Actor[];
  columns: CompendiumColumnConfig[];
  onAdd: (actor: Actor, count: number, keepId?: boolean) => void;
}

function ActorList({ actors, columns, onAdd }: ActorListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleToggle = useCallback(
    (id: string) => setExpandedId((prev) => (prev === id ? null : id)),
    [],
  );

  if (actors.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
        <Skull size={28} className="mb-3 opacity-30" />
        <p className="text-sm text-zinc-600">Ничего не найдено</p>
        <p className="text-xs text-zinc-700 mt-1">Попробуйте изменить фильтры</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {actors.map((actor) => (
        <RosterRow
          key={actor.id}
          actor={actor}
          columns={columns}
          onAdd={onAdd}
          isExpanded={expandedId === actor.id}
          onToggle={() => handleToggle(actor.id)}
        />
      ))}
    </div>
  );
}

// ─── DynamicFilterBar ─────────────────────────────────────────────────────────

interface DynamicFilterBarProps {
  columns: CompendiumColumnConfig[];
  allActors: Actor[];
  filters: FilterState;
  onFilterChange: (key: string, value: string | [string, string]) => void;
  sortKey: string | null;
  sortDir: SortDir;
  onSortKeyChange: (key: string) => void;
  onSortDirToggle: () => void;
}

function DynamicFilterBar({
  columns,
  allActors,
  filters,
  onFilterChange,
  sortKey,
  sortDir,
  onSortKeyChange,
  onSortDirToggle,
}: DynamicFilterBarProps) {
  const filterCols = useMemo(
    () => columns.filter((c) => c.roster_filter?.enabled),
    [columns],
  );

  const sortableCols = useMemo(
    () =>
      columns.filter(
        (c) =>
          c.showInTable &&
          (c.type === 'number' || c.type === 'fraction' || c.type === undefined || c.type === null),
      ),
    [columns],
  );

  const hasAnyControl = filterCols.length > 0 || sortableCols.length > 0;
  if (!hasAnyControl) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {/* Dynamic filter controls */}
      {filterCols.map((col) => {
        const ft = col.roster_filter!.filter_type;
        const label = col.roster_filter?.label ?? col.label;

        if (ft === 'select') {
          const options = Array.from(
            new Set(
              allActors
                .map((a) => a.stats[col.key])
                .filter((v) => v !== undefined && v !== null && v !== '')
                .map(String),
            ),
          ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

          return (
            <FilterControl key={col.key} label={label}>
              <select
                value={(filters[col.key] as string) ?? ''}
                onChange={(e) => onFilterChange(col.key, e.target.value)}
                className={selectClass}
              >
                <option value="">Все</option>
                {options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </FilterControl>
          );
        }

        if (ft === 'text') {
          return (
            <FilterControl key={col.key} label={label}>
              <input
                type="text"
                value={(filters[col.key] as string) ?? ''}
                onChange={(e) => onFilterChange(col.key, e.target.value)}
                placeholder="…"
                className={inputClass + ' w-24'}
              />
            </FilterControl>
          );
        }

        if (ft === 'number') {
          const [minV = '', maxV = ''] = (filters[col.key] as [string, string]) ?? [];
          return (
            <FilterControl key={col.key} label={label}>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={minV}
                  onChange={(e) => onFilterChange(col.key, [e.target.value, maxV])}
                  placeholder="от"
                  className={inputClass + ' w-14 text-center'}
                />
                <span className="text-zinc-600 text-xs">–</span>
                <input
                  type="number"
                  value={maxV}
                  onChange={(e) => onFilterChange(col.key, [minV, e.target.value])}
                  placeholder="до"
                  className={inputClass + ' w-14 text-center'}
                />
              </div>
            </FilterControl>
          );
        }

        return null;
      })}

      {/* Sort controls */}
      {sortableCols.length > 0 && (
        <div className="ml-auto flex items-center gap-1.5">
          <SlidersHorizontal size={12} className="text-zinc-600 flex-shrink-0" />
          <select
            value={sortKey ?? ''}
            onChange={(e) => onSortKeyChange(e.target.value)}
            className={selectClass}
          >
            <option value="">По имени</option>
            {sortableCols.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <button
            onClick={onSortDirToggle}
            className={`p-1.5 rounded border transition-colors duration-150 ${
              sortDir === 'asc'
                ? 'border-emerald-600/60 text-emerald-400 bg-emerald-600/10 hover:bg-emerald-600/20'
                : 'border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
            }`}
            title={sortDir === 'asc' ? 'По возрастанию' : 'По убыванию'}
          >
            {sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
          </button>
        </div>
      )}
    </div>
  );
}

// Shared input class fragments
const inputClass =
  'bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 ' +
  'placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500 ' +
  'hover:border-zinc-600 transition-colors tabular-nums';

const selectClass =
  'bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-300 ' +
  'focus:outline-none focus:border-emerald-500 hover:border-zinc-600 ' +
  'transition-colors cursor-pointer';

function FilterControl({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-zinc-600 uppercase tracking-wider whitespace-nowrap select-none">
        {label}
      </span>
      {children}
    </div>
  );
}

// ─── CharactersTab ────────────────────────────────────────────────────────────

type ImportSource = 'roster' | 'combat';

interface CharactersTabProps {
  onAdd: (actor: Actor, count: number, keepId?: boolean) => void;
}

function CharactersTab({ onAdd }: CharactersTabProps) {
  const { state } = useCombatState();
  const activeCampaignId = state?.session?.active_campaign_id ?? null;
  const combatActors = state?.core?.actors ?? [];

  const [campaignChars, setCampaignChars] = useState<Actor[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create form
  const [createName, setCreateName] = useState('');
  const [createRole, setCreateRole] = useState<Actor['role']>('character');
  const [creating, setCreating] = useState(false);

  // Import panel
  const [importOpen, setImportOpen] = useState(false);
  const [importSource, setImportSource] = useState<ImportSource>('roster');
  const [importActorId, setImportActorId] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [rosterActors, setRosterActors] = useState<Actor[]>([]);

  const fetchChars = useCallback(async () => {
    if (!activeCampaignId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/player/characters');
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setCampaignChars(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [activeCampaignId]);

  useEffect(() => { fetchChars(); }, [fetchChars]);

  // Load roster actors for import picker
  useEffect(() => {
    if (!importOpen || importSource !== 'roster') return;
    fetch('/api/actors')
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then(setRosterActors)
      .catch(() => setRosterActors([]));
  }, [importOpen, importSource]);

  const handleCreate = useCallback(async () => {
    const name = createName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch('/api/player/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, role: createRole }),
      });
      if (!res.ok) throw new Error(await res.text());
      const actor: Actor = await res.json();
      setCampaignChars((prev) => [...prev, actor]);
      setCreateName('');
      onAdd(actor, 1, true);
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  }, [createName, createRole, onAdd]);

  const handleImport = useCallback(async () => {
    if (!importActorId) return;
    setImportLoading(true);
    try {
      const res = await fetch('/api/player/characters/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor_id: importActorId, source: importSource }),
      });
      if (!res.ok) throw new Error(await res.text());
      const actor: Actor = await res.json();
      setCampaignChars((prev) => {
        if (prev.some((a) => a.id === actor.id)) return prev;
        return [...prev, actor];
      });
      setImportActorId('');
      setImportOpen(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setImportLoading(false);
    }
  }, [importActorId, importSource]);

  if (!activeCampaignId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20 text-zinc-600 select-none">
        <Users size={36} className="mb-4 opacity-20" />
        <p className="text-sm font-medium text-zinc-500">Нет активной кампании</p>
        <p className="text-xs text-zinc-700 mt-1.5">Активируйте кампанию в Настройках → Кампании</p>
      </div>
    );
  }

  const importPickerActors = importSource === 'combat' ? combatActors : rosterActors;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* ── Create form ── */}
      <div className="px-4 pt-4 pb-3 border-b border-zinc-800/80 space-y-2">
        <div className="text-[10px] uppercase tracking-widest text-zinc-600 font-medium flex items-center gap-1.5">
          <UserRound size={11} />
          Новый персонаж
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Имя персонажа…"
            className={inputClass + ' flex-1'}
          />
          <select
            value={createRole}
            onChange={(e) => setCreateRole(e.target.value as Actor['role'])}
            className={selectClass}
          >
            <option value="character">Игрок</option>
            <option value="ally">Союзник</option>
            <option value="enemy">Враг</option>
          </select>
          <button
            onClick={handleCreate}
            disabled={!createName.trim() || creating}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-emerald-600/15 text-emerald-400 hover:bg-emerald-600 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-xs font-medium"
          >
            {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            Создать
          </button>
        </div>
      </div>

      {/* ── Import panel ── */}
      <div className="px-4 py-2.5 border-b border-zinc-800/50">
        <button
          onClick={() => setImportOpen((o) => !o)}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <Download size={12} />
          Импортировать из…
          <ChevronDown
            size={11}
            className="transition-transform duration-150"
            style={{ transform: importOpen ? 'rotate(180deg)' : 'rotate(0)' }}
          />
        </button>

        {importOpen && (
          <div className="mt-2.5 space-y-2">
            {/* Source toggle */}
            <div className="flex items-center gap-1 bg-zinc-900 rounded-lg p-0.5 w-fit">
              {(['roster', 'combat'] as ImportSource[]).map((src) => (
                <button
                  key={src}
                  onClick={() => { setImportSource(src); setImportActorId(''); }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    importSource === src
                      ? 'bg-zinc-700 text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {src === 'roster' ? <Users size={11} /> : <Swords size={11} />}
                  {src === 'roster' ? 'Ростер' : 'Бой'}
                </button>
              ))}
            </div>

            {/* Actor picker */}
            <div className="flex items-center gap-2">
              <select
                value={importActorId}
                onChange={(e) => setImportActorId(e.target.value)}
                className={selectClass + ' flex-1'}
              >
                <option value="">— выберите персонажа —</option>
                {importPickerActors.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <button
                onClick={handleImport}
                disabled={!importActorId || importLoading}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-blue-600/15 text-blue-400 hover:bg-blue-600 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-xs font-medium"
              >
                {importLoading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                Добавить
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Campaign characters list ── */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
        {error && (
          <p className="text-xs text-red-400 px-1 mb-2">{error}</p>
        )}
        {loading ? (
          <div className="flex justify-center py-10 text-zinc-600">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : campaignChars.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-zinc-600 select-none">
            <Users size={28} className="mb-3 opacity-20" />
            <p className="text-sm text-zinc-600">Нет персонажей</p>
            <p className="text-xs text-zinc-700 mt-1">Создайте или импортируйте выше</p>
          </div>
        ) : (
          campaignChars.map((actor) => (
            <div
              key={actor.id}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-800 bg-zinc-900 hover:border-zinc-700 transition-colors"
            >
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${roleColor(actor.role)}`} />
              <span className="flex-1 text-sm text-zinc-100 truncate">{actor.name}</span>
              <span className="text-[9px] text-zinc-600 uppercase tracking-wider mr-1">
                {actor.role === 'character' ? 'игрок' : actor.role === 'ally' ? 'союзник' : 'враг'}
              </span>
              <button
                onClick={() => onAdd(actor, 1, true)}
                className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-600/12 text-emerald-400 hover:bg-emerald-600 hover:text-white transition-colors text-xs"
                title="Добавить в бой"
              >
                <Swords size={11} />
                В бой
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Compendium (root export) ─────────────────────────────────────────────────

export interface CompendiumProps {
  systemName: string;
  systemColumns: CompendiumColumnConfig[];
  actors: Actor[];
  onAdd: (actor: Actor, count: number, keepId?: boolean) => void;
  className?: string;
}

export function Compendium({
  systemName,
  systemColumns,
  actors,
  onAdd,
  className = '',
}: CompendiumProps) {
  useTranslation('core', { useSuspense: false });

  const [activeTab, setActiveTab] = useState<TabId>('npc');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<FilterState>({});
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleFilterChange = useCallback(
    (key: string, value: string | [string, string]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleSortKeyChange = useCallback((key: string) => {
    setSortKey(key || null);
    setSortDir('asc');
  }, []);

  const handleSortDirToggle = useCallback(() => {
    setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
  }, []);

  const filteredActors = useMemo(() => {
    let result = actors;

    // Name search
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter((a) => a.name.toLowerCase().includes(q));
    }

    // Column filters
    for (const col of systemColumns) {
      if (!col.roster_filter?.enabled) continue;
      const val = filters[col.key];
      if (!val) continue;

      const ft = col.roster_filter.filter_type;

      if (ft === 'select' || ft === 'text') {
        const fq = (val as string).toLowerCase();
        if (!fq) continue;
        result = result.filter((a) => {
          const sv = a.stats[col.key];
          return sv !== undefined && String(sv).toLowerCase().includes(fq);
        });
      } else if (ft === 'number') {
        const [minStr = '', maxStr = ''] = val as [string, string];
        const min = minStr !== '' ? parseFloat(minStr) : null;
        const max = maxStr !== '' ? parseFloat(maxStr) : null;
        if (min === null && max === null) continue;
        result = result.filter((a) => {
          const n = parseFloat(a.stats[col.key]);
          if (!Number.isFinite(n)) return true;
          if (min !== null && n < min) return false;
          if (max !== null && n > max) return false;
          return true;
        });
      }
    }

    // Sort
    result = [...result].sort((a, b) => {
      let va: unknown;
      let vb: unknown;
      if (sortKey) {
        va = a.stats[sortKey] ?? null;
        vb = b.stats[sortKey] ?? null;
      } else {
        va = a.name;
        vb = b.name;
      }
      const cmp =
        typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : String(va ?? '').localeCompare(String(vb ?? ''), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [actors, search, filters, systemColumns, sortKey, sortDir]);

  const tabs: { id: TabId; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'npc', label: 'НПС', icon: <Skull size={15} />, count: actors.length },
    { id: 'characters', label: 'Персонажи', icon: <Users size={15} /> },
  ];

  return (
    <div
      className={`flex h-full bg-zinc-950 text-zinc-200 overflow-hidden rounded-xl border border-zinc-800 shadow-2xl ${className}`}
    >
      {/* ── Left sidebar ─────────────────────────────────────────────────── */}
      <aside className="w-[148px] flex-shrink-0 border-r border-zinc-800 flex flex-col bg-zinc-900/60 backdrop-blur-sm">
        {/* System badge */}
        <div className="px-3 pt-3 pb-2.5 border-b border-zinc-800/80">
          <div className="text-[9px] uppercase tracking-widest text-zinc-600 mb-0.5 font-medium">
            Система
          </div>
          <div
            className="text-xs font-semibold text-zinc-300 truncate leading-snug"
            title={systemName}
          >
            {systemName}
          </div>
        </div>

        {/* Navigation tabs */}
        <nav className="flex flex-col gap-0.5 p-2 flex-1" aria-label="Разделы компендиума">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-left transition-all duration-150 group ${
                  isActive
                    ? 'bg-emerald-600/12 text-emerald-300 border border-emerald-600/25 shadow-sm'
                    : 'text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200 border border-transparent'
                }`}
              >
                <span
                  className={`flex-shrink-0 transition-colors ${
                    isActive ? 'text-emerald-400' : 'text-zinc-600 group-hover:text-zinc-400'
                  }`}
                >
                  {tab.icon}
                </span>
                <span className="font-medium truncate">{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Result count */}
        <div className="px-3 py-2.5 border-t border-zinc-800/80 text-center">
          <span className="text-[10px] text-zinc-700 tabular-nums">
            {activeTab === 'npc' ? (
              <>
                <span className="text-zinc-500">{filteredActors.length}</span>
                {filteredActors.length !== actors.length && (
                  <span className="text-zinc-700"> / {actors.length}</span>
                )}
              </>
            ) : (
              <span className="text-zinc-700">—</span>
            )}
          </span>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {activeTab === 'characters' ? (
          <CharactersTab onAdd={onAdd} />
        ) : (
          <>
            {/* Search */}
            <div className="px-4 pt-4 pb-3 border-b border-zinc-800/80">
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск по имени…"
                  className={
                    'w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-2 ' +
                    'text-sm text-zinc-200 placeholder:text-zinc-600 ' +
                    'focus:outline-none focus:border-emerald-600 focus:bg-zinc-800/50 ' +
                    'hover:border-zinc-700 transition-colors duration-150'
                  }
                />
              </div>
            </div>

            {/* Filter bar */}
            <div className="px-4 py-2.5 border-b border-zinc-800/50 bg-zinc-900/20 min-h-[42px] flex items-center">
              <DynamicFilterBar
                columns={systemColumns}
                allActors={actors}
                filters={filters}
                onFilterChange={handleFilterChange}
                sortKey={sortKey}
                sortDir={sortDir}
                onSortKeyChange={handleSortKeyChange}
                onSortDirToggle={handleSortDirToggle}
              />
            </div>

            {/* Actor list */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
              <ActorList
                actors={filteredActors}
                columns={systemColumns}
                onAdd={onAdd}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
