use super::{models::*, provider::HttpHosting};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};

pub const PREVIEW_LIMIT: u64 = 256 * 1024;
const LINE_LIMIT: usize = 5000;
const DIRECTORY_LIMIT: usize = 2000;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExploreQuery {
    pub account_id: String,
    pub owner: String,
    pub name: String,
    #[serde(flatten)]
    pub operation: ExploreOperation,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ExploreOperation {
    Detail,
    Branches { page: u32 },
    Branch { branch: String },
    Directory { sha: String },
    File { sha: String, size: u64 },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExploreResponse {
    pub account_id: String,
    pub owner: String,
    pub name: String,
    pub data: ExploreData,
}

#[derive(Debug, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ExploreData {
    Detail {
        id: String,
        full_name: String,
        description: Option<String>,
        default_branch: Option<String>,
        visibility: String,
        archived: bool,
    },
    Branches {
        items: Vec<Branch>,
        page: u32,
        has_next: bool,
    },
    Branch {
        name: String,
        commit_sha: String,
        tree_sha: String,
    },
    Directory {
        sha: String,
        items: Vec<TreeEntry>,
        truncated: bool,
    },
    File {
        sha: String,
        size: u64,
        status: &'static str,
        text: Option<String>,
    },
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Branch {
    pub name: String,
    pub commit: BranchCommit,
    #[serde(default)]
    pub protected: bool,
}
#[derive(Debug, Serialize, Deserialize)]
pub struct BranchCommit {
    pub sha: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TreeEntry {
    pub path: String,
    pub mode: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub sha: String,
    pub size: Option<u64>,
}

#[derive(Deserialize)]
struct RawDetail {
    id: u64,
    full_name: String,
    description: Option<String>,
    default_branch: Option<String>,
    private: Option<bool>,
    visibility: Option<String>,
    #[serde(default)]
    archived: bool,
}
#[derive(Deserialize)]
struct RawBranch {
    name: String,
    commit: RawCommit,
}
#[derive(Deserialize)]
struct RawCommit {
    sha: String,
    commit: CommitData,
}
#[derive(Deserialize)]
struct CommitData {
    tree: Sha,
}
#[derive(Deserialize)]
struct Sha {
    sha: String,
}
#[derive(Deserialize)]
struct RawTree {
    sha: String,
    tree: Vec<TreeEntry>,
    #[serde(default)]
    truncated: bool,
}
#[derive(Deserialize)]
struct RawBlob {
    sha: String,
    size: u64,
    encoding: String,
    content: String,
}

fn input_error() -> AppError {
    AppError::new(
        "invalidRepositoryInput",
        "The repository, branch, or object reference is invalid.",
    )
}
fn invalid_response() -> AppError {
    AppError::new(
        "invalidResponse",
        "The provider returned an invalid Git object.",
    )
}
fn valid_sha(value: &str) -> bool {
    matches!(value.len(), 40 | 64) && value.bytes().all(|b| b.is_ascii_hexdigit())
}
fn segment(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 255
        && value != "."
        && value != ".."
        && !value
            .chars()
            .any(|c| c.is_control() || c == '/' || c == '\\')
}

// Encode each untrusted path component independently; never use provider-supplied URLs.
pub(super) fn encode(value: &str) -> String {
    let mut encoded = String::new();
    for b in value.bytes() {
        if b.is_ascii_alphanumeric() || b"-._~".contains(&b) {
            encoded.push(b as char);
        } else {
            encoded.push_str(&format!("%{b:02X}"));
        }
    }
    encoded
}

impl ExploreQuery {
    pub fn validate(&self) -> Result<()> {
        if !segment(&self.owner) || !segment(&self.name) {
            return Err(input_error());
        }
        match &self.operation {
            ExploreOperation::Branches { page } if *page == 0 || *page > 10000 => {
                return Err(input_error())
            }
            ExploreOperation::Branch { branch }
                if branch.is_empty()
                    || branch.len() > 1024
                    || branch.chars().any(char::is_control)
                    || branch.split('/').any(|part| !segment(part)) =>
            {
                return Err(input_error())
            }
            ExploreOperation::Directory { sha } | ExploreOperation::File { sha, .. }
                if !valid_sha(sha) =>
            {
                return Err(input_error())
            }
            _ => (),
        }
        Ok(())
    }
}

impl HttpHosting {
    pub fn explore_repository(
        &self,
        account: &Account,
        token: &str,
        query: &ExploreQuery,
    ) -> Result<ExploreResponse> {
        query.validate()?;
        let prefix = format!("repos/{}/{}", encode(&query.owner), encode(&query.name));
        let result = (|| -> Result<ExploreData> {
            match &query.operation {
                ExploreOperation::Detail => {
                    let (repo, _): (RawDetail, _) =
                        self.request(account.provider, token, &prefix, &[])?;
                    let visibility = match (repo.private, repo.visibility.as_deref()) {
                        (_, Some("internal")) => "internal",
                        (Some(true), _) | (_, Some("private")) => "private",
                        (Some(false), _) | (_, Some("public")) => "public",
                        _ => "unknown",
                    };
                    Ok(ExploreData::Detail {
                        id: format!("{}:{}:{}", account.provider.slug(), account.host, repo.id),
                        full_name: repo.full_name,
                        description: repo.description,
                        default_branch: repo.default_branch.filter(|s| !s.is_empty()),
                        visibility: visibility.into(),
                        archived: repo.archived,
                    })
                }
                ExploreOperation::Branches { page } => {
                    let (items, headers): (Vec<Branch>, _) = self.request(
                        account.provider,
                        token,
                        &format!("{prefix}/branches"),
                        &[
                            ("page".into(), page.to_string()),
                            ("per_page".into(), "30".into()),
                        ],
                    )?;
                    if items
                        .iter()
                        .any(|b| b.name.is_empty() || !valid_sha(&b.commit.sha))
                    {
                        return Err(invalid_response());
                    }
                    let has_next = headers
                        .get("link")
                        .and_then(|v| v.to_str().ok())
                        .map(|v| v.contains("rel=\"next\""))
                        .unwrap_or(items.len() >= 30);
                    Ok(ExploreData::Branches {
                        items,
                        page: *page,
                        has_next,
                    })
                }
                ExploreOperation::Branch { branch } => {
                    let (raw, _): (RawBranch, _) = self.request(
                        account.provider,
                        token,
                        &format!("{prefix}/branches/{}", encode(branch)),
                        &[],
                    )?;
                    if raw.name != *branch
                        || !valid_sha(&raw.commit.sha)
                        || !valid_sha(&raw.commit.commit.tree.sha)
                    {
                        return Err(invalid_response());
                    }
                    Ok(ExploreData::Branch {
                        name: raw.name,
                        commit_sha: raw.commit.sha,
                        tree_sha: raw.commit.commit.tree.sha,
                    })
                }
                ExploreOperation::Directory { sha } => {
                    let (mut raw, _): (RawTree, _) = self.request(
                        account.provider,
                        token,
                        &format!("{prefix}/git/trees/{sha}"),
                        &[],
                    )?;
                    if raw.sha != *sha
                        || raw
                            .tree
                            .iter()
                            .any(|e| !segment(&e.path) || !valid_sha(&e.sha))
                    {
                        return Err(invalid_response());
                    }
                    raw.tree.sort_by(|a, b| {
                        (a.kind != "tree")
                            .cmp(&(b.kind != "tree"))
                            .then_with(|| a.path.to_lowercase().cmp(&b.path.to_lowercase()))
                    });
                    raw.truncated |= raw.tree.len() > DIRECTORY_LIMIT;
                    raw.tree.truncate(DIRECTORY_LIMIT);
                    Ok(ExploreData::Directory {
                        sha: raw.sha,
                        items: raw.tree,
                        truncated: raw.truncated,
                    })
                }
                ExploreOperation::File { sha, size } => {
                    if *size > PREVIEW_LIMIT {
                        return Ok(file_state(sha, *size, "tooLarge", None));
                    }
                    let response = self.request_limited::<RawBlob>(
                        account.provider,
                        token,
                        &format!("{prefix}/git/blobs/{sha}"),
                        &[],
                        384 * 1024,
                    );
                    let (blob, _) = match response {
                        Err(error) if error.code == "responseTooLarge" => {
                            return Ok(file_state(sha, *size, "tooLarge", None))
                        }
                        result => result?,
                    };
                    decode_blob(sha, blob)
                }
            }
        })();
        let data = result.map_err(|error| {
            if error.code == "forbidden" { AppError::new("resourceUnavailable", "The repository, branch, or object is unavailable or not permitted by this token.") }
            else { error }
        })?;
        Ok(ExploreResponse {
            account_id: account.id.clone(),
            owner: query.owner.clone(),
            name: query.name.clone(),
            data,
        })
    }
}

fn file_state(sha: &str, size: u64, status: &'static str, text: Option<String>) -> ExploreData {
    ExploreData::File {
        sha: sha.into(),
        size,
        status,
        text,
    }
}
fn decode_blob(expected_sha: &str, blob: RawBlob) -> Result<ExploreData> {
    if blob.sha != expected_sha || !valid_sha(&blob.sha) {
        return Err(invalid_response());
    }
    if blob.size > PREVIEW_LIMIT {
        return Ok(file_state(&blob.sha, blob.size, "tooLarge", None));
    }
    if blob.encoding != "base64" {
        return Ok(file_state(
            &blob.sha,
            blob.size,
            "unsupportedEncoding",
            None,
        ));
    }
    let compact: String = blob
        .content
        .chars()
        .filter(|c| !c.is_ascii_whitespace())
        .collect();
    let bytes = STANDARD.decode(compact).map_err(|_| invalid_response())?;
    if bytes.len() as u64 != blob.size {
        return Err(invalid_response());
    }
    if bytes
        .iter()
        .any(|b| *b == 0 || (*b < 32 && ![9, 10, 12, 13].contains(b)))
    {
        return Ok(file_state(&blob.sha, blob.size, "binary", None));
    }
    let text = match String::from_utf8(bytes) {
        Ok(text) => text,
        Err(_) => {
            return Ok(file_state(
                &blob.sha,
                blob.size,
                "unsupportedEncoding",
                None,
            ))
        }
    };
    let text = text
        .trim_start_matches('\u{feff}')
        .replace("\r\n", "\n")
        .replace('\r', "\n");
    if text.split('\n').take(LINE_LIMIT + 1).count() > LINE_LIMIT {
        return Ok(file_state(&blob.sha, blob.size, "tooLarge", None));
    }
    Ok(file_state(&blob.sha, blob.size, "text", Some(text)))
}

#[cfg(test)]
mod tests;
