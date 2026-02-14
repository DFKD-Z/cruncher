import { Download, RefreshCcw } from "lucide-react";
import { useI18n } from "../../hooks/useI18n";
import type { CompressTask } from "../../types";

export interface PreviewHeaderProps {
  task: CompressTask;
  processedUrl: string | null;
  isProcessing: boolean;
  processedSize: number | null;
  onReEdit: () => void;
  onDownload: () => void;
}

export function PreviewHeader({
  task,
  processedUrl,
  isProcessing,
  processedSize,
  onReEdit,
  onDownload,
}: PreviewHeaderProps) {
  const { t } = useI18n();

  return (
    <div className="px-6 py-4 flex items-center justify-between bg-zinc-800/90 border-b border-zinc-700">
      <div className="flex items-center gap-3">
        <span
          className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
            processedUrl
              ? "bg-green-500/20 text-green-400"
              : "bg-blue-500/20 text-blue-400"
          }`}
        >
          {processedUrl ? t("imageDetail.rendered") : t("imageDetail.viewport")}
        </span>
        <span className="text-sm font-medium text-zinc-300 truncate max-w-[200px]">
          {task.name}
        </span>
        {processedUrl && !isProcessing && (
          <>
            <button
              type="button"
              onClick={onReEdit}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-600 hover:bg-zinc-500 text-zinc-100 text-xs font-semibold transition-colors"
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
      </div>
      <div className="flex gap-6 items-center">
        <div className="text-right">
          <span className="block text-[9px] text-zinc-500 font-semibold uppercase">
            {t("detail.original")}
          </span>
          <span className="text-xs font-mono text-zinc-300">
            {(task.sizeBytes / 1024).toFixed(1)} KB
          </span>
        </div>
        {processedSize != null && (
          <div className="text-right pl-6 border-l border-zinc-600">
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
