# herdr-pet

English · [简体中文](README.md)

A standalone desktop pet plugin for Herdr on macOS and Windows. Shows agent status and recent terminal output, and sends typed prompts or drafts produced by local voice input. Installation does not modify Herdr source.

## Install and start

Requirements: Herdr 0.7.5+, Node.js 20+, Rust, and [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/). macOS requires 11.0 or later; the build target is set in the Tauri configuration. Voice builds also need CMake, a C++ compiler, and libclang: on macOS, install Xcode Command Line Tools and CMake separately (`brew install cmake`); on Windows, install Visual Studio Desktop development with C++, Windows SDK, and LLVM. Use native PowerShell and the MSVC Rust toolchain on Windows.

Official Herdr introduced plugins in [0.7.0](https://github.com/herdrdev/herdr/releases/tag/v0.7.0). This plugin uses `agent.prompt`, introduced in [0.7.5](https://github.com/herdrdev/herdr/releases/tag/v0.7.5), so its manifest declares `min_herdr_version = "0.7.5"`. That version also provides the required agent listing, reads, focus, status subscriptions, plugin builds, and runtime environment. Automatic themes and terminal activation use optional endpoints and do not raise the minimum version.

Check the CLI version with `herdr --version` before installation. If it is below 0.7.5, use `herdr update` to upgrade, then ensure the running Herdr session also uses 0.7.5 or later.

Start official Herdr in a terminal window outside Herdr, then run these commands from this repository. You can also run these build and plugin commands inside a pane of that Herdr session:

```sh
npm ci
npm run build
herdr plugin link .
herdr plugin action invoke herdr.pet.start
```

macOS builds an `.app` containing the microphone usage description; the plugin launches its executable. Windows builds `herdr-pet.exe`. Linking does not build. After updating source, stop the pet, rebuild, and start it:

```sh
herdr plugin action invoke herdr.pet.stop
npm run build
herdr plugin action invoke herdr.pet.start
```

```sh
herdr plugin action invoke herdr.pet.show
herdr plugin action invoke herdr.pet.stop
herdr plugin unlink herdr.pet
```

Start/show reuse one plugin process. The pet does not start automatically with Herdr. Startup errors go to `pet.log` in Herdr's plugin state directory. After publishing a GitHub repository, `herdr plugin install <owner>/<repo>` installs it and runs the manifest's build commands. Stop before uninstalling with `herdr plugin uninstall herdr.pet`.

`npm start` defaults to the debug `herdr-dev` socket. Specify the actual socket to connect to an official release. These examples use the default session and configuration directory; adjust for custom `XDG_CONFIG_HOME` or session paths:

```sh
HERDR_SOCKET_PATH="$HOME/.config/herdr/herdr.sock" npm start
```

```powershell
$env:HERDR_SOCKET_PATH = Join-Path $env:APPDATA "herdr\herdr.sock"
npm start
Remove-Item Env:HERDR_SOCKET_PATH
```

`HERDR_SESSION` selects a named session; explicit `HERDR_SOCKET_PATH` takes priority. Plugin actions inherit the session path provided by Herdr.

## Interaction and themes

- Drag to move the pet; double-click to focus the current agent. Position is saved.
- Hover to show cards with titles, status, and elapsed time. Click a card to focus its pane, or the message icon to open the composer.
- The selected agent card shows its last two nonempty terminal lines, capped at 180 characters each. Hover or keyboard-focus a card to select its preview; the current agent is selected initially. Only one agent is read, every five seconds while the bubble is visible. Failed reads leave cards and status available.
- The upper-right menu contains Theme, Language, Skin, Session, and Quit, without a duplicate context menu. Session appears only when multiple sessions exist.
- Six palettes use Herdr's built-in colors: Catppuccin Mocha / Latte, Tokyo Night / Day, and Gruvbox Dark / Light. Colors apply to the bubble, text, controls, status, and pet. Manual choices persist and override automatic matching. Only automatic mode queries Herdr's theme endpoint; unavailable themes fall back to Catppuccin Mocha.

The composer has a back button at the upper left and microphone/send buttons inside the input. Enter adds a line; Ctrl/Cmd + Enter sends, except during IME composition. Drafts are retained per session and agent until exit. Failed submission keeps the draft. “Submitted to Herdr” confirms submission, not task completion.

## Local voice input

The first microphone click requests permission, downloads multilingual Whisper Base, and loads it. The approximately 142 MiB model comes from the [whisper.cpp model repository](https://github.com/ggml-org/whisper.cpp/blob/master/models/README.md); Rust inference uses [whisper-rs](https://docs.rs/whisper-rs/0.16.0/whisper_rs/).

Recording starts after preparation. Click again to stop; recording stops automatically at 60 seconds. Transcription is inserted at the original cursor or replaces selected text. Review the draft and send manually. The Chinese interface recognizes Chinese; the English interface recognizes English. Cancel is available during preparation, recording, or transcription. Cancellation and failures preserve the typed draft.

Audio stays in memory: it is neither uploaded nor saved as an audio file. Only the initial model download requires a network connection; later transcription works offline. The cached model is `models/ggml-base.bin` inside the app's local data directory. Retry download errors by clicking again; remove a damaged model to download it again:

- macOS: `~/Library/Application Support/dev.herdr.pet/models/ggml-base.bin`
- Windows: `%LOCALAPPDATA%\dev.herdr.pet\models\ggml-base.bin`

Manage macOS permission in System Settings → Privacy & Security → Microphone. On Windows, enable Settings → Privacy & security → Microphone → Let desktop apps access your microphone.

## Herdr compatibility and windows

| Feature | Official Herdr | Herdr fork with optional endpoints |
| --- | --- | --- |
| Status, previews, prompts, pane focus | Existing endpoints | Supported |
| Six manual themes | Supported | Supported |
| Match the actual Herdr theme | Automatic option hidden; manual theme or default Catppuccin | Shown and enabled with `client.theme.get` |
| Bring the terminal window forward | Pane focus only, without an unavailable-feature notice | Enabled when `client.activate` and the terminal support it |

Optional endpoints are not guaranteed by the version number. When the activation endpoint or terminal does not support activation, pane focus completes without a notice. If a supported activation request fails due to permissions, a timeout, or another error, the pet reports successful focus and the activation failure separately. The companion fork currently implements activation for Herdr running directly in Ghostty on macOS; other terminals, tmux, GNU Screen, and Windows activation depend on Herdr-side support.

The transparent frameless window stays on top. Dragging and display changes keep the pet visible. macOS supports Spaces and ordinary fullscreen windows; the composer lowers the window level for native IME candidates. Windows uses native topmost behavior and window dragging. Lock screens and secure desktops are outside the overlay's scope.
