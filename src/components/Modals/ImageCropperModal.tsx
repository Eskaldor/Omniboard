import React, { useState, useCallback } from 'react';
import { X, Check } from 'lucide-react';
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop, convertToPixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { useTranslation } from 'react-i18next';

const OUTPUT_WIDTH = 172;
const OUTPUT_HEIGHT = 320;
const ASPECT = OUTPUT_WIDTH / OUTPUT_HEIGHT;

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

export function ImageCropperModal({
  imageSrc,
  onCropComplete,
  onClose,
}: {
  imageSrc: string;
  onCropComplete: (blob: Blob) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('core', { useSuspense: false });
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const imgRef = React.useRef<HTMLImageElement>(null);

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    setCrop(centerAspectCrop(width, height, ASPECT));
  }, []);

  const handleCrop = useCallback(async () => {
    const img = imgRef.current;
    if (!img || !crop) return;
    const pixelCrop = completedCrop ?? convertToPixelCrop(crop, img.width, img.height);
    try {
      const blob = await getCroppedPngBlob(img, pixelCrop);
      onCropComplete(blob);
      onClose();
    } catch (err) {
      console.error('Crop failed', err);
    }
  }, [crop, completedCrop, onCropComplete, onClose]);

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

        <div className="p-4 overflow-auto flex-1 min-h-0 bg-zinc-950 flex items-center justify-center">
          <div className="max-w-full">
            <ReactCrop
              crop={crop}
              onChange={(_, percentCrop) => setCrop(percentCrop)}
              onComplete={(pixelCrop) => setCompletedCrop(pixelCrop)}
              aspect={ASPECT}
              className="max-w-full"
              style={{ maxHeight: '60vh' }}
            >
              <img
                ref={imgRef}
                src={imageSrc}
                alt="Crop"
                onLoad={onImageLoad}
                className="max-w-full max-h-[60vh] block"
                style={{ display: 'block' }}
              />
            </ReactCrop>
          </div>
        </div>

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
            disabled={!crop}
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
