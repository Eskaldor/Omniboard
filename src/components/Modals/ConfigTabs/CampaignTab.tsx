import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Circle, Loader2, Plus, Users } from 'lucide-react';

interface CampaignInfo {
  id: string;
  system: string;
  player_count: number;
}

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

const SLUG_RE = /^[a-zA-Z0-9_-]+$/;

export function CampaignTab({
  inputClass,
  systemName,
  activeCampaignId,
  onActivate,
}: {
  inputClass: string;
  systemName: string;
  activeCampaignId: string | null;
  onActivate: (id: string | null) => Promise<void>;
}) {
  const [campaigns, setCampaigns] = useState<CampaignInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);

  const [newId, setNewId] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/player/campaigns');
      if (res.ok) setCampaigns((await res.json()) as CampaignInfo[]);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchCampaigns();
  }, [fetchCampaigns, systemName]);

  const handleActivate = async (id: string | null) => {
    setActivating(id ?? '__none__');
    try {
      await onActivate(id);
    } finally {
      setActivating(null);
    }
  };

  const handleCreate = async () => {
    const trimmed = newId.trim();
    if (!trimmed) return;
    if (!SLUG_RE.test(trimmed)) {
      setCreateError('Только латиница, цифры, _ и -');
      return;
    }
    setCreateError(null);
    setCreating(true);
    try {
      const res = await fetch('/api/player/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: trimmed, system: systemName }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { detail?: string };
        setCreateError(err.detail ?? `Ошибка ${res.status}`);
      } else {
        setNewId('');
        await fetchCampaigns();
      }
    } catch {
      setCreateError('Ошибка сети');
    }
    setCreating(false);
  };

  return (
    <div className="space-y-4">
      {/* Active campaign status */}
      <SectionCard
        title="Активная кампания"
        hint="Игроки видят персонажей активной кампании в лобби"
      >
        {activeCampaignId ? (
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
              <span className="text-sm font-mono text-emerald-300">{activeCampaignId}</span>
            </div>
            <button
              onClick={() => void handleActivate(null)}
              disabled={activating !== null}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1 rounded hover:bg-zinc-800 disabled:opacity-50"
            >
              {activating === '__none__' ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                'Деактивировать'
              )}
            </button>
          </div>
        ) : (
          <p className="text-xs text-zinc-500 py-1">
            Нет активной кампании — игроки видят пустое лобби
          </p>
        )}
      </SectionCard>

      {/* Campaigns list */}
      <SectionCard
        title={`Кампании — ${systemName}`}
        hint={
          loading
            ? undefined
            : campaigns.length === 0
              ? 'Создайте первую кампанию ниже'
              : undefined
        }
      >
        {loading ? (
          <div className="flex justify-center py-3">
            <Loader2 size={18} className="animate-spin text-zinc-600" />
          </div>
        ) : campaigns.length === 0 ? (
          <p className="text-xs text-zinc-600 py-1">Нет кампаний для этой системы</p>
        ) : (
          <ul className="space-y-1.5">
            {campaigns.map((c) => {
              const isActive = c.id === activeCampaignId;
              const isActivating = activating === c.id;
              return (
                <li
                  key={c.id}
                  className={[
                    'flex items-center justify-between rounded-lg px-3 py-2 border transition-colors',
                    isActive
                      ? 'border-emerald-700/40 bg-emerald-950/30'
                      : 'border-zinc-800 bg-zinc-900/50',
                  ].join(' ')}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isActive ? (
                      <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                    ) : (
                      <Circle size={14} className="text-zinc-600 shrink-0" />
                    )}
                    <span className="text-sm font-mono text-zinc-200 truncate">{c.id}</span>
                    {c.player_count > 0 && (
                      <span className="flex items-center gap-0.5 text-[10px] text-zinc-500 shrink-0">
                        <Users size={10} />
                        {c.player_count}
                      </span>
                    )}
                  </div>
                  {isActive ? (
                    <span className="text-[10px] uppercase tracking-wide text-emerald-500 shrink-0 px-1">
                      Активна
                    </span>
                  ) : (
                    <button
                      onClick={() => void handleActivate(c.id)}
                      disabled={activating !== null}
                      className="text-xs text-zinc-400 hover:text-zinc-100 px-2 py-0.5 rounded hover:bg-zinc-700 transition-colors shrink-0 disabled:opacity-50"
                    >
                      {isActivating ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        'Активировать'
                      )}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      {/* Create new campaign */}
      <SectionCard title="Новая кампания">
        <div className="flex gap-2">
          <input
            type="text"
            value={newId}
            onChange={(e) => {
              setNewId(e.target.value);
              setCreateError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate();
            }}
            placeholder="id_кампании"
            className={`${inputClass} flex-1 font-mono`}
            disabled={creating}
          />
          <button
            onClick={() => void handleCreate()}
            disabled={creating || !newId.trim()}
            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 rounded-lg text-xs transition-colors disabled:opacity-40"
          >
            {creating ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Plus size={12} />
            )}
            Создать
          </button>
        </div>
        {createError && (
          <p className="text-xs text-red-400">{createError}</p>
        )}
        <p className="text-[11px] text-zinc-600">
          Только латиница, цифры, подчёркивание и дефис. Система привяжется автоматически.
        </p>
      </SectionCard>
    </div>
  );
}
