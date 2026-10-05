use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample, SizedSample};
use rubato::{FftFixedIn, Resampler};

use super::{VoiceError, MAX_RECORDING_SECONDS};

pub(super) struct Capture {
    stream: cpal::Stream,
    samples: Arc<Mutex<Vec<f32>>>,
    failure: Arc<Mutex<Option<String>>>,
    level: Arc<AtomicU32>,
    sample_rate: u32,
}

impl Capture {
    pub(super) fn start() -> Result<Self, VoiceError> {
        let device = cpal::default_host()
            .default_input_device()
            .ok_or_else(|| VoiceError::new("voiceNoMicrophone", ""))?;
        let supported = device
            .default_input_config()
            .map_err(|e| VoiceError::new("voiceCaptureError", e))?;
        let sample_rate = supported.sample_rate().0;
        let config = supported.config();
        let samples = Arc::new(Mutex::new(Vec::with_capacity(
            sample_rate as usize * MAX_RECORDING_SECONDS,
        )));
        let failure = Arc::new(Mutex::new(None));
        let level = Arc::new(AtomicU32::new(0));
        let stream = match supported.sample_format() {
            cpal::SampleFormat::F32 => {
                input_stream::<f32>(&device, &config, &samples, &failure, &level)
            }
            cpal::SampleFormat::F64 => {
                input_stream::<f64>(&device, &config, &samples, &failure, &level)
            }
            cpal::SampleFormat::I16 => {
                input_stream::<i16>(&device, &config, &samples, &failure, &level)
            }
            cpal::SampleFormat::U16 => {
                input_stream::<u16>(&device, &config, &samples, &failure, &level)
            }
            cpal::SampleFormat::I32 => {
                input_stream::<i32>(&device, &config, &samples, &failure, &level)
            }
            other => {
                return Err(VoiceError::new(
                    "voiceCaptureError",
                    format!("Unsupported microphone format: {other}"),
                ))
            }
        }
        .map_err(|e| VoiceError::new("voiceCaptureError", e))?;
        stream
            .play()
            .map_err(|e| VoiceError::new("voiceCaptureError", e))?;
        Ok(Self {
            stream,
            samples,
            failure,
            level,
            sample_rate,
        })
    }

    pub(super) fn level(&self) -> f32 {
        f32::from_bits(self.level.swap(0, Ordering::Relaxed)).clamp(0.0, 1.0)
    }

    pub(super) fn error(&self) -> Option<String> {
        self.failure
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }

    pub(super) fn finish(self) -> Result<Vec<f32>, VoiceError> {
        drop(self.stream);
        let samples = std::mem::take(&mut *self.samples.lock().unwrap_or_else(|e| e.into_inner()));
        resample(&samples, self.sample_rate).map_err(|e| VoiceError::new("voiceCaptureError", e))
    }
}

fn input_stream<T>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    samples: &Arc<Mutex<Vec<f32>>>,
    failure: &Arc<Mutex<Option<String>>>,
    level: &Arc<AtomicU32>,
) -> Result<cpal::Stream, cpal::BuildStreamError>
where
    T: Sample + SizedSample,
    f32: FromSample<T>,
{
    let samples = Arc::clone(samples);
    let failure = Arc::clone(failure);
    let level = Arc::clone(level);
    let channels = usize::from(config.channels);
    let limit = config.sample_rate.0 as usize * MAX_RECORDING_SECONDS;
    device.build_input_stream(
        config,
        move |data: &[T], _| {
            let mut samples = samples.lock().unwrap_or_else(|e| e.into_inner());
            for frame in data.chunks(channels) {
                if samples.len() >= limit {
                    break;
                }
                let sample = frame
                    .iter()
                    .map(|sample| f32::from_sample(*sample))
                    .sum::<f32>()
                    / channels as f32;
                samples.push(sample);
                level.fetch_max(sample.abs().min(1.0).to_bits(), Ordering::Relaxed);
            }
        },
        move |error| {
            *failure.lock().unwrap_or_else(|e| e.into_inner()) = Some(error.to_string());
        },
        None,
    )
}

pub(super) fn resample(samples: &[f32], rate: u32) -> Result<Vec<f32>, String> {
    if rate == 16000 {
        return Ok(samples.to_vec());
    }
    let mut resampler =
        FftFixedIn::<f32>::new(rate as usize, 16000, 1024, 2, 1).map_err(|e| e.to_string())?;
    let wanted = samples.len() * 16000 / rate as usize;
    let delay = resampler.output_delay();
    let chunk_size = resampler.input_frames_next();
    let mut output = Vec::with_capacity(wanted + delay + resampler.output_frames_max());
    for chunk in samples.chunks(chunk_size) {
        let mut padded = vec![0.0; chunk_size];
        padded[..chunk.len()].copy_from_slice(chunk);
        let converted = resampler
            .process(&[padded], None)
            .map_err(|e| e.to_string())?;
        output.extend_from_slice(&converted[0]);
    }
    while output.len() < wanted + delay {
        let converted = resampler
            .process(&[vec![0.0; chunk_size]], None)
            .map_err(|e| e.to_string())?;
        output.extend_from_slice(&converted[0]);
    }
    Ok(output[delay..delay + wanted].to_vec())
}

#[cfg(test)]
mod tests {
    use super::resample;

    #[test]
    fn resampling_keeps_duration_and_tone() {
        let samples: Vec<f32> = (0..48000)
            .map(|i| (i as f32 * std::f32::consts::TAU * 440.0 / 48000.0).sin() * 0.5)
            .collect();
        let converted = resample(&samples, 48000).expect("resample");
        assert_eq!(converted.len(), 16000);
        let mean_error = converted
            .iter()
            .enumerate()
            .skip(100)
            .take(15000)
            .map(|(i, sample)| {
                (sample - (i as f32 * std::f32::consts::TAU * 440.0 / 16000.0).sin() * 0.5).abs()
            })
            .sum::<f32>()
            / 15000.0;
        assert!(mean_error < 0.02, "tone distortion: {mean_error}");
    }
}
