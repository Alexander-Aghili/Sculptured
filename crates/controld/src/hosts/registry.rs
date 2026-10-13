//! The connected hosts, and commands sent to them with request/response correlation.
use super::{not_connected, older_runner, runner, Pending};
use host_proto::{DriverInfo, HostCommand, ToHost};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::{mpsc, oneshot, watch};

struct HostConn {
    conn_id: u64,
    tx: mpsc::UnboundedSender<ToHost>,
    pending: Pending,
    drivers: Vec<DriverInfo>,
    /// What the host can do beyond M1, from its Hello (`host_proto::features`). Empty for an M1 hostd.
    features: Vec<String>,
    /// A connected computer's rules, from its Hello.
    policy: Option<host_proto::HostPolicyInfo>,
    /// Fired when a newer connection with the same host id replaces this one, so the old session ends
    /// even while a pending seat-tool call still holds its reply sender.
    evict: watch::Sender<bool>,
}

/// Why an op got no value.
#[derive(Debug)]
pub enum OpFailure {
    NotConnected,
    /// The host's runner predates local operations.
    OlderRunner,
    Timeout,
    Failed(host_proto::OpError),
}

type OpWaiters = Arc<Mutex<HashMap<String, (String, oneshot::Sender<Result<serde_json::Value, host_proto::OpError>>)>>>;

#[derive(Clone, Default)]
pub struct HostRegistry {
    inner: Arc<Mutex<HashMap<String, HostConn>>>,
    /// Ops sent and not answered yet: op id → (host, waiter). Dropped when the host disconnects.
    ops: OpWaiters,
    next_conn: Arc<AtomicU64>,
    /// Serializes connect (insert + reattach) against disconnect (remove + stale) per host.
    session_locks: Arc<Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>>,
}

impl HostRegistry {
    pub fn has_driver(&self, host: &str, driver: &str) -> bool {
        self.inner.lock().unwrap().get(host).is_some_and(|c| c.drivers.iter().any(|d| d.name == driver))
    }

    pub fn is_connected(&self, host: &str) -> bool {
        self.inner.lock().unwrap().contains_key(host)
    }

    /// Every connected host id, sorted.
    pub fn connected(&self) -> Vec<String> {
        let mut ids: Vec<String> = self.inner.lock().unwrap().keys().cloned().collect();
        ids.sort();
        ids
    }

    /// A connected computer's rules (None for a local runner or an unknown host).
    pub fn policy(&self, host: &str) -> Option<host_proto::HostPolicyInfo> {
        self.inner.lock().unwrap().get(host).and_then(|c| c.policy.clone())
    }

    /// The driver names a connected host offers.
    pub fn drivers(&self, host: &str) -> Vec<String> {
        self.inner.lock().unwrap().get(host).map(|c| c.drivers.iter().map(|d| d.name.clone()).collect()).unwrap_or_default()
    }

    /// Tests only: marks `host` connected with no driver and no live link.
    #[doc(hidden)]
    pub fn test_mark_connected(&self, host: &str) {
        let (tx, _rx) = mpsc::unbounded_channel();
        let (evict, _) = watch::channel(false);
        self.insert(host.to_string(), tx, Pending::default(), vec![], vec![], None, evict);
    }

    /// Whether the connected host said it can do `feature` (`host_proto::features`). False when it is not
    /// connected or is an M1 hostd, which names no features.
    pub fn host_supports(&self, host: &str, feature: &str) -> bool {
        self.inner.lock().unwrap().get(host).is_some_and(|c| c.features.iter().any(|f| f == feature))
    }

    /// Ok when the host can do all of `needed`, else the plain refusal (`older_runner`). A host that is not
    /// connected passes: sending to it reports that instead.
    pub fn check_features(&self, host: &str, needed: &[&str]) -> Result<(), String> {
        match self.inner.lock().unwrap().get(host) {
            Some(c) if !needed.iter().all(|n| c.features.iter().any(|f| f == n)) => Err(older_runner(host)),
            _ => Ok(()),
        }
    }

    pub(super) fn session_lock(&self, host: &str) -> Arc<tokio::sync::Mutex<()>> {
        self.session_locks.lock().unwrap().entry(host.to_string()).or_default().clone()
    }

    /// Returns the new connection id and whether it evicted a live connection.
    pub(super) fn insert(
        &self,
        host: String,
        tx: mpsc::UnboundedSender<ToHost>,
        pending: Pending,
        drivers: Vec<DriverInfo>,
        features: Vec<String>,
        policy: Option<host_proto::HostPolicyInfo>,
        evict: watch::Sender<bool>,
    ) -> (u64, bool) {
        let conn_id = self.next_conn.fetch_add(1, Ordering::SeqCst);
        let old = self.inner.lock().unwrap().insert(host, HostConn { conn_id, tx, pending, drivers, features, policy, evict });
        if let Some(old) = &old {
            let _ = old.evict.send(true);
        }
        (conn_id, old.is_some())
    }

