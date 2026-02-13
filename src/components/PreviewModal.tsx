import { convertFileSrc } from "@tauri-apps/api/core";
import { X } from "lucide-react";
import { useI18n } from "../hooks/useI18n";

interface PreviewModalProps {
  path: string;
  type: "image" | "video";
  onClose: () => void;
}

export function PreviewModal({ path, type, onClose }: PreviewModalProps) {
  const { t } = useI18n();
  const src = convertFileSrc(path);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("tasks.preview")}
    >
      <div
        className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-10 right-0 p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white"
          title={t("task.closePreview")}
        >
          <X className="w-6 h-6" />
        </button>
        {type === "image" ? (
          <img
            src={src}
            alt=""
            className="max-w-full max-h-[85vh] w-auto h-auto object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <video
            src={src}
            className="max-w-full max-h-[85vh] rounded-lg shadow-2xl"
            controls
            autoPlay
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </div>
    </div>
  );
}
