import { Channel, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { join, tempDir } from "@tauri-apps/api/path";
import type {
  CropRegion,
  ImageJobProgressEvent,
  ImageJobRequest,
  ImageJobState,
  ProcessOptions,
} from "../types";

export interface CompressImageParams {
  path: string;
  outputPath?: string;
  cropRegion?: CropRegion;
  options?: ProcessOptions;
  progressCallback?: (percent: number) => void;
}

export interface CompressImageResult {
  outputPath: string;
  sizeBytes: number;
}

/**
 * Invoke backend compress_image with optional crop and options.
 * If outputPath is not provided, generates a temp path and returns it.
 */
export async function compressImage(
  params: CompressImageParams
): Promise<CompressImageResult> {
  const {
    path,
    outputPath: providedOutputPath,
    cropRegion,
    options,
    progressCallback,
  } = params;

  const fallbackOutputPath =
    providedOutputPath ??
    (await (async () => {
      const temp = await tempDir();
      const safeId = path.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 50);
      const ext = path.includes(".") ? path.slice(path.lastIndexOf(".")) : ".png";
      return join(temp, `cruncher_preview_${safeId}${ext}`);
    })());

  const shouldForceLegacy = (() => {
    try {
      return localStorage.getItem("cruncher.useLegacyImageCommand") === "1";
    } catch {
      return false;
    }
  })();

  try {
    if (shouldForceLegacy) {
      throw new Error("create_image_job disabled by rollback flag");
    }
    const outputDir = fallbackOutputPath.replace(/[/\\][^/\\]+$/, "");
    const request: ImageJobRequest = {
      inputs: [path],
      outputDir,
      mode: "visuallyLossless",
      cropRegion: cropRegion ?? undefined,
      options: options ?? undefined,
    };

    let targetJobId: string | null = null;
    let settled = false;
    const timeoutMs = 120_000;

    const result = await new Promise<CompressImageResult>(async (resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const unlisten = await listen<ImageJobProgressEvent>(
        "image-job-progress",
        async (event) => {
          if (!targetJobId || settled) return;
          const payload = event.payload;
          if (payload.jobId !== targetJobId) return;

          if (progressCallback) {
            const p = Math.round(
              payload.totalFiles > 1 ? payload.overallProgress : payload.stageProgress
            );
            progressCallback(Math.max(0, Math.min(100, p)));
          }

          if (payload.status === "failed") {
            settled = true;
            if (timer) clearTimeout(timer);
            unlisten();
            reject(new Error(payload.error ?? "Image job failed"));
            return;
          }

          if (payload.status === "cancelled") {
            settled = true;
            if (timer) clearTimeout(timer);
            unlisten();
            reject(new Error(payload.error ?? "Image job cancelled"));
            return;
          }

          if (payload.status === "completed" && payload.fileIndex === 0) {
            settled = true;
            if (timer) clearTimeout(timer);
            unlisten();
            const snapshot = await invoke<ImageJobState>("get_image_job", {
              jobId: targetJobId,
            });
            const outputPath = snapshot.files?.[0]?.outputPath ?? fallbackOutputPath;
            const info = await invoke<{ size_bytes: number }>("get_file_info", {
              path: outputPath,
            }).catch(() => ({ size_bytes: 0 }));
            resolve({
              outputPath,
              sizeBytes: info.size_bytes ?? 0,
            });
          }
        }
      );

      timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        unlisten();
        reject(new Error("Image job timeout"));
      }, timeoutMs);

      try {
        targetJobId = await invoke<string>("create_image_job", { request });
      } catch (error) {
        if (timer) clearTimeout(timer);
        unlisten();
        reject(error);
      }
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      !message.includes("create_image_job") &&
      !message.includes("rollback flag")
    ) {
      throw error;
    }
    // Backward-compatible fallback for old backend.
    const progressChannel = new Channel<number>();
    if (progressCallback) {
      progressChannel.onmessage = (progress) => {
        progressCallback(Math.max(0, Math.min(100, Math.round(progress))));
      };
    }
    await invoke("compress_image", {
      path,
      outputPath: fallbackOutputPath,
      mode: "visuallyLossless",
      cropRegion: cropRegion ?? undefined,
      options: options ?? undefined,
      progressCallback: progressChannel,
    });
    const info = await invoke<{ size_bytes: number }>("get_file_info", {
      path: fallbackOutputPath,
    }).catch(() => ({ size_bytes: 0 }));
    return {
      outputPath: fallbackOutputPath,
      sizeBytes: info.size_bytes ?? 0,
    };
  }
}
