use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use super::{VoiceError, VoiceEvent};

const MODEL_FILE: &str = "ggml-base.bin";
const MODEL_URL: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin";

pub(super) fn ensure_model(
    directory: &Path,
    active: &AtomicU64,
    id: u64,
    emit: &impl Fn(VoiceEvent),
) -> Result<PathBuf, VoiceError> {
    let model = directory.join(MODEL_FILE);
    if model.is_file() {
        return Ok(model);
    }
    std::fs::create_dir_all(directory).map_err(|e| VoiceError::new("voiceDownloadError", e))?;
    let partial = directory.join(format!("{MODEL_FILE}.partial"));
    let result = tauri::async_runtime::block_on(download(&partial, active, id, emit));
    if let Err(error) = result {
        let _ = std::fs::remove_file(&partial);
        return Err(error);
    }
    std::fs::rename(&partial, &model).map_err(|e| VoiceError::new("voiceDownloadError", e))?;
    Ok(model)
}

async fn download(
    path: &Path,
    active: &AtomicU64,
    id: u64,
    emit: &impl Fn(VoiceEvent),
) -> Result<(), VoiceError> {
    emit(VoiceEvent::phase(id, "downloading"));
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(20))
        .timeout(Duration::from_secs(600))
        .build()
        .map_err(|e| VoiceError::new("voiceDownloadError", e))?;
    let mut response = tokio::select! {
        response = client.get(MODEL_URL).send() => response.and_then(reqwest::Response::error_for_status)
            .map_err(|e| VoiceError::new("voiceDownloadError", e))?,
        _ = wait_cancelled(active, id) => return Err(VoiceError::new("voiceCancelled", "")),
    };
    let total = response.content_length();
    let mut file = File::create(path).map_err(|e| VoiceError::new("voiceDownloadError", e))?;
    let mut received = 0_u64;
    let mut last_update = Instant::now();
    loop {
        if active.load(Ordering::Acquire) != id {
            return Err(VoiceError::new("voiceCancelled", ""));
        }
        let chunk = tokio::select! {
            chunk = response.chunk() => chunk.map_err(|e| VoiceError::new("voiceDownloadError", e))?,
            _ = wait_cancelled(active, id) => return Err(VoiceError::new("voiceCancelled", "")),
        };
        let Some(chunk) = chunk else {
            break;
        };
        file.write_all(&chunk)
            .map_err(|e| VoiceError::new("voiceDownloadError", e))?;
        received += chunk.len() as u64;
        if last_update.elapsed() >= Duration::from_millis(200) {
            let mut event = VoiceEvent::phase(id, "downloading");
            event.progress = total
                .filter(|total| *total > 0)
                .map(|total| received as f64 / total as f64);
            emit(event);
            last_update = Instant::now();
        }
    }
    if received == 0 || total.is_some_and(|total| received != total) {
        return Err(VoiceError::new(
            "voiceDownloadError",
            "Incomplete model download",
        ));
    }
    file.sync_all()
        .map_err(|e| VoiceError::new("voiceDownloadError", e))
}

async fn wait_cancelled(active: &AtomicU64, id: u64) {
    while active.load(Ordering::Acquire) == id {
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}
