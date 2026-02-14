use image::codecs::png::{CompressionType, FilterType};
use image::{DynamicImage, ExtendedColorType, GenericImageView, ImageEncoder, ImageFormat};
use std::path::{Path, PathBuf};

use crate::{CompressMode, CropOptions, CropRegion, ProcessOptions};

pub struct ImageMetadata {
    pub size_bytes: u64,
    pub format: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

pub fn get_file_info(path: &str) -> Result<ImageMetadata, String> {
    let path_buf = Path::new(path);
    if !path_buf.exists() {
        return Err("File not found".into());
    }

    let size_bytes = std::fs::metadata(path).map_err(|e| e.to_string())?.len();
    let ext = path_buf
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_string());

    let (format, width, height) = match image::open(path) {
        Ok(img) => {
            let (w, h) = img.dimensions();
            let fmt = ImageFormat::from_path(path_buf)
                .ok()
                .and_then(|f| match f {
                    ImageFormat::Png => Some("png".into()),
                    ImageFormat::Jpeg => Some("jpeg".into()),
                    ImageFormat::WebP => Some("webp".into()),
                    ImageFormat::Gif => Some("gif".into()),
                    ImageFormat::Bmp => Some("bmp".into()),
                    ImageFormat::Tiff => Some("tiff".into()),
                    _ => ext.clone(),
                });
            (fmt, Some(w), Some(h))
        }
        Err(_) => (ext, None, None),
    };

    Ok(ImageMetadata {
        size_bytes,
        format,
        width,
        height,
    })
}

pub fn load_image(path: &str) -> Result<DynamicImage, String> {
    image::open(path).map_err(|e| e.to_string())
}

pub fn apply_crop(img: DynamicImage, crop_region: &CropRegion) -> Result<DynamicImage, String> {
    let (w, h) = img.dimensions();
    validate_crop_bounds(w, h, crop_region)?;

    Ok(img.crop_imm(
        crop_region.x,
        crop_region.y,
        crop_region.width,
        crop_region.height,
    ))
}

/// 统一裁剪区域越界校验，避免重复逻辑和潜在 u32 溢出。
fn validate_crop_bounds(w: u32, h: u32, crop_region: &CropRegion) -> Result<(), String> {
    let right = crop_region
        .x
        .checked_add(crop_region.width)
        .ok_or_else(|| "Crop region overflow on x + width".to_string())?;
    let bottom = crop_region
        .y
        .checked_add(crop_region.height)
        .ok_or_else(|| "Crop region overflow on y + height".to_string())?;

    if right > w || bottom > h {
        return Err(format!(
            "Crop region out of bounds: image {}x{}, region x={} y={} {}x{}",
            w, h, crop_region.x, crop_region.y, crop_region.width, crop_region.height
        ));
    }

    Ok(())
}

pub fn apply_resize(img: DynamicImage, options: Option<&ProcessOptions>) -> DynamicImage {
    let (orig_w, orig_h) = img.dimensions();
    let (target_w, target_h) = resolve_target_dimensions(&img, options);
    if target_w != orig_w || target_h != orig_h {
        return img.resize(target_w, target_h, image::imageops::FilterType::Lanczos3);
    }
    img
}

/// 根据可选参数推导缩放目标尺寸；未指定则保留原图尺寸。
fn resolve_target_dimensions(img: &DynamicImage, options: Option<&ProcessOptions>) -> (u32, u32) {
    let (orig_w, orig_h) = img.dimensions();
    let target_w = options
        .and_then(|opts| opts.width)
        .filter(|w| *w > 0)
        .unwrap_or(orig_w);
    let target_h = options
        .and_then(|opts| opts.height)
        .filter(|h| *h > 0)
        .unwrap_or(orig_h);
    (target_w, target_h)
}

pub fn resolve_output_format(path: &str, options: Option<&ProcessOptions>) -> String {
    let input_ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    if let Some(opts) = options {
        if let Some(format) = &opts.format {
            let normalized = format.trim().to_lowercase();
            if !normalized.is_empty() && normalized != "auto" {
                return normalized;
            }
        }
    }
    input_ext
}

