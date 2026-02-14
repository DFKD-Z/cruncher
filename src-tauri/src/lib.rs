//! Tauri commands for image/video compression tool.

use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;

mod core;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CropRegion {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessOptions {
    pub quality: Option<u8>,
    pub format: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CompressMode {
    Lossless,
    VisuallyLossless,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileInfo {
    pub path: String,
    pub size_bytes: u64,
    pub format: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

#[derive(Deserialize)]
pub struct CropOptions {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
    pub circular: Option<bool>,
    pub output_format: Option<String>, // "png" | "jpg" | "webp"
}

/// Open native file dialog and return selected file paths.
#[tauri::command]
fn pick_files(filters: Option<Vec<(String, Vec<String>)>>) -> Result<Vec<String>, String> {
    let mut dialog = rfd::FileDialog::new();
    if let Some(f) = filters {
        for (name, exts) in f {
            let exts: Vec<&str> = exts.iter().map(String::as_str).collect();
            dialog = dialog.add_filter(name, &exts);
        }
    }
    let paths = dialog.pick_files();
    Ok(paths
        .map(|p| {
            p.into_iter()
                .filter_map(|p| p.into_os_string().into_string().ok())
                .collect()
        })
        .unwrap_or_default())
}

/// Pick a single directory.
#[tauri::command]
fn pick_directory() -> Result<Option<String>, String> {
    let path = rfd::FileDialog::new().pick_folder();
    Ok(path.and_then(|p| p.into_os_string().into_string().ok()))
}

/// Image extensions for folder import (lowercase).
const IMAGE_EXT: &[&str] = &["png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff", "tif"];

/// List image file paths in a directory (one level, no recursion).
#[tauri::command]
fn list_image_files_in_directory(dir: String) -> Result<Vec<String>, String> {
    let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
    let mut paths = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension() {
                let ext = ext.to_string_lossy().to_lowercase();
                if IMAGE_EXT.contains(&ext.as_str()) {
                    if let Some(p) = path.to_str() {
                        paths.push(p.to_string());
                    }
                }
            }
        }
    }
    paths.sort();
    Ok(paths)
}

/// Get file metadata: size, and for images dimensions and format.
/// Runs in a blocking thread so the IPC thread is not blocked when loading many files.
#[tauri::command]
async fn get_file_info(path: String) -> Result<FileInfo, String> {
    let path_clone = path.clone();
    let meta = tauri::async_runtime::spawn_blocking(move || core::image::get_file_info(&path_clone))
        .await
        .map_err(|e| e.to_string())??;

    Ok(FileInfo {
        path,
        size_bytes: meta.size_bytes,
        format: meta.format,
        width: meta.width,
        height: meta.height,
    })
}

/// Compress image: optional crop first, then compress by format and mode.
/// Runs in a blocking thread so progress_callback can be delivered to the frontend during execution.
#[tauri::command]
async fn compress_image(
    path: String,
    output_path: String,
    mode: CompressMode,
    crop_region: Option<CropRegion>,
    options: Option<ProcessOptions>,
    progress_callback: Channel<u8>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        core::image::compress_image(
            &path,
            &output_path,
            &mode,
            crop_region.as_ref(),
            options.as_ref(),
            move |progress| {
                let _ = progress_callback.send(progress);
            },
        )
    })
    .await
    .map_err(|e| e.to_string())
    .flatten()
}

// 裁剪图片
#[tauri::command]
async fn crop_image_command(
    input_path: String,
    output_path: String,
    options: CropOptions,
) -> Result<String, String> {
    core::image::perform_crop(&input_path, &output_path, &options)?;

    Ok(output_path)
}


/// Check if FFmpeg is available on the system.
#[tauri::command]
fn check_ffmpeg() -> Result<FfmpegCheckResult, String> {
    core::video::check_ffmpeg()
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FfmpegCheckResult {
    pub available: bool,
    pub path: String,
    pub version: String,
}

/// Compress video using FFmpeg (system).
#[tauri::command]
fn compress_video(path: String, output_path: String, mode: CompressMode) -> Result<(), String> {
    core::video::compress_video(&path, &output_path, &mode)
}

/// Copy a file from one path to another (e.g. save cropped image to user-chosen path).
/// Returns an error if the source does not exist or is empty (avoids downloading 0-byte files).
#[tauri::command]
fn copy_file(from: String, to: String) -> Result<(), String> {
    let meta = std::fs::metadata(&from).map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err("Source is not a file".into());
    }
    let len = meta.len();
    if len == 0 {
        return Err("Source file is empty (0 bytes), nothing to copy".into());
    }
    std::fs::copy(&from, &to).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn open_folder(path: &str) -> Result<(), String> {
    tauri_plugin_opener::open_path(path, None::<&str>).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            pick_files,
            pick_directory,
            list_image_files_in_directory,
            get_file_info,
            crop_image_command,
            compress_image,
            check_ffmpeg,
            compress_video,
            copy_file,
            open_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
