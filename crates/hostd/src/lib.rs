//! Host runtime: supervises seat processes on one machine and streams their
//! events to controld. Agents keep running when controld is unreachable; events
//! wait in the journal until controld acknowledges them.
pub mod journal;
pub mod link;
pub mod mapping;
pub mod ops;
pub mod platform;
pub mod policy;
pub mod private;
pub mod run;
pub mod seat_tools;
pub mod supervisor;

pub use journal::Journal;
pub use link::{run_link, LinkError};
pub use run::{run_hostd, HostdOptions, ALREADY_RUNNING};
pub use supervisor::Supervisor;
