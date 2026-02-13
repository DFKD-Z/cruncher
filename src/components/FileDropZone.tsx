import { useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Upload } from "lucide-react";
import { useI18n } from "../hooks/useI18n";

const IMAGE_EXT = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff", "tif"];
const VIDEO_EXT = ["mp4", "mkv", "avi", "mov", "webm", "flv", "wmv"];

export type DropZoneAccept = "image" | "video" | "all";

interface FileDropZoneProps {
  onFilesSelected: (paths: string[]) => void;
  disabled?: boolean;
  /** 仅图片 / 仅视频 / 全部 */
  accept?: DropZoneAccept;
}

export function FileDropZone({ onFilesSelected, disabled, accept = "all" }: FileDropZoneProps) {
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
  }, [onFilesSelected, disabled]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (disabled) return;
      // In Tauri, dropped files may not expose paths in the webview; use the button to pick files.
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
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onKeyDown={(e) => e.key === "Enter" && handleClick()}
      className={`
        cursor-pointer
        rounded-xl p-8 text-center transition-colors select-none
        border-2 border-dashed min-h-[140px] flex flex-col items-center justify-center gap-4
        ${disabled ? "opacity-50 cursor-not-allowed" : ""}
        bg-slate-800/80 border-cyan-500/60 hover:border-cyan-400/80 hover:bg-slate-800
      `}
    >
      <Upload className="w-14 h-14 text-cyan-400" />
      <div>
        <p className="text-lg font-bold text-white mb-1">
          {accept === "image"
            ? t("dropzone.promptImage")
            : accept === "video"
              ? t("dropzone.promptVideo")
              : t("dropzone.prompt")}
        </p>
        <p className="text-sm text-slate-400 mb-4">
          {t("dropzone.hint")}
        </p>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleClick();
        }}
        disabled={disabled}
        className="px-5 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {t("dropzone.chooseFiles")}
      </button>
    </div>
  );
}
