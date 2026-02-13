use image::codecs::png::{CompressionType, FilterType};
use image::{ExtendedColorType, GenericImageView, ImageEncoder, ImageFormat};
use std::path::{Path, PathBuf};

use crate::{CompressMode, CropRegion, ProcessOptions};

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

pub fn crop_image(path: &str, output_path: &str, crop_region: &CropRegion) -> Result<(), String> {
    let img = image::open(path).map_err(|e| e.to_string())?;
    let (w, h) = img.dimensions();
    if crop_region.x + crop_region.width > w || crop_region.y + crop_region.height > h {
        return Err(format!(
            "Crop region out of bounds: image {}x{}, region x={} y={} {}x{}",
            w, h, crop_region.x, crop_region.y, crop_region.width, crop_region.height
        ));
    }

    let cropped = img.crop_imm(
        crop_region.x,
        crop_region.y,
        crop_region.width,
        crop_region.height,
    );
    cropped.save(output_path).map_err(|e| e.to_string())?;
    Ok(())
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

    let mut img = image::open(path).map_err(|e| e.to_string())?;
    progress_callback(10); // 读取完成

    // ---- Crop ----
    if let Some(region) = crop_region {
        let (w, h) = img.dimensions();
        if region.x + region.width > w || region.y + region.height > h {
            return Err("Crop region out of bounds".into());
        }
        img = img.crop_imm(region.x, region.y, region.width, region.height);
    }
    progress_callback(30); // 裁剪完成

    // ---- Resize ----
    let default_opts = ProcessOptions {
        quality: None,
        format: None,
        width: None,
        height: None,
    };
    let opts = options.unwrap_or(&default_opts);
    let (orig_w, orig_h) = img.dimensions();

    let target_w = opts.width.filter(|w| *w > 0).unwrap_or(orig_w);
    let target_h = opts.height.filter(|h| *h > 0).unwrap_or(orig_h);

    if target_w != orig_w || target_h != orig_h {
        img = img.resize(target_w, target_h, image::imageops::FilterType::Lanczos3);
    }
    progress_callback(60); // resize完成

    // ---- Determine Format ----
    let input_ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let format = opts
        .format
        .clone()
        .filter(|f| !f.is_empty() && f != "auto")
        .unwrap_or(input_ext);

    // ---- Encode ----
    match format.as_str() {
        "png" => compress_png(&img, output_path, mode)?,
        "jpg" | "jpeg" => compress_jpeg(&img, output_path, mode, opts.quality)?,
        "webp" => compress_webp(&img, output_path, mode, opts.quality)?,
        _ => img.save(output_path).map_err(|e| e.to_string())?,
    }
    progress_callback(90); // 编码完成


    // ---- Fallback (prevent larger output) ----
    if crop_region.is_none()
        && target_w == orig_w
        && target_h == orig_h
        && opts.quality.is_none()
        && opts.format.is_none()
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


fn compress_png(img: &image::DynamicImage, output_path: &str, mode: &CompressMode) -> Result<(), String> {
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

    match mode {
        CompressMode::Lossless => {
            let mut opt = oxipng::Options::from_preset(2);
            opt.optimize_alpha = true;
            let in_file = std::env::temp_dir().join("cruncher_png_input.png");
            std::fs::write(&in_file, &buf).map_err(|e| e.to_string())?;
            let in_file_oxi = oxipng::InFile::Path(in_file.clone());
            let out_file = oxipng::OutFile::from_path(PathBuf::from(output_path));
            oxipng::optimize(&in_file_oxi, &out_file, &opt).map_err(|e| e.to_string())?;
            let _ = std::fs::remove_file(in_file);
        }
        CompressMode::VisuallyLossless => {
            std::fs::write(output_path, &buf).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn compress_jpeg(
    img: &image::DynamicImage,
    output_path: &str,
    mode: &CompressMode,
    quality: Option<u8>,
) -> Result<(), String> {
    let quality = quality.unwrap_or(match mode {
        CompressMode::Lossless => 98,
        CompressMode::VisuallyLossless => 95,
    });
    let quality = quality.clamp(1, 100);
    let rgb = img.to_rgb8();
    let (w, h) = rgb.dimensions();
    let mut buf = Vec::new();
    {
        let mut encoder =
            image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, quality);
        encoder
            .encode(rgb.as_raw(), w, h, ExtendedColorType::Rgb8)
            .map_err(|e| e.to_string())?;
    }
    // Encoder must be dropped so any buffered data is flushed to buf before we write.
    if buf.is_empty() {
        return Err("JPEG encoding produced empty output".into());
    }
    std::fs::write(output_path, &buf).map_err(|e| e.to_string())?;
    Ok(())
}

fn compress_webp(
    img: &image::DynamicImage,
    output_path: &str,
    mode: &CompressMode,
    quality: Option<u8>,
) -> Result<(), String> {
    let rgb = img.to_rgb8();
    let (w, h) = rgb.dimensions();
    let encoder = webp::Encoder::from_rgb(rgb.as_raw(), w, h);
    let quality = quality.unwrap_or(95).clamp(1, 100) as f32;
    let buf = match mode {
        CompressMode::Lossless => encoder.encode_lossless(),
        CompressMode::VisuallyLossless => encoder.encode(quality),
    };
    std::fs::write(output_path, &*buf).map_err(|e| e.to_string())?;
    Ok(())
}
