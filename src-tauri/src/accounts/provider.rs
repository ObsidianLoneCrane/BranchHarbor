use super::models::*;
use reqwest::{
    blocking::Client,
    header::{HeaderMap, HeaderValue, AUTHORIZATION},
    StatusCode,
};
use serde::Deserialize;
use std::{
    io::Read,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

pub const PAGE_SIZE: usize = 30;

pub trait Hosting: Send + Sync {
    fn identity(&self, provider: Provider, token: &str) -> Result<Account>;
    fn repositories(
        &self,
        account: &Account,
        token: &str,
        query: &RepositoryQuery,
    ) -> Result<RepositoryPage>;
    fn explore(
        &self,
        account: &Account,
        token: &str,
        query: &super::explorer::ExploreQuery,
    ) -> Result<super::explorer::ExploreResponse>;
}

pub struct HttpHosting {
    #[cfg(test)]
    pub base_url: Option<String>,
}

impl HttpHosting {
    pub fn new() -> Self {
        Self {
            #[cfg(test)]
            base_url: None,
        }
    }

    pub(super) fn request<T: serde::de::DeserializeOwned>(
        &self,
        provider: Provider,
        token: &str,
        endpoint: &str,
        query: &[(String, String)],
    ) -> Result<(T, HeaderMap)> {
        self.request_limited(provider, token, endpoint, query, 8 * 1024 * 1024)
    }

    pub(super) fn request_limited<T: serde::de::DeserializeOwned>(
        &self,
        provider: Provider,
        token: &str,
        endpoint: &str,
        query: &[(String, String)],
        limit: u64,
    ) -> Result<(T, HeaderMap)> {
        let client = Client::builder()
            .user_agent(concat!("BranchHarbor/", env!("CARGO_PKG_VERSION")))
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(25))
            .build()
            .map_err(|_| AppError::new("network", "The HTTPS client could not be initialized."))?;
        let base = provider.api();
        #[cfg(test)]
        let base = self.base_url.as_deref().unwrap_or(base);
        let mut authorization = HeaderValue::from_str(&format!("Bearer {token}"))
            .map_err(|_| AppError::new("invalidInput", "The token contains invalid characters."))?;
        authorization.set_sensitive(true);
        let mut request = client
            .get(format!("{base}/{endpoint}"))
            .header(AUTHORIZATION, authorization)
            .query(query);
        if provider == Provider::Github {
            request = request
                .header("Accept", "application/vnd.github+json")
                .header("X-GitHub-Api-Version", "2026-03-10");
        } else {
            request = request.header("Accept", "application/json");
        }
        let response = request.send().map_err(|_| {
            AppError::new(
                "network",
                "The provider could not be reached. Check your connection and try again.",
            )
        })?;
        let status = response.status();
        let headers = response.headers().clone();
        // Bound provider-controlled bodies and never return request URLs, headers, or response bodies as errors.
        let mut bytes = Vec::new();
        response
            .take(limit + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| AppError::new("network", "The provider response could not be read."))?;
        if !status.is_success() {
            return Err(response_error(status, &headers, &bytes));
        }
        if bytes.len() as u64 > limit {
            return Err(AppError::new(
                "responseTooLarge",
                "The provider response is too large.",
            ));
        }
        let body = serde_json::from_slice(&bytes).map_err(|_| {
            AppError::new(
                "invalidResponse",
                "The provider returned an unexpected response.",
            )
        })?;
        Ok((body, headers))
    }
}

pub fn response_error(status: StatusCode, headers: &HeaderMap, body: &[u8]) -> AppError {
    let secondary_limit = serde_json::from_slice::<serde_json::Value>(body)
        .ok()
        .and_then(|value| {
            value
                .get("message")
                .and_then(|v| v.as_str())
                .map(str::to_lowercase)
        })
        .is_some_and(|message| {
            message.contains("rate limit") || message.contains("abuse detection")
        });
    if status == StatusCode::TOO_MANY_REQUESTS
        || (status == StatusCode::FORBIDDEN
            && (headers
                .get("x-ratelimit-remaining")
                .is_some_and(|v| v == "0")
                || headers.contains_key("retry-after")
                || secondary_limit))
    {
        let mut error = AppError::new(
            "rateLimited",
            "The provider rate limit was reached. Wait before refreshing.",
        );
        error.retry_after_seconds = headers
            .get("retry-after")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse().ok())
            .or_else(|| {
                headers
                    .get("x-ratelimit-reset")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|v| v.parse::<u64>().ok())
                    .map(|reset| reset.saturating_sub(now()))
            });
        return error;
    }
    match status {
        StatusCode::UNAUTHORIZED => AppError::new(
            "unauthorized",
            "The token is invalid or expired. Reconnect the account.",
        ),
        StatusCode::FORBIDDEN => AppError::new(
            "forbidden",
            "The token does not have permission for this request.",
        ),
        StatusCode::NOT_FOUND => AppError::new(
            "forbidden",
            "This resource is unavailable with the current account permissions.",
        ),
        _ => AppError::new(
            "provider",
            "The provider could not complete the request. Try again later.",
        ),
    }
}

pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[derive(Deserialize)]
struct User {
    id: u64,
    login: String,
    name: Option<String>,
}
#[derive(Deserialize)]
struct Owner {
    login: String,
}
#[derive(Deserialize)]
struct RemoteRepository {
    id: u64,
    name: String,
    full_name: String,
    owner: Owner,
    description: Option<String>,
    private: Option<bool>,
    visibility: Option<String>,
    language: Option<String>,
    default_branch: Option<String>,
    updated_at: Option<String>,
    #[serde(default)]
    archived: bool,
}

impl Hosting for HttpHosting {
    fn explore(
        &self,
        account: &Account,
        token: &str,
        query: &super::explorer::ExploreQuery,
    ) -> Result<super::explorer::ExploreResponse> {
        self.explore_repository(account, token, query)
    }
    fn identity(&self, provider: Provider, token: &str) -> Result<Account> {
        let (user, _): (User, _) = self.request(provider, token, "user", &[])?;
        if user.login.is_empty() {
            return Err(AppError::new(
                "invalidResponse",
                "The provider did not return an account identity.",
            ));
        }
        Ok(Account {
            id: format!("{}:{}:{}", provider.slug(), provider.host(), user.id),
            provider,
            host: provider.host().into(),
            user_id: user.id.to_string(),
            login: user.login,
            name: user.name,
            verified_at: now(),
            credential_status: CredentialStatus::Saved,
        })
    }

    fn repositories(
        &self,
        account: &Account,
        token: &str,
        query: &RepositoryQuery,
    ) -> Result<RepositoryPage> {
        let affiliation = match query.ownership {
            Ownership::Owned => "owner",
            Ownership::All => {
                if account.provider == Provider::Github {
                    "owner,collaborator,organization_member"
                } else {
                    "owner,collaborator,organization_member,enterprise_member"
                }
            }
        };
        let parameters = vec![
            ("page".into(), query.page.to_string()),
            ("per_page".into(), PAGE_SIZE.to_string()),
            ("sort".into(), "updated".into()),
            ("direction".into(), "desc".into()),
            ("visibility".into(), query.visibility.value().into()),
            ("affiliation".into(), affiliation.into()),
        ];
        let (raw, headers): (Vec<RemoteRepository>, _) =
            self.request(account.provider, token, "user/repos", &parameters)?;
        let has_next = headers
            .get("link")
            .and_then(|h| h.to_str().ok())
            .map(|h| h.contains("rel=\"next\""))
            .unwrap_or(raw.len() >= PAGE_SIZE);
        let items = raw
            .into_iter()
            .map(|repo| {
                let visibility = match (repo.private, repo.visibility.as_deref()) {
                    (_, Some("internal")) => "internal",
                    (Some(true), _) | (_, Some("private")) => "private",
                    (Some(false), _) | (_, Some("public")) => "public",
                    _ => "unknown",
                };
                Repository {
                    id: format!("{}:{}:{}", account.provider.slug(), account.host, repo.id),
                    name: repo.name,
                    full_name: repo.full_name,
                    description: repo.description,
                    visibility: visibility.into(),
                    owned: repo.owner.login.eq_ignore_ascii_case(&account.login),
                    owner: repo.owner.login,
                    language: repo.language,
                    default_branch: repo.default_branch,
                    updated_at: repo.updated_at,
                    archived: repo.archived,
                }
            })
            .collect();
        Ok(RepositoryPage { account_id: account.id.clone(), items, page: query.page, has_next,
            access_notice: "Only repositories allowed by this token are shown. Private repository visibility depends on token permissions." })
    }
}
