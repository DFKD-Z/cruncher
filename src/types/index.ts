export type CompressMode = "lossless" | "visuallyLossless";

export interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
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
