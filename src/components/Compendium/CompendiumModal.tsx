import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Actor } from '../../types';
import { Compendium, CompendiumColumnConfig } from './Compendium';

interface CompendiumModalProps {
  systemName: string;
  systemColumns: CompendiumColumnConfig[];
  onClose: () => void;
  onAdd: (actor: Actor, count: number, keepId?: boolean) => void;
}

export function CompendiumModal({
  systemName,
  systemColumns,
  onClose,
  onAdd,
}: CompendiumModalProps) {
  const [actors, setActors] = useState<Actor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/systems/${encodeURIComponent(systemName)}/actors`)
      .then((r) => r.json())
      .then((data: Actor[]) => setActors(data))
      .catch(() => setActors([]))
      .finally(() => setLoading(false));
  }, [systemName]);

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-4xl h-[80vh] flex flex-col">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 z-10 w-7 h-7 flex items-center justify-center bg-zinc-800 border border-zinc-700 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 transition-colors shadow-lg"
          aria-label="Закрыть"
        >
          <X size={14} />
        </button>

        {loading ? (
          <div className="flex-1 flex items-center justify-center bg-zinc-950 rounded-xl border border-zinc-800">
            <div className="text-zinc-600 text-sm">Загрузка…</div>
          </div>
        ) : (
          <Compendium
            systemName={systemName}
            systemColumns={systemColumns}
            actors={actors}
            onAdd={onAdd}
            className="flex-1"
          />
        )}
      </div>
    </div>
  );
}
