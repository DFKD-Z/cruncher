//! Tauri commands for image/video compression tool.

use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter, State};

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

mod core;
mod job;
mod pipeline;
mod progress;

use job::manager::JobManager;
use job::types::{ImageJobRequest, ImageJobState, JobStatus};
use pipeline::executor::execute_pipeline_for_file;
use pipeline::stage::{stage_weight, PipelineStageKind};
use pipeline::validator::{resolve_pipeline, validate_job_request, validate_pipeline};
use progress::event::ImageJobProgressEvent;

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
    let output_path_for_task = output_path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        core::image::perform_crop(&input_path, &output_path_for_task, &options)
    })
    .await
    .map_err(|e| e.to_string())
    .flatten()?;

    Ok(output_path)
}

#[tauri::command]
async fn create_image_job(
    app: AppHandle,
    manager: State<'_, JobManager>,
    mut request: ImageJobRequest,
) -> Result<String, String> {
    validate_job_request(&request)?;
    let stages = resolve_pipeline(&request);
    validate_pipeline(&stages)?;
    request.pipeline = Some(stages);

    let manager = manager.inner().clone();
    let job_id = manager.create_job(request)?;
    let manager_for_task = manager.clone();
    let app_for_task = app.clone();
    let job_id_for_task = job_id.clone();
    tauri::async_runtime::spawn(async move {
        run_image_job(app_for_task, manager_for_task, job_id_for_task).await;
    });
    Ok(job_id)
}

#[tauri::command]
fn cancel_image_job(manager: State<'_, JobManager>, job_id: String) -> Result<(), String> {
    manager.cancel_job(&job_id)
}

#[tauri::command]
fn get_image_job(manager: State<'_, JobManager>, job_id: String) -> Result<ImageJobState, String> {
    manager.get_job(&job_id)
}

