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
    <div className="flex gap-3 items-center flex-wrap">
      <span className="text-sm text-zinc-500 dark:text-zinc-500">{t("mode.label")}</span>
      <label className="flex items-center gap-2 cursor-pointer border border-zinc-300 dark:border-zinc-600 rounded-lg px-3 py-2 bg-zinc-100 dark:bg-zinc-800/60 hover:bg-zinc-200 dark:hover:bg-zinc-700/60 transition-colors">
        <input
          type="radio"
          name="compress-mode"
          checked={value === "lossless"}
          onChange={() => onChange("lossless")}
          disabled={disabled}
          className="rounded-full border-zinc-400 dark:border-zinc-500 text-blue-500 focus:ring-blue-500 bg-white dark:bg-zinc-700"
        />
        <span className="text-sm text-zinc-700 dark:text-zinc-300">{t("mode.lossless")}</span>
      </label>
      <label className="flex items-center gap-2 cursor-pointer border border-zinc-300 dark:border-zinc-600 rounded-lg px-3 py-2 bg-zinc-100 dark:bg-zinc-800/60 hover:bg-zinc-200 dark:hover:bg-zinc-700/60 transition-colors">
        <input
          type="radio"
          name="compress-mode"
          checked={value === "visuallyLossless"}
          onChange={() => onChange("visuallyLossless")}
          disabled={disabled}
          className="rounded-full border-zinc-400 dark:border-zinc-500 text-blue-500 focus:ring-blue-500 bg-white dark:bg-zinc-700"
        />
        <span className="text-sm text-zinc-700 dark:text-zinc-300">{t("mode.visuallyLossless")}</span>
      </label>
    </div>
  );
}
