use interprocess::local_socket::traits::Stream as _;
use std::io::{self, Read};

pub fn set_stream_polling(
    stream: &mut interprocess::local_socket::Stream,
    enabled: bool,
) -> io::Result<()> {
    stream.set_nonblocking(enabled)
}

pub fn read_available(
    stream: &mut interprocess::local_socket::Stream,
    bytes: &mut [u8],
) -> io::Result<Option<usize>> {
    match stream.read(bytes) {
        Ok(count) => Ok(Some(count)),
        Err(error) if error.kind() == io::ErrorKind::WouldBlock => Ok(None),
        Err(error) => Err(error),
    }
}
