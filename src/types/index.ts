export type CompressMode = "lossless" | "visuallyLossless";

export interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Options for image compress (matches backend ProcessOptions) */
export interface ProcessOptions {
  quality?: number;
  format?: string;
  width?: number;
  height?: number;
}

export type TaskType = "image" | "video";

export type TaskStatus =
  | "pending"
  | "compressing"
  | "done"
  | "error"
  | "cancelled";

export interface CompressTask {
  id: string;
  type: TaskType;
  path: string;
  name: string;
  sizeBytes: number;
  status: TaskStatus;
  error?: string;
  outputPath?: string;
  outputSizeBytes?: number;
  cropRegion?: CropRegion | null;
  width?: number | null;
  height?: number | null;
  /** 是否参与批量压缩（多选） */
  selected: boolean;
  /** 当前压缩进度（0-100），仅压缩中有效 */
  progressPercent?: number;
  /** 裁剪后生成的临时文件路径，用于预览与下载 */
  croppedImagePath?: string | null;
}

export interface FfmpegCheckResult {
  available: boolean;
  path: string;
  version: string;
}

export type ImagePipelineStage = "crop" | "resize" | "convert" | "compress" | "save";

export type ImageJobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface ImageJobRequest {
  inputs: string[];
  outputDir?: string;
  mode?: CompressMode;
  cropRegion?: CropRegion;
  options?: ProcessOptions;
  pipeline?: ImagePipelineStage[];
  maxConcurrency?: number;
}

export interface ImageJobFileState {
  inputPath: string;
  outputPath?: string;
  status: ImageJobStatus;
  progress: number;
  error?: string;
}

export interface ImageJobState {
  jobId: string;
  status: ImageJobStatus;
  createdAtMs: number;
  startedAtMs?: number;
  completedAtMs?: number;
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  cancelledFiles: number;
  overallProgress: number;
  files: ImageJobFileState[];
}

export interface ImageJobProgressEvent {
  jobId: string;
  fileIndex: number;
  totalFiles: number;
  inputPath?: string;
  outputPath?: string;
  stage?: ImagePipelineStage;
  stageProgress: number;
  overallProgress: number;
  status: ImageJobStatus;
  message?: string;
  error?: string;
}
