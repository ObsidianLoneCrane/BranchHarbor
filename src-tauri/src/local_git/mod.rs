pub(super) mod activity;
pub(super) mod inspection;
mod process;
#[cfg(test)]
mod tests;

use process::{run, text};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::State;

type Result<T> = std::result::Result<T, GitError>;

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) enum GitError {
    InvalidInput,
    InvalidRepository,
    MissingFolder,
    DirectoryNotEmpty,
    NotRegistered,
    Storage,
    GitMissing,
    GitFailed,
    Busy,
    Ownership,
    UnsupportedText,
    TooLarge,
    AuthorMissing,
    Diverged,
    UnmergedBranch,
    WorkingTreeConflict,
    Authentication,
    PushRejected,
    Network,
    TimedOut,
    InvalidRemote,
    NoChanges,
    BranchChanged,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Repository {
    id: i64,
    path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Change {
    path: String,
    index: char,
    worktree: char,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Remote {
    name: String,
    fetch_url: Option<String>,
    push_url: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Snapshot {
    branch: Option<String>,
    head: Option<String>,
    upstream: Option<String>,
    ahead: Option<u32>,
    behind: Option<u32>,
    branches: Vec<String>,
    author: Option<String>,
    changes: Vec<Change>,
    remotes: Vec<Remote>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub(super) enum AddRepository {
    Import { path: String },
    Create { path: String },
    Clone { path: String, url: String },
}

#[derive(Deserialize)]
#[serde(
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    tag = "kind"
)]
pub(super) enum Operation {
    Stage {
        path: String,
    },
    Unstage {
        path: String,
    },
    Commit {
        message: String,
        author: String,
    },
    CreateBranch {
        name: String,
        start: String,
    },
    SwitchBranch {
        name: String,
    },
    DeleteBranch {
        name: String,
    },
    AddRemote {
        name: String,
        url: String,
    },
    Fetch {
        remote: String,
        url: String,
    },
    Pull {
        remote: String,
        url: String,
        branch: String,
        local_branch: String,
    },
    Push {
        remote: String,
        url: String,
        branch: String,
        local_branch: String,
        track: bool,
    },
}

#[derive(Serialize)]
pub(super) struct Diff {
    text: String,
    truncated: bool,
}

pub struct LocalGit {
    database: PathBuf,
    serial: Mutex<()>,
}

impl LocalGit {
    pub fn new(database: PathBuf) -> Self {
        Self {
            database,
            serial: Mutex::new(()),
        }
    }

    fn open(&self) -> Result<Connection> {
        let parent = self.database.parent().ok_or(GitError::Storage)?;
        std::fs::create_dir_all(parent).map_err(|_| GitError::Storage)?;
        let database = Connection::open(&self.database).map_err(|_| GitError::Storage)?;
        database
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS repositories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT NOT NULL UNIQUE
            );
            CREATE TABLE IF NOT EXISTS repository_access (
                repository_id INTEGER PRIMARY KEY, opened_at INTEGER NOT NULL
            )",
            )
            .map_err(|_| GitError::Storage)?;
        Ok(database)
    }
}

fn list(database: &Connection) -> Result<Vec<Repository>> {
    let mut statement = database
        .prepare(
            "SELECT id,path FROM repositories LEFT JOIN repository_access ON id=repository_id
                  ORDER BY opened_at DESC, id DESC",
        )
        .map_err(|_| GitError::Storage)?;
    let rows = statement
        .query_map([], |row| {
            Ok(Repository {
                id: row.get(0)?,
                path: row.get(1)?,
            })
        })
        .map_err(|_| GitError::Storage)?;
    rows.collect::<rusqlite::Result<_>>()
        .map_err(|_| GitError::Storage)
}

fn canonical(folder: &Path) -> Result<PathBuf> {
    let folder = std::fs::canonicalize(folder).map_err(|_| GitError::MissingFolder)?;
    if !folder.is_dir() {
        return Err(GitError::InvalidInput);
    }
    Ok(folder)
}

fn repository_root(folder: &Path) -> Result<PathBuf> {
    let folder = canonical(folder)?;
    if text(&folder, &["rev-parse", "--is-inside-work-tree"])?.trim_end() != "true" {
        return Err(GitError::InvalidRepository);
    }
    let root = text(&folder, &["rev-parse", "--show-toplevel"])?;
    canonical(Path::new(root.strip_suffix('\n').unwrap_or(&root)))
}

fn registered(database: &Connection, id: i64) -> Result<PathBuf> {
    let value: String = database
        .query_row("SELECT path FROM repositories WHERE id = ?1", [id], |row| {
            row.get(0)
        })
        .optional()
        .map_err(|_| GitError::Storage)?
        .ok_or(GitError::NotRegistered)?;
    let folder = PathBuf::from(value);
    if repository_root(&folder)? != folder {
        return Err(GitError::InvalidRepository);
    }
    Ok(folder)
}

fn add(database: &Connection, request: AddRepository) -> Result<Repository> {
    let (path, setup) = match &request {
        AddRepository::Import { path } => (path, None),
        AddRepository::Create { path } => (path, Some(None)),
        AddRepository::Clone { path, url } => (path, Some(Some(url.as_str()))),
    };
    let folder = Path::new(path);
    if !folder.is_absolute() {
        return Err(GitError::InvalidInput);
    }
    if let Some(url) = setup {
        let name = folder
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or(GitError::InvalidInput)?;
        let parent = canonical(folder.parent().ok_or(GitError::InvalidInput)?)?;
        let target = parent.join(name);
        match std::fs::symlink_metadata(&target) {
            Ok(metadata) => {
                if !metadata.is_dir()
                    || canonical(&target)? != target
                    || std::fs::read_dir(&target)
                        .map_err(|_| GitError::MissingFolder)?
                        .next()
                        .is_some()
                {
                    return Err(GitError::DirectoryNotEmpty);
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => return Err(GitError::MissingFolder),
        }
        if let Some(url) = url {
            validate_remote_url(url)?;
            run(
                &parent,
                &["clone", "--no-recurse-submodules", "--", url, name],
            )?;
        } else {
            run(&parent, &["init", "--initial-branch=main", "--", name])?;
        }
    }
    let root = repository_root(folder)?;
    let path = root.to_str().ok_or(GitError::UnsupportedText)?.to_owned();
    database
        .execute(
            "INSERT INTO repositories (path) VALUES (?1) ON CONFLICT(path) DO NOTHING",
            [&path],
        )
        .map_err(|_| GitError::Storage)?;
    let id = database
        .query_row(
            "SELECT id FROM repositories WHERE path = ?1",
            [&path],
            |row| row.get(0),
        )
        .map_err(|_| GitError::Storage)?;
    mark_opened(database, id)?;
    Ok(Repository { id, path })
}

fn mark_opened(database: &Connection, id: i64) -> Result<()> {
    let now = time::OffsetDateTime::now_utc().unix_timestamp_nanos() / 1_000_000;
    let now = i64::try_from(now).map_err(|_| GitError::Storage)?;
    database
        .execute(
            "INSERT INTO repository_access VALUES (?1, ?2)
         ON CONFLICT(repository_id) DO UPDATE SET opened_at=excluded.opened_at",
            params![id, now],
        )
        .map_err(|_| GitError::Storage)?;
    Ok(())
}

fn line(value: String) -> String {
    value.trim_end_matches(['\r', '\n']).to_owned()
}

fn optional_text(folder: &Path, arguments: &[&str]) -> Result<Option<String>> {
    match text(folder, arguments) {
        Ok(value) => Ok(Some(line(value))),
        Err(GitError::GitFailed | GitError::AuthorMissing) => Ok(None),
        Err(error) => Err(error),
    }
}

fn author(folder: &Path) -> Result<Option<String>> {
    Ok(optional_text(folder, &["var", "GIT_AUTHOR_IDENT"])?
        .and_then(|value| value.rsplitn(3, ' ').nth(2).map(str::to_owned)))
}

fn changes(folder: &Path) -> Result<Vec<Change>> {
    let output = text(
        folder,
        &[
            "status",
            "--porcelain=v1",
            "-z",
            "--untracked-files=all",
            "--no-renames",
        ],
    )?;
    output
        .split_terminator('\0')
        .map(|entry| {
            let path = entry.get(3..).ok_or(GitError::GitFailed)?;
            let flags = entry.as_bytes();
            Ok(Change {
                path: path.to_owned(),
                index: char::from(flags[0]),
                worktree: char::from(flags[1]),
            })
        })
        .collect()
}

fn branch(folder: &Path) -> Result<Option<String>> {
    Ok(optional_text(folder, &["symbolic-ref", "--quiet", "HEAD"])?
        .and_then(|value| value.strip_prefix("refs/heads/").map(str::to_owned)))
}

fn validate_remote_url(value: &str) -> Result<()> {
    if value.is_empty() || value.starts_with('-') || value.chars().any(char::is_control) {
        return Err(GitError::InvalidRemote);
    }
    if let Ok(url) = reqwest::Url::parse(value) {
        if matches!(url.scheme(), "https" | "ssh")
            && url.host_str().is_some()
            && url.password().is_none()
            && url.fragment().is_none()
            && url.query().is_none()
            && (url.scheme() == "ssh" || url.username().is_empty())
        {
            return Ok(());
        }
    }
    if !value.contains("://") && !value.contains("::") {
        if Path::new(value).is_absolute() {
            return Ok(());
        }
        if let Some((authority, path)) = value.split_once(':') {
            let valid = |part: &str| {
                !part.is_empty()
                    && !part.starts_with('-')
                    && part
                        .bytes()
                        .all(|byte| byte.is_ascii_alphanumeric() || b".-_".contains(&byte))
            };
            let valid_authority = authority.split_once('@').map_or_else(
                || valid(authority),
                |(user, host)| valid(user) && valid(host),
            );
            if valid_authority && !path.is_empty() && !value.chars().any(char::is_whitespace) {
                return Ok(());
            }
        }
    }
    Err(GitError::InvalidRemote)
}

fn remote_url(folder: &Path, name: &str, push: bool) -> Result<Option<String>> {
    let mut arguments = vec!["remote", "get-url", "--all"];
    if push {
        arguments.push("--push");
    }
    arguments.extend(["--", name]);
    let value = line(text(folder, &arguments)?);
    if validate_remote_url(&value).is_err() {
        return Ok(None);
    }
    Ok(Some(value))
}

fn snapshot(folder: &Path) -> Result<Snapshot> {
    let head = optional_text(folder, &["rev-parse", "--verify", "--short", "HEAD"])?;
    let upstream = optional_text(
        folder,
        &[
            "rev-parse",
            "--abbrev-ref",
            "--symbolic-full-name",
            "@{upstream}",
        ],
    )?;
    let (ahead, behind) = if upstream.is_some() {
        let counts = text(
            folder,
            &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
        )?;
        let mut counts = counts
            .split_whitespace()
            .map(|value| value.parse::<u32>().ok());
        (counts.next().flatten(), counts.next().flatten())
    } else {
        (None, None)
    };
    let names = text(folder, &["remote"])?;
    let remotes = names
        .lines()
        .map(|name| {
            Ok(Remote {
                name: name.to_owned(),
                fetch_url: remote_url(folder, name, false)?,
                push_url: remote_url(folder, name, true)?,
            })
        })
        .collect::<Result<_>>()?;
    Ok(Snapshot {
        branch: branch(folder)?,
        head,
        upstream,
        ahead,
        behind,
        branches: text(
            folder,
            &[
                "for-each-ref",
                "--format=%(refname:lstrip=2)",
                "refs/heads/",
            ],
        )?
        .lines()
        .map(str::to_owned)
        .collect(),
        author: author(folder)?,
        changes: changes(folder)?,
        remotes,
    })
}

fn selected_change(folder: &Path, path: &str) -> Result<Change> {
    changes(folder)?
        .into_iter()
        .find(|change| change.path == path)
        .ok_or(GitError::NoChanges)
}

fn diff(folder: &Path, path: &str, staged: bool) -> Result<Diff> {
    let change = selected_change(folder, path)?;
    let mut arguments = vec![
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--no-renames",
        "--no-color",
    ];
    if staged {
        arguments.push("--cached");
    } else if change.index == '?' {
        arguments.extend(["--no-index", "--", "/dev/null", path]);
        let output = process::run_diff(folder, &arguments)?;
        return Ok(Diff {
            text: String::from_utf8_lossy(&output.stdout).into_owned(),
            truncated: output.truncated,
        });
    }
    arguments.extend(["--", path]);
    let output = run(folder, &arguments)?;
    Ok(Diff {
        text: String::from_utf8_lossy(&output.stdout).into_owned(),
        truncated: output.truncated,
    })
}

fn validate_name(folder: &Path, prefix: &str, name: &str) -> Result<String> {
    if name.is_empty() || name.starts_with('-') {
        return Err(GitError::InvalidInput);
    }
    let full = format!("{prefix}/{name}");
    run(folder, &["check-ref-format", &full]).map_err(|_| GitError::InvalidInput)?;
    Ok(full)
}

fn check_target(folder: &Path, remote: &str, url: &str, push: bool) -> Result<()> {
    validate_name(folder, "refs/remotes", remote)?;
    if remote_url(folder, remote, push)?.as_deref() != Some(url) {
        return Err(GitError::InvalidRemote);
    }
    Ok(())
}

fn check_branch(folder: &Path, expected: &str) -> Result<()> {
    if branch(folder)?.as_deref() != Some(expected) {
        return Err(GitError::BranchChanged);
    }
    Ok(())
}

fn change(folder: &Path, operation: Operation) -> Result<()> {
    match operation {
        Operation::Stage { path } => {
            selected_change(folder, &path)?;
            run(folder, &["add", "--", &path])?;
        }
        Operation::Unstage { path } => {
            selected_change(folder, &path)?;
            run(folder, &["reset", "--", &path])?;
        }
        Operation::Commit {
            message,
            author: expected,
        } => {
            if message.trim().is_empty() || message.len() > 8192 {
                return Err(GitError::InvalidInput);
            }
            if author(folder)?.as_deref() != Some(&expected) {
                return Err(GitError::AuthorMissing);
            }
            if !changes(folder)?
                .iter()
                .any(|item| matches!(item.index, 'A' | 'D' | 'M' | 'T'))
            {
                return Err(GitError::NoChanges);
            }
            run(folder, &["commit", "-m", &message])?;
        }
        Operation::CreateBranch { name, start } => {
            validate_name(folder, "refs/heads", &name)?;
            if start != "HEAD" {
                validate_name(folder, "refs/heads", &start)?;
            }
            let reference = if start == "HEAD" {
                start
            } else {
                format!("refs/heads/{start}")
            };
            run(folder, &["branch", "--", &name, &reference])?;
        }
        Operation::SwitchBranch { name } => {
            let reference = validate_name(folder, "refs/heads", &name)?;
            run(folder, &["show-ref", "--verify", &reference])?;
            run(folder, &["switch", "--no-guess", "--", &name])?;
        }
        Operation::DeleteBranch { name } => {
            validate_name(folder, "refs/heads", &name)?;
            run(folder, &["branch", "-d", "--", &name])?;
        }
        Operation::AddRemote { name, url } => {
            validate_name(folder, "refs/remotes", &name)?;
            validate_remote_url(&url)?;
            run(folder, &["remote", "add", "--", &name, &url])?;
        }
        Operation::Fetch { remote, url } => {
            check_target(folder, &remote, &url, false)?;
            run(folder, &["fetch", "--no-recurse-submodules", "--", &remote])?;
        }
        Operation::Pull {
            remote,
            url,
            branch,
            local_branch,
        } => {
            check_target(folder, &remote, &url, false)?;
            check_branch(folder, &local_branch)?;
            let reference = validate_name(folder, "refs/heads", &branch)?;
            run(
                folder,
                &[
                    "pull",
                    "--ff-only",
                    "--no-rebase",
                    "--no-autostash",
                    "--no-recurse-submodules",
                    "--",
                    &remote,
                    &reference,
                ],
            )?;
        }
        Operation::Push {
            remote,
            url,
            branch,
            local_branch,
            track,
        } => {
            check_target(folder, &remote, &url, true)?;
            check_branch(folder, &local_branch)?;
            let destination = validate_name(folder, "refs/heads", &branch)?;
            let source = validate_name(folder, "refs/heads", &local_branch)?;
            let refspec = format!("{source}:{destination}");
            let mut arguments = vec![
                "push",
                "--no-follow-tags",
                "--no-mirror",
                "--no-recurse-submodules",
            ];
            if track {
                arguments.push("--set-upstream");
            }
            arguments.extend(["--", &remote, &refspec]);
            run(folder, &arguments)?;
        }
    }
    Ok(())
}

async fn with_database<T: Send + 'static>(
    service: State<'_, Arc<LocalGit>>,
    work: impl FnOnce(&Connection) -> Result<T> + Send + 'static,
) -> Result<T> {
    let service = Arc::clone(service.inner());
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = service.serial.lock().map_err(|_| GitError::Busy)?;
        work(&service.open()?)
    })
    .await
    .map_err(|_| GitError::GitFailed)?
}

