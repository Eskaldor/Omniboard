import React, { useState, useEffect } from 'react';
import { X, Plus, Search } from 'lucide-react';
import { Actor } from '../../types';
import { useTranslation } from 'react-i18next';

export function ActorRosterModal({
  systemName,
  onClose,
  onAdd,
}: {
  systemName: string;
  onClose: () => void;
  onAdd: (actor: Actor) => void;
}) {
  const { t } = useTranslation('core', { useSuspense: false });
  const [actors, setActors] = useState<Actor[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch(`/api/systems/${encodeURIComponent(systemName)}/actors`)
      .then((res) => res.json())
      .then((data) => setActors(data))
      .catch((err) => console.error('Failed to fetch actors', err));
  }, [systemName]);

  const filtered = actors.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl h-[600px] flex flex-col overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
          <h3 className="text-lg font-medium text-zinc-100">
            {t('modals.actor_roster_title')} ({systemName})
          </h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 border-b border-zinc-800 bg-zinc-950/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('modals.search_actors')}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="flex-1 p-4 overflow-auto bg-zinc-950">
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((actor) => (
              <div
                key={actor.id}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex items-center gap-3 hover:border-zinc-700 transition-colors"
              >
                <img src={actor.portrait} alt={actor.name} className="w-12 h-12 rounded-lg object-cover" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-zinc-200 truncate">{actor.name}</div>
                  <div className="text-xs text-zinc-500 capitalize">{actor.role}</div>
                </div>
                <button
                  onClick={() => onAdd(actor)}
                  className="p-2 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600 hover:text-white rounded-lg transition-colors"
                  title={t('modals.add_to_combat')}
                >
                  <Plus size={16} />
                </button>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="col-span-2 text-center py-12 text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
                {t('modals.no_actors_in_roster')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
