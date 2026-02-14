/** 图片详情页处理参数 */
export interface ProcessingSettings {
  quality: number;
  format: "auto" | "jpeg" | "png" | "webp";
  width: number;
  height: number;
}

export const DEFAULT_WIDTH = 1920;
export const DEFAULT_HEIGHT = 1080;
