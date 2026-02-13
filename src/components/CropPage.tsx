import { useState, useCallback, useRef } from "react";
import ReactCrop, {
  type PixelCrop,
  type PercentCrop,
  centerCrop,
  makeAspectCrop,
} from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useI18n } from "../hooks/useI18n";
import type { CropRegion } from "../types";

interface CropPageProps {
  imagePath: string;
  onConfirm: (crop: CropRegion) => void;
  onCancel: () => void;
}

function centerAspectCrop(
  width: number,
  height: number,
  aspect: number
): PercentCrop {
  return centerCrop(
    makeAspectCrop(
      { unit: "%", width: 90 },
      aspect,
      width,
      height
    ),
    width,
    height
  );
}

export function CropPage({
  imagePath,
  onConfirm,
  onCancel,
}: CropPageProps) {
  const { t } = useI18n();
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<PercentCrop | PixelCrop | undefined>(undefined);
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);

  const src = convertFileSrc(imagePath);

  const onImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const { width, height } = e.currentTarget;
      if (!crop) {
        setCrop(centerAspectCrop(width, height, width / height));
      }
    },
    [crop]
  );

  const handleConfirm = useCallback(() => {
    const img = imgRef.current;
    const c = completedCrop ?? crop;
    if (!img || !c || c.unit !== "px") return;
    const scaleX = img.naturalWidth / img.offsetWidth;
    const scaleY = img.naturalHeight / img.offsetHeight;
    const x = Math.round(c.x * scaleX);
    const y = Math.round(c.y * scaleY);
    const width = Math.round(c.width * scaleX);
    const height = Math.round(c.height * scaleY);
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    onConfirm({
      x: Math.max(0, Math.min(x, nw - 1)),
      y: Math.max(0, Math.min(y, nh - 1)),
      width: Math.min(width, nw - x),
      height: Math.min(height, nh - y),
    });
  }, [completedCrop, crop, onConfirm]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      {/* 顶部操作栏 */}
      <div className="shrink-0 flex items-center justify-between gap-4 px-6 py-3 border-b border-slate-700 bg-slate-900/80">
        <h2 className="text-lg font-semibold text-white">
          {t("crop.title")}
        </h2>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 font-medium transition-colors"
          >
            {t("crop.cancel")}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold transition-colors"
          >
            {t("crop.confirm")}
          </button>
        </div>
      </div>

      {/* 裁剪操作区：占满剩余空间，宽度与窗口一致，等比缩放 */}
      <div className="flex-1 min-h-0 overflow-auto flex items-start justify-center w-full">
        <div className="w-full max-w-full">
          <ReactCrop
            crop={crop}
            onChange={(_, percentCrop) => setCrop(percentCrop)}
            onComplete={(pixelCrop) => setCompletedCrop(pixelCrop)}
            aspect={undefined}
            className="w-full"
          >
            <img
              ref={imgRef}
              src={src}
              alt="Crop"
              onLoad={onImageLoad}
              className="block w-full h-auto max-w-full"
              style={{ display: "block" }}
            />
          </ReactCrop>
        </div>
      </div>
    </div>
  );
}
