import React, { useState, useEffect, useMemo } from 'react';
import { X, Upload, Trash2, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { slugify } from 'transliteration';
import type { Effect } from '../../types';
import { ImageCropperModal } from './ImageCropperModal';

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
  const [uploadDimensionWarning, setUploadDimensionWarning] = useState<string | null>(null);
  const [lastUploadedUrlWithWarning, setLastUploadedUrlWithWarning] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pngFormatWarning, setPngFormatWarning] = useState<string | null>(null);
  const [cropperImageSrc, setCropperImageSrc] = useState<string | null>(null);
  const [cropperContext, setCropperContext] = useState<{ tab: typeof activeTab; technicalId: string } | null>(null);
  const [deleteConfirmUrl, setDeleteConfirmUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [technicalId, setTechnicalId] = useState('');
  const [isCustomId, setIsCustomId] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const OPTIMAL_EFFECT_SIZE = { width: 172, height: 320 };

  function loadImageDimensions(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Image load failed'));
      };
      img.src = url;
    });
  }

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

    if (fileInputRef.current) fileInputRef.current.value = '';
    setUploadError(null);
    setUploadDimensionWarning(null);
    setLastUploadedUrlWithWarning(null);
    setPngFormatWarning(null);

    const isImage = file.type.startsWith('image/');
    if (!isImage) {
      setUploadError(t('library.upload_error_not_image'));
      return;
    }

    if ((activeTab === 'effects' || activeTab === 'frames') && file.type !== 'image/png') {
      setPngFormatWarning(t('library.png_transparency_warning'));
    }

    const objectUrl = URL.createObjectURL(file);
    setCropperContext({ tab: activeTab, technicalId });
    setCropperImageSrc(objectUrl);
  };

  const handleCropperClose = () => {
    if (cropperImageSrc) URL.revokeObjectURL(cropperImageSrc);
    setCropperImageSrc(null);
    setCropperContext(null);
  };

  const handleCropComplete = async (blob: Blob) => {
    if (!cropperContext) return;
    const { tab, technicalId: ctxTechnicalId } = cropperContext;
    const baseName = ctxTechnicalId?.trim() || 'image';
    const fileName = `${baseName}.png`;
    const file = new File([blob], fileName, { type: 'image/png' });

    let hasResolutionWarning = false;
    if (tab === 'effects') {
      try {
        const { width, height } = await loadImageDimensions(file);
        if (width !== OPTIMAL_EFFECT_SIZE.width || height !== OPTIMAL_EFFECT_SIZE.height) {
          hasResolutionWarning = true;
          setUploadDimensionWarning(t('library.effect_size_warning'));
        }
      } catch {
        // ignore
      }
    }

    const formData = new FormData();
    formData.append('file', file);

    setIsUploading(true);
    try {
      const res = await fetch(`/api/assets/${tab}?system=${encodeURIComponent(systemName)}`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      const newUrl = data?.url;
      fetchAssets();
      setDisplayName('');
      setTechnicalId('');
      setIsCustomId(false);
      if (onSelect && tab === 'effects' && newUrl) {
        if (hasResolutionWarning) {
          setLastUploadedUrlWithWarning(newUrl);
        } else {
          onSelect(newUrl);
          onClose();
        }
      }
    } catch (err) {
      console.error('Upload failed', err);
      setUploadError(t('library.upload_error_failed'));
    } finally {
      setIsUploading(false);
      handleCropperClose();
    }
  };

  const handleDelete = async (url: string) => {
    if (isBaseAsset(url)) return;
    setDeleteConfirmUrl(url);
  };

  const handleDeleteConfirm = async () => {
    const url = deleteConfirmUrl;
    if (!url) return;
    setDeleteConfirmUrl(null);
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
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl h-[600px] flex flex-col overflow-hidden shadow-2xl">
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

        <div className="bg-zinc-900 border-b border-zinc-800 p-4 flex flex-col gap-2">
          {uploadError && (
            <div className="px-3 py-2 bg-red-500/20 border border-red-500/40 rounded-lg text-red-300 text-sm">
              {uploadError}
            </div>
          )}
          {pngFormatWarning && (
            <div className="px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-200 text-sm">
              {pngFormatWarning}
            </div>
          )}
          <div className="flex gap-4 items-end">
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
              disabled={isUploading}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Upload size={16} /> {isUploading ? t('library.uploading') : t('library.upload')}
            </button>
          </div>
          </div>
        </div>

        {uploadDimensionWarning && (
          <div className="px-4 py-2 bg-amber-500/10 border-t border-amber-500/30 text-amber-200 text-sm flex flex-wrap items-center gap-2">
            <span className="flex-1 min-w-0">{uploadDimensionWarning}</span>
            {onSelect && lastUploadedUrlWithWarning && (
              <button
                type="button"
                onClick={() => {
                  onSelect(lastUploadedUrlWithWarning);
                  setLastUploadedUrlWithWarning(null);
                  setUploadDimensionWarning(null);
                  onClose();
                }}
                className="shrink-0 px-3 py-1.5 bg-amber-500/80 hover:bg-amber-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {t('library.select_anyway')}
              </button>
            )}
          </div>
        )}

        <div className="flex-1 p-6 overflow-auto bg-zinc-950">
          <div className="grid grid-cols-4 gap-4">
            {filteredAssets.map((url, i) => {
              const base = isBaseAsset(url);
              const displayLabel = (() => {
                const filename = url.split('/').pop() ?? '';
                const name = filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
                return name || filename;
              })();
              return (
                <div
                  key={url}
                  onClick={() => onSelect && onSelect(url)}
                  className={`aspect-[9/16] bg-zinc-900 border border-zinc-800 rounded-xl flex flex-col overflow-hidden group relative ${
                    onSelect ? 'cursor-pointer hover:border-emerald-500' : ''
                  }`}
                >
                  <div className="relative flex-1 min-h-0">
                    <img src={url} alt={displayLabel} className="w-full h-full object-cover" />
                    <div className="absolute inset-x-0 top-0 pt-2 pb-6 bg-gradient-to-b from-black/70 to-transparent pointer-events-none">
                      <span className="line-clamp-2 px-2 text-xs font-medium text-white text-center drop-shadow-sm">
                        {displayLabel}
                      </span>
                    </div>
                  </div>
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

      {deleteConfirmUrl && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10 rounded-2xl">
          <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 max-w-sm shadow-xl">
            <h4 className="text-sm font-semibold text-zinc-100 mb-2">{t('library.delete_asset_title')}</h4>
            <p className="text-sm text-zinc-400 mb-4">{t('library.delete_asset_confirm')}</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmUrl(null)}
                className="px-3 py-1.5 text-sm font-medium text-zinc-300 hover:text-zinc-100 rounded-lg border border-zinc-600 hover:bg-zinc-700 transition-colors"
              >
                {t('library.delete_asset_cancel')}
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors"
              >
                {t('library.delete_asset_confirm_btn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {cropperImageSrc && (
        <ImageCropperModal
          imageSrc={cropperImageSrc}
          onCropComplete={handleCropComplete}
          onClose={handleCropperClose}
        />
      )}
    </div>
  );
}
