import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { compressImage } from "../utils/compressImage";
import type {
  CompressTask,
  CompressMode,
  CropRegion,
  ImagePipelineStage,
  ImageJobProgressEvent,
  ImageJobRequest,
  ImageJobState,
} from "../types";

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

type DetailJobKind = "render" | "crop";

interface DetailJobNotification {
  id: string;
  taskId: string;
  kind: DetailJobKind;
  status: "completed" | "failed" | "cancelled";
  taskName: string;
  error?: string;
}

export function useCompress() {
  const [tasks, setTasks] = useState<CompressTask[]>([]);
  const [outputDir, setOutputDir] = useState<string | null>(null);
  const [compressMode, setCompressMode] = useState<CompressMode>("visuallyLossless");
  const [running, setRunning] = useState(false);
  /** 压缩进度：当前完成数 / 总数，仅在 running 时有值 */
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [activeImageJobId, setActiveImageJobId] = useState<string | null>(null);
  const [detailNotifications, setDetailNotifications] = useState<
    DetailJobNotification[]
  >([]);

  const pushDetailNotification = useCallback((payload: DetailJobNotification) => {
    setDetailNotifications((prev) => [...prev, payload]);
  }, []);

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

  const runDetailImageJob = useCallback(
    async (params: {
      task: CompressTask;
      inputPath: string;
      kind: DetailJobKind;
      cropRegion?: CropRegion;
      options?: ImageJobRequest["options"];
      pipeline?: ImagePipelineStage[];
    }) => {
      const { task, inputPath, kind, cropRegion, options, pipeline } = params;

      setTasks((prev) =>
        prev.map((item) =>
          item.id === task.id
            ? {
                ...item,
                status: "compressing",
                progressPercent: 0,
                error: undefined,
                detailJobType: kind,
                ...(kind === "crop"
                  ? {
                      outputPath: undefined,
                      outputSizeBytes: undefined,
                    }
                  : {}),
              }
            : item
        )
      );

      let targetJobId: string | null = null;
      const request: ImageJobRequest = {
        inputs: [inputPath],
        outputDir: outputDir ?? undefined,
        mode: compressMode,
        cropRegion,
        options,
        pipeline,
      };

      const unlisten = await listen<ImageJobProgressEvent>(
        "image-job-progress",
        (event) => {
          if (!targetJobId) return;
          const payload = event.payload;
          if (payload.jobId !== targetJobId) return;

          if (payload.inputPath) {
            if (payload.status === "running") {
              setTasks((prev) =>
                prev.map((item) =>
                  item.id === task.id
                    ? {
                        ...item,
                        status: "compressing",
                        progressPercent: Math.max(
                          0,
                          Math.min(100, Math.round(payload.stageProgress))
                        ),
                      }
                    : item
                )
              );
            }

            if (payload.status === "completed") {
              const nextOutputPath = payload.outputPath ?? undefined;
              if (kind === "render" && nextOutputPath) {
                invoke<{ size_bytes: number }>("get_file_info", {
                  path: nextOutputPath,
                })
                  .then((info) => {
                    setTasks((prev) =>
                      prev.map((item) =>
                        item.id === task.id
                          ? {
                              ...item,
                              outputSizeBytes: info.size_bytes ?? item.outputSizeBytes,
                            }
                          : item
                      )
                    );
                  })
                  .catch(() => {
                    // 忽略体积查询失败，保留已有数据
                  });
              }

              setTasks((prev) =>
                prev.map((item) => {
                  if (item.id !== task.id) return item;
                  if (kind === "crop") {
                    return {
                      ...item,
                      status: "pending",
                      croppedImagePath: nextOutputPath ?? item.croppedImagePath,
                      outputPath: undefined,
                      outputSizeBytes: undefined,
                      progressPercent: undefined,
                      detailJobType: kind,
                    };
                  }
                  return {
                    ...item,
                    status: "done",
                    outputPath: nextOutputPath ?? item.outputPath,
                    progressPercent: 100,
                    detailJobType: kind,
                  };
                })
              );
            }

            if (payload.status === "failed" || payload.status === "cancelled") {
              setTasks((prev) =>
                prev.map((item) => {
                  if (item.id !== task.id) return item;
                  if (kind === "crop") {
                    return {
                      ...item,
                      status: "pending",
                      error: payload.error ?? item.error,
                      progressPercent: undefined,
                      detailJobType: kind,
                    };
                  }
                  return {
                    ...item,
                    status: payload.status === "cancelled" ? "cancelled" : "error",
                    error: payload.error ?? item.error,
                    progressPercent: Math.max(
                      0,
                      Math.min(100, Math.round(payload.stageProgress))
                    ),
                    detailJobType: kind,
                  };
                })
              );
            }
          }

          if (
            !payload.inputPath &&
            (payload.status === "completed" ||
              payload.status === "failed" ||
              payload.status === "cancelled")
          ) {
            unlisten();
            pushDetailNotification({
              id: `${task.id}-${targetJobId}-${Date.now()}`,
              taskId: task.id,
              kind,
              status: payload.status,
              taskName: task.name,
              error: payload.error,
            });
          }
        }
      );

      try {
        targetJobId = await invoke<string>("create_image_job", { request });
      } catch (error) {
        unlisten();
        const message = error instanceof Error ? error.message : String(error);
        setTasks((prev) =>
          prev.map((item) => {
            if (item.id !== task.id) return item;
            if (kind === "crop") {
              return {
                ...item,
                status: "pending",
                error: message,
                progressPercent: undefined,
                detailJobType: kind,
              };
            }
            return {
              ...item,
              status: "error",
              error: message,
              progressPercent: undefined,
              detailJobType: kind,
            };
          })
        );
        pushDetailNotification({
          id: `${task.id}-local-failed-${Date.now()}`,
          taskId: task.id,
          kind,
          status: "failed",
          taskName: task.name,
          error: message,
        });
      }
    },
    [compressMode, outputDir, pushDetailNotification]
  );

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
        let outputSizeBytes = 0;
        if (task.type === "image") {
          const result = await compressImage({
            path: task.croppedImagePath ?? task.path,
            outputPath,
            cropRegion: task.cropRegion ?? undefined,
            options: { quality: 60 },
            progressCallback: (p) => {
              setTasks((prev) =>
                prev.map((t) =>
                  t.id === task.id
                    ? { ...t, progressPercent: Math.max(0, Math.min(100, Math.round(p))) }
                    : t
                )
              );
            },
          });
          outputSizeBytes = result.sizeBytes;
          if (outputSizeBytes === 0) {
            throw new Error("Compression produced empty file (0 bytes)");
          }
        } else {
          await invoke("compress_video", {
            path: task.path,
            outputPath,
            mode: compressMode,
          });
          const info = await invoke<{ size_bytes: number }>("get_file_info", {
            path: outputPath,
          }).catch(() => ({ size_bytes: 0 }));
          outputSizeBytes = info.size_bytes ?? 0;
        }
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

      if (type === "image") {
        setRunning(true);
        setProgress({ current: 0, total: pending.length });
        setTasks((prev) =>
          prev.map((t) => {
            const idx = pending.findIndex((p) => p.id === t.id);
            if (idx < 0) return t;
            return { ...t, status: "compressing", progressPercent: 0 };
          })
        );

        const inputs = pending.map((task) => task.croppedImagePath ?? task.path);
        const request: ImageJobRequest = {
          inputs,
          outputDir: outputDir ?? undefined,
          mode: compressMode,
          options: { quality: 60 },
        };

        let targetJobId: string | null = null;
        const doneSet = new Set<string>();

        try {
          await new Promise<void>(async (resolve, reject) => {
            const unlisten = await listen<ImageJobProgressEvent>(
              "image-job-progress",
              (event) => {
                if (!targetJobId) return;
                const payload = event.payload;
                if (payload.jobId !== targetJobId) return;

                const index = payload.fileIndex;
                const task = pending[index];
                if (task && payload.inputPath) {
                  if (payload.status === "running") {
                    setTasks((prev) =>
                      prev.map((t) =>
                        t.id === task.id
                          ? {
                              ...t,
                              status: "compressing",
                              progressPercent: Math.max(
                                0,
                                Math.min(100, Math.round(payload.stageProgress))
                              ),
                            }
                          : t
                      )
                    );
                  }

                  if (payload.status === "completed") {
                    doneSet.add(task.id);
                    setProgress({ current: doneSet.size, total: pending.length });
                    setTasks((prev) =>
                      prev.map((t) =>
                        t.id === task.id
                          ? {
                              ...t,
                              status: "done",
                              outputPath: payload.outputPath ?? t.outputPath,
                              progressPercent: 100,
                            }
                          : t
                      )
                    );
                  }

                  if (payload.status === "failed" || payload.status === "cancelled") {
                    doneSet.add(task.id);
                    setProgress({ current: doneSet.size, total: pending.length });
                    setTasks((prev) =>
                      prev.map((t) =>
                        t.id === task.id
                          ? {
                              ...t,
                              status: payload.status === "failed" ? "error" : "cancelled",
                              error: payload.error,
                              progressPercent: Math.max(
                                0,
                                Math.min(100, Math.round(payload.stageProgress))
                              ),
                            }
                          : t
                      )
                    );
                  }
                }

                if (
                  !payload.inputPath &&
                  (payload.status === "completed" ||
                    payload.status === "failed" ||
                    payload.status === "cancelled")
                ) {
                  unlisten();
                  resolve();
                }
              }
            );

            try {
              targetJobId = await invoke<string>("create_image_job", { request });
              setActiveImageJobId(targetJobId);
            } catch (error) {
              unlisten();
              reject(error);
            }
          });

          if (targetJobId) {
            const snapshot = await invoke<ImageJobState>("get_image_job", {
              jobId: targetJobId,
            });
            setTasks((prev) =>
              prev.map((item) => {
                const index = pending.findIndex((task) => task.id === item.id);
                if (index < 0) return item;
                const file = snapshot.files[index];
                if (!file) return item;
                const nextStatus =
                  file.status === "completed"
                    ? "done"
                    : file.status === "failed"
                      ? "error"
                      : file.status === "cancelled"
                        ? "cancelled"
                        : "compressing";
                return {
                  ...item,
                  status: nextStatus,
                  outputPath: file.outputPath ?? item.outputPath,
                  progressPercent: Math.max(0, Math.min(100, Math.round(file.progress))),
                  error: file.error ?? item.error,
                };
              })
            );
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const canFallback = message.includes("create_image_job");
          if (canFallback) {
            for (let i = 0; i < pending.length; i++) {
              await runTask(pending[i]);
              setProgress({ current: i + 1, total: pending.length });
            }
          } else {
            setTasks((prev) =>
              prev.map((task) =>
                pending.some((p) => p.id === task.id)
                  ? { ...task, status: "error", error: message }
                  : task
              )
            );
          }
        } finally {
          setActiveImageJobId(null);
          setProgress(null);
          setRunning(false);
        }
        return;
      }

      setRunning(true);
      setProgress({ current: 0, total: pending.length });
      for (let i = 0; i < pending.length; i++) {
        await runTask(pending[i]);
        setProgress({ current: i + 1, total: pending.length });
      }
      setProgress(null);
      setRunning(false);
    },
    [tasks, runTask, outputDir, compressMode]
  );

  const runImageDetailRender = useCallback(
    async (params: {
      task: CompressTask;
      inputPath: string;
      cropRegion?: CropRegion;
      options: NonNullable<ImageJobRequest["options"]>;
    }) => {
      await runDetailImageJob({
        task: params.task,
        inputPath: params.inputPath,
        kind: "render",
        cropRegion: params.cropRegion,
        options: params.options,
      });
    },
    [runDetailImageJob]
  );

  const runImageDetailCrop = useCallback(
    async (params: {
      task: CompressTask;
      inputPath: string;
      cropRegion: CropRegion;
    }) => {
      await runDetailImageJob({
        task: params.task,
        inputPath: params.inputPath,
        kind: "crop",
        cropRegion: params.cropRegion,
        pipeline: ["crop", "save"],
      });
    },
    [runDetailImageJob]
  );

  const resetTaskOutput = useCallback((id: string) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id
          ? {
              ...task,
              status: "pending",
              outputPath: undefined,
              outputSizeBytes: undefined,
              progressPercent: undefined,
              error: undefined,
              detailJobType: undefined,
            }
          : task
      )
    );
  }, []);

  const dismissDetailNotification = useCallback((id: string) => {
    setDetailNotifications((prev) => prev.filter((item) => item.id !== id));
  }, []);

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

  const cancelActiveImageJob = useCallback(async () => {
    if (!activeImageJobId) return;
    await invoke("cancel_image_job", { jobId: activeImageJobId });
  }, [activeImageJobId]);

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
    runImageDetailRender,
    runImageDetailCrop,
    resetTaskOutput,
    running,
    progress,
    openOutputFolder,
    activeImageJobId,
    cancelActiveImageJob,
    detailNotifications,
    dismissDetailNotification,
  };
}
