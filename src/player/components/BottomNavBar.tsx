import React from 'react';
import { User, Zap, Dices, List, ScrollText } from 'lucide-react';
import type { PlayerTab } from '../types';
import { hapticTap } from '../../utils/haptics';

const TABS: { id: PlayerTab; icon: React.ReactNode; label: string }[] = [
  { id: 'sheet', icon: <User size={22} />, label: 'Лист' },
  { id: 'actions', icon: <Zap size={22} />, label: 'Действия' },
  { id: 'dice', icon: <Dices size={22} />, label: 'Кубы' },
  { id: 'initiative', icon: <List size={22} />, label: 'Инициатива' },
  { id: 'log', icon: <ScrollText size={22} />, label: 'Лог' },
];

interface Props {
  active: PlayerTab;
  onChange: (tab: PlayerTab) => void;
}

export function BottomNavBar({ active, onChange }: Props) {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 flex h-16 bg-zinc-900/95 backdrop-blur border-t border-zinc-800">
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            onClick={() => {
              hapticTap('light');
              onChange(tab.id);
            }}
            className={[
              'flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors',
              isActive ? 'text-amber-400' : 'text-zinc-500 active:text-zinc-300',
            ].join(' ')}
          >
            <span className={isActive ? 'text-amber-400' : 'text-zinc-500'}>{tab.icon}</span>
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
