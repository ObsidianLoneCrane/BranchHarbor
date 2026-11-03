use super::*;
use crate::accounts::{tests::mock_server, CredentialStatus};

fn account(provider: Provider) -> Account {
    Account {
        id: "fixture".into(),
        provider,
        host: provider.host().into(),
        user_id: "42".into(),
        login: "fixture-user".into(),
        name: None,
        verified_at: 0,
        credential_status: CredentialStatus::Saved,
    }
}

#[test]
fn day_queries_use_utc_boundaries_and_reject_invalid_days() {
    let day = parse_day("2024-02-29").unwrap();
    let body = graphql_body(Some(day));
    assert_eq!(body["variables"]["from"], "2024-02-29T00:00:00Z");
    assert_eq!(body["variables"]["to"], "2024-02-29T23:59:59Z");
    for invalid in [
        "2023-02-29",
        "2024-2-29",
        "2024-02-29T00:00:00Z",
        "9999-01-01",
    ] {
        assert_eq!(
            parse_day(invalid).unwrap_err().code,
            "invalidContributionDay"
        );
    }
}

#[test]
fn calendar_keeps_provider_dates_and_zero_counts() {
    let body = json!({"data": {"viewer": {
        "databaseId": 42,
        "contributionsCollection": {
            "startedAt": "2024-01-01T00:00:00Z",
            "endedAt": "2024-12-31T23:59:59Z",
            "restrictedContributionsCount": 0,
            "contributionCalendar": {
                "totalContributions": 0,
                "weeks": [{"contributionDays": [{
                    "date": "2024-01-01",
                    "contributionCount": 0,
                    "contributionLevel": "NONE"
                }]}]
            }
        }
    }}})
    .to_string();
    let (hosting, server) = mock_server("200 OK", "", body);
    let response = hosting
        .fetch_contribution_source(&account(Provider::Github), Some("fixture-secret"), None)
        .unwrap();
    let data = serde_json::to_value(response).unwrap();
    assert_eq!(data["source"], "githubCalendar");
    assert_eq!(
        data["calendar"]["weeks"][0]["contributionDays"][0]["date"],
        "2024-01-01"
    );
    assert_eq!(
        data["calendar"]["weeks"][0]["contributionDays"][0]["contributionCount"],
        0
    );
    let request = server.join().unwrap().to_lowercase();
    assert!(request.starts_with("post /graphql "));
    assert!(request.contains("authorization: bearer fixture-secret"));
    assert!(request.contains("contributioncalendar"));
}

#[test]
fn graphql_errors_and_mismatched_viewers_fail_without_echoing_payloads() {
    let (hosting, server) = mock_server("200 OK", "Retry-After: 5\r\n",
        json!({"data":{"viewer":null},"errors":[{"type":"RATE_LIMITED","message":"private payload"}]}).to_string());
    let error = hosting
        .fetch_contribution_source(&account(Provider::Github), Some("fixture"), None)
        .err()
        .unwrap();
    assert_eq!(error.code, "rateLimited");
    assert_eq!(error.retry_after_seconds, Some(5));
    assert!(!error.message.contains("private payload"));
    server.join().unwrap();

    let envelope = serde_json::from_value(json!({"data":{"viewer":{
        "databaseId":43,"contributionsCollection":{}
    }}}))
    .unwrap();
    let error = decode_github(envelope, &account(Provider::Github), true)
        .err()
        .unwrap();
    assert_eq!(error.code, "accountMismatch");
}

#[test]
fn public_events_preserve_unknown_types_and_never_send_credentials() {
    let (hosting, server) = mock_server(
        "200 OK",
        "",
        json!([{"id":"661495466","type":null,"created_at":"2023-06-21T03:21:22+08:00",
            "repo":null,"payload":{"unused":"unneeded private details"}}])
        .to_string(),
    );
    let response = hosting
        .fetch_contribution_source(&account(Provider::Gitee), Some("fixture-secret"), None)
        .unwrap();
    let data = serde_json::to_value(response).unwrap();
    assert_eq!(data["source"], "giteePublicEvents");
    assert_eq!(data["events"][0]["id"], "661495466");
    assert_eq!(data["events"][0]["createdAt"], "2023-06-21T03:21:22+08:00");
    assert!(data["events"][0]["eventType"].is_null());
    assert!(data["events"][0].get("payload").is_none());
    let request = server.join().unwrap().to_lowercase();
    assert!(request.starts_with("get /users/fixture-user/events/public?limit=20 "));
    assert!(!request.contains("authorization"));
    assert!(!request.contains("fixture-secret"));
}
