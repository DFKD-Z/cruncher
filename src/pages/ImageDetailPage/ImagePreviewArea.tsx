import type { RefObject } from "react";
import ReactCrop, {
  type PixelCrop,
  type PercentCrop,
} from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { useI18n } from "../../hooks/useI18n";

export interface CropTransform {
  scale: number;
  x: number;
  y: number;
}

export interface ImagePreviewAreaProps {
  imgRef: RefObject<HTMLImageElement | null>;
  previewContainerRef: RefObject<HTMLDivElement | null>;
  cropViewportRef: RefObject<HTMLDivElement | null>;
  previewSrc: string;
  processedUrl: string | null;
  showCropView: boolean;
  cropTransform: CropTransform;
  onCropPanStart: (e: React.MouseEvent) => void;
  reactCrop: PercentCrop | PixelCrop | undefined;
  onCropChange: (percentCrop: PercentCrop) => void;
  onCropComplete: (pixelCrop: PixelCrop) => void;
  cropAspect: number | undefined;
  onImageLoad: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  isProcessing: boolean;
  processProgress: number;
}

export function ImagePreviewArea({
  imgRef,
  previewContainerRef,
  cropViewportRef,
  previewSrc,
  processedUrl,
  showCropView,
  cropTransform,
  onCropPanStart,
  reactCrop,
  onCropChange,
  onCropComplete,
  cropAspect,
  onImageLoad,
  isProcessing,
  processProgress,
}: ImagePreviewAreaProps) {
  const { t } = useI18n();

  return (
    <div
      ref={previewContainerRef}
      className="flex-1 min-h-0 relative bg-zinc-200 dark:bg-zinc-950 flex items-center justify-center p-8 overflow-hidden"
    >
      <div className="relative w-full h-full flex items-center justify-center overflow-hidden min-w-0 min-h-0">
        {showCropView ? (
          <div
            ref={cropViewportRef}
            className="crop-viewport w-full h-full flex items-center justify-center min-w-0 min-h-0 overflow-hidden cursor-crosshair"
            onMouseDown={onCropPanStart}
            style={{ touchAction: "none" }}
          >
            <div
              className="crop-transform-layer flex items-center justify-center"
              style={{
                transform: `translate(${cropTransform.x}px, ${cropTransform.y}px) scale(${cropTransform.scale})`,
                transformOrigin: "center center",
              }}
            >
              <ReactCrop
                crop={reactCrop}
                onChange={(_, percentCrop) => onCropChange(percentCrop)}
                onComplete={(pixelCrop) => onCropComplete(pixelCrop)}
                aspect={cropAspect}
                className="image-detail-react-crop"
              >
                <img
                  ref={imgRef}
                  src={previewSrc}
                  alt=""
                  onLoad={onImageLoad}
                  className={`block max-w-full max-h-full w-auto h-auto object-contain transition-opacity duration-300 rounded-xl ${
                    isProcessing ? "opacity-30 blur-sm" : "opacity-100"
                  }`}
                  style={{ display: "block" }}
                  draggable={false}
                />
              </ReactCrop>
            </div>
          </div>
        ) : (
          <img
            ref={imgRef}
            src={processedUrl ?? previewSrc}
            alt=""
            className={`block max-w-full max-h-full w-auto h-auto object-contain transition-all duration-300 rounded-xl ${
              isProcessing ? "opacity-30 blur-sm" : "opacity-100"
            }`}
          />
        )}
      </div>

      {isProcessing && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zinc-900/70 dark:bg-zinc-950/70 backdrop-blur-sm rounded-b-2xl">
          <span className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-sm font-semibold text-white">
            {t("imageDetail.processingFrame")}
          </p>
          <p className="text-xs text-blue-400">{processProgress}%</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">{t("imageDetail.runningLocally")}</p>
        </div>
      )}
    </div>
  );
}
