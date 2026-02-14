use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PipelineStageKind {
    Crop,
    Resize,
    Convert,
    Compress,
    Save,
}

impl PipelineStageKind {
    pub fn order(self) -> u8 {
        match self {
            Self::Crop => 0,
            Self::Resize => 1,
            Self::Convert => 2,
            Self::Compress => 3,
            Self::Save => 4,
        }
    }
}

pub fn stage_weight(stage: PipelineStageKind) -> f32 {
    match stage {
        PipelineStageKind::Crop => 15.0,
        PipelineStageKind::Resize => 20.0,
        PipelineStageKind::Convert => 15.0,
        PipelineStageKind::Compress => 35.0,
        PipelineStageKind::Save => 15.0,
    }
}

