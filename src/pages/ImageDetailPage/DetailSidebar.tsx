import { ArrowLeft, Edit } from "lucide-react";
import { useI18n } from "../../hooks/useI18n";
import type { ProcessingSettings } from "./types";
import { CompressSettingsPanel } from "./CompressSettingsPanel";
import { CropSettingsPanel } from "./CropSettingsPanel";

export type DetailTab = "compress" | "crop";

export interface DetailSidebarProps {
  activeTab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
  settings: ProcessingSettings;
  onSettingsChange: (update: Partial<ProcessingSettings>) => void;
  onSetAspect: (ratio: number | null) => void;
  onApplyCrop: () => void;
  isApplyingCrop: boolean;
  canApplyCrop: boolean;
  onBack: () => void;
  onRender: () => void;
  isProcessing: boolean;
}

export function DetailSidebar({
  activeTab,
  onTabChange,
  settings,
  onSettingsChange,
  onSetAspect,
  onApplyCrop,
  isApplyingCrop,
  canApplyCrop,
  onBack,
  onRender,
  isProcessing,
}: DetailSidebarProps) {
  const { t } = useI18n();

  return (
    <div className="lg:col-span-4 flex flex-col h-full overflow-y-auto p-4">
      <div className="space-y-6 shrink-0">
        <div className="p-6 bg-zinc-100 dark:bg-zinc-800/90 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-lg space-y-6">

          <div className="flex justify-between items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              className="w-[50px] py-4 rounded-xl text-2xl font-medium flex items-center justify-center gap-2 transition-all bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300 dark:hover:bg-zinc-600 text-zinc-900 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-600"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex-1 flex p-1.5 bg-zinc-200 dark:bg-zinc-900/80 border border-zinc-300 dark:border-zinc-600 rounded-xl">
              <button
                type="button"
                onClick={() => onTabChange("compress")}
                className={`flex-1 py-2.5 text-xs font-semibold rounded-lg transition-all ${activeTab === "compress"
                  ? "bg-blue-500 text-white shadow-sm"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                  }`}
              >
                {t("detail.tabCompress")}
              </button>
              <button
                type="button"
                onClick={() => onTabChange("crop")}
                className={`flex-1 py-2.5 text-xs font-semibold rounded-lg transition-all ${activeTab === "crop"
                  ? "bg-blue-500 text-white shadow-sm"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                  }`}
              >
                {t("imageDetail.tabTransform")}
              </button>
            </div>
          </div>


          <div className="space-y-5">
            {activeTab === "compress" ? (
              <CompressSettingsPanel
                settings={settings}
                onSettingsChange={onSettingsChange}
              />
            ) : (
              <CropSettingsPanel
                onSetAspect={onSetAspect}
                onApplyCrop={onApplyCrop}
                isApplyingCrop={isApplyingCrop}
                canApplyCrop={canApplyCrop}
              />
            )}
          </div>

          <div className="pt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onRender}
              disabled={isProcessing}
              className="w-full py-4 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all bg-blue-500 hover:bg-blue-600 text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-500"
            >
              <Edit className="w-4 h-4" />
              {isProcessing ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                t("imageDetail.renderOutput")
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
