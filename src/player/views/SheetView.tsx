import React, { useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import type { Actor, ColumnConfig } from '../../types';
import { SystemSheetRenderer } from '../components/sheets/SystemSheetRenderer';
import type { PlayerAuth } from '../types';

interface Props {
  auth: PlayerAuth;
  system: string;
}

export function SheetView({ auth, system }: Props) {
  const [actor, setActor] = useState<Actor | null>(null);
  const [columns, setColumns] = useState<ColumnConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [actorRes, colsRes] = await Promise.all([
        fetch(`/api/player/actor/${auth.actorId}`, {
          headers: { 'X-Player-Token': auth.token },
        }),
        fetch(`/api/systems/${encodeURIComponent(system)}/columns`),
      ]);
      if (!actorRes.ok) throw new Error(actorRes.status === 403 ? 'Токен устарел' : 'Персонаж не найден');
      setActor((await actorRes.json()) as Actor);
      if (colsRes.ok) {
        const colData = (await colsRes.json()) as { columns?: ColumnConfig[] };
        setColumns(colData.columns ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.actorId, auth.token]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={28} className="animate-spin text-zinc-600" />
      </div>
    );
  }

  if (error || !actor) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center px-6">
        <p className="text-zinc-400 text-sm">{error ?? 'Персонаж не найден'}</p>
        <button
          onClick={() => void fetchData()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-800 text-zinc-200 text-sm active:bg-zinc-700"
        >
          <RefreshCw size={14} />
          Повторить
        </button>
      </div>
    );
  }

  return <SystemSheetRenderer actor={actor} columns={columns} systemName={system} />;
}
