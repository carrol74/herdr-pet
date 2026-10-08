#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::{
    configure_window, pointer_position, primary_mouse_button_down, request_microphone,
    set_prompt_active,
};

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
pub use windows::{
    configure_window, primary_mouse_button_down, request_microphone, set_prompt_active,
};
#[cfg(windows)]
pub use windows::{read_available, set_stream_polling};

#[cfg(unix)]
mod unix;
#[cfg(unix)]
pub use unix::{read_available, set_stream_polling};

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod other;
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub use other::{
    configure_window, primary_mouse_button_down, request_microphone, set_prompt_active,
};

#[cfg(not(target_os = "macos"))]
pub fn pointer_position(
    window: &tauri::WebviewWindow,
) -> Result<tauri::LogicalPosition<f64>, String> {
    let cursor = window
        .cursor_position()
        .map_err(|error| error.to_string())?;
    let origin = window.inner_position().map_err(|error| error.to_string())?;
    let scale = window.scale_factor().map_err(|error| error.to_string())?;
    Ok(tauri::LogicalPosition::new(
        (cursor.x - f64::from(origin.x)) / scale,
        (cursor.y - f64::from(origin.y)) / scale,
    ))
}
