use super::{
    explorer::{encode, ExploreOperation, ExploreQuery},
    models::*,
    provider::HttpHosting,
};
use reqwest::header::HeaderMap;
use serde::{Deserialize, Serialize};

const PAGE_SIZE: usize = 30;
const BODY_LIMIT: usize = 64 * 1024;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Resource {
    Pulls,
    Issues,
}
impl Resource {
    fn path(self) -> &'static str {
        match self {
            Self::Pulls => "pulls",
            Self::Issues => "issues",
        }
    }
}
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum State {
    Open,
    Closed,
    Merged,
    Progressing,
    Rejected,
    All,
}
impl State {
    fn value(self) -> &'static str {
        match self {
            Self::Open => "open",
            Self::Closed => "closed",
            Self::Merged => "merged",
            Self::Progressing => "progressing",
            Self::Rejected => "rejected",
            Self::All => "all",
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadQuery {
    pub account_id: String,
    pub owner: String,
    pub name: String,
    pub resource: Resource,
    #[serde(flatten)]
    pub operation: ReadOperation,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ReadOperation {
    List { page: u32, state: State },
    Detail { number: String },
    Comments { number: String, page: u32 },
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadResponse {
    pub account_id: String,
    pub owner: String,
    pub name: String,
    pub resource: Resource,
    pub data: ReadData,
}
#[derive(Debug, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ReadData {
    List {
        items: Vec<WorkItem>,
        page: u32,
        has_next: bool,
        filtered: bool,
    },
    Detail {
        item: Box<WorkItem>,
        body: String,
        body_truncated: bool,
        head: Option<BranchRef>,
        base: Option<BranchRef>,
        merged_at: Option<String>,
        closed_at: Option<String>,
    },
    Comments {
        number: String,
        items: Vec<Comment>,
        page: u32,
        has_next: bool,
    },
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkItem {
    pub number: String,
    pub title: String,
    pub state: String,
    pub author: Option<String>,
    pub labels: Vec<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub draft: bool,
}
#[derive(Debug, Serialize, Deserialize)]
pub struct BranchRef {
    pub name: Option<String>,
    pub repository: Option<String>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Comment {
    pub id: String,
    pub author: Option<String>,
    pub body: String,
    pub body_truncated: bool,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum Identifier {
    Number(u64),
    Text(String),
}
impl Identifier {
    fn text(&self) -> String {
        match self {
            Self::Number(n) => n.to_string(),
            Self::Text(s) => s.clone(),
        }
    }
}
#[derive(Deserialize)]
struct User {
    login: Option<String>,
}
#[derive(Deserialize)]
#[serde(untagged)]
enum Label {
    Text(String),
    Named { name: String },
}
#[derive(Deserialize)]
struct RawBranch {
    #[serde(rename = "ref")]
    name: Option<String>,
    label: Option<String>,
    repo: Option<RawRepo>,
}
#[derive(Deserialize)]
struct RawRepo {
    full_name: Option<String>,
}
impl RawBranch {
    fn normalize(self) -> BranchRef {
        BranchRef {
            name: self.name.or(self.label),
            repository: self.repo.and_then(|r| r.full_name),
        }
    }
}
#[derive(Deserialize)]
struct RawItem {
    number: Identifier,
    title: String,
    state: String,
    user: Option<User>,
    labels: Option<Vec<Label>>,
    created_at: Option<String>,
    updated_at: Option<String>,
    body: Option<String>,
    draft: Option<bool>,
    merged: Option<bool>,
    merged_at: Option<String>,
    closed_at: Option<String>,
    pull_request: Option<serde_json::Value>,
    head: Option<RawBranch>,
    base: Option<RawBranch>,
}
#[derive(Deserialize)]
struct RawComment {
    id: Identifier,
    user: Option<User>,
    body: Option<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
}

fn input_error() -> AppError {
    AppError::new(
        "invalidReaderInput",
        "The repository, item number, state, or page is invalid.",
    )
}
fn invalid_response() -> AppError {
    AppError::new(
        "invalidResponse",
        "The provider returned an invalid collaboration response.",
    )
}
fn unavailable() -> AppError {
    AppError::new(
        "resourceUnavailable",
        "This item is unavailable or not permitted by the selected token.",
    )
}
fn numeric(value: &str) -> bool {
    !value.starts_with('0') && value.parse::<u64>().is_ok_and(|n| n > 0)
}
fn identifier(value: &str) -> bool {
    !value.is_empty() && value.len() <= 32 && value.bytes().all(|b| b.is_ascii_alphanumeric())
}
fn bounded(text: String) -> (String, bool) {
    if text.len() <= BODY_LIMIT {
        return (text, false);
    }
    let mut end = BODY_LIMIT;
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    (text[..end].to_owned(), true)
}
fn has_next(headers: &HeaderMap, count: usize) -> bool {
    headers
        .get("link")
        .and_then(|v| v.to_str().ok())
        .map(|v| v.contains("rel=\"next\""))
        .unwrap_or(count >= PAGE_SIZE)
}

impl ReadQuery {
    pub fn validate(&self) -> Result<()> {
        ExploreQuery {
            account_id: self.account_id.clone(),
            owner: self.owner.clone(),
            name: self.name.clone(),
            operation: ExploreOperation::Detail,
        }
        .validate()
        .map_err(|_| input_error())?;
        let page = match &self.operation {
            ReadOperation::List { page, .. } | ReadOperation::Comments { page, .. } => *page,
            _ => 1,
        };
        if !(1..=10000).contains(&page) {
            return Err(input_error());
        }
        match &self.operation {
            ReadOperation::Detail { number } | ReadOperation::Comments { number, .. }
                if !identifier(number)
                    || (self.resource == Resource::Pulls && !numeric(number)) =>
            {
                return Err(input_error())
            }
            ReadOperation::List { state, .. }
                if (self.resource == Resource::Issues && *state == State::Merged)
                    || (self.resource == Resource::Pulls
                        && matches!(state, State::Progressing | State::Rejected)) =>
            {
                return Err(input_error())
            }
            _ => (),
        }
        Ok(())
    }
    pub fn validate_provider(&self, provider: Provider) -> Result<()> {
        if provider == Provider::Github {
            match &self.operation {
                ReadOperation::Detail { number } | ReadOperation::Comments { number, .. }
                    if !numeric(number) =>
                {
                    return Err(input_error())
                }
                ReadOperation::List {
                    state: State::Progressing | State::Rejected,
                    ..
                } => return Err(input_error()),
                _ => (),
            }
        }
        Ok(())
    }
}

impl RawItem {
    fn normalized_state(&self, resource: Resource) -> String {
        if resource == Resource::Pulls
            && (self.state == "merged"
                || self.merged == Some(true)
                || self.merged_at.as_ref().is_some_and(|s| !s.is_empty()))
        {
            return "merged".into();
        }
        match self.state.as_str() {
            "open" | "closed" | "progressing" | "rejected" => self.state.clone(),
            _ => "unknown".into(),
        }
    }
    fn summary(&self, resource: Resource) -> Result<WorkItem> {
        let number = self.number.text();
        if !identifier(&number) || (resource == Resource::Pulls && !numeric(&number)) {
            return Err(invalid_response());
        }
        Ok(WorkItem {
            number,
            title: self.title.clone(),
            state: self.normalized_state(resource),
            author: self.user.as_ref().and_then(|u| u.login.clone()),
            labels: self
                .labels
                .as_deref()
                .unwrap_or_default()
                .iter()
                .take(100)
                .map(|label| match label {
                    Label::Text(text) | Label::Named { name: text } => text.clone(),
                })
                .collect(),
            created_at: self.created_at.clone(),
            updated_at: self.updated_at.clone(),
            draft: self.draft.unwrap_or(false),
        })
    }
}

impl HttpHosting {
    pub fn read_repository_collaboration(
        &self,
        account: &Account,
        token: &str,
        query: &ReadQuery,
    ) -> Result<ReadResponse> {
        query.validate()?;
        query.validate_provider(account.provider)?;
        let prefix = format!("repos/{}/{}", encode(&query.owner), encode(&query.name));
        let resource_path = format!("{prefix}/{}", query.resource.path());
        let result = (|| -> Result<ReadData> {
            match &query.operation {
                ReadOperation::List { page, state } => {
                    let api_state =
                        if account.provider == Provider::Github && *state == State::Merged {
                            "closed"
                        } else {
                            state.value()
                        };
                    let (raw, headers): (Vec<RawItem>, _) = self.request(
                        account.provider,
                        token,
                        &resource_path,
                        &[
                            ("page".into(), page.to_string()),
                            ("per_page".into(), PAGE_SIZE.to_string()),
                            ("state".into(), api_state.into()),
                            ("sort".into(), "updated".into()),
                            ("direction".into(), "desc".into()),
                        ],
                    )?;
                    if raw.len() > 100 {
                        return Err(invalid_response());
                    }
                    let next = has_next(&headers, raw.len());
                    let mut filtered = false;
                    let mut items = Vec::new();
                    for item in raw {
                        if query.resource == Resource::Issues && item.pull_request.is_some() {
                            filtered = true;
                            continue;
                        }
                        let summary = item.summary(query.resource)?;
                        if *state != State::All && summary.state != state.value() {
                            filtered = true;
                            continue;
                        }
                        items.push(summary);
                    }
                    Ok(ReadData::List {
                        items,
                        page: *page,
                        has_next: next,
                        filtered,
                    })
                }
                ReadOperation::Detail { number } => {
                    let (raw, _): (RawItem, _) = self.request(
                        account.provider,
                        token,
                        &format!("{resource_path}/{}", encode(number)),
                        &[],
                    )?;
                    if raw.number.text() != *number
                        || (query.resource == Resource::Issues && raw.pull_request.is_some())
                    {
                        return Err(unavailable());
                    }
                    let item = Box::new(raw.summary(query.resource)?);
                    let (body, body_truncated) = bounded(raw.body.unwrap_or_default());
                    Ok(ReadData::Detail {
                        item,
                        body,
                        body_truncated,
                        head: raw.head.map(RawBranch::normalize),
                        base: raw.base.map(RawBranch::normalize),
                        merged_at: raw.merged_at,
                        closed_at: raw.closed_at,
                    })
                }
                ReadOperation::Comments { number, page } => {
                    let path = if account.provider == Provider::Github {
                        format!("{prefix}/issues/{}/comments", encode(number))
                    } else {
                        format!("{resource_path}/{}/comments", encode(number))
                    };
                    let mut params = vec![
                        ("page".into(), page.to_string()),
                        ("per_page".into(), PAGE_SIZE.to_string()),
                    ];
                    if account.provider == Provider::Gitee {
                        if query.resource == Resource::Pulls {
                            params.push(("comment_type".into(), "pr_comment".into()));
                            params.push(("direction".into(), "asc".into()));
                        } else {
                            params.push(("order".into(), "asc".into()));
                        }
                    }
                    let (raw, headers): (Vec<RawComment>, _) =
                        self.request(account.provider, token, &path, &params)?;
                    if raw.len() > 100 {
                        return Err(invalid_response());
                    }
                    let next = has_next(&headers, raw.len());
                    let mut items = Vec::new();
                    for comment in raw {
                        let id = comment.id.text();
                        if !identifier(&id) {
                            return Err(invalid_response());
                        }
                        let (body, body_truncated) = bounded(comment.body.unwrap_or_default());
                        items.push(Comment {
                            id,
                            author: comment.user.and_then(|u| u.login),
                            body,
                            body_truncated,
                            created_at: comment.created_at,
                            updated_at: comment.updated_at,
                        });
                    }
                    Ok(ReadData::Comments {
                        number: number.clone(),
                        items,
                        page: *page,
                        has_next: next,
                    })
                }
            }
        })();
        let data = result.map_err(|error| {
            if error.code == "forbidden" {
                unavailable()
            } else {
                error
            }
        })?;
        Ok(ReadResponse {
            account_id: account.id.clone(),
            owner: query.owner.clone(),
            name: query.name.clone(),
            resource: query.resource,
            data,
        })
    }
}

#[cfg(test)]
mod tests;
