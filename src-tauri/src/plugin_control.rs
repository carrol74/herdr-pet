use std::fs;
use std::io::{self, Read, Write};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::PathBuf;
use std::thread;
use std::time::Duration;

use tauri::Manager;

pub enum PreparedControl {
    Standalone,
    Existing,
    Server(ControlServer),
}

pub struct ControlServer {
    listener: UnixListener,
    path: PathBuf,
}

impl Drop for ControlServer {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
}

pub fn prepare() -> io::Result<PreparedControl> {
    let Some(directory) = std::env::var_os("HERDR_PLUGIN_STATE_DIR") else {
        return Ok(PreparedControl::Standalone);
    };
    let directory = PathBuf::from(directory);
    fs::create_dir_all(&directory)?;
    let path = directory.join("pet-control.sock");
    match UnixListener::bind(&path) {
        Ok(listener) => Ok(PreparedControl::Server(ControlServer { listener, path })),
        Err(error) if error.kind() == io::ErrorKind::AddrInUse => {
            match send_show(&path) {
                Ok(()) => Ok(PreparedControl::Existing),
                Err(error) if error.kind() == io::ErrorKind::ConnectionRefused => {
                    fs::remove_file(&path)?;
                    let listener = UnixListener::bind(&path)?;
                    Ok(PreparedControl::Server(ControlServer { listener, path }))
                }
                Err(error) => Err(error),
            }
        }
        Err(error) => Err(error),
    }
}

fn send_show(path: &PathBuf) -> io::Result<()> {
    let mut stream = UnixStream::connect(path)?;
    stream.set_read_timeout(Some(Duration::from_secs(2)))?;
    stream.write_all(b"show\n")?;
    let mut response = [0; 3];
    stream.read_exact(&mut response)?;
    if response == *b"ok\n" {
        Ok(())
    } else {
        Err(io::Error::other("Herdr Pet rejected the show request"))
    }
}

impl ControlServer {
    pub fn start(&self, app: tauri::AppHandle) -> io::Result<()> {
        let listener = self.listener.try_clone()?;
        thread::spawn(move || {
            for connection in listener.incoming() {
                let Ok(mut stream) = connection else {
                    continue;
                };
                let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
                let mut request = [0; 16];
                let Ok(length) = stream.read(&mut request) else {
                    continue;
                };
                match &request[..length] {
                    b"show\n" | b"start\n" => {
                        let Some(window) = app.get_webview_window("main") else {
                            let _ = stream.write_all(b"no\n");
                            continue;
                        };
                        if window.show().and_then(|()| window.set_focus()).is_ok() {
                            let _ = stream.write_all(b"ok\n");
                        } else {
                            let _ = stream.write_all(b"no\n");
                        }
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
        Ok(())
    }
}