pub fn save_image_with_format(
    img: &DynamicImage,
    output_path: &str,
    format: &str,
    mode: &CompressMode,
    quality: Option<u8>,
) -> Result<(), String> {
    save_image_with_format_progress(img, output_path, format, mode, quality, |_| {})
}

pub fn save_image_with_format_progress<F>(
    img: &DynamicImage,
    output_path: &str,
    format: &str,
    mode: &CompressMode,
    quality: Option<u8>,
    mut progress_callback: F,
) -> Result<(), String>
where
    F: FnMut(f32),
{
    progress_callback(0.0);
    match format {
        "png" => compress_png(img, output_path, mode, &mut progress_callback),
        "jpg" | "jpeg" => compress_jpeg(img, output_path, mode, quality, &mut progress_callback),
        "webp" => compress_webp(img, output_path, mode, quality, &mut progress_callback),
        _ => {
            progress_callback(20.0);
            img.save(output_path).map_err(|e| e.to_string())?;
            progress_callback(100.0);
            Ok(())
        }
    }
}

pub fn compress_image<F>(
    path: &str,
    output_path: &str,
    mode: &CompressMode,
    crop_region: Option<&CropRegion>,
    options: Option<&ProcessOptions>,
    mut progress_callback: F,
) -> Result<(), String>
where
    F: FnMut(u8),
{
    // 1) 读取图片
    let mut img = load_image(path)?;
    progress_callback(10); // 读取完成

    // 2) 可选裁剪
    if let Some(region) = crop_region {
        img = apply_crop(img, region)?;
    }
    progress_callback(30); // 裁剪完成

    // 3) 可选缩放
    let (orig_w, orig_h) = img.dimensions();
    let (target_w, target_h) = resolve_target_dimensions(&img, options);
    img = apply_resize(img, options);
    progress_callback(60); // resize完成

    // 4) 编码格式选择（优先 options.format，否则沿用原扩展名）
    let format = resolve_output_format(path, options);

    // 5) 编码输出
    let quality = options.and_then(|opts| opts.quality);
    save_image_with_format(&img, output_path, &format, mode, quality)?;
    progress_callback(90); // 编码完成


    // 6) 无任何显式处理时，若输出更大则回退到原图，避免体积倒挂。
    let has_explicit_processing = options.is_some_and(|opts| {
        opts.quality.is_some()
            || opts.format.as_deref().is_some_and(|f| {
                let trimmed = f.trim();
                !trimmed.is_empty() && trimmed != "auto"
            })
            || opts.width.unwrap_or(0) > 0
            || opts.height.unwrap_or(0) > 0
    });

    if crop_region.is_none()
        && target_w == orig_w
        && target_h == orig_h
        && !has_explicit_processing
        && Path::new(path) != Path::new(output_path)
    {
        let input_size = std::fs::metadata(path).map_err(|e| e.to_string())?.len();
        let output_size = std::fs::metadata(output_path).map_err(|e| e.to_string())?.len();

        if output_size >= input_size {
            std::fs::remove_file(output_path).ok();
            std::fs::copy(path, output_path).map_err(|e| e.to_string())?;
        }
    }
    progress_callback(100); // 完成
    Ok(())
}


fn compress_png(
    img: &image::DynamicImage,
    output_path: &str,
    mode: &CompressMode,
    progress_callback: &mut dyn FnMut(f32),
) -> Result<(), String> {
    progress_callback(5.0);
    let mut buf = Vec::new();
    let (w, h) = img.dimensions();
    let raw = img.to_rgba8();
    {
        let png_encoder = image::codecs::png::PngEncoder::new_with_quality(
            &mut buf,
            CompressionType::Default,
            FilterType::Adaptive,
        );
        png_encoder
            .write_image(raw.as_raw(), w, h, ExtendedColorType::Rgba8)
            .map_err(|e: image::ImageError| e.to_string())?;
    }
    progress_callback(35.0);

    match mode {
        CompressMode::Lossless => {
            let mut opt = oxipng::Options::from_preset(3);
            opt.optimize_alpha = true;
            let in_file = std::env::temp_dir().join("cruncher_png_input.png");
            std::fs::write(&in_file, &buf).map_err(|e| e.to_string())?;
            progress_callback(55.0);
            let in_file_oxi = oxipng::InFile::Path(in_file.clone());
            let out_file = oxipng::OutFile::from_path(PathBuf::from(output_path));
            progress_callback(75.0);
            oxipng::optimize(&in_file_oxi, &out_file, &opt).map_err(|e| e.to_string())?;
            let _ = std::fs::remove_file(in_file);
            progress_callback(100.0);
        }
        CompressMode::VisuallyLossless => {
            std::fs::write(output_path, &buf).map_err(|e| e.to_string())?;
            progress_callback(100.0);
        }
    }
    Ok(())
}

