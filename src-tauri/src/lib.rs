//! Tauri commands for image/video compression tool.

use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;

mod core;

#[derive(Debug, Serialize, Deserialize)]
pub struct CropRegion {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessOptions {
    pub quality: Option<u8>,
    pub format: Option<String>,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
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

/// Get file metadata: size, and for images dimensions and format.
#[tauri::command]
fn get_file_info(path: String) -> Result<FileInfo, String> {
    let meta = core::image::get_file_info(&path)?;

    Ok(FileInfo {
        path,
        size_bytes: meta.size_bytes,
        format: meta.format,
        width: meta.width,
        height: meta.height,
    })
}

/// Crop image to the given region and save to output_path.
#[tauri::command]
fn crop_image(
    path: String,
    output_path: String,
    crop_region: CropRegion,
) -> Result<(), String> {
    core::image::crop_image(&path, &output_path, &crop_region)
}

/// Compress image: optional crop first, then compress by format and mode.
#[tauri::command]
fn compress_image(
    path: String,
    output_path: String,
    mode: CompressMode,
    crop_region: Option<CropRegion>,
    options: Option<ProcessOptions>,
    progress_callback: Channel<u8>,
) -> Result<(), String> {
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
#[tauri::command]
fn copy_file(from: String, to: String) -> Result<(), String> {
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
            get_file_info,
            crop_image,
            compress_image,
            check_ffmpeg,
            compress_video,
            copy_file,
            open_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
