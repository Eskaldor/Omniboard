import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Swords, WifiOff } from 'lucide-react';
import type { PlayerAuth, PlayerCharacterSummary } from '../types';
import { CharacterCard } from '../components/CharacterCard';

interface Props {
  onClaim: (actorId: string) => Promise<PlayerAuth>;
}

type LobbyStatus = 'loading' | 'no-campaign' | 'empty' | 'ready' | 'error';

export function LobbyView({ onClaim }: Props) {
  const [characters, setCharacters] = useState<PlayerCharacterSummary[]>([]);
  const [status, setStatus] = useState<LobbyStatus>('loading');
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchLobby = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const [sessRes, lobbyRes] = await Promise.all([
        fetch('/api/player/session'),
        fetch('/api/player/lobby'),
      ]);
      if (!sessRes.ok || !lobbyRes.ok) throw new Error('Server error');
      const sess = (await sessRes.json()) as { active_campaign_id: string | null };
      if (!sess.active_campaign_id) {
        setStatus('no-campaign');
        return;
      }
      const list = (await lobbyRes.json()) as PlayerCharacterSummary[];
      setCharacters(list);
      setStatus(list.length === 0 ? 'empty' : 'ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void fetchLobby();
  }, [fetchLobby]);

  const handleClaim = async (actorId: string) => {
    setClaimingId(actorId);
    setError(null);
    try {
      await onClaim(actorId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка бронирования');
      setClaimingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Header */}
      <div className="px-5 pt-safe pt-6 pb-4 border-b border-zinc-800/80">
        <div className="flex items-center gap-2.5 mb-1">
          <Swords size={20} className="text-amber-400 shrink-0" />
          <h1 className="text-lg font-bold text-zinc-100">Omniboard</h1>
        </div>
        <p className="text-sm text-zinc-500">Выбери своего персонажа</p>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-5">
        {status === 'loading' && (
          <div className="flex justify-center py-12">
            <Loader2 size={28} className="animate-spin text-zinc-600" />
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <WifiOff size={32} className="text-zinc-600" />
            <p className="text-zinc-400 text-sm">Не удалось подключиться к серверу</p>
            <button
              onClick={() => void fetchLobby()}
              className="mt-1 px-4 py-2 rounded-xl bg-zinc-800 text-zinc-200 text-sm active:bg-zinc-700"
            >
              Повторить
            </button>
          </div>
        )}

        {status === 'no-campaign' && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Swords size={32} className="text-zinc-700" />
            <p className="text-zinc-400 text-sm">Мастер ещё не открыл лобби</p>
            <p className="text-zinc-600 text-xs">Дождитесь, когда GM выберет кампанию</p>
            <button
              onClick={() => void fetchLobby()}
              className="mt-3 px-4 py-2 rounded-xl bg-zinc-800 text-zinc-200 text-sm active:bg-zinc-700"
            >
              Обновить
            </button>
          </div>
        )}

        {status === 'empty' && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="text-zinc-400 text-sm">В кампании нет персонажей</p>
          </div>
        )}

        {status === 'ready' && (
          <div className="space-y-3">
            {characters.map((ch) => (
              <CharacterCard
                key={ch.id}
                character={ch}
                onClaim={() => void handleClaim(ch.id)}
                isLoading={claimingId === ch.id}
              />
            ))}
          </div>
        )}

        {error && (
          <p className="mt-4 text-center text-sm text-red-400">{error}</p>
        )}
      </div>
    </div>
  );
}
