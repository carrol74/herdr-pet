use tauri::menu::{CheckMenuItemBuilder, ContextMenu, MenuBuilder, SubmenuBuilder};
use tauri::{LogicalPosition, Manager, Position, State};

use crate::ManagedState;

#[tauri::command]
pub fn show_settings_menu(
    window: tauri::Window,
    state: State<'_, ManagedState>,
    english: bool,
    theme: String,
    skin: String,
    menu_x: f64,
    menu_y: f64,
) -> Result<(), String> {
    let snapshot = state
        .shared
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .snapshot
        .clone();
    let app = window.app_handle();
    let mut skins = SubmenuBuilder::new(app, if english { "Skin" } else { "皮肤" });
    for (id, title) in [
        ("sprite", if english { "Sprite" } else { "小精灵" }),
        ("cloud", if english { "Cloud" } else { "小云朵" }),
        ("cat", if english { "Mecha Cat" } else { "机械猫" }),
    ] {
        let item = CheckMenuItemBuilder::with_id(format!("skin:{id}"), title)
            .checked(skin == id)
            .build(app)
            .map_err(|e| e.to_string())?;
        skins = skins.item(&item);
    }
    let skins = skins.build().map_err(|e| e.to_string())?;
    let mut themes = SubmenuBuilder::new(app, if english { "Theme" } else { "主题" });
    let selected_theme = if theme == "auto" && !snapshot.theme_supported {
        "catppuccin"
    } else {
        theme.as_str()
    };
    for (id, title) in [
        (
            "auto",
            if english {
                "Follow Herdr"
            } else {
                "自动匹配 Herdr"
            },
        ),
        ("catppuccin", "Catppuccin Mocha"),
        ("catppuccin-latte", "Catppuccin Latte"),
        ("tokyo-night", "Tokyo Night"),
        ("tokyo-night-day", "Tokyo Night Day"),
        ("gruvbox", "Gruvbox Dark"),
        ("gruvbox-light", "Gruvbox Light"),
    ] {
        if id == "auto" && !snapshot.theme_supported {
            continue;
        }
        let item = CheckMenuItemBuilder::with_id(format!("theme:{id}"), title)
            .checked(selected_theme == id)
            .build(app)
            .map_err(|e| e.to_string())?;
        themes = themes.item(&item);
    }
    let themes = themes.build().map_err(|e| e.to_string())?;
    let mut sessions = SubmenuBuilder::new(app, if english { "Session" } else { "会话" });
    for session in &snapshot.sessions {
        let item = CheckMenuItemBuilder::with_id(
            format!("select-session:{}", session.name),
            &session.name,
        )
        .checked(session.active)
        .build(app)
        .map_err(|e| e.to_string())?;
        sessions = sessions.item(&item);
    }
    let sessions = sessions.build().map_err(|e| e.to_string())?;
    let chinese = CheckMenuItemBuilder::with_id("language-zh", "中文")
        .checked(!english)
        .build(app)
        .map_err(|e| e.to_string())?;
    let english_item = CheckMenuItemBuilder::with_id("language-en", "English")
        .checked(english)
        .build(app)
        .map_err(|e| e.to_string())?;
    let language = SubmenuBuilder::new(app, if english { "Language" } else { "语言" })
        .item(&chinese)
        .item(&english_item)
        .build()
        .map_err(|e| e.to_string())?;
    let mut menu = MenuBuilder::new(app);
    if snapshot.sessions.len() > 1 {
        menu = menu.item(&sessions).separator();
    }
    let menu = menu
        .item(&themes)
        .item(&skins)
        .item(&language)
        .separator()
        .text("quit", if english { "Quit" } else { "退出" })
        .build()
        .map_err(|e| e.to_string())?;
    menu.popup_at(
        window,
        Position::Logical(LogicalPosition::new(menu_x, menu_y)),
    )
    .map_err(|e| e.to_string())
}
