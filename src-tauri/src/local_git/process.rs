use super::{GitError, Result};
use std::io::{self, Read};
use std::path::Path;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

const MAX_OUTPUT: usize = 8 * 1024 * 1024;

pub(super) struct Output {
    pub stdout: Vec<u8>,
    pub truncated: bool,
}

fn read_output(mut source: impl Read) -> io::Result<Output> {
    let mut stdout = Vec::new();
    let mut buffer = [0; 8192];
    let mut truncated = false;
    loop {
        let count = source.read(&mut buffer)?;
        if count == 0 {
            return Ok(Output { stdout, truncated });
        }
        let retained = count.min(MAX_OUTPUT - stdout.len());
        stdout.extend_from_slice(&buffer[..retained]);
        truncated |= retained < count;
    }
}

pub(super) fn run(folder: &Path, arguments: &[&str]) -> Result<Output> {
    execute(folder, arguments, false)
}

pub(super) fn run_diff(folder: &Path, arguments: &[&str]) -> Result<Output> {
    execute(folder, arguments, true)
}

fn execute(folder: &Path, arguments: &[&str], diff_status: bool) -> Result<Output> {
    let mut command = Command::new("git");
    command
        .current_dir(folder)
        .args([
            "--no-pager",
            "--literal-pathspecs",
            "-c",
            "color.ui=false",
            "-c",
            "maintenance.auto=false",
            "-c",
            "core.fsmonitor=false",
            "-c",
            "protocol.allow=never",
            "-c",
            "protocol.https.allow=always",
            "-c",
            "protocol.ssh.allow=always",
            "-c",
            "protocol.file.allow=always",
        ])
        .args(arguments)
        .env("LC_ALL", "C")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("SSH_ASKPASS_REQUIRE", "never")
        .env("GCM_INTERACTIVE", "never")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for (name, _) in std::env::vars_os() {
        let key = name.to_string_lossy().to_ascii_uppercase();
        if matches!(
            key.as_str(),
            "GIT_DIR"
                | "GIT_WORK_TREE"
                | "GIT_COMMON_DIR"
                | "GIT_INDEX_FILE"
                | "GIT_OBJECT_DIRECTORY"
                | "GIT_ALTERNATE_OBJECT_DIRECTORIES"
                | "GIT_NAMESPACE"
                | "GIT_PREFIX"
                | "GIT_CONFIG_PARAMETERS"
                | "GIT_CONFIG_COUNT"
                | "GIT_EXTERNAL_DIFF"
                | "GIT_ALLOW_PROTOCOL"
                | "GIT_PROTOCOL_FROM_USER"
        ) || key.starts_with("GIT_TRACE")
        {
            command.env_remove(name);
        }
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }

    let mut child = command.spawn().map_err(|error| match error.kind() {
        io::ErrorKind::NotFound => GitError::GitMissing,
        _ => GitError::GitFailed,
    })?;
    let stdout = child.stdout.take().ok_or(GitError::GitFailed)?;
    let stderr = child.stderr.take().ok_or(GitError::GitFailed)?;
    let (out_sender, out_receiver) = std::sync::mpsc::sync_channel(1);
    let (err_sender, err_receiver) = std::sync::mpsc::sync_channel(1);
    thread::spawn(move || {
        let _ = out_sender.send(read_output(stdout));
    });
    thread::spawn(move || {
        let _ = err_sender.send(read_output(stderr));
    });
    let deadline = Instant::now() + Duration::from_secs(180);
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|_| GitError::GitFailed)? {
            break status;
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err(GitError::TimedOut);
        }
        thread::sleep(Duration::from_millis(15));
    };
    let stdout = out_receiver
        .recv_timeout(deadline.saturating_duration_since(Instant::now()))
        .map_err(|_| GitError::TimedOut)?
        .map_err(|_| GitError::GitFailed)?;
    let stderr = err_receiver
        .recv_timeout(deadline.saturating_duration_since(Instant::now()))
        .map_err(|_| GitError::TimedOut)?
        .map_err(|_| GitError::GitFailed)?;
    if status.success() || (diff_status && status.code() == Some(1)) {
        return Ok(stdout);
    }
    let message = String::from_utf8_lossy(&stderr.stdout).to_ascii_lowercase();
    let error = if message.contains("dubious ownership") {
        GitError::Ownership
    } else if message.contains("not a git repository") {
        GitError::InvalidRepository
    } else if message.contains("unable to auto-detect email")
        || message.contains("identity unknown")
    {
        GitError::AuthorMissing
    } else if message.contains("not possible to fast-forward") {
        GitError::Diverged
    } else if message.contains("not fully merged") {
        GitError::UnmergedBranch
    } else if message.contains("would be overwritten")
        || message.contains("local changes")
        || message.contains("you need to resolve your current index")
    {
        GitError::WorkingTreeConflict
    } else if message.contains("index.lock") || message.contains("another git process") {
        GitError::Busy
    } else if message.contains("authentication failed")
        || message.contains("publickey")
        || message.contains("terminal prompts disabled")
        || message.contains("could not read username")
        || message.contains("permission denied")
    {
        GitError::Authentication
    } else if message.contains("non-fast-forward") || message.contains("failed to push some refs") {
        GitError::PushRejected
    } else if message.contains("could not resolve host") || message.contains("failed to connect") {
        GitError::Network
    } else {
        GitError::GitFailed
    };
    Err(error)
}

pub(super) fn text(folder: &Path, arguments: &[&str]) -> Result<String> {
    let result = run(folder, arguments)?;
    if result.truncated {
        return Err(GitError::TooLarge);
    }
    String::from_utf8(result.stdout).map_err(|_| GitError::UnsupportedText)
}