#[tauri::command]
fn list_image_jobs(manager: State<'_, JobManager>) -> Result<Vec<ImageJobState>, String> {
    manager.list_jobs()
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

/// 执行整批图片任务：负责调度、取消、状态汇总与事件派发。
async fn run_image_job(app: AppHandle, manager: JobManager, job_id: String) {
    let request = match manager.get_request(&job_id) {
        Ok(request) => request,
        Err(_) => return,
    };

    let stages = request
        .pipeline
        .clone()
        .unwrap_or_else(|| vec![PipelineStageKind::Compress, PipelineStageKind::Save]);
    let total_files = request.inputs.len();
    if total_files == 0 {
        let _ = manager.finish_job(&job_id, JobStatus::Completed);
        return;
    }

    let mode = request
        .mode
        .clone()
        .unwrap_or(CompressMode::VisuallyLossless);
    let output_dir = request.output_dir.clone();
    let cancel_flag = match manager.cancel_flag(&job_id) {
        Ok(flag) => flag,
        Err(_) => return,
    };

    let _ = manager.mark_running(&job_id);

    for (file_index, input_path) in request.inputs.iter().enumerate() {
        if cancel_flag.load(Ordering::Relaxed) {
            let overall = calculate_file_base_progress(file_index, total_files);
            mark_file_and_emit(
                &app,
                &manager,
                &job_id,
                file_index,
                total_files,
                input_path,
                None,
                &JobStatus::Cancelled,
                0.0,
                overall,
                Some("Job cancelled".into()),
                Some("Job cancelled".into()),
            );
            continue;
        }

        let output_path = build_output_path(input_path, output_dir.as_deref());
        let run_result = run_image_file_pipeline(
            app.clone(),
            manager.clone(),
            job_id.clone(),
            file_index,
            total_files,
            input_path.clone(),
            output_path.clone(),
            mode.clone(),
            request.crop_region.clone(),
            request.options.clone(),
            stages.clone(),
            cancel_flag.clone(),
        )
        .await;

        match run_result {
            Ok(()) => {
                let overall = calculate_file_done_progress(file_index, total_files);
                mark_file_and_emit(
                    &app,
                    &manager,
                    &job_id,
                    file_index,
                    total_files,
                    input_path,
                    Some(output_path),
                    &JobStatus::Completed,
                    100.0,
                    overall,
                    Some("File completed".into()),
                    None,
                );
            }
            Err(err) => {
                let cancelled = err.to_lowercase().contains("cancel");
                let status = if cancelled {
                    JobStatus::Cancelled
                } else {
                    JobStatus::Failed
                };
                let overall = calculate_file_base_progress(file_index, total_files);
                mark_file_and_emit(
                    &app,
                    &manager,
                    &job_id,
                    file_index,
                    total_files,
                    input_path,
                    None,
                    &status,
                    0.0,
                    overall,
                    None,
                    Some(err),
                );
                if cancelled {
                    break;
                }
            }
        }
    }

    let final_snapshot = match manager.get_job(&job_id) {
        Ok(snapshot) => snapshot,
        Err(_) => return,
    };
    let final_status = resolve_final_job_status(&cancel_flag, &final_snapshot);

    let _ = manager.finish_job(&job_id, final_status.clone());
    let final_overall = manager
        .get_job(&job_id)
        .map(|state| state.overall_progress)
        .unwrap_or(100.0);
    emit_progress(
        &app,
        ImageJobProgressEvent {
            job_id,
            file_index: total_files.saturating_sub(1),
            total_files,
            input_path: None,
            output_path: None,
            stage: None,
            stage_progress: 100.0,
            overall_progress: final_overall.clamp(0.0, 100.0),
            status: final_status,
            message: Some("Job finished".into()),
            error: None,
        },
    );
}

/// 执行单文件流水线，将阶段进度折算为文件/任务总进度。
async fn run_image_file_pipeline(
    app: AppHandle,
    manager: JobManager,
    job_id: String,
    file_index: usize,
    total_files: usize,
    input_path: String,
    output_path: String,
    mode: CompressMode,
    crop_region: Option<CropRegion>,
    options: Option<ProcessOptions>,
    stages: Vec<PipelineStageKind>,
    cancel_flag: Arc<AtomicBool>,
) -> Result<(), String> {
    let _ = manager.update_file(
        &job_id,
        file_index,
        Some(JobStatus::Running),
        Some(0.0),
        None,
        None,
    );

    let total_stage_weight = stages.iter().map(|s| stage_weight(*s)).sum::<f32>().max(1.0);
    tauri::async_runtime::spawn_blocking(move || {
        let mut completed_weight = 0.0f32;
        execute_pipeline_for_file(
            &input_path,
            &output_path,
            &mode,
            crop_region.as_ref(),
            options.as_ref(),
            &stages,
            |stage, stage_progress| {
                let stage_p = stage_progress.clamp(0.0, 100.0);
                let stage_overall = ((completed_weight + stage_weight(stage) * (stage_p / 100.0))
                    / total_stage_weight)
                    * 100.0;
                let job_overall =
                    calculate_job_overall_progress(file_index, total_files, stage_overall);

                let _ = manager.update_file(
                    &job_id,
                    file_index,
                    Some(JobStatus::Running),
                    Some(stage_overall),
                    None,
                    None,
                );
                emit_progress(
                    &app,
                    ImageJobProgressEvent {
                        job_id: job_id.clone(),
                        file_index,
                        total_files,
                        input_path: Some(input_path.clone()),
                        output_path: None,
                        stage: Some(stage),
                        stage_progress: stage_p,
                        overall_progress: job_overall,
                        status: JobStatus::Running,
                        message: None,
                        error: None,
                    },
                );

                if stage_p >= 100.0 {
                    completed_weight += stage_weight(stage);
                }
            },
            || cancel_flag.load(Ordering::Relaxed),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 更新单文件状态并发出对应进度事件。
fn mark_file_and_emit(
    app: &AppHandle,
    manager: &JobManager,
    job_id: &str,
    file_index: usize,
    total_files: usize,
    input_path: &str,
    output_path: Option<String>,
    status: &JobStatus,
    stage_progress: f32,
    overall_progress: f32,
    message: Option<String>,
    error: Option<String>,
) {
    let _ = manager.update_file(
        job_id,
        file_index,
        Some(status.clone()),
        Some(stage_progress),
        output_path.clone(),
        error.clone(),
    );

    emit_progress(
        app,
        ImageJobProgressEvent {
            job_id: job_id.to_string(),
            file_index,
            total_files,
            input_path: Some(input_path.to_string()),
            output_path,
            stage: if matches!(status, JobStatus::Completed) {
                Some(PipelineStageKind::Save)
            } else {
                None
            },
            stage_progress,
            overall_progress: overall_progress.clamp(0.0, 100.0),
            status: status.clone(),
            message,
            error,
        },
    );
}

fn resolve_final_job_status(cancel_flag: &Arc<AtomicBool>, snapshot: &ImageJobState) -> JobStatus {
    if cancel_flag.load(Ordering::Relaxed) || snapshot.cancelled_files > 0 {
        JobStatus::Cancelled
    } else if snapshot.failed_files > 0 {
        JobStatus::Failed
    } else {
        JobStatus::Completed
    }
}

fn calculate_job_overall_progress(file_index: usize, total_files: usize, stage_overall: f32) -> f32 {
    ((file_index as f32 + stage_overall.clamp(0.0, 100.0) / 100.0) / total_files as f32) * 100.0
}

fn calculate_file_base_progress(file_index: usize, total_files: usize) -> f32 {
    (file_index as f32 / total_files as f32) * 100.0
}

fn calculate_file_done_progress(file_index: usize, total_files: usize) -> f32 {
    ((file_index + 1) as f32 / total_files as f32) * 100.0
}

fn emit_progress(app: &AppHandle, event: ImageJobProgressEvent) {
    let _ = app.emit("image-job-progress", event);
}

fn build_output_path(input_path: &str, output_dir: Option<&str>) -> String {
    let input = Path::new(input_path);
    let stem = input
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("image");
    let ext = input.extension().and_then(|s| s.to_str()).unwrap_or("png");
    let file_name = format!("{stem}_compressed.{ext}");

    if let Some(dir) = output_dir {
        return Path::new(dir)
            .join(file_name)
            .to_string_lossy()
            .to_string();
    }

    let parent = input
        .parent()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    parent.join(file_name).to_string_lossy().to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(JobManager::default())
        .invoke_handler(tauri::generate_handler![
            pick_files,
            pick_directory,
            list_image_files_in_directory,
            get_file_info,
            crop_image_command,
            compress_image,
            create_image_job,
            cancel_image_job,
            get_image_job,
            list_image_jobs,
            check_ffmpeg,
            compress_video,
            copy_file,
            open_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
