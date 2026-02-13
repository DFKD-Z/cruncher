import { useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";
import { useI18n } from "../hooks/useI18n";

interface OutputPickerProps {
  value: string | null;
  onChange: (path: string | null) => void;
  disabled?: boolean;
}

export function OutputPicker({ value, onChange, disabled }: OutputPickerProps) {
  const { t } = useI18n();
  const handleClick = useCallback(async () => {
    if (disabled) return;
    const selected = await open({ directory: true });
    if (selected != null) {
      onChange(Array.isArray(selected) ? selected[0] ?? null : selected);
    }
  }, [onChange, disabled]);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className="flex items-center gap-2 px-2 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 border border-slate-600 disabled:opacity-50 text-sm text-slate-300"
      >
        <FolderOpen className="w-4 h-4" />
        {value ? (
          <span className="max-w-[200px] truncate" title={value}>
            {value.replace(/^.*[/\\]/, "") || value}
          </span>
        ) : (
          t("output.pick")
        )}
      </button>
    </div>
  );
}
