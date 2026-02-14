import { AlertCircle } from "lucide-react";
import { useI18n } from "../hooks/useI18n";

interface FfmpegBannerProps {
  show: boolean;
}

export function FfmpegBanner({ show }: FfmpegBannerProps) {
  const { t } = useI18n();
  if (!show) return null;
  return (
    <div
      className="flex items-center gap-3 p-3  bg-amber-950/50 text-amber-200 border border-amber-700"
      role="alert"
    >
      <AlertCircle className="w-5 h-5 shrink-0" />
      <p className="text-sm">{t("ffmpeg.banner")}</p>
    </div>
  );
}
