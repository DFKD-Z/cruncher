import { Channel, invoke } from "@tauri-apps/api/core";
import { join, tempDir } from "@tauri-apps/api/path";
import type { CropRegion, ProcessOptions } from "../types";

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

  const progressChannel = new Channel<number>();
  if (progressCallback) {
    progressChannel.onmessage = (progress) => {
      progressCallback(Math.max(0, Math.min(100, Math.round(progress))));
    };
  }

  const outputPath =
    providedOutputPath ??
    (await (async () => {
      const temp = await tempDir();
      const safeId = path.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 50);
      const ext = path.includes(".") ? path.slice(path.lastIndexOf(".")) : ".png";
      return join(temp, `cruncher_preview_${safeId}${ext}`);
    })());

  await invoke("compress_image", {
    path,
    outputPath,
    mode: "visuallyLossless",
    cropRegion: cropRegion ?? undefined,
    options: options ?? undefined,
    progressCallback: progressChannel,
  });

  const info = await invoke<{ size_bytes: number }>("get_file_info", {
    path: outputPath,
  }).catch(() => ({ size_bytes: 0 }));

  return {
    outputPath,
    sizeBytes: info.size_bytes ?? 0,
  };
}
