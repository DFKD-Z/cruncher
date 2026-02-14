import { useCallback, useState } from "react";
import { useNavigate, useParams, Routes, Route, Navigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { tempDir, join } from "@tauri-apps/api/path";
import { open, save } from "@tauri-apps/plugin-dialog";
import { Sun, Moon } from "lucide-react";
import { useI18n } from "./hooks/useI18n";
import { useTheme } from "./hooks/useTheme";
import { ImportWorkspace } from "./components/ImportWorkspace";
import { AssetGrid } from "./components/AssetGrid";
import { FfmpegBanner } from "./components/FfmpegBanner";
import { CropPage } from "./components/CropPage";
import { PreviewModal } from "./components/PreviewModal";
import { ImageDetailPage } from "./pages/ImageDetailPage";
import { useFfmpegCheck } from "./hooks/useFfmpegCheck";
import { useCompress } from "./hooks/useCompress";
import type { CompressTask } from "./types";

type TabId = "image" | "video";

interface ImageDetailRouteProps {
  imageTasks: CompressTask[];
  running: boolean;
  runSingleTask: (task: CompressTask) => void;
  handleDownloadOutput: (task: CompressTask) => void;
  handleApplyCrop: (task: CompressTask, crop: { x: number; y: number; width: number; height: number }) => Promise<void>;
  onBack: () => void;
}

function ImageDetailRoute({
  imageTasks,
  running,
  runSingleTask,
  handleDownloadOutput,
  handleApplyCrop,
  onBack,
}: ImageDetailRouteProps) {
  const { taskId: rawTaskId } = useParams<{ taskId: string }>();
  const taskId = rawTaskId ? decodeURIComponent(rawTaskId) : null;
  const task = taskId
    ? (imageTasks.find((t) => t.id === taskId) ?? null)
    : null;
  if (!task || task.type !== "image") {
    return <Navigate to="/" replace />;
  }
  return (
    <ImageDetailPage
      task={task}
      running={running}
      onBack={onBack}
      onApplyCrop={(crop) => handleApplyCrop(task, crop)}
      onApplyProcess={() => runSingleTask(task)}
      onSave={() => handleDownloadOutput(task)}
    />
  );
}

export default function App() {
  const { t } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const { result: ffmpegResult } = useFfmpegCheck();
  const [activeTab, setActiveTab] = useState<TabId>("image");
  const {
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
    runSelectedByType,
    runSingleTask,
    running,
    progress,
    openOutputFolder,
  } = useCompress();

  const navigate = useNavigate();
  const [cropTask, setCropTask] = useState<CompressTask | null>(null);
  const [fileAdding, setFileAdding] = useState(false);
  const [fileAddingProgress, setFileAddingProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [previewItem, setPreviewItem] = useState<{ path: string; type: "image" | "video" } | null>(null);

  const BATCH_SIZE = 8;

  const imageTasks = tasks.filter((x) => x.type === "image");
  const videoTasks = tasks.filter((x) => x.type === "video");
  const currentTasks = activeTab === "image" ? imageTasks : videoTasks;
  const selectedPendingCount = currentTasks.filter(
    (x) => x.status === "pending" && x.selected
  ).length;

  const handleFilesSelected = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return;
      setFileAdding(true);
      await new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));
      setFileAddingProgress({ current: 0, total: paths.length });
      try {
        for (let i = 0; i < paths.length; i += BATCH_SIZE) {
          const batchPaths = paths.slice(i, i + BATCH_SIZE);
          const batchInfos = new Map<
            string,
            { size_bytes: number; width?: number; height?: number; format?: string | null }
          >();
          await Promise.all(
            batchPaths.map(async (path) => {
              try {
                const info = await invoke<{
                  size_bytes: number;
                  width?: number;
                  height?: number;
                  format?: string | null;
                }>("get_file_info", { path });
                batchInfos.set(path, info);
              } catch {
                batchInfos.set(path, { size_bytes: 0 });
              }
            })
          );
          addPaths(batchPaths, batchInfos);
          setFileAddingProgress({
            current: Math.min(i + batchPaths.length, paths.length),
            total: paths.length,
          });
        }
      } finally {
        setFileAdding(false);
        setFileAddingProgress(null);
      }
    },
    [addPaths]
  );

  const handleImportFolder = useCallback(async () => {
    const selected = await open({ directory: true });
    if (selected == null) return;
    const dir = Array.isArray(selected) ? selected[0] : selected;
    if (!dir) return;
    try {
      const paths = await invoke<string[]>("list_image_files_in_directory", {
        dir,
      });
      if (paths.length > 0) {
        await handleFilesSelected(paths);
      }
    } catch (e) {
      console.error("list_image_files_in_directory failed", e);
    }
  }, [handleFilesSelected]);

  const handleCropConfirm = useCallback(
    async (crop: { x: number; y: number; width: number; height: number }) => {
      if (!cropTask) return;
      setTaskCrop(cropTask.id, crop);
      setCropTask(null);
      try {
        const temp = await tempDir();
        const ext = cropTask.name.includes(".")
          ? cropTask.name.slice(cropTask.name.lastIndexOf("."))
          : ".png";
        const safeId = cropTask.id.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 50);
        const outputPath = await join(temp, `cruncher_crop_${safeId}${ext}`);
        await invoke("crop_image", {
          path: cropTask.path,
          outputPath,
          cropRegion: crop,
        });
        setTaskCroppedPath(cropTask.id, outputPath);
      } catch {
        // Crop region already saved; cropped file preview will be missing
      }
    },
    [cropTask, setTaskCrop, setTaskCroppedPath]
  );

  const CROP_TIMEOUT_MS = 60_000;

  const handleApplyCrop = useCallback(
    async (task: CompressTask, crop: { x: number; y: number; width: number; height: number }) => {
      setTaskCrop(task.id, crop);
      const temp = await tempDir();
      const ext = task.name.includes(".")
        ? task.name.slice(task.name.lastIndexOf("."))
        : ".png";
      const safeId = task.id.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 50);
      const outputPath = await join(temp, `cruncher_crop_${safeId}${ext}`);
      const cropPromise = invoke("crop_image", {
        path: task.path,
        outputPath,
        cropRegion: crop,
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Crop timeout")), CROP_TIMEOUT_MS)
      );
      await Promise.race([cropPromise, timeoutPromise]);
      setTaskCroppedPath(task.id, outputPath);
    },
    [setTaskCrop, setTaskCroppedPath]
  );

  const handleDownloadCropped = useCallback(
    async (croppedPath: string, suggestedName: string) => {
      const path = await save({
        defaultPath: suggestedName,
      });
      if (path) {
        try {
          await invoke("copy_file", { from: croppedPath, to: path });
          openOutputFolder(path.replace(/[/\\][^/\\]+$/, ""));
        } catch (e) {
          console.error(e);
        }
      }
    },
    [openOutputFolder]
  );

  const handleDownloadOutput = useCallback(
    async (task: CompressTask) => {
      if (!task.outputPath) return;
      const base = task.outputPath.replace(/\\/g, "/").split("/").pop() ?? task.name;
      const path = await save({ defaultPath: base });
      if (path) {
        try {
          await invoke("copy_file", { from: task.outputPath, to: path });
          openOutputFolder(path.replace(/[/\\][^/\\]+$/, ""));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("copy_file failed", msg);
          if (msg.includes("empty") || msg.includes("0 bytes")) {
            window.alert(t("download.errorSourceEmpty"));
          } else {
            window.alert(t("download.errorCopy", { message: msg }));
          }
        }
      }
    },
    [openOutputFolder, t]
  );

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 transition-colors">
      <div className="max-w-8xl mx-auto">
        <Routes>
          {/* 更具体的路由放前面，避免 path="/" 匹配到 /image/xxx */}
          <Route
            path="/image/:taskId"
            element={
              <ImageDetailRoute
                imageTasks={imageTasks}
                running={running}
                runSingleTask={runSingleTask}
                handleDownloadOutput={handleDownloadOutput}
                handleApplyCrop={handleApplyCrop}
                onBack={() => navigate("/")}
              />
            }
          />
          <Route
            path="/"
            element={
              <>
                {activeTab === "video" && (
                  <FfmpegBanner show={ffmpegResult !== null && !ffmpegResult.available} />
                )}

                {/* 左右布局：固定高度，仅右侧列表可滚动 */}
                <div className="flex flex-col lg:flex-row gap-8 lg:gap-0 h-screen overflow-hidden">
                  {/* 左侧：上传区域（固定不随列表滚动）— 苹果风格 */}
                  <div className="shrink-0 lg:w-[42%] xl:w-[38%] lg:max-w-lg lg:pr-8 lg:border-r lg:border-zinc-200 dark:border-zinc-800 p-6">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="flex p-1.5 bg-zinc-200/80 dark:bg-zinc-900/80 border border-zinc-300 dark:border-zinc-700 rounded-xl w-fit">
                        <button
                          type="button"
                          onClick={() => setActiveTab("image")}
                          className={`px-4 py-2.5 text-xs font-semibold rounded-lg transition-all ${
                            activeTab === "image"
                              ? "bg-blue-500 text-white shadow-sm"
                              : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                          }`}
                        >
                          {t("tab.images")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab("video")}
                          className={`px-4 py-2.5 text-xs font-semibold rounded-lg transition-all ${
                            activeTab === "video"
                              ? "bg-blue-500 text-white shadow-sm"
                              : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                          }`}
                        >
                          {t("tab.videos")}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={toggleTheme}
                        title={theme === "dark" ? t("theme.light") : t("theme.dark")}
                        className="p-2 rounded-lg bg-zinc-200/80 dark:bg-zinc-900/80 border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:border-zinc-400 dark:hover:border-zinc-600 transition-all"
                        aria-label={t("theme.toggle")}
                      >
                        {theme === "dark" ? (
                          <Sun className="w-4 h-4" />
                        ) : (
                          <Moon className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    <ImportWorkspace
                      accept={activeTab === "image" ? "image" : "video"}
                      onFilesSelected={handleFilesSelected}
                      onImportFolder={activeTab === "image" ? handleImportFolder : undefined}
                      disabled={running || fileAdding}
                      fileAdding={fileAdding}
                      fileAddingProgress={fileAddingProgress}
                      compressMode={compressMode}
                      onCompressModeChange={setCompressMode}
                      outputDir={outputDir}
                      onOutputDirChange={setOutputDir}
                      onRun={() => runSelectedByType(activeTab)}
                      running={running}
                      progress={progress}
                      selectedPendingCount={selectedPendingCount}
                    />
                  </div>

                  {/* 右侧：资产列表（仅此区域可滚动） */}
                  <div className="flex-1 min-w-0 lg:pl-8 overflow-y-auto overflow-x-hidden p-6">
                    {activeTab === "image" && imageTasks.length > 0 && (
                      <AssetGrid
                        tasks={imageTasks}
                        taskType="image"
                        running={running}
                        onRemove={removeTask}
                        onCrop={setCropTask}
                        onOpenFolder={openOutputFolder}
                        onDownload={handleDownloadOutput}
                        onCompressSingle={runSingleTask}
                        onOpenDetail={(task) =>
                          navigate(`/image/${encodeURIComponent(task.id)}`)
                        }
                        onPreview={(path, type) =>
                          setPreviewItem({ path, type })
                        }
                        onDownloadCropped={handleDownloadCropped}
                        onToggleSelect={setTaskSelected}
                        onSelectAll={() => toggleSelectAll("image", true)}
                        onDeselectAll={() => toggleSelectAll("image", false)}
                      />
                    )}
                    {activeTab === "video" && videoTasks.length > 0 && (
                      <AssetGrid
                        tasks={videoTasks}
                        taskType="video"
                        running={running}
                        onRemove={removeTask}
                        onCrop={() => {}}
                        onOpenFolder={openOutputFolder}
                        onDownload={handleDownloadOutput}
                        onCompressSingle={runSingleTask}
                        onPreview={(path, type) =>
                          setPreviewItem({ path, type })
                        }
                        onToggleSelect={setTaskSelected}
                        onSelectAll={() => toggleSelectAll("video", true)}
                        onDeselectAll={() => toggleSelectAll("video", false)}
                      />
                    )}
                    {(activeTab === "image" ? imageTasks : videoTasks).length ===
                      0 && (
                      <div className="flex flex-col items-center justify-center py-20 text-zinc-500 dark:text-zinc-500">
                        <p className="text-sm font-medium">
                          {activeTab === "image"
                            ? t("dropzone.promptImage")
                            : t("dropzone.promptVideo")}
                        </p>
                        <p className="text-xs mt-1.5 text-zinc-500/80">{t("workspace.dropHint")}</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            }
          />
        </Routes>
      </div>

      {cropTask && cropTask.type === "image" && (
        <CropPage
          imagePath={cropTask.path}
          onConfirm={handleCropConfirm}
          onCancel={() => setCropTask(null)}
        />
      )}

      {previewItem && (
        <PreviewModal
          path={previewItem.path}
          type={previewItem.type}
          onClose={() => setPreviewItem(null)}
        />
      )}
    </div>
  );
}
