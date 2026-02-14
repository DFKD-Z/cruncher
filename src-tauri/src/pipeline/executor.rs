use std::path::Path;

use crate::core::image;
use crate::pipeline::stage::PipelineStageKind;
use crate::{CompressMode, CropRegion, ProcessOptions};

pub fn execute_pipeline_for_file<F, C>(
    input_path: &str,
    output_path: &str,
    mode: &CompressMode,
    crop_region: Option<&CropRegion>,
    options: Option<&ProcessOptions>,
    stages: &[PipelineStageKind],
    mut on_stage_progress: F,
    mut is_cancelled: C,
) -> Result<(), String>
where
    F: FnMut(PipelineStageKind, f32),
    C: FnMut() -> bool,
{
    if is_cancelled() {
        return Err("Job cancelled".into());
    }

    let mut img = image::load_image(input_path)?;
    let mut format = image::resolve_output_format(input_path, options);
    let quality = options.and_then(|opt| opt.quality);

    for stage in stages {
        if is_cancelled() {
            return Err("Job cancelled".into());
        }

        on_stage_progress(*stage, 0.0);
        match stage {
            PipelineStageKind::Crop => {
                if let Some(region) = crop_region {
                    on_stage_progress(*stage, 20.0);
                    img = image::apply_crop(img, region)?;
                }
                on_stage_progress(*stage, 100.0);
            }
            PipelineStageKind::Resize => {
                on_stage_progress(*stage, 20.0);
                img = image::apply_resize(img, options);
                on_stage_progress(*stage, 100.0);
            }
            PipelineStageKind::Convert => {
                on_stage_progress(*stage, 30.0);
                format = image::resolve_output_format(input_path, options);
                on_stage_progress(*stage, 100.0);
            }
            PipelineStageKind::Compress => {
                on_stage_progress(*stage, 100.0);
            }
            PipelineStageKind::Save => {
                if let Some(parent) = Path::new(output_path).parent() {
                    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                }
                on_stage_progress(*stage, 15.0);
                image::save_image_with_format_progress(
                    &img,
                    output_path,
                    &format,
                    mode,
                    quality,
                    |save_progress| {
                        let stage_progress = 15.0 + (save_progress.clamp(0.0, 100.0) * 0.85);
                        on_stage_progress(*stage, stage_progress);
                    },
                )?;
                on_stage_progress(*stage, 100.0);
            }
        }
    }

    Ok(())
}

