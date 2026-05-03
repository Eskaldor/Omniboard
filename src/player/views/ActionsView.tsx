import React, { useState } from 'react';
import { Zap, Loader2 } from 'lucide-react';
import type { PlayerAuth } from '../types';
import type { PublicCombatState } from '../types';

interface RollResult {
  total: number;
  formula: string;
  details: string;
}

interface Props {
  auth: PlayerAuth;
  state: PublicCombatState | null;
}

/**
 * Phase 4: полная реализация с макросами из actions.json.
 * Сейчас: кнопки системных действий для актора из WS-стейта.
 */
export function ActionsView({ auth, state }: Props) {
  const [rolling, setRolling] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<RollResult | null>(null);

  const myActor = state?.core.actors.find((a) => a.id === auth.actorId);

  const roll = async (actionId: string, formula: string) => {
    setRolling(actionId);
    setLastResult(null);
    try {
      const res = await fetch(`/api/combat/actors/${auth.actorId}/roll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expression: formula }),
      });
      if (res.ok) {
        const data = (await res.json()) as RollResult;
        setLastResult(data);
      }
    } catch {}
    setRolling(null);
  };

  if (!state) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 size={28} className="animate-spin text-zinc-600" />
      </div>
    );
  }

  if (!myActor) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center px-6">
        <Zap size={32} className="text-zinc-700" />
        <p className="text-zinc-500 text-sm">Твой персонаж не в инициативе</p>
        <p className="text-zinc-600 text-xs">GM добавит тебя в бой при необходимости</p>
      </div>
    );
  }

  // Собираем доступные действия из override актора
  const actionEntries = Object.entries(myActor.actions ?? {}).filter(
    ([, v]) => v?.show_on_panel !== false
  );

  return (
    <div className="px-4 py-5">
      {/* Last roll result */}
      {lastResult && (
        <div className="mb-5 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-center">
          <div className="text-3xl font-bold text-amber-400 tabular-nums">{lastResult.total}</div>
          <div className="text-xs text-zinc-400 mt-0.5">{lastResult.formula}</div>
          {lastResult.details && (
            <div className="text-[11px] text-zinc-500 mt-1">{lastResult.details}</div>
          )}
        </div>
      )}

      {actionEntries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <Zap size={28} className="text-zinc-700" />
          <p className="text-zinc-500 text-sm">Нет доступных действий</p>
          <p className="text-zinc-600 text-xs">
            Действия настраиваются GM в чарнике персонажа
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {actionEntries.map(([id, override]) => {
            const label = override?.custom_name ?? id;
            const formula = override?.custom_formula ?? override?.formula_override ?? `1d20`;
            const isRolling = rolling === id;
            return (
              <button
                key={id}
                onClick={() => void roll(id, formula)}
                disabled={isRolling || rolling !== null}
                className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-zinc-700 bg-zinc-900 px-3 py-4 active:bg-zinc-800 disabled:opacity-50 transition-colors"
              >
                {isRolling ? (
                  <Loader2 size={20} className="animate-spin text-amber-400" />
                ) : (
                  <Zap size={20} className="text-amber-400" />
                )}
                <span className="text-xs font-medium text-zinc-200 text-center leading-tight">
                  {label}
                </span>
                <span className="text-[10px] text-zinc-600">{formula}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
