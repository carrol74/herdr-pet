use tauri::State;

use crate::{api, ManagedState};

#[tauri::command]
pub async fn agent_preview(
    state: State<'_, ManagedState>,
    pane_id: String,
    session: String,
) -> Result<String, String> {
    let path = {
        let shared = state.shared.lock().unwrap_or_else(|e| e.into_inner());
        if shared.snapshot.session != session {
            return Err("会话已切换，请返回列表重新选择 agent".into());
        }
        shared.socket_path.clone()
    };
    tauri::async_runtime::spawn_blocking(move || {
        let result = api::request(
            &path,
            "agent.read",
            serde_json::json!({
                "target": pane_id, "source": "recent_unwrapped", "lines": 12,
                "format": "text", "strip_ansi": true,
            }),
        )
        .map_err(|error| error.to_string())?;
        result
            .pointer("/read/text")
            .and_then(|text| text.as_str())
            .map(str::to_owned)
            .ok_or_else(|| "Herdr returned no preview text".into())
    })
    .await
    .map_err(|error| error.to_string())?
}
