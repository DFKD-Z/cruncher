import { useState, useCallback } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";
import type { CompressTask, CompressMode, CropRegion } from "../types";

const IMAGE_EXT = new Set(
  ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff", "tif"].map((s) =>
    s.toLowerCase()
  )
);
const VIDEO_EXT = new Set(
  ["mp4", "mkv", "avi", "mov", "webm", "flv", "wmv"].map((s) => s.toLowerCase())
);

function ext(path: string): string {
  const i = path.lastIndexOf(".");
  return i >= 0 ? path.slice(i + 1).toLowerCase() : "";
}

function basename(path: string): string {
  const i = path.replace(/\\/g, "/").lastIndexOf("/");
  return i >= 0 ? path.slice(i + 1) : path;
}

export function useCompress() {
  const [tasks, setTasks] = useState<CompressTask[]>([]);
  const [outputDir, setOutputDir] = useState<string | null>(null);
  const [compressMode, setCompressMode] = useState<CompressMode>("visuallyLossless");
  const [running, setRunning] = useState(false);
  /** 压缩进度：当前完成数 / 总数，仅在 running 时有值 */
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const addPaths = useCallback((paths: string[], fileInfos?: Map<string, { size_bytes: number; width?: number; height?: number; format?: string | null }>) => {
    const newTasks: CompressTask[] = paths.map((path) => {
      const extLower = ext(path);
      const type: CompressTask["type"] = VIDEO_EXT.has(extLower)
        ? "video"
        : IMAGE_EXT.has(extLower)
          ? "image"
          : "image";
      const info = fileInfos?.get(path);
      return {
        id: `${path}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        type,
        path,
        name: basename(path),
        sizeBytes: info?.size_bytes ?? 0,
        status: "pending",
        cropRegion: null,
        width: info?.width ?? null,
        height: info?.height ?? null,
        selected: true,
      };
    });
    setTasks((prev) => [...prev, ...newTasks]);
  }, []);

  const removeTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const setTaskCrop = useCallback((id: string, cropRegion: CropRegion | null) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, cropRegion } : t))
    );
  }, []);

  const setTaskCroppedPath = useCallback((id: string, croppedImagePath: string | null) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, croppedImagePath } : t))
    );
  }, []);

  const setTaskSelected = useCallback((id: string, selected: boolean) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, selected } : t))
    );
  }, []);

  const toggleSelectAll = useCallback((type: "image" | "video" | "all", checked: boolean) => {
    setTasks((prev) =>
      prev.map((t) => {
        const match = type === "all" || t.type === type;
        return match ? { ...t, selected: checked } : t;
      })
    );
  }, []);

  const runTask = useCallback(
    async (task: CompressTask): Promise<void> => {
      const outDir = outputDir || task.path.replace(/\\/g, "/").replace(/\/[^/]+$/, "") || ".";
      const base = basename(task.path);
      const nameNoExt = base.replace(/\.[^.]+$/, "");
      const extPart = base.includes(".") ? base.slice(base.lastIndexOf(".")) : "";
      const outputPath = `${outDir}/${nameNoExt}_compressed${extPart}`;

      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id ? { ...t, status: "compressing", progressPercent: 0 } : t
        )
      );

      try {
        if (task.type === "image") {
          const progressChannel = new Channel<number>();
          progressChannel.onmessage = (progress) => {
            setTasks((prev) =>
              prev.map((t) =>
                t.id === task.id
                  ? { ...t, progressPercent: Math.max(0, Math.min(100, Math.round(progress))) }
                  : t
              )
            );
          };

          await invoke("compress_image", {
            path: task.path,
            outputPath,
            mode: compressMode,
            cropRegion: task.cropRegion ?? undefined,
            progressCallback: progressChannel,
          });
        } else {
          await invoke("compress_video", {
            path: task.path,
            outputPath,
            mode: compressMode,
          });
        }
        const info = await invoke<{ size_bytes: number }>("get_file_info", {
          path: outputPath,
        }).catch(() => ({ size_bytes: 0 }));
        const outputSizeBytes = info.size_bytes ?? 0;
        setTasks((prev) =>
          prev.map((t) =>
            t.id === task.id
              ? {
                  ...t,
                  status: "done",
                  outputPath,
                  outputSizeBytes: outputSizeBytes || 0,
                  progressPercent: 100,
                }
              : t
          )
        );
      } catch (e) {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === task.id
              ? {
                  ...t,
                  status: "error",
                  error: e instanceof Error ? e.message : String(e),
                  progressPercent: t.progressPercent ?? 0,
                }
              : t
          )
        );
      }
    },
    [outputDir, compressMode]
  );

  const runAll = useCallback(async () => {
    const pending = tasks.filter((t) => t.status === "pending" && t.selected);
    if (pending.length === 0) return;
    setRunning(true);
    for (const task of pending) {
      await runTask(task);
    }
    setRunning(false);
  }, [tasks, runTask]);

  /** 仅压缩当前类型且选中的待处理任务；后台顺序执行，通过 progress 展示进度 */
  const runSelectedByType = useCallback(
    async (type: "image" | "video") => {
      const pending = tasks.filter(
        (t) => t.type === type && t.status === "pending" && t.selected
      );
      if (pending.length === 0) return;
      setRunning(true);
      setProgress({ current: 0, total: pending.length });
      for (let i = 0; i < pending.length; i++) {
        await runTask(pending[i]);
        setProgress({ current: i + 1, total: pending.length });
      }
      setProgress(null);
      setRunning(false);
    },
    [tasks, runTask]
  );

  /** 单条任务压缩（用于列表项上的「压缩」按钮），不自动下载 */
  const runSingleTask = useCallback(
    async (task: CompressTask) => {
      if (task.status !== "pending") return;
      setRunning(true);
      setProgress({ current: 0, total: 1 });
      await runTask(task);
      setProgress({ current: 1, total: 1 });
      setProgress(null);
      setRunning(false);
    },
    [runTask]
  );

  const openOutputFolder = useCallback((path: string) => {
    invoke("open_folder", { path });
  }, []);

  return {
    tasks,
    outputDir,
    setOutputDir,
    compressMode,
    setCompressMode,
    addPaths,
    removeTask,
    setTaskCrop,
    setTaskCroppedPath,
    setTaskSelected,
    toggleSelectAll,
    runTask,
    runSingleTask,
    runAll,
    runSelectedByType,
    running,
    progress,
    openOutputFolder,
  };
}
