use super::{optional_text, registered, run, text, with_database, GitError, LocalGit, Result};
use serde::Serialize;
use std::{path::Path, sync::Arc};
use tauri::State;

const HISTORY_LIMIT: usize = 150;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct History {
    commits: Vec<Commit>,
    limited: bool,
}

#[derive(Serialize)]
struct Commit {
    hash: String,
    parents: Vec<String>,
    refs: Vec<String>,
    author: String,
    date: String,
    subject: String,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Tree {
    entries: Vec<Entry>,
    limited: bool,
}

#[derive(Serialize)]
struct Entry {
    name: String,
    hash: String,
    kind: &'static str,
}

#[derive(Serialize)]
pub(crate) struct Blob {
    status: &'static str,
    text: Option<String>,
}

fn object_id(hash: &str) -> Result<&str> {
    if matches!(hash.len(), 40 | 64) && hash.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        Ok(hash)
    } else {
        Err(GitError::InvalidInput)
    }
}

fn history(folder: &Path) -> Result<History> {
    let limit = format!("--max-count={}", HISTORY_LIMIT + 1);
    let mut arguments = vec![
        "log",
        "-z",
        "--all",
        "--topo-order",
        "--no-show-signature",
        "--decorate=full",
        "--format=%H%x00%P%x00%D%x00%an%x00%aI%x00%s%x00%B",
        &limit,
    ];
    if optional_text(folder, &["rev-parse", "--verify", "HEAD^{commit}"])?.is_some() {
        arguments.push("HEAD");
    }
    arguments.push("--");
    let output = text(folder, &arguments)?;
    let mut commits = Vec::new();
    for fields in output.split_terminator('\0').collect::<Vec<_>>().chunks(7) {
        let [hash, parents, refs, author, date, subject, message] = fields else {
            return Err(GitError::GitFailed);
        };
        commits.push(Commit {
            hash: (*hash).into(),
            parents: parents.split_whitespace().map(str::to_owned).collect(),
            refs: refs
                .split(", ")
                .filter(|name| !name.is_empty())
                .map(|name| {
                    name.replace("refs/heads/", "")
                        .replace("refs/remotes/", "")
                        .replace("refs/tags/", "")
                })
                .collect(),
            author: (*author).into(),
            date: (*date).into(),
            subject: (*subject).into(),
            message: message.trim_end().into(),
        });
    }
    let limited = commits.len() > HISTORY_LIMIT;
    commits.truncate(HISTORY_LIMIT);
    Ok(History { commits, limited })
}

#[tauri::command]
pub(crate) async fn read_local_history(
    service: State<'_, Arc<LocalGit>>,
    id: i64,
) -> Result<History> {
    with_database(service, move |database| history(&registered(database, id)?)).await
}

#[tauri::command]
pub(crate) async fn read_local_tree(
    service: State<'_, Arc<LocalGit>>,
    id: i64,
    hash: Option<String>,
) -> Result<Tree> {
    with_database(service, move |database| {
        let folder = registered(database, id)?;
        let Some(root) = optional_text(&folder, &["rev-parse", "--verify", "HEAD^{tree}"])? else {
            return Ok(Tree {
                entries: Vec::new(),
                limited: false,
            });
        };
        let target = hash.as_deref().map(object_id).transpose()?.unwrap_or(&root);
        let output = text(&folder, &["ls-tree", "-z", target])?;
        let mut entries = Vec::new();
        let mut records = output.split_terminator('\0');
        for record in records.by_ref().take(1000) {
            let (metadata, name) = record.split_once('\t').ok_or(GitError::GitFailed)?;
            let mut parts = metadata.split_whitespace();
            let mode = parts.next().ok_or(GitError::GitFailed)?;
            let kind = match (mode, parts.next()) {
                ("120000", _) => "symlink",
                (_, Some("tree")) => "directory",
                (_, Some("blob")) => "file",
                (_, Some("commit")) => "submodule",
                _ => return Err(GitError::GitFailed),
            };
            let hash = object_id(parts.next().ok_or(GitError::GitFailed)?)?;
            entries.push(Entry {
                name: name.into(),
                hash: hash.into(),
                kind,
            });
        }
        entries.sort_by_key(|entry| entry.kind != "directory");
        Ok(Tree {
            entries,
            limited: records.next().is_some(),
        })
    })
    .await
}

#[tauri::command]
pub(crate) async fn read_local_blob(
    service: State<'_, Arc<LocalGit>>,
    id: i64,
    hash: String,
) -> Result<Blob> {
    with_database(service, move |database| {
        let folder = registered(database, id)?;
        let hash = object_id(&hash)?;
        if text(&folder, &["cat-file", "-t", hash])?.trim() != "blob" {
            return Err(GitError::InvalidInput);
        }
        let size: usize = text(&folder, &["cat-file", "-s", hash])?
            .trim()
            .parse()
            .map_err(|_| GitError::GitFailed)?;
        if size > 256 * 1024 {
            return Ok(Blob {
                status: "tooLarge",
                text: None,
            });
        }
        let bytes = run(&folder, &["cat-file", "blob", hash])?.stdout;
        if bytes.contains(&0) {
            return Ok(Blob {
                status: "binary",
                text: None,
            });
        }
        match String::from_utf8(bytes) {
            Ok(text) if text.lines().count() <= 5000 => Ok(Blob {
                status: "text",
                text: Some(text),
            }),
            Ok(_) => Ok(Blob {
                status: "tooLarge",
                text: None,
            }),
            Err(_) => Ok(Blob {
                status: "unsupportedEncoding",
                text: None,
            }),
        }
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn history_preserves_merge_parents_and_branch_refs() {
        let folder = tempfile::tempdir().unwrap();
        let folder = folder.path();
        run(folder, &["init", "--initial-branch=main"]).unwrap();
        run(folder, &["config", "user.name", "Sample Author"]).unwrap();
        run(folder, &["config", "user.email", "sample@example.invalid"]).unwrap();
        run(folder, &["config", "commit.gpgsign", "false"]).unwrap();
        run(folder, &["commit", "--allow-empty", "-m", "Root commit"]).unwrap();
        run(folder, &["switch", "-c", "topic"]).unwrap();
        run(folder, &["commit", "--allow-empty", "-m", "Topic commit"]).unwrap();
        run(folder, &["switch", "main"]).unwrap();
        run(folder, &["commit", "--allow-empty", "-m", "Main commit"]).unwrap();
        run(folder, &["merge", "--no-ff", "--no-edit", "topic"]).unwrap();
        let result = history(folder).unwrap();
        assert_eq!(result.commits.len(), 4);
        let tip = &result.commits[0];
        assert_eq!(tip.parents.len(), 2);
        assert!(tip.refs.contains(&"HEAD -> main".to_owned()));
        assert!(result.commits.iter().any(|commit| {
            commit.refs.contains(&"topic".to_owned()) && tip.parents.contains(&commit.hash)
        }));
        assert!(result.commits[3].parents.is_empty());
    }
}
