import { useCallback, useState } from "react";
import { join, tempDir } from "@tauri-apps/api/path";
import { compressImage } from "../utils/compressImage";
import type { CropRegion, ProcessOptions } from "../types";

export interface UseImageProcessParams {
  path: string;
  cropRegion?: CropRegion;
  options: ProcessOptions & {
    quality: number;
    format: string;
    width: number;
    height: number;
  };
  /** Optional id for temp filename (e.g. task.id) */
  tempId?: string;
}

export interface UseImageProcessResult {
  processImage: (params: UseImageProcessParams) => Promise<{
    outputPath: string;
    sizeBytes: number;
  }>;
  isProcessing: boolean;
  progress: number;
}

export function useImageProcess(): UseImageProcessResult {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  const processImage = useCallback(
    async (
      params: UseImageProcessParams
    ): Promise<{ outputPath: string; sizeBytes: number }> => {
      const { path, cropRegion, options, tempId } = params;
      setIsProcessing(true);
      setProgress(0);
      try {
        const format =
          options.format === "auto" || !options.format ? undefined : options.format;
        const srcExt = path.includes(".")
          ? path.split(".").pop()?.toLowerCase()
          : "png";
        const normalizedSrcExt = srcExt === "jpg" ? "jpeg" : (srcExt ?? "png");
        const resolvedFormat =
          format ??
          (normalizedSrcExt === "jpeg" ||
          normalizedSrcExt === "webp" ||
          normalizedSrcExt === "png"
            ? normalizedSrcExt
            : "png");
        const ext = resolvedFormat === "jpeg" ? "jpg" : resolvedFormat;
        const temp = await tempDir();
        const safeId = (tempId ?? path).replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 50);
        const outputPath = await join(temp, `cruncher_preview_${safeId}.${ext}`);

        const result = await compressImage({
          path,
          outputPath,
          cropRegion,
          options: {
            quality: Math.max(1, Math.min(100, options.quality)),
            format: options.format,
            width: Math.max(1, options.width),
            height: Math.max(1, options.height),
          },
          progressCallback: (p) => setProgress(p),
        });
        return result;
      } finally {
        setIsProcessing(false);
        setProgress(0);
      }
    },
    []
  );

  return { processImage, isProcessing, progress };
}
