use std::io;
use std::time::{Duration, Instant};

pub fn read_line(
    stream: &mut interprocess::local_socket::Stream,
    timeout: Duration,
    max_bytes: usize,
) -> io::Result<Vec<u8>> {
    crate::platform::set_stream_polling(stream, true)?;
    let deadline = Instant::now() + timeout;
    let mut result = Vec::new();
    let mut bytes = [0; 4096];
    while Instant::now() < deadline {
        match crate::platform::read_available(stream, &mut bytes)? {
            Some(0) => {
                return Err(io::Error::new(
                    io::ErrorKind::UnexpectedEof,
                    "connection closed",
                ))
            }
            Some(count) => {
                result.extend_from_slice(&bytes[..count]);
                if result.len() > max_bytes {
                    return Err(io::Error::new(
                        io::ErrorKind::InvalidData,
                        "response too large",
                    ));
                }
                if result.contains(&b'\n') {
                    return Ok(result);
                }
            }
            None => std::thread::sleep(Duration::from_millis(10)),
        }
    }
    Err(io::Error::new(
        io::ErrorKind::TimedOut,
        "Herdr request timed out",
    ))
}

#[cfg(all(test, unix))]
mod tests {
    use interprocess::local_socket::{prelude::*, GenericFilePath, ListenerOptions};
    use std::io::Write;
    use std::time::Duration;

    #[test]
    fn fragmented_control_response_is_read_until_newline() {
        let directory = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../tmp");
        std::fs::create_dir_all(&directory).expect("temporary directory");
        let path = directory.join(format!("control-test-{}.sock", std::process::id()));
        let listener = ListenerOptions::new()
            .name(path.as_path().to_fs_name::<GenericFilePath>().expect("name"))
            .create_sync()
            .expect("listener");
        let server = std::thread::spawn(move || {
            let mut stream = listener.accept().expect("connection");
            stream.write_all(b"o").expect("first fragment");
            std::thread::sleep(Duration::from_millis(10));
            stream.write_all(b"k\n").expect("last fragment");
        });
        let mut stream = interprocess::local_socket::Stream::connect(
            path.as_path().to_fs_name::<GenericFilePath>().expect("name"),
        )
        .expect("connect");
        assert_eq!(
            super::read_line(&mut stream, Duration::from_secs(2), 16).expect("response"),
            b"ok\n"
        );
        server.join().expect("server");
    }
}
