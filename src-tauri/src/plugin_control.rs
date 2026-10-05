use std::io::{self, Write};
use std::path::PathBuf;
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use interprocess::local_socket::{prelude::*, GenericFilePath, ListenerOptions};
use tauri::Manager;

pub enum PreparedControl {
    Standalone,
    Existing,
    Server(ControlServer),
}
pub struct ControlServer {
    listener: Arc<interprocess::local_socket::Listener>,
}

pub fn prepare() -> io::Result<PreparedControl> {
    let Some(directory) = std::env::var_os("HERDR_PLUGIN_STATE_DIR") else {
        return Ok(PreparedControl::Standalone);
    };
    let directory = PathBuf::from(directory);
    std::fs::create_dir_all(&directory)?;
    let endpoint = match std::env::var_os("HERDR_PET_CONTROL_ENDPOINT") {
        Some(value) => PathBuf::from(value),
        None => directory.join("pet-control.sock"),
    };
    match send_show(&endpoint) {
        Ok(()) => return Ok(PreparedControl::Existing),
        Err(error)
            if matches!(
                error.kind(),
                io::ErrorKind::NotFound | io::ErrorKind::ConnectionRefused
            ) => {}
        Err(error) => return Err(error),
    }
    let name = endpoint.to_fs_name::<GenericFilePath>()?;
    let listener = ListenerOptions::new()
        .name(name)
        .try_overwrite(true)
        .create_sync()?;
    Ok(PreparedControl::Server(ControlServer {
        listener: Arc::new(listener),
    }))
}

fn read_line(stream: &mut interprocess::local_socket::Stream) -> io::Result<Vec<u8>> {
    crate::transport::read_line(stream, Duration::from_secs(2), 16)
}

fn send_show(endpoint: &PathBuf) -> io::Result<()> {
    let mut stream =
        interprocess::local_socket::Stream::connect(endpoint.to_fs_name::<GenericFilePath>()?)?;
    stream.write_all(b"show\n")?;
    if read_line(&mut stream)? == b"ok\n" {
        Ok(())
    } else {
        Err(io::Error::other("Herdr Pet rejected the show request"))
    }
}

impl ControlServer {
    pub fn start(&self, app: tauri::AppHandle) {
        let listener = Arc::clone(&self.listener);
        thread::spawn(move || {
            for connection in listener.incoming() {
                let Ok(mut stream) = connection else {
                    continue;
                };
                let Ok(command) = read_line(&mut stream) else {
                    continue;
                };
                let _ = crate::platform::set_stream_polling(&mut stream, false);
                match command.as_slice() {
                    b"show\n" | b"start\n" => {
                        let Some(window) = app.get_webview_window("main") else {
                            let _ = stream.write_all(b"no\n");
                            continue;
                        };
                        let response = if window.show().and_then(|()| window.set_focus()).is_ok() {
                            b"ok\n"
                        } else {
                            b"no\n"
                        };
                        let _ = stream.write_all(response);
                    }
                    b"stop\n" => {
                        let _ = stream.write_all(b"ok\n");
                        app.exit(0);
                        break;
                    }
                    _ => {
                        let _ = stream.write_all(b"no\n");
                    }
                }
            }
        });
    }
}
