use serde::{Deserialize, Serialize};

use crate::job::types::JobStatus;
use crate::pipeline::stage::PipelineStageKind;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageJobProgressEvent {
    pub job_id: String,
    pub file_index: usize,
    pub total_files: usize,
    pub input_path: Option<String>,
    pub output_path: Option<String>,
    pub stage: Option<PipelineStageKind>,
    pub stage_progress: f32,
    pub overall_progress: f32,
    pub status: JobStatus,
    pub message: Option<String>,
    pub error: Option<String>,
}

