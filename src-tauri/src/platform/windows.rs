use tauri::WebviewWindow;
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};

pub fn configure_window(window: &WebviewWindow) -> tauri::Result<()> {
    window.set_always_on_top(true)
}

pub fn primary_mouse_button_down() -> bool {
    unsafe { GetAsyncKeyState(i32::from(VK_LBUTTON)) < 0 }
}

pub fn set_prompt_active(_window: &WebviewWindow, _active: bool) -> tauri::Result<()> {
    Ok(())
}
pub fn request_microphone() -> Result<(), String> {
    Ok(())
}

pub fn set_stream_polling(
    _stream: &mut interprocess::local_socket::Stream,
    _enabled: bool,
) -> std::io::Result<()> {
    Ok(())
}

pub fn read_available(
    stream: &mut interprocess::local_socket::Stream,
    bytes: &mut [u8],
) -> std::io::Result<Option<usize>> {
    use std::io::{self, Read};
    use std::os::windows::io::{AsHandle, AsRawHandle};
    use windows_sys::Win32::Foundation::{
        ERROR_BROKEN_PIPE, ERROR_NO_DATA, ERROR_PIPE_NOT_CONNECTED,
    };
    use windows_sys::Win32::System::Pipes::PeekNamedPipe;

    let interprocess::local_socket::Stream::NamedPipe(pipe) = stream;
    let mut available = 0;
    let success = unsafe {
        PeekNamedPipe(
            pipe.as_handle().as_raw_handle(),
            std::ptr::null_mut(),
            0,
            std::ptr::null_mut(),
            &mut available,
            std::ptr::null_mut(),
        )
    };
    if success == 0 {
        let error = io::Error::last_os_error();
        if matches!(
            error.raw_os_error().map(|code| code as u32),
            Some(ERROR_BROKEN_PIPE | ERROR_NO_DATA | ERROR_PIPE_NOT_CONNECTED)
        ) {
            return Ok(Some(0));
        }
        return Err(error);
    }
    if available == 0 {
        return Ok(None);
    }
    let count = bytes.len().min(available as usize);
    stream.read(&mut bytes[..count]).map(Some)
}
