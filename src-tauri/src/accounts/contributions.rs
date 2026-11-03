use super::{
    explorer::encode,
    models::*,
    provider::{response_error, HttpHosting, RequestBody},
    storage, AccountService,
};
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;
use time::{macros::format_description, Date};

const LIMIT: u64 = 512 * 1024;
const GITEE_LIMIT: usize = 20;

const CALENDAR_QUERY: &str = "query {
  viewer {
    databaseId
    contributionsCollection {
      startedAt endedAt restrictedContributionsCount
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount contributionLevel } }
      }
    }
  }
}";

const DAY_QUERY: &str = "query($from: DateTime!, $to: DateTime!) {
  viewer {
    databaseId
    contributionsCollection(from: $from, to: $to) {
      startedAt endedAt restrictedContributionsCount
      totalCommitContributions totalPullRequestContributions totalIssueContributions
    }
  }
}";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceResponse {
    account_id: String,
    data: SourceData,
}

#[derive(Serialize)]
#[serde(
    tag = "source",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum SourceData {
    GithubCalendar {
        #[serde(flatten)]
        range: Range,
        calendar: Calendar,
    },
    GithubDay {
        #[serde(flatten)]
        range: Range,
        #[serde(flatten)]
        totals: DayTotals,
    },
    GiteePublicEvents {
        events: Vec<PublicEvent>,
        limit: usize,
    },
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Range {
    started_at: String,
    ended_at: String,
    restricted_contributions_count: u32,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Calendar {
    total_contributions: u32,
    weeks: Vec<CalendarWeek>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CalendarWeek {
    contribution_days: Vec<CalendarDay>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CalendarDay {
    date: String,
    contribution_count: u32,
    contribution_level: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DayTotals {
    total_commit_contributions: u32,
    total_pull_request_contributions: u32,
    total_issue_contributions: u32,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicEvent {
    #[serde(deserialize_with = "event_id")]
    id: String,
    #[serde(rename(deserialize = "type"))]
    event_type: Option<String>,
    #[serde(rename(deserialize = "created_at"))]
    created_at: String,
    #[serde(rename(deserialize = "repo"), skip_serializing_if = "Option::is_none")]
    repository: Option<EventRepository>,
}

fn event_id<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> std::result::Result<String, D::Error> {
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Id {
        Text(String),
        Number(u64),
    }
    match Id::deserialize(deserializer)? {
        Id::Text(id) => Ok(id),
        Id::Number(id) => Ok(id.to_string()),
    }
}

#[derive(Deserialize, Serialize)]
struct EventRepository {
    name: Option<String>,
}

#[derive(Deserialize)]
struct GraphqlEnvelope {
    data: Option<serde_json::Value>,
    #[serde(default)]
    errors: Vec<GraphqlError>,
}

#[derive(Deserialize)]
struct GraphqlError {
    #[serde(rename = "type")]
    kind: Option<String>,
}

#[derive(Deserialize)]
struct GraphqlData {
    viewer: Viewer,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Viewer {
    database_id: Option<u64>,
    contributions_collection: serde_json::Value,
}

fn invalid_response() -> AppError {
    AppError::new(
        "invalidResponse",
        "The contribution source returned an unexpected response.",
    )
}

fn invalid_day() -> AppError {
    AppError::new(
        "invalidContributionDay",
        "Choose a valid UTC day on or before today.",
    )
}

fn parse_day(day: &str) -> Result<Date> {
    let date =
        Date::parse(day, format_description!("[year]-[month]-[day]")).map_err(|_| invalid_day())?;
    if day.len() != 10 || date.year() < 2008 || date > time::OffsetDateTime::now_utc().date() {
        return Err(invalid_day());
    }
    Ok(date)
}

fn graphql_body(day: Option<Date>) -> serde_json::Value {
    if let Some(day) = day {
        json!({
            "query": DAY_QUERY,
            "variables": {
                "from": format!("{day}T00:00:00Z"),
                "to": format!("{day}T23:59:59Z")
            }
        })
    } else {
        json!({ "query": CALENDAR_QUERY })
    }
}

fn decode_github(envelope: GraphqlEnvelope, account: &Account, daily: bool) -> Result<SourceData> {
    let data: GraphqlData = serde_json::from_value(envelope.data.ok_or_else(invalid_response)?)
        .map_err(|_| invalid_response())?;
    let viewer = data.viewer;
    let id = viewer.database_id.ok_or_else(invalid_response)?;
    if id.to_string() != account.user_id {
        return Err(AppError::new(
            "accountMismatch",
            "The token belongs to a different account.",
        ));
    }
    let collection = viewer.contributions_collection;
    let range = serde_json::from_value(collection.clone()).map_err(|_| invalid_response())?;
    if daily {
        let totals = serde_json::from_value(collection).map_err(|_| invalid_response())?;
        Ok(SourceData::GithubDay { range, totals })
    } else {
        let calendar = serde_json::from_value(collection["contributionCalendar"].clone())
            .map_err(|_| invalid_response())?;
        Ok(SourceData::GithubCalendar { range, calendar })
    }
}

impl HttpHosting {
    pub(super) fn fetch_contribution_source(
        &self,
        account: &Account,
        token: Option<&str>,
        day: Option<Date>,
    ) -> Result<SourceData> {
        match account.provider {
            Provider::Github => {
                let (envelope, headers): (GraphqlEnvelope, _) = self.send(
                    account.provider,
                    Some(token.ok_or_else(AppError::missing)?),
                    "graphql",
                    RequestBody::Graphql(graphql_body(day)),
                    LIMIT,
                )?;
                if !envelope.errors.is_empty() {
                    if envelope
                        .errors
                        .iter()
                        .any(|error| error.kind.as_deref() == Some("RATE_LIMITED"))
                    {
                        return Err(response_error(StatusCode::TOO_MANY_REQUESTS, &headers, &[]));
                    }
                    if envelope
                        .errors
                        .iter()
                        .any(|error| error.kind.as_deref() == Some("FORBIDDEN"))
                    {
                        return Err(response_error(StatusCode::FORBIDDEN, &headers, &[]));
                    }
                    return Err(AppError::new(
                        "provider",
                        "GitHub could not complete the contribution query.",
                    ));
                }
                decode_github(envelope, account, day.is_some())
            }
            Provider::Gitee => {
                if day.is_some() {
                    return Err(AppError::new(
                        "contributionUnavailable",
                        "Gitee only provides a public event sample here.",
                    ));
                }
                let parameters = [("limit".into(), GITEE_LIMIT.to_string())];
                let (mut events, _): (Vec<PublicEvent>, _) = self.send(
                    account.provider,
                    None,
                    &format!("users/{}/events/public", encode(&account.login)),
                    RequestBody::Query(&parameters),
                    LIMIT,
                )?;
                events.truncate(GITEE_LIMIT);
                Ok(SourceData::GiteePublicEvents {
                    events,
                    limit: GITEE_LIMIT,
                })
            }
        }
    }
}

impl AccountService {
    fn contribution_source(&self, account_id: &str, day: Option<Date>) -> Result<SourceResponse> {
        let _guard = self.operations.lock().map_err(|_| AppError::storage())?;
        let connection = storage::open(&self.path)?;
        let account = storage::get(&connection, account_id)?;
        let token = match account.provider {
            Provider::Github => Some(
                self.credentials
                    .read(&account.id)?
                    .filter(|token| !token.is_empty())
                    .ok_or_else(AppError::missing)?,
            ),
            Provider::Gitee => None,
        };
        let data = self.hosting.contribution_source(
            &account,
            token.as_ref().map(|token| token.as_str()),
            day,
        )?;
        Ok(SourceResponse {
            account_id: account.id,
            data,
        })
    }
}

#[tauri::command]
pub async fn read_contribution_source(
    service: tauri::State<'_, Arc<AccountService>>,
    account_id: String,
    day: Option<String>,
) -> Result<SourceResponse> {
    let day = day.as_deref().map(parse_day).transpose()?;
    let service = service.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.contribution_source(&account_id, day))
        .await
        .map_err(|_| AppError::storage())?
}

#[cfg(test)]
mod tests;
