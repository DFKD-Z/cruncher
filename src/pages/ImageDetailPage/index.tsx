import { useState, useRef, useEffect, useCallback } from "react";
import { Download } from "lucide-react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import ReactCrop, {
  type PixelCrop,
  type PercentCrop,
  centerCrop,
  makeAspectCrop,
  convertToPixelCrop,
} from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { useI18n } from "../../hooks/useI18n";
import { useImageProcess } from "../../hooks/useImageProcess";
import type { CompressTask, CropRegion } from "../../types";
import { ArrowLeft, Edit } from "lucide-react";

interface ProcessingSettings {
  quality: number;
  format: "auto" | "jpeg" | "png" | "webp";
  width: number;
  height: number;
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

export interface ImageDetailPageProps {
  task: CompressTask;
  running: boolean;
  onBack: () => void;
  onApplyCrop: (crop: CropRegion) => void | Promise<void>;
  onApplyProcess: () => void;
  onSave: () => void;
}

const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;

export function ImageDetailPage({
  task,
  running: _running,
  onBack,
  onApplyCrop,
  onApplyProcess: _onApplyProcess,
  onSave: _onSave,
}: ImageDetailPageProps) {
  const { t } = useI18n();
  const previewPath = task.croppedImagePath ?? task.path;
  const width = task.width ?? DEFAULT_WIDTH;
  const height = task.height ?? DEFAULT_HEIGHT;

  const [settings, setSettings] = useState<ProcessingSettings>({
    quality: 80,
    format: "auto",
    width,
    height,
  });

  const { processImage: runProcessImage, isProcessing, progress: processProgress } = useImageProcess();

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
  const [activeTab, setActiveTab] = useState<"compress" | "crop">("compress");

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

  const handleSetAspect = (ratio: number | null) => {
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
  };

  const handleApplyCrop = useCallback(async () => {
    const img = imgRef.current;
    const c = completedCrop ?? reactCrop;
    if (!img || !c) return;
    setIsApplyingCrop(true);
    setCropToast(null);
    setCropErrorMsg(null);
    try {
      const pixelCrop = c.unit === "px"
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
          : convertToPixelCrop(cropForRender, displayImg.offsetWidth, displayImg.offsetHeight);

      const safeDisplayWidth = Math.max(1, displayImg.offsetWidth);
      const safeDisplayHeight = Math.max(1, displayImg.offsetHeight);
      const scaleX = nw / safeDisplayWidth;
      const scaleY = nh / safeDisplayHeight;

      sourceX = Math.max(0, Math.min(Math.round(pixelCrop.x * scaleX), nw - 1));
      sourceY = Math.max(0, Math.min(Math.round(pixelCrop.y * scaleY), nh - 1));
      sourceW = Math.max(1, Math.min(Math.round(pixelCrop.width * scaleX), nw - sourceX));
      sourceH = Math.max(1, Math.min(Math.round(pixelCrop.height * scaleY), nh - sourceY));
    } else if (crop) {
      const scaleX = width > 0 ? nw / width : 1;
      const scaleY = height > 0 ? nh / height : 1;
      sourceX = Math.max(0, Math.min(Math.round(crop.x * scaleX), nw - 1));
      sourceY = Math.max(0, Math.min(Math.round(crop.y * scaleY), nh - 1));
      sourceW = Math.max(1, Math.min(Math.round(crop.width * scaleX), nw - sourceX));
      sourceH = Math.max(1, Math.min(Math.round(crop.height * scaleY), nh - sourceY));
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in slide-in-from-bottom-4 duration-300 h-[calc(100vh-5rem)] overflow-hidden">
      {/* 左侧控制栏 */}
      <div className="lg:col-span-4 flex flex-col h-full overflow-y-auto">
        <div className="space-y-6 shrink-0">
        <div className="p-6 rounded-2xl bg-slate-800/80 border border-slate-700 space-y-6">
          <div className="flex p-1.5 bg-slate-900/80 rounded-xl border border-slate-600">
            <button
              type="button"
              onClick={() => setActiveTab("compress")}
              className={`flex-1 py-2.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === "compress"
                  ? "bg-cyan-500 text-slate-950"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {t("detail.tabCompress")}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("crop")}
              className={`flex-1 py-2.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === "crop"
                  ? "bg-cyan-500 text-slate-950"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {t("imageDetail.tabTransform")}
            </button>
          </div>

          <div className="space-y-5">
            {activeTab === "compress" ? (
              <div className="space-y-5">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-medium text-slate-300">
                      {t("imageDetail.quality")}
                    </label>
                    <span className="text-cyan-400 font-mono font-semibold bg-cyan-500/10 px-2 py-0.5 rounded">
                      {settings.quality}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={settings.quality}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, quality: parseInt(e.target.value, 10) }))
                    }
                    className="w-full h-4 rounded-full bg-slate-600 appearance-none cursor-pointer accent-cyan-500"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">
                    {t("imageDetail.format")}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(["auto", "jpeg", "png", "webp"] as const).map((fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => setSettings((prev) => ({ ...prev, format: fmt }))}
                        className={`py-4 px-3 rounded-lg border font-medium transition-all ${
                          settings.format === fmt
                            ? "bg-cyan-500/20 border-cyan-500 text-cyan-400"
                            : "bg-slate-800/50 border-slate-600 text-slate-400 hover:border-slate-500"
                        }`}
                      >
                        {fmt.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">
                    {t("imageDetail.resolution")}
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="relative">
                      <input
                        type="number"
                        value={settings.width}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            width: parseInt(e.target.value, 10) || 0,
                          }))
                        }
                        className="w-full bg-slate-900 border border-slate-600 rounded-lg pl-3 pr-8 py-2 text-sm font-mono outline-none focus:border-cyan-500/50"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-500">
                        W
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        value={settings.height}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            height: parseInt(e.target.value, 10) || 0,
                          }))
                        }
                        className="w-full bg-slate-900 border border-slate-600 rounded-lg pl-3 pr-8 py-2 text-sm font-mono outline-none focus:border-cyan-500/50"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-500">
                        H
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: t("imageDetail.presetOriginal"), val: null },
                    { label: t("imageDetail.preset1x1"), val: 1 },
                    { label: "16:9", val: 16 / 9 },
                    { label: "4:3", val: 4 / 3 },
                    { label: "9:16", val: 9 / 16 },
                    { label: "3:2", val: 3 / 2 },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => handleSetAspect(preset.val)}
                      className="py-2.5 px-3 bg-slate-800/50 hover:bg-slate-700 border border-slate-600 rounded-lg text-xs font-medium transition-all hover:border-cyan-500/30"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <div className="p-4 rounded-xl bg-slate-900/50 border-l-2 border-l-cyan-500 space-y-1">
                  <p className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wide">
                    {t("imageDetail.selectionTool")}
                  </p>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {t("imageDetail.selectionToolTip")}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {t("imageDetail.zoomPanTip")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleApplyCrop}
                  disabled={isApplyingCrop || !reactCrop}
                  className="w-full py-3 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-semibold text-sm text-slate-950 transition-all flex items-center justify-center gap-2"
                >
                  {isApplyingCrop ? (
                    <span className="w-5 h-5 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                  ) : (
                    t("crop.confirm")
                  )}
                </button>
              </div>
            )}
          </div>

          <div className="pt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              className="w-full py-4 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all bg-slate-700 hover:bg-slate-600 text-slate-200"
            >
              <ArrowLeft className="w-4 h-4" />
              {t("detail.backToList")}
            </button>
            <button
              type="button"
              onClick={handleProcess}
              disabled={isProcessing}
              className="w-full py-4 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all bg-cyan-500 hover:bg-cyan-400 text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Edit className="w-4 h-4" />
              {isProcessing ? (
                <span className="w-5 h-5 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
              ) : (
                t("imageDetail.renderOutput")
              )}
            </button>
          </div>
        </div>
        </div>
      </div>

      {/* 右侧预览区 */}
      <div className="lg:col-span-8 flex flex-col min-h-0">
        <div className="rounded-2xl overflow-hidden flex flex-col flex-1 min-h-0 bg-slate-800 border border-slate-700">
          <div className="px-6 py-4 flex items-center justify-between bg-slate-900/80 border-b border-slate-700">
            <div className="flex items-center gap-3">
              <span
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                  processedUrl
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-cyan-500/20 text-cyan-400"
                }`}
              >
                {processedUrl ? t("imageDetail.rendered") : t("imageDetail.viewport")}
              </span>
              <span className="text-sm font-medium text-slate-300 truncate max-w-[200px]">
                {task.name}
              </span>
              {processedUrl && (
                <button
                  type="button"
                  onClick={download}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-semibold transition-colors"
                  title={t("imageDetail.download")}
                >
                  <Download className="w-4 h-4 shrink-0" />
                  {t("imageDetail.download")}
                </button>
              )}
            </div>
            <div className="flex gap-6 items-center">
              <div className="text-right">
                <span className="block text-[9px] text-slate-500 font-semibold uppercase">
                  {t("detail.original")}
                </span>
                <span className="text-xs font-mono text-slate-300">
                  {(task.sizeBytes / 1024).toFixed(1)} KB
                </span>
              </div>
              {processedSize != null && (
                <div className="text-right pl-6 border-l border-slate-600">
                  <span className="block text-[9px] text-emerald-500 font-semibold uppercase">
                    {t("imageDetail.saved")}{" "}
                    {Math.round((1 - processedSize / task.sizeBytes) * 100)}%
                  </span>
                  <span className="text-xs font-mono text-emerald-400">
                    {(processedSize / 1024).toFixed(1)} KB
                  </span>
                </div>
              )}
            </div>
          </div>

          {renderCompleteToast && (
            <div
              role="status"
              className="mx-6 mt-3 py-3 px-4 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-sm font-medium flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-300"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 animate-pulse" />
              {t("imageDetail.renderComplete")}
            </div>
          )}

          {exportDoneToast && (
            <div
              role="status"
              className="mx-6 mt-3 py-3 px-4 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-sm font-medium flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-300"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 animate-pulse" />
              {t("imageDetail.exportDone")}
            </div>
          )}

          {cropToast === "success" && (
            <div
              role="status"
              className="mx-6 mt-3 py-3 px-4 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-sm font-medium flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-300"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 animate-pulse" />
              {t("imageDetail.cropSuccess")}
            </div>
          )}
          {cropToast === "error" && (
            <div
              role="alert"
              className="mx-6 mt-3 py-3 px-4 rounded-xl bg-red-500/20 border border-red-500/40 text-red-400 text-sm font-medium flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-300"
            >
              <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
              {t("imageDetail.cropError")}
              {cropErrorMsg && (
                <span className="text-red-300/90 truncate max-w-[200px]" title={cropErrorMsg}>
                  {cropErrorMsg}
                </span>
              )}
            </div>
          )}

          <div
            ref={previewContainerRef}
            className="flex-1 min-h-0 relative bg-slate-950 flex items-center justify-center p-8 overflow-hidden"
          >
            <div className="relative w-full h-full flex items-center justify-center overflow-hidden min-w-0 min-h-0">
              {activeTab === "crop" && !processedUrl ? (
                <div
                  ref={cropViewportRef}
                  className="crop-viewport w-full h-full flex items-center justify-center min-w-0 min-h-0 overflow-hidden cursor-crosshair"
                  onMouseDown={handleCropPanStart}
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
                      onChange={(_, percentCrop) => setReactCrop(percentCrop)}
                      onComplete={(pixelCrop) => setCompletedCrop(pixelCrop)}
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
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-950/60 backdrop-blur-sm">
                <span className="w-12 h-12 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
                <p className="text-sm font-semibold text-white">
                  {t("imageDetail.processingFrame")}
                </p>
                <p className="text-xs text-cyan-400">{processProgress}%</p>
                <p className="text-xs text-slate-500">{t("imageDetail.runningLocally")}</p>
              </div>
            )}

            {processedUrl && !isProcessing && (
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setProcessedUrl(null);
                    setProcessedPath(null);
                    setProcessedSize(null);
                  }}
                  className="px-6 py-3 bg-white/10 hover:bg-white/15 rounded-xl font-semibold text-sm transition-all border border-white/10"
                >
                  {t("imageDetail.reEdit")}
                </button>
                <button
                  type="button"
                  onClick={download}
                  className="px-8 py-3 bg-cyan-500 hover:bg-cyan-400 rounded-xl font-semibold text-sm text-slate-950 transition-all"
                >
                  {t("imageDetail.exportNow")}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ImageDetailPage;
