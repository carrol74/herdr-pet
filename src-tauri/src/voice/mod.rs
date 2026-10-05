mod audio;
mod model;

use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::Arc;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

const MAX_RECORDING_SECONDS: usize = 60;

struct VoiceError {
    code: &'static str,
    detail: String,
}
impl VoiceError {
    fn new(code: &'static str, detail: impl ToString) -> Self {
        Self {
            code,
            detail: detail.to_string(),
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct VoiceEvent {
    id: u64,
    phase: &'static str,
    progress: Option<f64>,
    seconds: Option<f32>,
    level: Option<f32>,
    text: Option<String>,
    code: Option<&'static str>,
    detail: Option<String>,
}

impl VoiceEvent {
    fn phase(id: u64, phase: &'static str) -> Self {
        Self {
            id,
            phase,
            progress: None,
            seconds: None,
            level: None,
            text: None,
            code: None,
            detail: None,
        }
    }
}

enum Control {
    Start { id: u64, language: String },
    Stop(u64),
    Cancel,
}

pub struct VoiceService {
    sender: Sender<Control>,
    active: Arc<AtomicU64>,
}

impl VoiceService {
    pub fn new(app: AppHandle, directory: PathBuf) -> Self {
        let (sender, receiver) = mpsc::channel();
        let active = Arc::new(AtomicU64::new(0));
        let worker_active = Arc::clone(&active);
        std::thread::spawn(move || {
            let mut context = None;
            while let Ok(command) = receiver.recv() {
                let Control::Start { id, language } = command else {
                    continue;
                };
                if worker_active.load(Ordering::Acquire) != id {
                    continue;
                }
                let emit = |event: VoiceEvent| {
                    if worker_active.load(Ordering::Acquire) == id {
                        let _ = app.emit("pet-voice", event);
                    }
                };
                let result = record_and_transcribe(
                    &receiver,
                    &directory,
                    &worker_active,
                    id,
                    &language,
                    &mut context,
                    &emit,
                );
                if worker_active
                    .compare_exchange(id, 0, Ordering::AcqRel, Ordering::Acquire)
                    .is_ok()
                {
                    let mut event =
                        VoiceEvent::phase(id, if result.is_ok() { "complete" } else { "failed" });
                    match result {
                        Ok(text) => event.text = Some(text),
                        Err(error) => {
                            event.code = Some(error.code);
                            event.detail = Some(error.detail);
                        }
                    }
                    let _ = app.emit("pet-voice", event);
                }
            }
        });
        Self { sender, active }
    }

    pub fn cancel_current(&self) {
        self.active.store(0, Ordering::Release);
        let _ = self.sender.send(Control::Cancel);
    }
}

#[tauri::command]
pub fn voice_start(
    service: State<'_, VoiceService>,
    id: u64,
    language: String,
) -> Result<(), String> {
    if id == 0 || !matches!(language.as_str(), "zh" | "en") {
        return Err("Invalid voice request".into());
    }
    service
        .active
        .compare_exchange(0, id, Ordering::AcqRel, Ordering::Acquire)
        .map_err(|_| "Voice input is already active".to_string())?;
    if let Err(error) = service.sender.send(Control::Start { id, language }) {
        service.active.store(0, Ordering::Release);
        return Err(error.to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn voice_stop(service: State<'_, VoiceService>, id: u64) -> Result<(), String> {
    service
        .sender
        .send(Control::Stop(id))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn voice_cancel(service: State<'_, VoiceService>, id: u64) {
    if service.active.load(Ordering::Acquire) == id {
        service.cancel_current();
    }
}

fn record_and_transcribe(
    receiver: &Receiver<Control>,
    directory: &std::path::Path,
    active: &Arc<AtomicU64>,
    id: u64,
    language: &str,
    context: &mut Option<WhisperContext>,
    emit: &impl Fn(VoiceEvent),
) -> Result<String, VoiceError> {
    emit(VoiceEvent::phase(id, "permission"));
    crate::platform::request_microphone()
        .map_err(|e| VoiceError::new("voicePermissionDenied", e))?;
    if active.load(Ordering::Acquire) != id {
        return Err(VoiceError::new("voiceCancelled", ""));
    }
    if context.is_none() {
        let path = model::ensure_model(directory, active, id, emit)?;
        emit(VoiceEvent::phase(id, "loading"));
        *context = Some(
            WhisperContext::new_with_params(path, WhisperContextParameters::default())
                .map_err(|e| VoiceError::new("voiceModelError", e))?,
        );
    }
    if active.load(Ordering::Acquire) != id {
        return Err(VoiceError::new("voiceCancelled", ""));
    }
    let capture = audio::Capture::start()?;
    let started = Instant::now();
    loop {
        if active.load(Ordering::Acquire) != id {
            return Err(VoiceError::new("voiceCancelled", ""));
        }
        if let Some(error) = capture.error() {
            return Err(VoiceError::new("voiceCaptureError", error));
        }
        let mut event = VoiceEvent::phase(id, "recording");
        event.seconds = Some(started.elapsed().as_secs_f32());
        event.level = Some(capture.level());
        emit(event);
        if started.elapsed().as_secs() >= MAX_RECORDING_SECONDS as u64 {
            break;
        }
        match receiver.recv_timeout(Duration::from_millis(200)) {
            Ok(Control::Stop(target)) if target == id => break,
            Ok(Control::Cancel) => {}
            Ok(_) | Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => {
                return Err(VoiceError::new("voiceCancelled", ""))
            }
        }
    }
    emit(VoiceEvent::phase(id, "transcribing"));
    let samples = capture.finish()?;
    if samples.len() < 4000 || samples.iter().all(|sample| sample.abs() < 0.001) {
        return Err(VoiceError::new("voiceNoSpeech", ""));
    }
    let context = context
        .as_ref()
        .ok_or_else(|| VoiceError::new("voiceModelError", "Model not loaded"))?;
    let mut state = context
        .create_state()
        .map_err(|e| VoiceError::new("voiceTranscribeError", e))?;
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_language(Some(language));
    params.set_translate(false);
    params.set_n_threads(std::thread::available_parallelism().map_or(2, |n| n.get().min(4)) as i32);
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    let cancellation = (Arc::clone(active), id);
    // 同步推理结束前 cancellation 保持有效，回调只读取原子状态。
    unsafe {
        params.set_abort_callback(Some(should_abort));
        params.set_abort_callback_user_data(
            (&cancellation as *const (Arc<AtomicU64>, u64))
                .cast_mut()
                .cast(),
        );
    }
    state
        .full(params, &samples)
        .map_err(|e| VoiceError::new("voiceTranscribeError", e))?;
    let mut text = String::new();
    for segment in state.as_iter() {
        text.push_str(
            segment
                .to_str()
                .map_err(|e| VoiceError::new("voiceTranscribeError", e))?,
        );
    }
    let text = text.trim().to_string();
    if text.is_empty() {
        return Err(VoiceError::new("voiceNoSpeech", ""));
    }
    Ok(text)
}

unsafe extern "C" fn should_abort(data: *mut std::ffi::c_void) -> bool {
    let (active, id) = unsafe { &*data.cast::<(Arc<AtomicU64>, u64)>() };
    active.load(Ordering::Acquire) != *id
}
