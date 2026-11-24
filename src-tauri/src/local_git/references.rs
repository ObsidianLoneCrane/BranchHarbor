use super::{
    check_target, registered, remote_url, run, text, validate_name, with_database, GitError,
    LocalGit, Result,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use tauri::State;

#[derive(Clone, Copy, Debug, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) enum ReferenceKind {
    Branch,
    Tag,
}

impl ReferenceKind {
    fn prefix(self) -> &'static str {
        match self {
            Self::Branch => "refs/heads",
            Self::Tag => "refs/tags",
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Reference {
    name: String,
    kind: ReferenceKind,
    oid: String,
    target_oid: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RemoteReferences {
    url: String,
    default_branch: Option<String>,
    items: Vec<Reference>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeleteRequest {
    remote: String,
    url: String,
    kind: ReferenceKind,
    name: String,
    oid: String,
}

fn valid_oid(oid: &str) -> bool {
    matches!(oid.len(), 40 | 64) && oid.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn reference(full: &str, oid: &str, target_oid: Option<&str>) -> Result<Reference> {
    let (kind, name) = if let Some(name) = full.strip_prefix("refs/heads/") {
        (ReferenceKind::Branch, name)
    } else if let Some(name) = full.strip_prefix("refs/tags/") {
        (ReferenceKind::Tag, name)
    } else {
        return Err(GitError::GitFailed);
    };
    if name.is_empty()
        || name.chars().any(char::is_control)
        || !valid_oid(oid)
        || target_oid.is_some_and(|oid| !valid_oid(oid))
    {
        return Err(GitError::GitFailed);
    }
    Ok(Reference {
        name: name.to_owned(),
        kind,
        oid: oid.to_owned(),
        target_oid: target_oid.map(str::to_owned),
    })
}

fn list_local(folder: &Path) -> Result<Vec<Reference>> {
    text(
        folder,
        &[
            "for-each-ref",
            "--format=%(refname)%09%(objectname)%09%(*objectname)",
            "refs/heads/",
            "refs/tags/",
        ],
    )?
    .lines()
    .map(|line| {
        let (name, objects) = line.split_once('\t').ok_or(GitError::GitFailed)?;
        let (oid, target) = objects.split_once('\t').ok_or(GitError::GitFailed)?;
        reference(name, oid, (!target.is_empty()).then_some(target))
    })
    .collect()
}

fn remote_refs(folder: &Path, url: &str) -> Result<RemoteReferences> {
    if super::line(text(folder, &["ls-remote", "--get-url", "--", url])?) != url {
        return Err(GitError::InvalidRemote);
    }
    let output = text(
        folder,
        &[
            "-c",
            "http.followRedirects=false",
            "ls-remote",
            "--symref",
            "--",
            url,
            "HEAD",
            "refs/heads/*",
            "refs/tags/*",
        ],
    )?;
    let mut default_branch = None;
    let mut items = Vec::new();
    let mut targets = HashMap::new();
    for line in output.lines() {
        let (value, name) = line.split_once('\t').ok_or(GitError::GitFailed)?;
        if name == "HEAD" {
            if let Some(branch) = value.strip_prefix("ref: refs/heads/") {
                default_branch = Some(branch.to_owned());
            }
        } else if let Some(tag) = name.strip_suffix("^{}") {
            if tag.starts_with("refs/tags/") && valid_oid(value) {
                targets.insert(tag, value);
            }
        } else if name.starts_with("refs/heads/") || name.starts_with("refs/tags/") {
            items.push(reference(name, value, None)?);
        }
    }
    for item in &mut items {
        if item.kind == ReferenceKind::Tag {
            item.target_oid = targets
                .get(format!("refs/tags/{}", item.name).as_str())
                .map(|oid| (*oid).to_owned());
        }
    }
    Ok(RemoteReferences {
        url: url.to_owned(),
        default_branch,
        items,
    })
}

fn delete(folder: &Path, request: DeleteRequest) -> Result<()> {
    let full_name = validate_name(folder, request.kind.prefix(), &request.name)?;
    if !valid_oid(&request.oid) {
        return Err(GitError::InvalidInput);
    }
    check_target(folder, &request.remote, &request.url, true)?;
    let refs = remote_refs(folder, &request.url)?;
    if request.kind == ReferenceKind::Branch {
        let default = refs.default_branch.ok_or(GitError::RemoteDefaultUnknown)?;
        if default == request.name {
            return Err(GitError::RemoteDefaultBranch);
        }
    }
    if !refs.items.iter().any(|item| {
        item.kind == request.kind && item.name == request.name && item.oid == request.oid
    }) {
        return Err(GitError::RemoteReferenceChanged);
    }
    check_target(folder, &request.remote, &request.url, true)?;
    let names = text(folder, &["remote"])?;
    let mut index = 0;
    let alias = loop {
        let name = format!("branchharbor-delete-{index}");
        if !names.lines().any(|remote| remote == name) {
            break name;
        }
        index += 1;
    };
    let url = format!("remote.{alias}.url={}", request.url);
    let push_url = format!("remote.{alias}.pushurl={}", request.url);
    run(
        folder,
        &[
            "-c",
            "http.followRedirects=false",
            "-c",
            &url,
            "-c",
            &push_url,
            "push",
            "--no-follow-tags",
            "--no-mirror",
            "--no-recurse-submodules",
            &format!("--force-with-lease={full_name}:{}", request.oid),
            "--",
            &alias,
            &format!(":{full_name}"),
        ],
    )?;
    Ok(())
}

#[tauri::command]
pub(crate) async fn read_local_references(
    service: State<'_, Arc<LocalGit>>,
    id: i64,
) -> Result<Vec<Reference>> {
    with_database(service, move |db| list_local(&registered(db, id)?)).await
}

#[tauri::command]
pub(crate) async fn read_remote_references(
    service: State<'_, Arc<LocalGit>>,
    id: i64,
    remote: String,
    push: bool,
) -> Result<RemoteReferences> {
    let (folder, url) = with_database(service, move |db| {
        let folder = registered(db, id)?;
        validate_name(&folder, "refs/remotes", &remote)?;
        let url = remote_url(&folder, &remote, push)?.ok_or(GitError::InvalidRemote)?;
        Ok((folder, url))
    })
    .await?;
    tauri::async_runtime::spawn_blocking(move || remote_refs(&folder, &url))
        .await
        .map_err(|_| GitError::GitFailed)?
}

#[tauri::command]
pub(crate) async fn delete_remote_reference(
    service: State<'_, Arc<LocalGit>>,
    id: i64,
    request: DeleteRequest,
) -> Result<()> {
    with_database(service, move |db| delete(&registered(db, id)?, request)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deletes_only_the_confirmed_remote_namespace_and_object() {
        let temp = tempfile::tempdir().unwrap();
        let folder = temp.path().join("working");
        let remote = temp.path().join("remote.git");
        let other = temp.path().join("other.git");
        let folder_path = folder.to_str().unwrap();
        let remote_path = remote.to_str().unwrap();
        let other_path = other.to_str().unwrap();
        for path in [remote_path, other_path] {
            run(temp.path(), &["init", "--bare", "-b", "main", "--", path]).unwrap();
        }
        run(temp.path(), &["init", "-b", "main", "--", folder_path]).unwrap();
        run(
            &folder,
            &[
                "-c",
                "user.name=Test",
                "-c",
                "user.email=test@example.invalid",
                "commit",
                "--no-gpg-sign",
                "--allow-empty",
                "-m",
                "Test",
            ],
        )
        .unwrap();
        run(&folder, &["branch", "shared"]).unwrap();
        run(
            &folder,
            &[
                "-c",
                "user.name=Test",
                "-c",
                "user.email=test@example.invalid",
                "tag",
                "-a",
                "--no-sign",
                "-m",
                "Release",
                "shared",
            ],
        )
        .unwrap();
        run(&folder, &["remote", "add", "origin", other_path]).unwrap();
        run(
            &folder,
            &["remote", "set-url", "--push", "origin", remote_path],
        )
        .unwrap();
        for path in [remote_path, other_path] {
            run(
                &folder,
                &[
                    "push",
                    "--",
                    path,
                    "refs/heads/*:refs/heads/*",
                    "refs/tags/*:refs/tags/*",
                ],
            )
            .unwrap();
        }
        run(
            &folder,
            &[
                "config",
                &format!("url.{other_path}.pushInsteadOf"),
                remote_path,
            ],
        )
        .unwrap();
        let listed = remote_refs(&folder, remote_path).unwrap();
        assert_eq!(listed.default_branch.as_deref(), Some("main"));
        assert_eq!(list_local(&folder).unwrap().len(), 3);
        let tag = listed
            .items
            .iter()
            .find(|item| item.kind == ReferenceKind::Tag)
            .unwrap();
        let branch = listed
            .items
            .iter()
            .find(|item| item.name == "shared" && item.kind == ReferenceKind::Branch)
            .unwrap();
        assert_eq!(tag.target_oid.as_deref(), Some(branch.oid.as_str()));
        let request = |kind, name: &str, oid: &str| DeleteRequest {
            remote: "origin".into(),
            url: remote_path.into(),
            kind,
            name: name.into(),
            oid: oid.into(),
        };
        assert_eq!(
            delete(&folder, request(ReferenceKind::Branch, "main", &branch.oid)),
            Err(GitError::RemoteDefaultBranch)
        );
        assert_eq!(
            delete(
                &folder,
                request(ReferenceKind::Branch, "shared", &"1".repeat(40))
            ),
            Err(GitError::RemoteReferenceChanged)
        );
        delete(
            &folder,
            request(ReferenceKind::Branch, "shared", &branch.oid),
        )
        .unwrap();
        let after_branch = remote_refs(&folder, remote_path).unwrap();
        assert_eq!(after_branch.items.len(), 2);
        assert!(after_branch
            .items
            .iter()
            .any(|item| item.kind == ReferenceKind::Tag));
        delete(&folder, request(ReferenceKind::Tag, "shared", &tag.oid)).unwrap();
        assert_eq!(remote_refs(&folder, remote_path).unwrap().items.len(), 1);
        assert_eq!(remote_refs(&folder, other_path).unwrap().items.len(), 3);
        assert_eq!(list_local(&folder).unwrap().len(), 3);
    }
}