fn compress_jpeg(
    img: &image::DynamicImage,
    output_path: &str,
    mode: &CompressMode,
    quality: Option<u8>,
    progress_callback: &mut dyn FnMut(f32),
) -> Result<(), String> {
    progress_callback(5.0);
    let quality = quality.unwrap_or(match mode {
        CompressMode::Lossless => 100,
        CompressMode::VisuallyLossless => 96,
    });
    let quality = quality.clamp(1, 100);
    let rgb = img.to_rgb8();
    progress_callback(20.0);
    let (w, h) = rgb.dimensions();
    let mut buf = Vec::new();
    {
        let mut encoder =
            image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, quality);
        encoder
            .encode(rgb.as_raw(), w, h, ExtendedColorType::Rgb8)
            .map_err(|e| e.to_string())?;
    }
    progress_callback(75.0);
    // Encoder must be dropped so any buffered data is flushed to buf before we write.
    if buf.is_empty() {
        return Err("JPEG encoding produced empty output".into());
    }
    std::fs::write(output_path, &buf).map_err(|e| e.to_string())?;
    progress_callback(100.0);
    Ok(())
}

fn compress_webp(
    img: &image::DynamicImage,
    output_path: &str,
    mode: &CompressMode,
    quality: Option<u8>,
    progress_callback: &mut dyn FnMut(f32),
) -> Result<(), String> {
    progress_callback(5.0);
    let rgb = img.to_rgb8();
    progress_callback(20.0);
    let (w, h) = rgb.dimensions();
    let encoder = webp::Encoder::from_rgb(rgb.as_raw(), w, h);
    let quality = quality.unwrap_or(96).clamp(1, 100) as f32;
    let buf = match mode {
        CompressMode::Lossless => encoder.encode_lossless(),
        CompressMode::VisuallyLossless => encoder.encode(quality),
    };
    progress_callback(80.0);
    std::fs::write(output_path, &*buf).map_err(|e| e.to_string())?;
    progress_callback(100.0);
    Ok(())
}


// 裁剪图片（支持矩形/圆形、输出格式）
pub fn perform_crop(
    input_path: &str,
    output_path: &str,
    options: &CropOptions,
) -> Result<(), String> {
    let img = load_image(input_path).map_err(|e| format!("Failed to open image: {e}"))?;
    let crop_region = CropRegion {
        x: options.x,
        y: options.y,
        width: options.width,
        height: options.height,
    };
    let cropped = apply_crop(img, &crop_region).map_err(|e| format!("Crop failed: {e}"))?;

    // 是否圆形裁剪
    if options.circular.unwrap_or(false) {
        let mut rgba = cropped.to_rgba8();
        let (w, h) = rgba.dimensions();
        let radius = w.min(h) / 2;
        let center = (w / 2, h / 2);

        for x in 0..w {
            for y in 0..h {
                let dx = x as i32 - center.0 as i32;
                let dy = y as i32 - center.1 as i32;

                if dx * dx + dy * dy > (radius as i32 * radius as i32) {
                    rgba.get_pixel_mut(x, y).0[3] = 0;
                }
            }
        }

        rgba.save(output_path)
            .map_err(|e| format!("Save failed: {e}"))?;

        return Ok(());
    }

    // 普通裁剪保存
    let format = match options.output_format
        .as_deref()
        .unwrap_or("png")
    {
        "jpg" | "jpeg" => ImageFormat::Jpeg,
        "webp" => ImageFormat::WebP,
        _ => ImageFormat::Png,
    };

    cropped
        .save_with_format(output_path, format)
        .map_err(|e| format!("Save failed: {e}"))?;

    Ok(())
}