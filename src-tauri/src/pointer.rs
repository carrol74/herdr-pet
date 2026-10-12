use serde::Serialize;
use tauri::WebviewWindow;

use crate::platform;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PointerPosition {
    x: f64,
    y: f64,
    screen_x: f64,
    screen_y: f64,
    scale_factor: f64,
    primary_down: bool,
}

#[tauri::command]
pub fn pointer_position(window: WebviewWindow) -> Result<PointerPosition, String> {
    let position = platform::pointer_position(&window)?;
    let screen = window.cursor_position().map_err(|error| error.to_string())?;
    let scale_factor = window.scale_factor().map_err(|error| error.to_string())?;
    Ok(PointerPosition {
        x: position.x,
        y: position.y,
        screen_x: screen.x,
        screen_y: screen.y,
        scale_factor,
        primary_down: platform::primary_mouse_button_down(),
    })
}

#[tauri::command]
pub fn set_pointer_interactive(window: WebviewWindow, interactive: bool) -> Result<(), String> {
    window
        .set_ignore_cursor_events(!interactive)
        .map_err(|error| error.to_string())
}
