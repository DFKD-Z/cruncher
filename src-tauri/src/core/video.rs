use crate::{CompressMode, FfmpegCheckResult};

pub fn check_ffmpeg() -> Result<FfmpegCheckResult, String> {
    let out = std::process::Command::new("ffmpeg")
        .args(["-version"])
        .output();

    match out {
        Ok(output) if output.status.success() => {
            let version = String::from_utf8_lossy(&output.stdout);
            let first_line = version.lines().next().unwrap_or("").to_string();
            Ok(FfmpegCheckResult {
                available: true,
                path: "ffmpeg".to_string(),
                version: first_line,
            })
        }
        _ => Ok(FfmpegCheckResult {
            available: false,
            path: String::new(),
            version: String::new(),
        }),
    }
}

pub fn compress_video(path: &str, output_path: &str, mode: &CompressMode) -> Result<(), String> {
    let crf = match mode {
        CompressMode::Lossless => "0",
        CompressMode::VisuallyLossless => "17",
    };

    let output = std::process::Command::new("ffmpeg")
        .args([
            "-y",
            "-i",
            path,
            "-c:v",
            "libx264",
            "-crf",
            crf,
            "-c:a",
            "copy",
            output_path,
        ])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("FFmpeg failed: {}", stderr));
    }

    Ok(())
}