    /// Removes the host only if `conn_id` is still the current connection, so a
    /// fast reconnect is not torn down by the old session's cleanup.
    pub(super) fn remove_if(&self, host: &str, conn_id: u64) -> bool {
        let mut hosts = self.inner.lock().unwrap();
        if hosts.get(host).is_some_and(|c| c.conn_id == conn_id) {
            hosts.remove(host);
            // Waiting ops on this host end now (their waiters see NotConnected).
            self.ops.lock().unwrap().retain(|_, (h, _)| h != host);
            true
        } else {
            false
        }
    }

    /// Sends work to `host` and waits up to `timeout` for its answer.
    pub async fn op(&self, host: &str, op: serde_json::Value, timeout: Duration) -> Result<serde_json::Value, OpFailure> {
        let tx = match self.inner.lock().unwrap().get(host) {
            None => return Err(OpFailure::NotConnected),
            Some(c) if !c.features.iter().any(|f| f == host_proto::features::LOCAL_OPS) => return Err(OpFailure::OlderRunner),
            Some(c) => c.tx.clone(),
        };
        let op_id = uuid::Uuid::new_v4().to_string();
        let (done_tx, done_rx) = oneshot::channel();
        self.ops.lock().unwrap().insert(op_id.clone(), (host.to_string(), done_tx));
        if tx.send(ToHost::Op { op_id: op_id.clone(), request: op }).is_err() {
            self.ops.lock().unwrap().remove(&op_id);
            return Err(OpFailure::NotConnected);
        }
        match tokio::time::timeout(timeout, done_rx).await {
            Err(_) => {
                self.ops.lock().unwrap().remove(&op_id);
                Err(OpFailure::Timeout)
            }
            Ok(Err(_)) => Err(OpFailure::NotConnected),
            Ok(Ok(r)) => r.map_err(OpFailure::Failed),
        }
    }

    /// An answer from a host; ignored when nobody waits for it (timed out, or another host's id).
    pub(super) fn op_answered(&self, host: &str, op_id: &str, result: Result<serde_json::Value, host_proto::OpError>) {
        let mut ops = self.ops.lock().unwrap();
        if ops.get(op_id).is_some_and(|(h, _)| h == host) {
            if let Some((_, tx)) = ops.remove(op_id) {
                let _ = tx.send(result);
            }
        }
    }

    pub async fn command(&self, host: &str, command: HostCommand) -> Result<(), String> {
        self.command_checked(host, command).await.map_err(CommandFailure::into_message)
    }

    /// `command`, saying whether a failed command certainly did not happen (`NotConnected`,
    /// `Refused`, `OlderRunner`) or may have happened (`NoReply`). A command the host's features do
    /// not cover is refused here (`OlderRunner`), never sent.
    pub async fn command_checked(&self, host: &str, command: HostCommand) -> Result<(), CommandFailure> {
        let (tx, pending) = {
            let hosts = self.inner.lock().unwrap();
            let conn = hosts.get(host).ok_or_else(|| CommandFailure::NotConnected(not_connected(host)))?;
            // An older hostd would run a restricted agent unrestricted or drop what it does not know.
            if !command.required_features().iter().all(|n| conn.features.iter().any(|f| f == n)) {
                return Err(CommandFailure::OlderRunner(older_runner(host)));
            }
            (conn.tx.clone(), conn.pending.clone())
        };
        let command_id = uuid::Uuid::new_v4().to_string();
        let (done_tx, done_rx) = oneshot::channel();
        pending.lock().unwrap().insert(command_id.clone(), done_tx);
        if tx.send(ToHost::Command { command_id: command_id.clone(), command }).is_err() {
            pending.lock().unwrap().remove(&command_id);
            return Err(CommandFailure::NotConnected(not_connected(host)));
        }
        let wait = reply_timeout();
        match tokio::time::timeout(wait, done_rx).await {
            Ok(Ok(result)) => result.map_err(CommandFailure::Refused),
            Ok(Err(_)) => Err(CommandFailure::NoReply(format!("{} disconnected before it replied", runner(host)))),
            Err(_) => {
                pending.lock().unwrap().remove(&command_id);
                let within = if wait.subsec_millis() == 0 { format!("{} s", wait.as_secs()) } else { format!("{} ms", wait.as_millis()) };
                Err(CommandFailure::NoReply(format!("{} did not reply within {within}", runner(host))))
            }
        }
    }
}

/// How long a host has to reply to a command: 30 s (a test seam can shorten it).
fn reply_timeout() -> Duration {
    #[cfg(feature = "test-seams")]
    if let Some(d) = crate::seams::override_ms(&crate::seams::HOST_REPLY_TIMEOUT_MS) {
        return d;
    }
    Duration::from_secs(30)
}

/// Why a host command failed. Each carries the plain reason `command` returns.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CommandFailure {
    /// Never sent: the host is not connected.
    NotConnected(String),
    /// The host replied that it did not do it (its words, verbatim).
    Refused(String),
    /// Sent, but no reply came (a timeout, or the link dropped): it may or may not have happened.
    NoReply(String),
    /// Never sent: the host's agent runner is too old for this command (`older_runner`'s words).
    OlderRunner(String),
}

impl CommandFailure {
    pub fn into_message(self) -> String {
        match self {
            Self::NotConnected(m) | Self::Refused(m) | Self::NoReply(m) | Self::OlderRunner(m) => m,
        }
    }
}

