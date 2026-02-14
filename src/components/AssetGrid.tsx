import { convertFileSrc } from "@tauri-apps/api/core";
import {
  ArrowDownToLine,
  Expand,
  Scissors,
  X,
  Play,
  AlertCircle,
  Loader2,
  Download,
  Pencil,
  FolderOpen,
} from "lucide-react";
import { useI18n } from "../hooks/useI18n";
import type { CompressTask } from "../types";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDimensions(width?: number | null, height?: number | null): string {
  if (width != null && height != null) return `${width}×${height}`;
  return "—";
}

interface AssetGridProps {
  tasks: CompressTask[];
  taskType: "image" | "video";
  running?: boolean;
  onRemove: (id: string) => void;
  onCrop: (task: CompressTask) => void;
  onOpenFolder: (path: string) => void;
  onDownload?: (task: CompressTask) => void;
  onCompressSingle?: (task: CompressTask) => void;
  onOpenDetail?: (task: CompressTask) => void;
  onPreview?: (path: string, type: "image" | "video") => void;
  onDownloadCropped?: (croppedPath: string, suggestedName: string) => void;
  onToggleSelect?: (id: string, selected: boolean) => void;
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
}

export function AssetGrid({
  tasks,
  taskType: _taskType,
  running = false,
  onRemove,
  onCrop: _onCrop,
  onOpenFolder,
  onDownload,
  onCompressSingle,
  onOpenDetail,
  onPreview,
  onDownloadCropped,
  onToggleSelect,
  onSelectAll,
  onDeselectAll,
}: AssetGridProps) {
  const { t } = useI18n();
  if (tasks.length === 0) return null;

  const pendingCount = tasks.filter((x) => x.status === "pending").length;
  const isCropped = (task: CompressTask) =>
    Boolean(task.croppedImagePath || task.cropRegion);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{t("assets.title")}</h2>
        <div className="flex items-center gap-3">
          {pendingCount > 0 && onSelectAll && onDeselectAll && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onSelectAll}
                className="text-xs text-blue-400 hover:text-blue-300 hover:underline font-medium"
              >
                {t("tasks.selectAll")}
              </button>
              <button
                type="button"
                onClick={onDeselectAll}
                className="text-xs text-zinc-500 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-400 hover:underline"
              >
                {t("tasks.deselectAll")}
              </button>
            </div>
          )}
          <span className="flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            {t("assets.count", { count: tasks.length })}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {tasks.map((task) => {
            const isQueued =
              running && task.status === "pending" && task.selected;
            const cropped = isCropped(task);
            const hasProcessedOutput =
              task.type === "image" && task.status === "done" && !!task.outputPath;
            const previewPath =
              hasProcessedOutput && task.outputPath
                ? task.outputPath
                : task.type === "image" && cropped && task.croppedImagePath
                  ? task.croppedImagePath
                  : task.path;

            return (
              <div
                key={task.id}
                className={`group relative rounded-2xl overflow-hidden border transition-all ${
                  isQueued
                    ? "bg-blue-950/30 border-blue-600 animate-pulse"
                    : "bg-zinc-100 dark:bg-zinc-800/90 border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600"
                }`}
              >
                {/* 缩略图区域 */}
                <div className="relative aspect-square bg-zinc-200 dark:bg-zinc-800">
                  <button
                    type="button"
                    onClick={() =>
                      onPreview?.(previewPath, task.type) ??
                      onOpenDetail?.(task)
                    }
                    className="block w-full h-full text-left"
                  >
                    {task.type === "image" ? (
                      <img
                        src={convertFileSrc(previewPath)}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <video
                        src={convertFileSrc(previewPath)}
                        className="w-full h-full object-cover"
                        muted
                        preload="metadata"
                      />
                    )}
                  </button>

                  {/* 类型标签 (IMAGE / VIDEO) */}
                  <span className="absolute left-2 bottom-2 px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-blue-500/90 text-white">
                    {task.type === "image"
                      ? t("assets.imageTag")
                      : t("assets.videoTag")}
                  </span>

                  {hasProcessedOutput && (
                    <span className="absolute left-2 top-2 px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-green-500/90 text-white">
                      {t("detail.statusProcessed")}
                    </span>
                  )}

                  {/* 裁剪标识 */}
                  {cropped && (
                    <span
                      className="absolute right-2 top-2 p-1.5 rounded-lg bg-amber-500/90 text-zinc-950"
                      title={t("assets.cropped")}
                    >
                      <Scissors className="w-3.5 h-3.5" />
                    </span>
                  )}

                  {/* 操作按钮 overlay */}
                  <div className="absolute inset-0 bg-zinc-900/70 dark:bg-zinc-900/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                    {onOpenDetail && task.type === "image" && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenDetail(task);
                        }}
                        className="p-2 rounded-xl bg-zinc-300/90 dark:bg-zinc-700 hover:bg-zinc-400 dark:hover:bg-zinc-600 text-blue-600 dark:text-blue-400 transition-colors"
                        title={t("task.openDetail")}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                    {task.status === "pending" && onCompressSingle && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCompressSingle(task);
                        }}
                        className="p-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white shadow-sm transition-colors"
                        title={t("task.compress")}
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    )}
                    {task.status === "done" && task.outputPath && (
                      <>
                        {onDownload && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDownload(task);
                            }}
                            className="p-2 rounded-xl bg-zinc-300/90 dark:bg-zinc-700 hover:bg-zinc-400 dark:hover:bg-zinc-600 text-blue-600 dark:text-blue-400 transition-colors"
                            title={t("task.download")}
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        )}
                        {onOpenFolder && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenFolder(
                                task.outputPath!.replace(/[/\\][^/\\]+$/, "")
                              );
                            }}
                            className="p-2 rounded-xl bg-zinc-300/90 dark:bg-zinc-700 hover:bg-zinc-400 dark:hover:bg-zinc-600 text-blue-600 dark:text-blue-400 transition-colors"
                            title={t("task.openFolder")}
                          >
                            <FolderOpen className="w-4 h-4" />
                          </button>
                        )}
                      </>
                    )}
                    {cropped && onDownloadCropped && task.croppedImagePath && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const ext = task.name.includes(".")
                            ? task.name.slice(task.name.lastIndexOf("."))
                            : ".png";
                          onDownloadCropped(
                            task.croppedImagePath!,
                            task.name.replace(/\.[^.]+$/, "") + "_cropped" + ext
                          );
                        }}
                        className="p-2 rounded-xl bg-zinc-300/90 dark:bg-zinc-700 hover:bg-zinc-400 dark:hover:bg-zinc-600 text-blue-600 dark:text-blue-400 transition-colors"
                        title={t("task.downloadCropped")}
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    )}
                    {task.status === "compressing" && (
                      <div className="flex flex-col items-center gap-1 text-blue-300">
                        <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                        <span className="text-[10px] font-semibold">
                          {Math.max(0, Math.min(100, Math.round(task.progressPercent ?? 0)))}%
                        </span>
                      </div>
                    )}
                    {task.status === "error" && (
                      <AlertCircle className="w-6 h-6 text-red-400" />
                    )}
                  </div>
                </div>

                {/* 文件信息 */}
                <div className="p-3">
                  {onToggleSelect && task.status === "pending" && (
                    <label className="absolute top-2 left-2 z-10 flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={task.selected}
                        onChange={(e) =>
                          onToggleSelect(task.id, e.target.checked)
                        }
                        className="rounded border-zinc-400 dark:border-zinc-500 text-blue-500 focus:ring-blue-500 bg-white dark:bg-zinc-800/90 w-4 h-4"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </label>
                  )}
                  <p
                    className="font-medium text-zinc-900 dark:text-zinc-100 truncate text-sm cursor-pointer hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
                    title={task.name}
                    onClick={() => onOpenDetail?.(task)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && onOpenDetail?.(task)
                    }
                    role={onOpenDetail ? "button" : undefined}
                    tabIndex={onOpenDetail ? 0 : undefined}
                  >
                    {task.name}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-zinc-500 dark:text-zinc-500">
                    <span className="flex items-center gap-1">
                      <ArrowDownToLine className="w-3.5 h-3.5 shrink-0" />
                      {formatBytes(task.sizeBytes)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Expand className="w-3.5 h-3.5 shrink-0" />
                      {formatDimensions(task.width, task.height)}
                    </span>
                  </div>
                </div>

                {/* 移除按钮 */}
                <button
                  type="button"
                  onClick={() => onRemove(task.id)}
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/90 dark:bg-zinc-900/90 hover:bg-red-500/90 text-zinc-500 dark:text-zinc-400 hover:text-white opacity-0 group-hover:opacity-100 transition-all z-10"
                  title={t("task.remove")}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
