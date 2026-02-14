import { useI18n } from "../../hooks/useI18n";

export interface DetailToastsProps {
  renderComplete: boolean;
  exportDone: boolean;
  cropToast: "success" | "error" | null;
  cropErrorMsg: string | null;
}

export function DetailToasts({
  renderComplete,
  exportDone,
  cropToast,
  cropErrorMsg,
}: DetailToastsProps) {
  const { t } = useI18n();

  const toastClass =
    "mx-6 mt-3 py-3 px-4 rounded-xl bg-green-500/15 border border-green-500/30 text-green-400 text-sm font-medium flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-300 shadow-sm";
  const dotClass =
    "w-2 h-2 rounded-full bg-green-400 shrink-0 animate-pulse";

  return (
    <>
      {renderComplete && (
        <div role="status" className={toastClass}>
          <span className={dotClass} />
          {t("imageDetail.renderQueued")}
        </div>
      )}

      {exportDone && (
        <div role="status" className={toastClass}>
          <span className={dotClass} />
          {t("imageDetail.exportDone")}
        </div>
      )}

      {cropToast === "success" && (
        <div role="status" className={toastClass}>
          <span className={dotClass} />
          {t("imageDetail.cropQueued")}
        </div>
      )}

      {cropToast === "error" && (
        <div
          role="alert"
          className="mx-6 mt-3 py-3 px-4 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-sm font-medium flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-300 shadow-sm"
        >
          <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
          {t("imageDetail.cropError")}
          {cropErrorMsg && (
            <span
              className="text-red-300/90 truncate max-w-[200px]"
              title={cropErrorMsg}
            >
              {cropErrorMsg}
            </span>
          )}
        </div>
      )}
    </>
  );
}
