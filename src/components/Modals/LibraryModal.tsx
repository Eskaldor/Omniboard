import React, { useState, useEffect, useMemo } from 'react';
import { X, Upload, Trash2, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { slugify } from 'transliteration';
import type { Effect } from '../../types';

export function LibraryModal({
  onClose,
  onSelect,
  systemName,
  initialTab,
  searchQuery: initialSearchQuery = '',
}: {
  onClose: () => void;
  onSelect?: (url: string) => void;
  systemName: string;
  initialTab?: 'portraits' | 'frames' | 'effects';
  searchQuery?: string;
}) {
  const { t } = useTranslation('core', { useSuspense: false });
  const [activeTab, setActiveTab] = useState<'portraits' | 'frames' | 'effects'>(initialTab ?? 'portraits');
  const [assets, setAssets] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [baseEffectIcons, setBaseEffectIcons] = useState<Set<string>>(new Set());
  const [isUploading, setIsUploading] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [technicalId, setTechnicalId] = useState('');
  const [isCustomId, setIsCustomId] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSearchQuery(initialSearchQuery);
  }, [initialSearchQuery]);

  const fetchAssets = () => {
    fetch(`/api/assets/${activeTab}?system=${encodeURIComponent(systemName)}`)
      .then((res) => res.json())
      .then((data) => setAssets(Array.isArray(data) ? data : []))
      .catch((err) => console.error('Failed to fetch assets', err));
  };

  useEffect(() => {
    setActiveTab((prev) => initialTab ?? prev);
  }, [initialTab]);

  useEffect(() => {
    fetchAssets();
  }, [activeTab, systemName]);

  useEffect(() => {
    if (activeTab !== 'effects' || !systemName) return;
    fetch(`/api/systems/${encodeURIComponent(systemName)}/effects`)
      .then((res) => res.json())
      .then((data: Effect[]) => {
        const set = new Set<string>();
        (Array.isArray(data) ? data : []).forEach((e) => {
          if (e.is_base && e.icon) set.add(e.icon.split('/').pop() || e.icon);
        });
        setBaseEffectIcons(set);
      })
      .catch(() => setBaseEffectIcons(new Set()));
  }, [activeTab, systemName]);

  const isBaseAsset = (url: string) => {
    const filename = url.split('/').pop() || '';
    return baseEffectIcons.has(filename);
  };

  const filteredAssets = useMemo(() => {
    if (!searchQuery.trim()) return assets;
    const q = searchQuery.toLowerCase().trim();
    return assets.filter((url) => {
      const filename = url.split('/').pop() || '';
      const nameWithoutExt = filename.replace(/\.[^.]+$/, '');
      return filename.toLowerCase().includes(q) || nameWithoutExt.toLowerCase().includes(q);
    });
  }, [assets, searchQuery]);

  const handleDisplayNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDisplayName(val);
    if (!isCustomId) {
      setTechnicalId(slugify(val, { separator: '_' }));
    }
  };

  const handleTechnicalIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTechnicalId(e.target.value);
    setIsCustomId(true);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();

    if (technicalId) {
      const ext = file.name.split('.').pop();
      const newFile = new File([file], `${technicalId}.${ext}`, { type: file.type });
      formData.append('file', newFile);
    } else {
      formData.append('file', file);
    }

    setIsUploading(true);
    try {
      const res = await fetch(`/api/assets/${activeTab}?system=${encodeURIComponent(systemName)}`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      const newUrl = data?.url;
      fetchAssets();
      setDisplayName('');
      setTechnicalId('');
      setIsCustomId(false);
      if (onSelect && initialTab === 'effects' && newUrl) {
        onSelect(newUrl);
        onClose();
      }
    } catch (err) {
      console.error('Upload failed', err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (url: string) => {
    if (isBaseAsset(url) || !confirm('Delete this asset?')) return;
    const filename = url.split('/').pop();
    const isDefault = url.includes('/assets/default/');
    const queryParam = isDefault ? '' : `?system=${encodeURIComponent(systemName)}`;
    try {
      await fetch(`/api/assets/${activeTab}/${filename}${queryParam}`, { method: 'DELETE' });
      fetchAssets();
    } catch (err) {
      console.error('Delete failed', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl h-[600px] flex flex-col overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
          <h3 className="text-lg font-medium text-zinc-100">{t('modals.asset_library')}</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-100">
            <X size={20} />
          </button>
        </div>

        <div className="flex justify-between items-center border-b border-zinc-800 bg-zinc-950/50 px-4">
          <div className="flex">
            {(['portraits', 'frames', 'effects'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 text-sm font-medium capitalize border-b-2 transition-colors ${
                  activeTab === tab ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {t(`library.tab_${tab}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-zinc-900 border-b border-zinc-800 p-4 flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">
              {t('library.search_assets')}
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('library.search_placeholder')}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">
              {t('library.display_name_label')}
            </label>
            <input
              type="text"
              value={displayName}
              onChange={handleDisplayNameChange}
              placeholder={t('library.placeholder_display')}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">
              {t('library.technical_id_label')}
            </label>
            <input
              type="text"
              value={technicalId}
              onChange={handleTechnicalIdChange}
              placeholder={t('modals.technical_id_placeholder')}
              className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div className="pb-0.5">
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || (!onSelect && !technicalId && activeTab === 'effects')}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Upload size={16} /> {isUploading ? t('library.uploading') : t('library.upload')}
            </button>
          </div>
        </div>

        <div className="flex-1 p-6 overflow-auto bg-zinc-950">
          <div className="grid grid-cols-4 gap-4">
            {filteredAssets.map((url, i) => {
              const base = isBaseAsset(url);
              return (
                <div
                  key={url}
                  onClick={() => onSelect && onSelect(url)}
                  className={`aspect-square bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-center overflow-hidden group relative ${
                    onSelect ? 'cursor-pointer hover:border-emerald-500' : ''
                  }`}
                >
                  <img src={url} alt="Asset" className="w-full h-full object-cover" />
                  {base && (
                    <div className="absolute top-2 left-2 p-1 bg-amber-500/90 rounded text-white" title={t('library.base_effect_locked')}>
                      <Lock size={14} />
                    </div>
                  )}
                  {onSelect && (
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <span className="text-xs font-medium text-white">{t('library.select')}</span>
                    </div>
                  )}
                  {!onSelect && (
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!base && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(url);
                          }}
                          className="p-1.5 bg-red-500/80 text-white rounded-md hover:bg-red-500 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {filteredAssets.length === 0 && assets.length > 0 && (
              <div className="col-span-4 flex flex-col items-center justify-center py-12 text-zinc-500 border border-dashed border-zinc-800 rounded-xl gap-3">
                <span>{t('library.no_assets_found')}</span>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="px-4 py-2 text-sm font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  {t('library.clear_search')}
                </button>
              </div>
            )}
            {assets.length === 0 && (
              <div className="col-span-4 text-center py-12 text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
                {t('library.no_assets_upload_some')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
