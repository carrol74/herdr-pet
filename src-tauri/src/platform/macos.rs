use objc2_app_kit::{
    NSEvent, NSFloatingWindowLevel, NSScreenSaverWindowLevel, NSWindow, NSWindowCollectionBehavior,
};
use tauri::WebviewWindow;

pub fn request_microphone() -> Result<(), String> {
    use block2::RcBlock;
    use objc2::runtime::Bool;
    use objc2_av_foundation::{AVCaptureDevice, AVMediaTypeAudio};

    let media = unsafe { AVMediaTypeAudio }.ok_or("Microphone capture is unavailable")?;
    let (sender, receiver) = std::sync::mpsc::channel();
    let callback = RcBlock::new(move |granted: Bool| {
        let _ = sender.send(granted.as_bool());
    });
    unsafe {
        AVCaptureDevice::requestAccessForMediaType_completionHandler(media, &callback);
    }
    match receiver.recv_timeout(std::time::Duration::from_secs(120)) {
        Ok(true) => Ok(()),
        Ok(false) => {
            Err("Allow Herdr Pet in System Settings → Privacy & Security → Microphone".into())
        }
        Err(error) => Err(error.to_string()),
    }
}

pub fn configure_window(window: &WebviewWindow) -> tauri::Result<()> {
    let pointer = window.ns_window()?;
    let window = unsafe { &*pointer.cast::<NSWindow>() };
    let behavior = window.collectionBehavior()
        | NSWindowCollectionBehavior::CanJoinAllSpaces
        | NSWindowCollectionBehavior::FullScreenAuxiliary;
    window.setCanHide(false);
    window.setHidesOnDeactivate(false);
    window.setCollectionBehavior(behavior);
    window.setLevel(NSScreenSaverWindowLevel);
    window.setHasShadow(false);
    Ok(())
}

pub fn primary_mouse_button_down() -> bool {
    NSEvent::pressedMouseButtons() & 1 != 0
}

pub fn set_prompt_active(window: &WebviewWindow, active: bool) -> tauri::Result<()> {
    let pointer = window.ns_window()?;
    let window = unsafe { &*pointer.cast::<NSWindow>() };
    window.setLevel(if active {
        NSFloatingWindowLevel
    } else {
        NSScreenSaverWindowLevel
    });
    Ok(())
}