#[tauri::command]
pub(super) async fn list_local_repositories(
    service: State<'_, Arc<LocalGit>>,
) -> Result<Vec<Repository>> {
    with_database(service, list).await
}

#[tauri::command]
pub(super) async fn add_local_repository(
    service: State<'_, Arc<LocalGit>>,
    request: AddRepository,
) -> Result<Repository> {
    with_database(service, move |database| add(database, request)).await
}

#[tauri::command]
pub(super) async fn remove_local_repository(
    service: State<'_, Arc<LocalGit>>,
    id: i64,
) -> Result<()> {
    with_database(service, move |database| {
        let transaction = database
            .unchecked_transaction()
            .map_err(|_| GitError::Storage)?;
        transaction
            .execute(
                "DELETE FROM repository_access WHERE repository_id = ?1",
                [id],
            )
            .map_err(|_| GitError::Storage)?;
        transaction
            .execute("DELETE FROM repositories WHERE id = ?1", params![id])
            .map_err(|_| GitError::Storage)?;
        transaction.commit().map_err(|_| GitError::Storage)
    })
    .await
}

#[tauri::command]
pub(super) async fn read_local_repository(
    service: State<'_, Arc<LocalGit>>,
    id: i64,
) -> Result<Snapshot> {
    with_database(service, move |database| {
        let data = snapshot(&registered(database, id)?)?;
        mark_opened(database, id)?;
        Ok(data)
    })
    .await
}

#[tauri::command]
pub(super) async fn read_local_diff(
    service: State<'_, Arc<LocalGit>>,
    id: i64,
    path: String,
    staged: bool,
) -> Result<Diff> {
    with_database(service, move |database| {
        diff(&registered(database, id)?, &path, staged)
    })
    .await
}

#[tauri::command]
pub(super) async fn change_local_repository(
    service: State<'_, Arc<LocalGit>>,
    id: i64,
    operation: Operation,
) -> Result<()> {
    with_database(service, move |database| {
        change(&registered(database, id)?, operation)
    })
    .await
}
