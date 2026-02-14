import { centerCrop, makeAspectCrop, type PercentCrop } from "react-image-crop";

/** 以给定宽高与比例生成居中裁剪区域（百分比） */
export function centerAspectCrop(
  width: number,
  height: number,
  aspect: number
): PercentCrop {
  return centerCrop(
    makeAspectCrop(
      { unit: "%", width: 90 },
      aspect,
      width,
      height
    ),
    width,
    height
  );
}
