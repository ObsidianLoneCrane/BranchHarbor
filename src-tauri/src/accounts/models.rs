use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Github,
    Gitee,
}

impl Provider {
    pub fn slug(self) -> &'static str {
        match self {
            Self::Github => "github",
            Self::Gitee => "gitee",
        }
    }
    pub fn host(self) -> &'static str {
        match self {
            Self::Github => "github.com",
            Self::Gitee => "gitee.com",
        }
    }
    pub fn api(self) -> &'static str {
        match self {
            Self::Github => "https://api.github.com",
            Self::Gitee => "https://gitee.com/api/v5",
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub id: String,
    pub provider: Provider,
    pub host: String,
    pub user_id: String,
    pub login: String,
    pub name: Option<String>,
    pub verified_at: u64,
    pub credential_status: CredentialStatus,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum CredentialStatus {
    Saved,
    Missing,
    Unavailable,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: String,
    pub message: String,
    pub retry_after_seconds: Option<u64>,
}

impl AppError {
    pub fn new(code: &str, message: &str) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            retry_after_seconds: None,
        }
    }
    pub fn storage() -> Self {
        Self::new("storage", "Local account data could not be accessed.")
    }
    pub fn credential() -> Self {
        Self::new(
            "credentialUnavailable",
            "The system credential store is unavailable or locked.",
        )
    }
    pub fn missing() -> Self {
        Self::new(
            "credentialMissing",
            "The saved token is missing. Reconnect this account.",
        )
    }
    pub fn not_found() -> Self {
        Self::new("accountNotFound", "The selected account no longer exists.")
    }
}

pub type Result<T> = std::result::Result<T, AppError>;

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Ownership {
    #[default]
    All,
    Owned,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Visibility {
    #[default]
    All,
    Public,
    Private,
}

impl Visibility {
    pub fn value(self) -> &'static str {
        match self {
            Self::All => "all",
            Self::Public => "public",
            Self::Private => "private",
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryQuery {
    pub account_id: String,
    pub page: u32,
    #[serde(default)]
    pub ownership: Ownership,
    #[serde(default)]
    pub visibility: Visibility,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Repository {
    pub id: String,
    pub name: String,
    pub full_name: String,
    pub description: Option<String>,
    pub visibility: String,
    pub owner: String,
    pub owned: bool,
    pub language: Option<String>,
    pub default_branch: Option<String>,
    pub updated_at: Option<String>,
    pub archived: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryPage {
    pub account_id: String,
    pub items: Vec<Repository>,
    pub page: u32,
    pub has_next: bool,
    pub access_notice: &'static str,
}
