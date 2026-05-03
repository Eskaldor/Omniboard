import { useState } from 'react';
import type { PlayerAuth } from '../types';

const STORAGE_KEY = 'omniboard_player_claim';

function readStorage(): PlayerAuth | null {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (!s) return null;
    const parsed = JSON.parse(s) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      'token' in (parsed as object) &&
      'actorId' in (parsed as object)
    ) {
      return parsed as PlayerAuth;
    }
  } catch {}
  return null;
}

export function usePlayerAuth() {
  const [auth, setAuth] = useState<PlayerAuth | null>(readStorage);

  const claim = async (actorId: string): Promise<PlayerAuth> => {
    const headers: Record<string, string> = {};
    if (auth?.token) headers['X-Player-Token'] = auth.token;
    const res = await fetch(`/api/player/claim/${actorId}`, {
      method: 'POST',
      headers,
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { detail?: string };
      throw new Error(err.detail ?? 'Claim failed');
    }
    const data = (await res.json()) as { token: string; actor_id: string };
    const newAuth: PlayerAuth = { token: data.token, actorId: data.actor_id };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newAuth));
    setAuth(newAuth);
    return newAuth;
  };

  const unclaim = async (): Promise<void> => {
    if (!auth) return;
    try {
      await fetch(`/api/player/claim/${auth.actorId}`, {
        method: 'DELETE',
        headers: { 'X-Player-Token': auth.token },
      });
    } catch {}
    localStorage.removeItem(STORAGE_KEY);
    setAuth(null);
  };

  return { auth, claim, unclaim };
}
