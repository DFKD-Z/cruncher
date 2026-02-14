use std::path::Path;

use crate::job::types::ImageJobRequest;
use crate::pipeline::stage::PipelineStageKind;

pub fn validate_job_request(request: &ImageJobRequest) -> Result<(), String> {
    if request.inputs.is_empty() {
        return Err("inputs must not be empty".into());
    }

    for input in &request.inputs {
        if !Path::new(input).exists() {
            return Err(format!("input file not found: {input}"));
        }
    }

    if let Some(dir) = &request.output_dir {
        let path = Path::new(dir);
        if !path.exists() {
            return Err(format!("output directory not found: {dir}"));
        }
        if !path.is_dir() {
            return Err(format!("output path is not directory: {dir}"));
        }
    }

    if let Some(options) = &request.options {
        if let Some(quality) = options.quality {
            if !(1..=100).contains(&quality) {
                return Err("quality must be in [1, 100]".into());
            }
        }
        if let Some(width) = options.width {
            if width == 0 {
                return Err("width must be > 0".into());
            }
        }
        if let Some(height) = options.height {
            if height == 0 {
                return Err("height must be > 0".into());
            }
        }
    }

    if let Some(crop) = &request.crop_region {
        if crop.width == 0 || crop.height == 0 {
            return Err("crop width and height must be > 0".into());
        }
    }

    Ok(())
}

pub fn resolve_pipeline(request: &ImageJobRequest) -> Vec<PipelineStageKind> {
    if let Some(stages) = &request.pipeline {
        return stages.clone();
    }

    let mut stages = Vec::new();
    if request.crop_region.is_some() {
        stages.push(PipelineStageKind::Crop);
    }
    if let Some(options) = &request.options {
        if options.width.is_some() || options.height.is_some() {
            stages.push(PipelineStageKind::Resize);
        }
        if options
            .format
            .as_ref()
            .map(|format| {
                let f = format.trim().to_lowercase();
                !f.is_empty() && f != "auto"
            })
            .unwrap_or(false)
        {
            stages.push(PipelineStageKind::Convert);
        }
    }
    stages.push(PipelineStageKind::Compress);
    stages.push(PipelineStageKind::Save);
    stages
}

pub fn validate_pipeline(stages: &[PipelineStageKind]) -> Result<(), String> {
    if stages.is_empty() {
        return Err("pipeline must not be empty".into());
    }

    let mut save_count = 0usize;
    let mut prev_order = 0u8;
    let mut first = true;

    for stage in stages {
        if *stage == PipelineStageKind::Save {
            save_count += 1;
        }

        let order = stage.order();
        if first {
            prev_order = order;
            first = false;
            continue;
        }

        if order < prev_order {
            return Err("pipeline stage order is invalid".into());
        }
        prev_order = order;
    }

    if save_count != 1 {
        return Err("pipeline must contain Save stage exactly once".into());
    }

    Ok(())
}

