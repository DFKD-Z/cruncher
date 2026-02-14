import { useState, useRef, useEffect, useCallback } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type { PixelCrop, PercentCrop } from "react-image-crop";
import { convertToPixelCrop } from "react-image-crop";
import { useI18n } from "../../hooks/useI18n";
import { useImageProcess } from "../../hooks/useImageProcess";
import type { CompressTask, CropRegion } from "../../types";
import type { ProcessingSettings } from "./types";
import { DEFAULT_WIDTH, DEFAULT_HEIGHT } from "./types";
import { centerAspectCrop } from "./utils";
import { DetailSidebar, type DetailTab } from "./DetailSidebar";
import { PreviewHeader } from "./PreviewHeader";
import { DetailToasts } from "./DetailToasts";
import { ImagePreviewArea } from "./ImagePreviewArea";

export interface ImageDetailPageProps {
  task: CompressTask;
  running: boolean;
  onBack: () => void;
  onApplyCrop: (crop: CropRegion) => void | Promise<void>;
  onRevertCrop?: () => void;
  onApplyProcess: () => void;
  onSave: () => void;
}

export function ImageDetailPage({
  task,
  running: _running,
  onBack,
  onApplyCrop,
  onRevertCrop,
  onApplyProcess: _onApplyProcess,
  onSave: _onSave,
}: ImageDetailPageProps) {
  useI18n();
  const previewPath = task.croppedImagePath ?? task.path;
  const width = task.width ?? DEFAULT_WIDTH;
  const height = task.height ?? DEFAULT_HEIGHT;

  const [settings, setSettings] = useState<ProcessingSettings>({
    quality: 80,
    format: "auto",
    width,
    height,
  });

  const { processImage: runProcessImage, isProcessing, progress: processProgress } =
    useImageProcess();

  const [crop, setCrop] = useState<CropRegion | null>(null);
  const [reactCrop, setReactCrop] = useState<PercentCrop | PixelCrop | undefined>(undefined);
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const [cropAspect, setCropAspect] = useState<number | undefined>(undefined);
  const [isApplyingCrop, setIsApplyingCrop] = useState(false);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [processedPath, setProcessedPath] = useState<string | null>(null);
  const [processedSize, setProcessedSize] = useState<number | null>(null);
  const [renderCompleteToast, setRenderCompleteToast] = useState(false);
  const [exportDoneToast, setExportDoneToast] = useState(false);
  const [cropToast, setCropToast] = useState<"success" | "error" | null>(null);
  const [cropErrorMsg, setCropErrorMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("compress");

  const imgRef = useRef<HTMLImageElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const cropViewportRef = useRef<HTMLDivElement>(null);
  const panStartRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const previewSrc = convertFileSrc(previewPath);

  const [cropTransform, setCropTransform] = useState({ scale: 1, x: 0, y: 0 });

  useEffect(() => {
    setSettings((prev) => ({
      ...prev,
      width: task.width ?? prev.width,
      height: task.height ?? prev.height,
    }));
  }, [task.width, task.height]);

  useEffect(() => {
    if (!renderCompleteToast) return;
    const timer = setTimeout(() => setRenderCompleteToast(false), 3000);
    return () => clearTimeout(timer);
  }, [renderCompleteToast]);

  useEffect(() => {
    if (!exportDoneToast) return;
    const timer = setTimeout(() => setExportDoneToast(false), 3000);
    return () => clearTimeout(timer);
  }, [exportDoneToast]);

  useEffect(() => {
    if (!cropToast) return;
    const timer = setTimeout(() => {
      setCropToast(null);
      setCropErrorMsg(null);
    }, 3000);
    return () => clearTimeout(timer);
  }, [cropToast]);

  const onImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const { width: w, height: h } = e.currentTarget;
      if (!reactCrop) {
        const aspect = cropAspect ?? w / h;
        setReactCrop(centerAspectCrop(w, h, aspect));
      }
      setCropTransform({ scale: 1, x: 0, y: 0 });
    },
    [reactCrop, cropAspect]
  );

  const handleCropPanStart = useCallback(
    (e: React.MouseEvent) => {
      if (activeTab !== "crop" || processedUrl || !e.altKey) return;
      e.preventDefault();
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        offsetX: cropTransform.x,
        offsetY: cropTransform.y,
      };
    },
    [activeTab, processedUrl, cropTransform.x, cropTransform.y]
  );

  const handleCropPanMove = useCallback((e: MouseEvent) => {
    const start = panStartRef.current;
    if (!start) return;
    setCropTransform((t) => ({
      ...t,
      x: start.offsetX + (e.clientX - start.x),
      y: start.offsetY + (e.clientY - start.y),
    }));
  }, []);

  const handleCropPanEnd = useCallback(() => {
    panStartRef.current = null;
  }, []);

  useEffect(() => {
    if (panStartRef.current === null) return;
    window.addEventListener("mousemove", handleCropPanMove);
    window.addEventListener("mouseup", handleCropPanEnd);
    return () => {
      window.removeEventListener("mousemove", handleCropPanMove);
      window.removeEventListener("mouseup", handleCropPanEnd);
    };
  }, [handleCropPanMove, handleCropPanEnd]);

  useEffect(() => {
    if (activeTab !== "crop") {
      setCropTransform({ scale: 1, x: 0, y: 0 });
    }
  }, [activeTab]);

  useEffect(() => {
    const el = cropViewportRef.current;
    if (!el || activeTab !== "crop" || processedUrl) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.15 : 0.15;
      setCropTransform((t) => {
        const nextScale = Math.max(0.5, Math.min(5, t.scale + delta));
        if (nextScale === t.scale) return t;
        const rect = el.getBoundingClientRect();
        const mx = e.clientX - rect.left - rect.width / 2;
        const my = e.clientY - rect.top - rect.height / 2;
        const newX = mx - (mx - t.x) * (nextScale / t.scale);
        const newY = my - (my - t.y) * (nextScale / t.scale);
        return { scale: nextScale, x: newX, y: newY };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [activeTab, processedUrl]);

  const handleSetAspect = useCallback(
    (ratio: number | null) => {
      setCropAspect(ratio ?? undefined);
      if (!ratio) {
        setCrop(null);
        if (imgRef.current) {
          const { naturalWidth: w, naturalHeight: h } = imgRef.current;
          setReactCrop(centerAspectCrop(w, h, w / h));
        }
        return;
      }
      const w = width;
      const h = height;
      let cropW: number;
      let cropH: number;
      if (w / h > ratio) {
        cropH = h;
        cropW = h * ratio;
      } else {
        cropW = w;
        cropH = w / ratio;
      }
      setCrop({
        x: Math.round((w - cropW) / 2),
        y: Math.round((h - cropH) / 2),
        width: Math.round(cropW),
        height: Math.round(cropH),
      });
      if (imgRef.current) {
        const { naturalWidth: nw, naturalHeight: nh } = imgRef.current;
        setReactCrop(centerAspectCrop(nw, nh, ratio));
      }
    },
    [width, height]
  );

  const handleApplyCrop = useCallback(async () => {
    const img = imgRef.current;
    const c = completedCrop ?? reactCrop;
    if (!img || !c) return;
    setIsApplyingCrop(true);
    setCropToast(null);
    setCropErrorMsg(null);
    try {
      const pixelCrop =
        c.unit === "px"
          ? (c as PixelCrop)
          : convertToPixelCrop(c, img.offsetWidth, img.offsetHeight);
      const scaleX = img.naturalWidth / img.offsetWidth;
      const scaleY = img.naturalHeight / img.offsetHeight;
      const x = Math.round(pixelCrop.x * scaleX);
      const y = Math.round(pixelCrop.y * scaleY);
      const cWidth = Math.round(pixelCrop.width * scaleX);
      const cHeight = Math.round(pixelCrop.height * scaleY);
      const nw = img.naturalWidth;
      const nh = img.naturalHeight;
      const region: CropRegion = {
        x: Math.max(0, Math.min(x, nw - 1)),
        y: Math.max(0, Math.min(y, nh - 1)),
        width: Math.min(cWidth, nw - x),
        height: Math.min(cHeight, nh - y),
      };
      await onApplyCrop(region);
      setReactCrop(undefined);
      setCompletedCrop(null);
      setCrop(null);
      setCropToast("success");
    } catch (e) {
      setCropToast("error");
      setCropErrorMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setIsApplyingCrop(false);
    }
  }, [completedCrop, reactCrop, onApplyCrop]);

  const handleProcess = useCallback(async () => {
    const outputWidth = Math.max(1, settings.width);
    const outputHeight = Math.max(1, settings.height);
    const outputFormat = settings.format;

    const displayImg = imgRef.current;
    const nw = displayImg?.naturalWidth ?? task.width ?? DEFAULT_WIDTH;
    const nh = displayImg?.naturalHeight ?? task.height ?? DEFAULT_HEIGHT;

    let sourceX = 0;
    let sourceY = 0;
    let sourceW = nw;
    let sourceH = nh;

    const cropForRender = completedCrop ?? reactCrop;
    const useSelection = activeTab === "crop" && displayImg && cropForRender;

    if (useSelection) {
      const pixelCrop =
        cropForRender.unit === "px"
          ? (cropForRender as PixelCrop)
          : convertToPixelCrop(
            cropForRender,
            displayImg.offsetWidth,
            displayImg.offsetHeight
          );

      const safeDisplayWidth = Math.max(1, displayImg.offsetWidth);
      const safeDisplayHeight = Math.max(1, displayImg.offsetHeight);
      const scaleX = nw / safeDisplayWidth;
      const scaleY = nh / safeDisplayHeight;

      sourceX = Math.max(0, Math.min(Math.round(pixelCrop.x * scaleX), nw - 1));
      sourceY = Math.max(0, Math.min(Math.round(pixelCrop.y * scaleY), nh - 1));
      sourceW = Math.max(
        1,
        Math.min(Math.round(pixelCrop.width * scaleX), nw - sourceX)
      );
      sourceH = Math.max(
        1,
        Math.min(Math.round(pixelCrop.height * scaleY), nh - sourceY)
      );
    } else if (crop) {
      const scaleX = width > 0 ? nw / width : 1;
      const scaleY = height > 0 ? nh / height : 1;
      sourceX = Math.max(0, Math.min(Math.round(crop.x * scaleX), nw - 1));
      sourceY = Math.max(0, Math.min(Math.round(crop.y * scaleY), nh - 1));
      sourceW = Math.max(
        1,
        Math.min(Math.round(crop.width * scaleX), nw - sourceX)
      );
      sourceH = Math.max(
        1,
        Math.min(Math.round(crop.height * scaleY), nh - sourceY)
      );
    }

    const cropRegion =
      sourceW > 0 && sourceH > 0
        ? { x: sourceX, y: sourceY, width: sourceW, height: sourceH }
        : undefined;

    try {
      const result = await runProcessImage({
        path: previewPath,
        cropRegion,
        options: {
          quality: settings.quality,
          format: outputFormat,
          width: outputWidth,
          height: outputHeight,
        },
        tempId: task.id,
      });
      setProcessedPath(result.outputPath);
      setProcessedUrl(convertFileSrc(result.outputPath));
      setProcessedSize(result.sizeBytes);
      setRenderCompleteToast(true);
    } catch (error) {
      console.error("processImage failed:", error);
    }
  }, [
    previewPath,
    width,
    height,
    settings,
    crop,
    task.id,
    task.width,
    task.height,
    completedCrop,
    reactCrop,
    activeTab,
    runProcessImage,
  ]);

  const download = useCallback(async () => {
    if (!processedPath) return;
    const ext =
      settings.format === "auto"
        ? (processedPath?.split(".").pop() ?? task.name.split(".").pop() ?? "png")
        : (settings.format === "jpeg" ? "jpg" : settings.format);
    const defaultFileName = `optimized-${task.name.replace(/\.[^.]+$/, "")}.${ext}`;
    const path = await save({ defaultPath: defaultFileName });
    if (path) {
      try {
        await invoke("copy_file", { from: processedPath, to: path });
        setExportDoneToast(true);
      } catch (e) {
        console.error("Export failed:", e);
      }
    }
  }, [processedPath, settings.format, task.name]);

  const downloadCropped = useCallback(async () => {
    const sourcePath = task.croppedImagePath ?? task.path;
    if (!sourcePath) return;
    const ext = sourcePath.split(".").pop() ?? task.name.split(".").pop() ?? "png";
    const defaultFileName = `cropped-${task.name.replace(/\.[^.]+$/, "")}.${ext}`;
    const path = await save({ defaultPath: defaultFileName });
    if (path) {
      try {
        await invoke("copy_file", { from: sourcePath, to: path });
        setExportDoneToast(true);
      } catch (e) {
        console.error("Export failed:", e);
      }
    }
  }, [task.croppedImagePath, task.path, task.name]);

  const handleReEdit = useCallback(() => {
    setProcessedUrl(null);
    setProcessedPath(null);
    setProcessedSize(null);
  }, []);

  const handleSettingsChange = useCallback((update: Partial<ProcessingSettings>) => {
    setSettings((prev) => ({ ...prev, ...update }));
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12  animate-in slide-in-from-bottom-4 duration-300 overflow-hidden ">
      <div className="lg:col-span-3 flex flex-col h-full overflow-y-auto p-4 pr-2">
        <DetailSidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          settings={settings}
          onSettingsChange={handleSettingsChange}
          onSetAspect={handleSetAspect}
          onBack={onBack}
          onRender={handleProcess}
          isProcessing={isProcessing}
          showRenderOutput={!task.croppedImagePath}
        />
      </div>

      <div className="lg:col-span-9 flex flex-col p-4 h-screen">
        <div className="overflow-hidden flex flex-col flex-1 min-h-0 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 shadow-lg rounded-2xl">
          <PreviewHeader
            task={task}
            processedUrl={processedUrl}
            isProcessing={isProcessing}
            processedSize={processedSize}
            onReEdit={handleReEdit}
            onDownload={download}
            onDownloadCropped={downloadCropped}
            onRevertCrop={onRevertCrop}
            showCropConfirm={activeTab === "crop" && !processedUrl && !task.croppedImagePath}
            onApplyCrop={handleApplyCrop}
            isApplyingCrop={isApplyingCrop}
            canApplyCrop={!!reactCrop}
          />

          <DetailToasts
            renderComplete={renderCompleteToast}
            exportDone={exportDoneToast}
            cropToast={cropToast}
            cropErrorMsg={cropErrorMsg}
          />

          <ImagePreviewArea
            imgRef={imgRef}
            previewContainerRef={previewContainerRef}
            cropViewportRef={cropViewportRef}
            previewSrc={previewSrc}
            processedUrl={processedUrl}
            showCropView={activeTab === "crop" && !processedUrl && !task.croppedImagePath}
            cropTransform={cropTransform}
            onCropPanStart={handleCropPanStart}
            reactCrop={reactCrop}
            onCropChange={(percentCrop) => setReactCrop(percentCrop)}
            onCropComplete={setCompletedCrop}
            cropAspect={cropAspect}
            onImageLoad={onImageLoad}
            isProcessing={isProcessing}
            processProgress={processProgress}
          />
        </div>
      </div>
    </div>
  );
}

export default ImageDetailPage;
