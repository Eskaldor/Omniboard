import React, { useState, useCallback, useEffect, useRef } from 'react';
import { X, Check } from 'lucide-react';
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop, convertToPixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { useTranslation } from 'react-i18next';
import { slugify } from 'transliteration';

const OUTPUT_WIDTH = 172;
const OUTPUT_HEIGHT = 320;
const ASPECT = OUTPUT_WIDTH / OUTPUT_HEIGHT;

const TECHNICAL_ID_REGEX = /^[a-z0-9_]+$/;

function getCroppedPngBlob(image: HTMLImageElement, crop: PixelCrop): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    const sx = crop.x * scaleX;
    const sy = crop.y * scaleY;
    const sw = crop.width * scaleX;
    const sh = crop.height * scaleY;

    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_WIDTH;
    canvas.height = OUTPUT_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('No 2d context'));
      return;
    }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
      'image/png',
      1
    );
  });
}

function centerAspectCrop(
  mediaWidth: number,
  mediaHeight: number,
  aspect: number
): Crop {
  return centerCrop(
    makeAspectCrop({ unit: '%', width: 90 }, aspect, mediaWidth, mediaHeight),
    mediaWidth,
    mediaHeight
  );
}

export interface CropCompletePayload {
  blob: Blob;
  technicalId: string;
  displayName: string;
}

export function ImageCropperModal({
  imageSrc,
  initialDisplayName = '',
  initialTechnicalId = '',
  conflictError: conflictErrorProp = null,
  setConflictNotifier,
  onOverwriteRequested,
  isOverwriteLoading = false,
  onCropComplete,
  onClose,
}: {
  imageSrc: string;
  initialDisplayName?: string;
  initialTechnicalId?: string;
  conflictError?: string | null;
  setConflictNotifier?: (fn: ((msg: string | null) => void) | null) => void;
  onOverwriteRequested?: () => void;
  isOverwriteLoading?: boolean;
  onCropComplete: (payload: CropCompletePayload) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('core', { useSuspense: false });
  const [localConflict, setLocalConflict] = useState<string | null>(null);
  const displayConflict = conflictErrorProp ?? localConflict;

  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [technicalId, setTechnicalId] = useState(initialTechnicalId || slugify(initialDisplayName, { separator: '_' }) || '');
  const [isCustomId, setIsCustomId] = useState(!!initialTechnicalId);
  const imgRef = React.useRef<HTMLImageElement>(null);
  const setConflictNotifierRef = useRef(setConflictNotifier);
  setConflictNotifierRef.current = setConflictNotifier;

  if (setConflictNotifier) setConflictNotifier(setLocalConflict);
  useEffect(() => () => setConflictNotifierRef.current?.(null), []);
  useEffect(() => {
    if (!conflictErrorProp) setLocalConflict(null);
  }, [conflictErrorProp]);
  useEffect(() => {
    if (initialDisplayName) setDisplayName(initialDisplayName);
    if (initialTechnicalId) {
      setTechnicalId(initialTechnicalId);
      setIsCustomId(true);
    } else if (initialDisplayName) {
      setTechnicalId(slugify(initialDisplayName, { separator: '_' }) || '');
      setIsCustomId(false);
    }
  }, [initialDisplayName, initialTechnicalId]);

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    setCrop(centerAspectCrop(width, height, ASPECT));
  }, []);

  const handleDisplayNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDisplayName(val);
    if (!isCustomId) {
      setTechnicalId(slugify(val, { separator: '_' }) || '');
    }
  };

  const handleTechnicalIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTechnicalId(e.target.value);
    setIsCustomId(true);
  };

  const technicalIdTrimmed = technicalId.trim();
  const isTechnicalIdValid = technicalIdTrimmed.length > 0 && TECHNICAL_ID_REGEX.test(technicalIdTrimmed);

  const handleCrop = useCallback(async () => {
    const img = imgRef.current;
    if (!img || !crop || !isTechnicalIdValid) return;
    const rawId = technicalIdTrimmed.toLowerCase();
    const pixelCrop = completedCrop ?? convertToPixelCrop(crop, img.width, img.height);
    try {
      const blob = await getCroppedPngBlob(img, pixelCrop);
      onCropComplete({
        blob,
        technicalId: rawId,
        displayName: (displayName || rawId).trim(),
      });
    } catch (err) {
      console.error('Crop failed', err);
    }
  }, [crop, completedCrop, technicalIdTrimmed, displayName, isTechnicalIdValid, onCropComplete]);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50 shrink-0">
          <h3 className="text-lg font-medium text-zinc-100">{t('modals.crop_title')}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-100 p-1 rounded-lg hover:bg-zinc-800 transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 overflow-auto flex-1 min-h-0 bg-zinc-950 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 shrink-0">
            <div>
              <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">
                {t('library.display_name_label')}
              </label>
              <input
                type="text"
                value={displayName}
                onChange={handleDisplayNameChange}
                placeholder={t('library.placeholder_display')}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-1">
                {t('library.technical_id_label')}
              </label>
              <input
                type="text"
                value={technicalId}
                onChange={handleTechnicalIdChange}
                placeholder={t('modals.technical_id_placeholder')}
                className={`w-full bg-zinc-900 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 ${
                  technicalIdTrimmed.length > 0 && !isTechnicalIdValid
                    ? 'border-2 border-red-500 focus:border-red-500 focus:ring-red-500/30'
                    : 'border border-zinc-700 focus:border-emerald-500'
                }`}
              />
              {technicalIdTrimmed.length > 0 && !isTechnicalIdValid && (
                <p className="mt-1 text-xs text-red-400">{t('library.technical_id_validation_error')}</p>
              )}
            </div>
          </div>
          <div className="flex items-center justify-center min-h-0 flex-1">
            <div className="max-w-full">
              <ReactCrop
                crop={crop}
                onChange={(_, percentCrop) => setCrop(percentCrop)}
                onComplete={(pixelCrop) => setCompletedCrop(pixelCrop)}
                aspect={ASPECT}
                className="max-w-full"
                style={{ maxHeight: '50vh' }}
              >
                <img
                  ref={imgRef}
                  src={imageSrc}
                  alt="Crop"
                  onLoad={onImageLoad}
                  className="max-w-full max-h-[50vh] block"
                  style={{ display: 'block' }}
                />
              </ReactCrop>
            </div>
          </div>
        </div>

        {displayConflict && (
          <div className="px-4 pt-2 pb-1 border-t border-red-500/30 bg-red-500/5 shrink-0">
            <p className="text-sm text-red-300 mb-2">{displayConflict}</p>
            <p className="text-xs text-zinc-400 mb-2">{t('library.asset_id_exists_hint')}</p>
            {onOverwriteRequested && (
              <button
                type="button"
                onClick={onOverwriteRequested}
                disabled={isOverwriteLoading}
                className="px-3 py-1.5 text-sm font-medium text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded-lg transition-colors"
              >
                {isOverwriteLoading ? t('library.uploading') : t('library.overwrite_anyway')}
              </button>
            )}
          </div>
        )}

        <div className="p-4 border-t border-zinc-800 flex justify-end gap-2 bg-zinc-900/50 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-zinc-300 hover:text-zinc-100 rounded-lg border border-zinc-600 hover:bg-zinc-800 transition-colors"
          >
            {t('modals.crop_cancel')}
          </button>
          <button
            type="button"
            onClick={handleCrop}
            disabled={!crop || !isTechnicalIdValid}
            className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg flex items-center gap-2 transition-colors"
          >
            <Check size={16} />
            {t('modals.crop_apply')}
          </button>
        </div>
      </div>
    </div>
  );
}
