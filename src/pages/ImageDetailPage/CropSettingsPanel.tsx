import { useI18n } from "../../hooks/useI18n";

export interface CropSettingsPanelProps {
  onSetAspect: (ratio: number | null) => void;
  onApplyCrop: () => void;
  isApplyingCrop: boolean;
  canApplyCrop: boolean;
}

export function CropSettingsPanel({
  onSetAspect,
  onApplyCrop,
  isApplyingCrop,
  canApplyCrop,
}: CropSettingsPanelProps) {
  const { t } = useI18n();

  const presets = [
    { label: t("imageDetail.presetOriginal"), val: null },
    { label: t("imageDetail.preset1x1"), val: 1 },
    { label: "16:9", val: 16 / 9 },
    { label: "4:3", val: 4 / 3 },
    { label: "9:16", val: 9 / 16 },
    { label: "3:2", val: 3 / 2 },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2">
        {presets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => onSetAspect(preset.val)}
            className="py-2.5 px-3 bg-zinc-800/50 hover:bg-zinc-700 border border-zinc-600 rounded-xl text-xs font-medium transition-all hover:border-blue-500/40"
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="p-4 rounded-xl bg-zinc-900/50 border-l-2 border-l-blue-500 space-y-1">
        <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide">
          {t("imageDetail.selectionTool")}
        </p>
        <p className="text-xs text-zinc-400 leading-relaxed">
          {t("imageDetail.selectionToolTip")}
        </p>
        <p className="text-[10px] text-zinc-500">
          {t("imageDetail.zoomPanTip")}
        </p>
      </div>
      <button
        type="button"
        onClick={onApplyCrop}
        disabled={isApplyingCrop || !canApplyCrop}
        className="w-full py-3 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-500 font-semibold text-sm text-white shadow-sm transition-all flex items-center justify-center gap-2"
      >
        {isApplyingCrop ? (
          <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          t("crop.confirm")
        )}
      </button>
    </div>
  );
}
