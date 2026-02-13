import { useI18n } from "../hooks/useI18n";
import type { CompressMode } from "../types";

interface ModeSelectorProps {
  value: CompressMode;
  onChange: (mode: CompressMode) => void;
  disabled?: boolean;
}

export function ModeSelector({ value, onChange, disabled }: ModeSelectorProps) {
  const { t } = useI18n();
  return (
    <div className="flex gap-4 items-center">
      <span className="text-sm text-slate-400">{t("mode.label")}</span>
      <label className="flex items-center gap-2 cursor-pointer border border-slate-800 rounded-lg p-2">
        <input
          type="radio"
          name="compress-mode"
          checked={value === "lossless"}
          onChange={() => onChange("lossless")}
          disabled={disabled}
          className="rounded-full border-slate-500 text-cyan-500 focus:ring-cyan-500 bg-slate-700"
        />
        <span className="text-sm text-slate-300">{t("mode.lossless")}</span>
      </label>
      <label className="flex items-center gap-2 cursor-pointer border border-slate-800 rounded-lg p-2">
        <input
          type="radio"
          name="compress-mode"
          checked={value === "visuallyLossless"}
          onChange={() => onChange("visuallyLossless")}
          disabled={disabled}
          className="rounded-full border-slate-500 text-cyan-500 focus:ring-cyan-500 bg-slate-700"
        />
        <span className="text-sm text-slate-300">{t("mode.visuallyLossless")}</span>
      </label>
    </div>
  );
}
