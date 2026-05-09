import React, { useState } from 'react';
import { BottomNavBar } from './components/BottomNavBar';
import { LobbyView } from './views/LobbyView';
import { SheetView } from './views/SheetView';
import { ActionsView } from './views/ActionsView';
import { DiceView } from './views/DiceView';
import { InitiativeView } from './views/InitiativeView';
import { LogView } from './views/LogView';
import { usePlayerAuth } from './hooks/usePlayerAuth';
import { usePlayerSocket } from './hooks/usePlayerSocket';
import type { PlayerTab } from './types';

export default function PlayerApp() {
  const { auth, claim, unclaim } = usePlayerAuth();
  const { state, isConnected, syncMode, rollRequestStatus } = usePlayerSocket(auth?.token);
  const [tab, setTab] = useState<PlayerTab>('sheet');

  // Не прошли аутентификацию — показываем лобби
  if (!auth) {
    return <LobbyView onClaim={claim} />;
  }

  const system = state?.core.system ?? '';
  const isCombatActive = state?.core?.is_active === true;
  const dotClass = !auth.token || !state || !isCombatActive
    ? 'bg-zinc-600'
    : syncMode === 'ws' && isConnected
      ? 'bg-emerald-500'
      : syncMode === 'http'
        ? 'bg-amber-400'
        : 'bg-zinc-600';
  const dotTitle = !auth.token
    ? 'Нет токена'
    : !state
      ? 'Нет данных'
      : !isCombatActive
        ? 'Бой не активен'
        : syncMode === 'ws' && isConnected
          ? 'Синхронизация: WebSocket'
          : syncMode === 'http'
            ? 'Синхронизация: HTTP fallback'
            : 'Нет соединения';

  return (
    <div className="flex flex-col h-dvh bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* Status bar */}
      <div className="flex items-center justify-between px-4 pt-safe py-2 border-b border-zinc-800/60 shrink-0">
        <span className="text-xs text-zinc-500 truncate max-w-[60%]">
          {system || 'Omniboard'}
        </span>
        <div className="flex items-center gap-2">
          <span
            title={dotTitle}
            className={`w-1.5 h-1.5 rounded-full ${dotClass}`}
          />
          <button
            onClick={() => void unclaim()}
            className="text-[10px] text-zinc-600 active:text-zinc-400 px-1"
          >
            Сменить
          </button>
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto overscroll-contain pb-16">
        {tab === 'sheet' && <SheetView auth={auth} system={system} state={state} />}
        {tab === 'actions' && <ActionsView auth={auth} state={state} rollRequestStatus={rollRequestStatus} />}
        {tab === 'dice' && <DiceView auth={auth} state={state} rollRequestStatus={rollRequestStatus} />}
        {tab === 'initiative' && <InitiativeView state={state} myActorId={auth.actorId} />}
        {tab === 'log' && <LogView auth={auth} state={state} />}
      </main>

      <BottomNavBar active={tab} onChange={setTab} />
    </div>
  );
}
