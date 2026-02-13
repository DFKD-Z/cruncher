import { useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, ImagePlus, Loader2, Play } from "lucide-react";
import { useI18n } from "../hooks/useI18n";
import { ModeSelector } from "./ModeSelector";
import { OutputPicker } from "./OutputPicker";
import type { DropZoneAccept } from "./FileDropZone";

const IMAGE_EXT = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff", "tif"];
const VIDEO_EXT = ["mp4", "mkv", "avi", "mov", "webm", "flv", "wmv"];

interface ImportWorkspaceProps {
  accept: DropZoneAccept;
  onFilesSelected: (paths: string[]) => void;
  /** 导入文件夹（仅图片 tab 时提供），选择目录后自动加载目录内图片到待处理列表 */
  onImportFolder?: () => void;
  disabled?: boolean;
  fileAdding?: boolean;
  fileAddingProgress?: { current: number; total: number } | null;
  compressMode: "lossless" | "visuallyLossless";
  onCompressModeChange: (mode: "lossless" | "visuallyLossless") => void;
  outputDir: string | null;
  onOutputDirChange: (dir: string | null) => void;
  onRun: () => void;
  running?: boolean;
  progress?: { current: number; total: number } | null;
  selectedPendingCount?: number;
}

export function ImportWorkspace({
  accept,
  onFilesSelected,
  onImportFolder,
  disabled = false,
  fileAdding = false,
  fileAddingProgress = null,
  compressMode,
  onCompressModeChange,
  outputDir,
  onOutputDirChange,
  onRun,
  running = false,
  progress,
  selectedPendingCount = 0,
}: ImportWorkspaceProps) {
  const { t } = useI18n();

  const filters =
    accept === "image"
      ? [{ name: t("tab.images"), extensions: IMAGE_EXT }]
      : accept === "video"
        ? [{ name: t("tab.videos"), extensions: VIDEO_EXT }]
        : [
            { name: t("tab.images"), extensions: IMAGE_EXT },
            { name: t("tab.videos"), extensions: VIDEO_EXT },
          ];

  const handleClick = useCallback(async () => {
    if (disabled) return;
    const selected = await open({
      multiple: true,
      filters,
    });
    if (selected) {
      const paths = Array.isArray(selected) ? selected : [selected];
      onFilesSelected(paths);
    }
  }, [onFilesSelected, disabled, filters]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (disabled) return;
      const files = e.dataTransfer?.files;
      if (!files?.length) return;
      const paths: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if ("path" in f && typeof (f as { path?: string }).path === "string") {
          paths.push((f as { path: string }).path);
        }
      }
      if (paths.length) onFilesSelected(paths);
    },
    [onFilesSelected, disabled]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return (
    <div className="flex flex-col h-full mt-4">
      {/* 标签 */}
      {/* <span className="inline-flex w-fit px-3 py-1 rounded-md text-xs font-medium bg-slate-700/80 text-slate-300 mb-6">
        {t("workspace.label")}
      </span> */}

      {/* 标题区 */}
      <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
        {t("workspace.title")}
      </h1>
      <p className="text-slate-400 text-sm mb-8 max-w-md">
        {t("workspace.desc")}
      </p>

      {/* 上传区域 */}
      <div className="relative mb-6">
        <div
          role="button"
          tabIndex={0}
          onClick={handleClick}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onKeyDown={(e) => e.key === "Enter" && handleClick()}
          className={`
            relative cursor-pointer rounded-xl p-8 text-center transition-colors select-none
            border-2 border-dashed min-h-[180px] flex flex-col items-center justify-center gap-3
            ${disabled ? "opacity-50 cursor-not-allowed" : ""}
            bg-slate-800/60 border-slate-600 hover:border-cyan-500/60 hover:bg-slate-800/80
          `}
        >
          <div className="relative">
            <div className="w-16 h-16 rounded-lg bg-cyan-500/20 flex items-center justify-center">
              <ImagePlus className="w-8 h-8 text-cyan-400" />
            </div>
            <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-cyan-500 flex items-center justify-center text-slate-950 text-lg font-bold leading-none">
              +
            </span>
          </div>
          <p className="font-semibold text-white">{t("workspace.importAssets")}</p>
          <p className="text-sm text-slate-400">
            {(() => {
              const parts = t("workspace.dropHint").split(t("workspace.browse"));
              return (
                <>
                  {parts[0]}
                  <span
                    className="text-cyan-400 hover:underline cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClick();
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && handleClick()}
                  >
                    {t("workspace.browse")}
                  </span>
                  {parts[1] ?? ""}
                </>
              );
            })()}
          </p>
          {onImportFolder && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onImportFolder();
              }}
              disabled={disabled}
              className="mt-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-300 bg-slate-700/80 hover:bg-slate-600/80 disabled:opacity-50 disabled:cursor-not-allowed border border-slate-600"
            >
              <FolderOpen className="w-4 h-4" />
              {t("workspace.importFolder")}
            </button>
          )}
        </div>

        {fileAdding && (
          <div className="absolute inset-0 z-10 rounded-xl bg-slate-900/95 flex flex-col items-center justify-center gap-3 pointer-events-none border-2 border-dashed border-cyan-500/50">
            <Loader2 className="w-10 h-10 text-cyan-400 animate-spin" />
            <span className="text-white text-sm font-medium">
              {fileAddingProgress
                ? t("dropzone.addingProgress", {
                    current: fileAddingProgress.current,
                    total: fileAddingProgress.total,
                  })
                : t("dropzone.adding")}
            </span>
            {fileAddingProgress && fileAddingProgress.total > 0 && (
              <div className="w-48 h-1.5 rounded-full bg-slate-700 overflow-hidden">
                <div
                  className="h-full bg-cyan-500 transition-all duration-300"
                  style={{
                    width: `${(fileAddingProgress.current / fileAddingProgress.total) * 100}%`,
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* 功能卡片 */}
      {/* <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <div className="flex gap-3 p-4 rounded-xl bg-slate-800/60 border border-slate-700">
          <Zap className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-white text-sm">
              {t("workspace.edgeProcessing")}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              {t("workspace.edgeDesc")}
            </p>
          </div>
        </div>
        <div className="flex gap-3 p-4 rounded-xl bg-slate-800/60 border border-slate-700">
          <Lightbulb className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-white text-sm">
              {t("workspace.aiInsights")}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              {t("workspace.aiDesc")}
            </p>
          </div>
        </div>
      </div> */}

      {/* 模式、输出、运行 */}
      <div className="flex flex-col gap-3">
        <ModeSelector
          value={compressMode}
          onChange={onCompressModeChange}
          disabled={running}
        />
        <div className="flex items-center gap-3">
        <OutputPicker
          value={outputDir}
          onChange={onOutputDirChange}
          disabled={running}
        />
        <button
          type="button"
          onClick={onRun}
          disabled={running || selectedPendingCount === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-semibold transition-colors"
        >
          {running ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {running && progress
            ? t("tasks.progress", {
                current: progress.current,
                total: progress.total,
              })
            : selectedPendingCount > 0
              ? `${t("action.batchProcess")} (${selectedPendingCount})`
              : t("action.start")}
        </button>
        </div>
        
      </div>

      {running && progress && (
        <div className="mt-4">
          <div className="flex justify-between text-sm text-slate-400 mb-1.5">
            <span>{t("tasks.compressing")}</span>
            <span>
              {progress.current}/{progress.total}
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
            <div
              className="h-full bg-cyan-500 transition-all duration-300 ease-out"
              style={{
                width: `${(progress.current / progress.total) * 100}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
