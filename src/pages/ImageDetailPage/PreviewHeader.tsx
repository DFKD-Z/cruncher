import { Check, Download, RefreshCcw, Undo2 } from "lucide-react";
import { useI18n } from "../../hooks/useI18n";
import type { CompressTask } from "../../types";

export interface PreviewHeaderProps {
  task: CompressTask;
  processedUrl: string | null;
  isProcessing: boolean;
  processedSize: number | null;
  onReEdit: () => void;
  onDownload: () => void;
  /** 仅裁剪后下载（无渲染结果时） */
  onDownloadCropped?: () => void;
  /** 撤销裁剪，恢复原图 */
  onRevertCrop?: () => void;
  showCropConfirm?: boolean;
  onApplyCrop?: () => void;
  isApplyingCrop?: boolean;
  canApplyCrop?: boolean;
}

export function PreviewHeader({
  task,
  processedUrl,
  isProcessing,
  processedSize,
  onReEdit,
  onDownload,
  onDownloadCropped,
  onRevertCrop,
  showCropConfirm = false,
  onApplyCrop,
  isApplyingCrop = false,
  canApplyCrop = false,
}: PreviewHeaderProps) {
  const { t } = useI18n();

  return (
    <div className="px-6 py-4 flex items-center justify-between bg-zinc-100 dark:bg-zinc-800/90 border-b border-zinc-200 dark:border-zinc-700">
      <div className="flex items-center gap-3">
        {showCropConfirm && (
          <button
            type="button"
            onClick={onApplyCrop}
            disabled={isApplyingCrop || !canApplyCrop}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all bg-white/60 dark:bg-white/15 backdrop-blur-md border border-white/30 dark:border-white/20 text-blue-700 dark:text-blue-300 hover:bg-white/80 dark:hover:bg-white/25 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white/60 disabled:dark:hover:bg-white/15"
          >
            {isApplyingCrop ? (
              <span className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin shrink-0" />
            ) : (
              <Check className="w-4 h-4 shrink-0" />
            )}
            {t("imageDetail.confirmCrop")}
          </button>
        )}
        <span
          className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
            processedUrl
              ? "bg-green-500/20 text-green-400"
              : "bg-blue-500/20 text-blue-400"
          }`}
        >
          {processedUrl ? t("imageDetail.rendered") : t("imageDetail.viewport")}
        </span>
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 truncate max-w-[200px]">
          {task.name}
        </span>
        {processedUrl && !isProcessing && (
          <>
            <button
              type="button"
              onClick={onReEdit}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-300 dark:bg-zinc-600 hover:bg-zinc-400 dark:hover:bg-zinc-500 text-zinc-900 dark:text-zinc-100 text-xs font-semibold transition-colors"
            >
              <RefreshCcw className="w-4 h-4 shrink-0" />
              {t("imageDetail.reEdit")}
            </button>
            <button
              type="button"
              onClick={onDownload}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold shadow-sm transition-colors"
              title={t("imageDetail.download")}
            >
              <Download className="w-4 h-4 shrink-0" />
              {t("imageDetail.download")}
            </button>
          </>
        )}
        {!processedUrl && task.croppedImagePath && (
          <>
            {onRevertCrop && (
              <button
                type="button"
                onClick={onRevertCrop}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-300 dark:bg-zinc-600 hover:bg-zinc-400 dark:hover:bg-zinc-500 text-zinc-900 dark:text-zinc-100 text-xs font-semibold transition-colors"
                title={t("imageDetail.revertCrop")}
              >
                <Undo2 className="w-4 h-4 shrink-0" />
                {t("imageDetail.revertCrop")}
              </button>
            )}
            {onDownloadCropped && (
              <button
                type="button"
                onClick={onDownloadCropped}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold shadow-sm transition-colors"
                title={t("imageDetail.download")}
              >
                <Download className="w-4 h-4 shrink-0" />
                {t("imageDetail.download")}
              </button>
            )}
          </>
        )}
      </div>
      <div className="flex gap-6 items-center">
        <div className="text-right">
          <span className="block text-[9px] text-zinc-500 dark:text-zinc-500 font-semibold uppercase">
            {t("detail.original")}
          </span>
          <span className="text-xs font-mono text-zinc-700 dark:text-zinc-300">
            {(task.sizeBytes / 1024).toFixed(1)} KB
          </span>
        </div>
        {processedSize != null && (
          <div className="text-right pl-6 border-l border-zinc-300 dark:border-zinc-600">
            <span className="block text-[9px] text-green-500 font-semibold uppercase">
              {t("imageDetail.saved")}{" "}
              {Math.round((1 - processedSize / task.sizeBytes) * 100)}%
            </span>
            <span className="text-xs font-mono text-green-400">
              {(processedSize / 1024).toFixed(1)} KB
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
