//! What differs between the runner's systems (Linux, macOS, Windows): the home folder and finding a CLI
//! (`localops::programs`, shared with the drivers).
pub use localops::programs::{find_on_path, home, program, program_in, resolve};
