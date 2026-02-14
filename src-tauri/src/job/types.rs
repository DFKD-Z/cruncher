use serde::{Deserialize, Serialize};

use crate::pipeline::stage::PipelineStageKind;
use crate::{CompressMode, CropRegion, ProcessOptions};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageJobRequest {
    pub inputs: Vec<String>,
    pub output_dir: Option<String>,
    pub mode: Option<CompressMode>,
    pub crop_region: Option<CropRegion>,
    pub options: Option<ProcessOptions>,
    pub pipeline: Option<Vec<PipelineStageKind>>,
    pub max_concurrency: Option<usize>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum JobStatus {
    Pending,
    Running,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobFileState {
    pub input_path: String,
    pub output_path: Option<String>,
    pub status: JobStatus,
    pub progress: f32,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageJobState {
    pub job_id: String,
    pub status: JobStatus,
    pub created_at_ms: u64,
    pub started_at_ms: Option<u64>,
    pub completed_at_ms: Option<u64>,
    pub total_files: usize,
    pub completed_files: usize,
    pub failed_files: usize,
    pub cancelled_files: usize,
    pub overall_progress: f32,
    pub files: Vec<JobFileState>,
}

