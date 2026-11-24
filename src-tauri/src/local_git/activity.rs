use super::{list, optional_text, registered, text, with_database, GitError, LocalGit, Result};
use rusqlite::Connection;
use serde::Serialize;
use std::sync::Arc;
use tauri::State;
use time::{macros::format_description, Date, OffsetDateTime};

const REPOSITORIES: usize = 12;
const ENTRIES: usize = 20;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Commit {
    repository_id: i64,
    repository_path: String,
    hash: String,
    committed_at: i64,
    author: String,
    subject: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalActivity {
    day: String,
    commits: Vec<Commit>,
    skipped_repositories: usize,
    limited: bool,
}

fn repository_commits(
    database: &Connection,
    id: i64,
    range: &[&str],
    limit: usize,
) -> Result<Vec<Commit>> {
    let folder = registered(database, id)?;
    if optional_text(&folder, &["rev-parse", "--verify", "HEAD"])?.is_none() {
        return Ok(Vec::new());
    }
    let repository_path = folder.to_str().ok_or(GitError::UnsupportedText)?;
    let maximum = format!("--max-count={limit}");
    let mut arguments = vec![
        "log",
        "-z",
        "--no-show-signature",
        "--format=%H%x00%ct%x00%an%x00%s",
        &maximum,
    ];
    arguments.extend_from_slice(range);
    arguments.extend(["HEAD", "--"]);
    let output = text(&folder, &arguments)?;
    output
        .split_terminator('\0')
        .collect::<Vec<_>>()
        .chunks(4)
        .map(|fields| {
            let [hash, timestamp, author, subject] = fields else {
                return Err(GitError::GitFailed);
            };
            Ok(Commit {
                repository_id: id,
                repository_path: repository_path.to_owned(),
                hash: (*hash).to_owned(),
                committed_at: timestamp.parse().map_err(|_| GitError::GitFailed)?,
                author: (*author).to_owned(),
                subject: (*subject).to_owned(),
            })
        })
        .collect()
}

fn read_activity(database: &Connection, day: Date) -> Result<LocalActivity> {
    let from = format!("--since-as-filter={day}T00:00:00Z");
    let until = format!("--until={day}T23:59:59Z");
    collect_activity(
        database,
        &day.to_string(),
        &[&from, &until],
        ENTRIES,
        REPOSITORIES,
    )
}

fn collect_activity(
    database: &Connection,
    day: &str,
    range: &[&str],
    limit: usize,
    repository_limit: usize,
) -> Result<LocalActivity> {
    let repositories = list(database)?;
    let mut skipped_repositories = 0;
    let mut commits = Vec::new();
    for repository in repositories.iter().take(repository_limit) {
        match repository_commits(database, repository.id, range, limit + 1) {
            Ok(entries) => commits.extend(entries),
            Err(GitError::GitMissing) => return Err(GitError::GitMissing),
            Err(_) => skipped_repositories += 1,
        }
    }
    commits.sort_by(|left, right| {
        right
            .committed_at
            .cmp(&left.committed_at)
            .then_with(|| left.repository_id.cmp(&right.repository_id))
            .then_with(|| left.hash.cmp(&right.hash))
    });
    let limited = repositories.len() > repository_limit || commits.len() > limit;
    commits.truncate(limit);
    Ok(LocalActivity {
        day: day.to_string(),
        commits,
        skipped_repositories,
        limited,
    })
}

#[tauri::command]
pub(crate) async fn read_recent_local_activity(
    service: State<'_, Arc<LocalGit>>,
    limit: usize,
) -> Result<LocalActivity> {
    let service = Arc::clone(service.inner());
    tauri::async_runtime::spawn_blocking(move || {
        collect_activity(&service.open()?, "", &[], limit.clamp(1, 200), usize::MAX)
    })
    .await
    .map_err(|_| GitError::GitFailed)?
}

#[tauri::command]
pub(crate) async fn read_local_activity(
    service: State<'_, Arc<LocalGit>>,
    day: String,
) -> Result<LocalActivity> {
    let day = Date::parse(&day, format_description!("[year]-[month]-[day]"))
        .map_err(|_| GitError::InvalidInput)?;
    if day.year() < 2008 || day > OffsetDateTime::now_utc().date() {
        return Err(GitError::InvalidInput);
    }
    with_database(service, move |database| read_activity(database, day)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::local_git::{add, process::run, AddRepository};

    #[test]
    fn reads_the_requested_utc_day_and_skips_missing_working_trees() {
        let directory = tempfile::tempdir().unwrap();
        let database = LocalGit::new(directory.path().join("local.sqlite3"))
            .open()
            .unwrap();
        let folder = directory.path().join("Project");
        let repo = add(
            &database,
            AddRepository::Create {
                path: folder.to_str().unwrap().into(),
            },
        )
        .unwrap();
        run(
            &folder,
            &[
                "-c",
                "user.name=Sample Author",
                "-c",
                "user.email=sample@example.invalid",
                "commit",
                "--allow-empty",
                "--no-gpg-sign",
                "-m",
                "A local commit",
            ],
        )
        .unwrap();
        let date = OffsetDateTime::now_utc().date();
        let activity = read_activity(&database, date).unwrap();
        assert_eq!(activity.commits.len(), 1);
        assert_eq!(activity.commits[0].repository_id, repo.id);
        assert_eq!(activity.commits[0].subject, "A local commit");
        assert!(read_activity(&database, date.previous_day().unwrap())
            .unwrap()
            .commits
            .is_empty());
        std::fs::rename(&folder, directory.path().join("Moved")).unwrap();
        let activity = read_activity(&database, date).unwrap();
        assert!(activity.commits.is_empty());
        assert_eq!(activity.skipped_repositories, 1);
    }
}
