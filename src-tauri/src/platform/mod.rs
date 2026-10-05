#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::{
    configure_window, primary_mouse_button_down, request_microphone, set_prompt_active,
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
