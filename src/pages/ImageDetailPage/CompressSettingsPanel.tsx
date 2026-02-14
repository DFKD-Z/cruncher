import type { ProcessingSettings } from "./types";
import { useI18n } from "../../hooks/useI18n";

export interface CompressSettingsPanelProps {
  settings: ProcessingSettings;
  onSettingsChange: (update: Partial<ProcessingSettings>) => void;
}

export function CompressSettingsPanel({
  settings,
  onSettingsChange,
}: CompressSettingsPanelProps) {
  const { t } = useI18n();

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {t("imageDetail.quality")}
          </label>
          <span className="text-blue-400 font-mono font-semibold bg-blue-500/15 px-2.5 py-1 rounded-lg">
            {settings.quality}%
          </span>
        </div>
        <input
          type="range"
          min="1"
          max="100"
          value={settings.quality}
          onChange={(e) =>
            onSettingsChange({ quality: parseInt(e.target.value, 10) })
          }
          className="w-full h-2 bg-zinc-300 dark:bg-zinc-600 rounded-full appearance-none cursor-pointer accent-blue-500"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-300">
          {t("imageDetail.format")}
        </label>
        <div className="grid grid-cols-2 gap-2">
          {(["auto", "jpeg", "png", "webp"] as const).map((fmt) => (
            <button
              key={fmt}
              type="button"
              onClick={() => onSettingsChange({ format: fmt })}
              className={`py-4 px-3 rounded-xl border font-medium transition-all ${
                settings.format === fmt
                  ? "bg-blue-500/20 border-blue-500 text-blue-400"
                  : "bg-zinc-100 dark:bg-zinc-800/50 border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
              }`}
            >
              {fmt.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-zinc-300">
          {t("imageDetail.resolution")}
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div className="relative">
            <input
              type="number"
              value={settings.width}
              onChange={(e) =>
                onSettingsChange({
                  width: parseInt(e.target.value, 10) || 0,
                })
              }
              className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-600 rounded-xl pl-3 pr-8 py-2.5 text-sm font-mono text-zinc-900 dark:text-zinc-100 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-zinc-500 dark:text-zinc-500">
              W
            </span>
          </div>
          <div className="relative">
            <input
              type="number"
              value={settings.height}
              onChange={(e) =>
                onSettingsChange({
                  height: parseInt(e.target.value, 10) || 0,
                })
              }
              className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-600 rounded-xl pl-3 pr-8 py-2.5 text-sm font-mono text-zinc-900 dark:text-zinc-100 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-zinc-500 dark:text-zinc-500">
              H
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
