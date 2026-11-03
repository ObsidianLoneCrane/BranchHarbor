use super::*;
use serde_json::json;
use std::{
    io::{Read, Write},
    net::TcpListener,
};

fn account(provider: Provider) -> Account {
    Account {
        id: format!("{}:{}:1", provider.slug(), provider.host()),
        provider,
        host: provider.host().into(),
        user_id: "1".into(),
        login: "alice".into(),
        name: None,
        verified_at: 1,
        credential_status: CredentialStatus::Saved,
    }
}
fn query(resource: Resource, operation: ReadOperation) -> ReadQuery {
    ReadQuery {
        account_id: "fixture".into(),
        owner: "alice".into(),
        name: "workspace".into(),
        resource,
        operation,
    }
}
fn mock(
    body: serde_json::Value,
    status: &str,
    headers: &str,
) -> (HttpHosting, std::thread::JoinHandle<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let status = status.to_string();
    let headers = headers.to_string();
    let server = std::thread::spawn(move || {
        let (mut socket, _) = listener.accept().unwrap();
        socket
            .set_read_timeout(Some(std::time::Duration::from_secs(5)))
            .unwrap();
        let mut raw = Vec::new();
        loop {
            let mut buffer = [0; 2048];
            let count = socket.read(&mut buffer).unwrap();
            if count == 0 {
                break;
            }
            raw.extend_from_slice(&buffer[..count]);
            if raw.windows(4).any(|s| s == b"\r\n\r\n") {
                break;
            }
        }
        let body = body.to_string();
        write!(socket,"HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\n{headers}Connection: close\r\n\r\n{body}",body.len()).unwrap();
        String::from_utf8(raw).unwrap()
    });
    (
        HttpHosting {
            base_url: Some(url),
        },
        server,
    )
}
fn item(number: serde_json::Value, state: &str) -> serde_json::Value {
    json!({"number":number,"title":"A useful change","state":state,"user":{"login":"alice"},"labels":[{"name":"enhancement"}],"body":"Safe source <script>not executed</script>","created_at":"2026-11-02T00:00:00Z","updated_at":"2026-11-02T01:00:00Z"})
}

#[test]
fn rejects_invalid_paths_pages_identifiers_and_provider_specific_states() {
    for resource in [Resource::Pulls, Resource::Issues] {
        let mut request = query(
            resource,
            ReadOperation::List {
                page: 0,
                state: State::Open,
            },
        );
        assert!(request.validate().is_err());
        request.operation = ReadOperation::Detail {
            number: "../secret".into(),
        };
        assert!(request.validate().is_err());
        request.operation = ReadOperation::List {
            page: 1,
            state: State::Open,
        };
        request.owner = "../another".into();
        assert!(request.validate().is_err());
    }
    let request = query(
        Resource::Issues,
        ReadOperation::Detail {
            number: "IKS135".into(),
        },
    );
    request.validate().unwrap();
    request.validate_provider(Provider::Gitee).unwrap();
    assert!(request.validate_provider(Provider::Github).is_err());
    assert!(query(
        Resource::Pulls,
        ReadOperation::Detail {
            number: "IKS135".into()
        }
    )
    .validate()
    .is_err());
    assert!(query(
        Resource::Issues,
        ReadOperation::List {
            page: 1,
            state: State::Merged
        }
    )
    .validate()
    .is_err());
    assert!(query(
        Resource::Issues,
        ReadOperation::List {
            page: 1,
            state: State::Progressing
        }
    )
    .validate_provider(Provider::Github)
    .is_err());
}

#[test]
fn github_issue_filtering_preserves_provider_pagination_even_on_an_empty_filtered_page() {
    let mut pull = item(json!(42), "open");
    pull["pull_request"] = json!({"url":"https://untrusted.invalid"});
    let (hosting, server) = mock(
        json!([pull]),
        "200 OK",
        "Link: <https://untrusted.invalid/next>; rel=\"next\"\r\n",
    );
    let response = hosting
        .read_repository_collaboration(
            &account(Provider::Github),
            "synthetic",
            &query(
                Resource::Issues,
                ReadOperation::List {
                    page: 2,
                    state: State::Open,
                },
            ),
        )
        .unwrap();
    assert!(
        matches!(response.data, ReadData::List { items, page: 2, has_next: true, filtered: true } if items.is_empty())
    );
    let request = server.join().unwrap();
    let first = request.lines().next().unwrap();
    assert!(first.contains("/issues?"));
    assert!(first.contains("page=2"));
    assert!(!first.contains("synthetic"));
}

#[test]
fn merged_and_closed_pull_filters_are_distinct_and_use_each_providers_supported_state() {
    for provider in [Provider::Github, Provider::Gitee] {
        let mut merged = item(
            json!(42),
            if provider == Provider::Github {
                "closed"
            } else {
                "merged"
            },
        );
        merged["merged_at"] = json!("2026-11-02T01:00:00Z");
        let (hosting, server) = mock(json!([merged, item(json!(43), "closed")]), "200 OK", "");
        let response = hosting
            .read_repository_collaboration(
                &account(provider),
                "synthetic",
                &query(
                    Resource::Pulls,
                    ReadOperation::List {
                        page: 1,
                        state: State::Merged,
                    },
                ),
            )
            .unwrap();
        assert!(
            matches!(response.data, ReadData::List { items, filtered: true, .. } if items.len() == 1 && items[0].state == "merged")
        );
        let request = server.join().unwrap();
        assert!(request.contains(if provider == Provider::Github {
            "state=closed"
        } else {
            "state=merged"
        }));
    }
    let mut merged = item(json!(42), "closed");
    merged["merged"] = json!(true);
    let (hosting, server) = mock(json!([merged, item(json!(43), "closed")]), "200 OK", "");
    let response = hosting
        .read_repository_collaboration(
            &account(Provider::Github),
            "synthetic",
            &query(
                Resource::Pulls,
                ReadOperation::List {
                    page: 1,
                    state: State::Closed,
                },
            ),
        )
        .unwrap();
    assert!(
        matches!(response.data, ReadData::List { items, .. } if items.len() == 1 && items[0].number == "43")
    );
    server.join().unwrap();
}

#[test]
fn gitee_issue_string_numbers_and_progressing_states_survive_normalization() {
    let (hosting, server) = mock(json!([item(json!("IKS135"), "progressing")]), "200 OK", "");
    let response = hosting
        .read_repository_collaboration(
            &account(Provider::Gitee),
            "synthetic",
            &query(
                Resource::Issues,
                ReadOperation::List {
                    page: 1,
                    state: State::Progressing,
                },
            ),
        )
        .unwrap();
    assert!(
        matches!(response.data, ReadData::List { items, .. } if items[0].number == "IKS135" && items[0].state == "progressing")
    );
    server.join().unwrap();
}

#[test]
fn detail_preserves_fork_branch_context_and_rejects_issue_pull_mismatches() {
    let mut raw = item(json!(42), "closed");
    raw["merged"] = json!(true);
    raw["head"] = json!({"ref":"feature/read","repo":{"full_name":"fork/workspace"}});
    raw["base"] = json!({"ref":"main","repo":{"full_name":"alice/workspace"}});
    let (hosting, server) = mock(raw.clone(), "200 OK", "");
    let response = hosting
        .read_repository_collaboration(
            &account(Provider::Github),
            "synthetic",
            &query(
                Resource::Pulls,
                ReadOperation::Detail {
                    number: "42".into(),
                },
            ),
        )
        .unwrap();
    assert!(
        matches!(response.data, ReadData::Detail { item, head: Some(head), base: Some(base), .. } if item.state == "merged" && head.repository.as_deref() == Some("fork/workspace") && base.name.as_deref() == Some("main"))
    );
    server.join().unwrap();
    raw["pull_request"] = json!({});
    let (hosting, server) = mock(raw, "200 OK", "");
    assert_eq!(
        hosting
            .read_repository_collaboration(
                &account(Provider::Github),
                "synthetic",
                &query(
                    Resource::Issues,
                    ReadOperation::Detail {
                        number: "42".into()
                    }
                )
            )
            .unwrap_err()
            .code,
        "resourceUnavailable"
    );
    server.join().unwrap();
}

#[test]
fn comments_use_general_discussion_endpoints_and_preserve_null_authors() {
    for provider in [Provider::Github, Provider::Gitee] {
        for resource in [Resource::Pulls, Resource::Issues] {
            let number = if provider == Provider::Gitee && resource == Resource::Issues {
                "IKS135"
            } else {
                "42"
            };
            let (hosting, server) = mock(
                json!([{"id":99,"user":null,"body":"<img src=invalid onerror=alert(1)>"}]),
                "200 OK",
                "",
            );
            let response = hosting
                .read_repository_collaboration(
                    &account(provider),
                    "synthetic",
                    &query(
                        resource,
                        ReadOperation::Comments {
                            number: number.into(),
                            page: 2,
                        },
                    ),
                )
                .unwrap();
            assert!(
                matches!(response.data, ReadData::Comments { items, page: 2, .. } if items[0].author.is_none() && items[0].body.starts_with("<img"))
            );
            let request = server.join().unwrap();
            let first = request.lines().next().unwrap();
            assert!(first.contains(
                if provider == Provider::Gitee && resource == Resource::Pulls {
                    "/pulls/42/comments?"
                } else if number == "IKS135" {
                    "/issues/IKS135/comments?"
                } else {
                    "/issues/42/comments?"
                }
            ));
            assert_eq!(
                first.contains("comment_type=pr_comment"),
                provider == Provider::Gitee && resource == Resource::Pulls
            );
        }
    }
}

#[test]
fn body_limits_preserve_utf8_boundaries_and_do_not_include_raw_body_in_lists() {
    let (body, truncated) = bounded("\u{00e9}".repeat(BODY_LIMIT));
    assert!(truncated);
    assert!(body.len() <= BODY_LIMIT);
    let mut raw = item(json!(42), "open");
    raw["body"] = json!("x".repeat(BODY_LIMIT + 1));
    let (hosting, server) = mock(raw, "200 OK", "");
    let response = hosting
        .read_repository_collaboration(
            &account(Provider::Github),
            "synthetic",
            &query(
                Resource::Issues,
                ReadOperation::Detail {
                    number: "42".into(),
                },
            ),
        )
        .unwrap();
    assert!(
        matches!(response.data, ReadData::Detail { body, body_truncated: true, .. } if body.len() == BODY_LIMIT)
    );
    server.join().unwrap();
    let (hosting, server) = mock(json!([item(json!(42), "open")]), "200 OK", "");
    let response = hosting
        .read_repository_collaboration(
            &account(Provider::Github),
            "synthetic",
            &query(
                Resource::Issues,
                ReadOperation::List {
                    page: 1,
                    state: State::All,
                },
            ),
        )
        .unwrap();
    assert!(!serde_json::to_string(&response)
        .unwrap()
        .contains("<script>"));
    server.join().unwrap();
}

#[test]
fn errors_are_safe_and_unavailable_resources_do_not_become_empty_lists() {
    for (status, expected) in [
        ("404 Not Found", "resourceUnavailable"),
        ("403 Forbidden", "resourceUnavailable"),
        ("401 Unauthorized", "unauthorized"),
        ("429 Too Many Requests", "rateLimited"),
    ] {
        let (hosting, server) = mock(json!({"message":"synthetic-secret"}), status, "");
        let error = hosting
            .read_repository_collaboration(
                &account(Provider::Gitee),
                "synthetic-secret",
                &query(
                    Resource::Issues,
                    ReadOperation::Detail {
                        number: "IKS135".into(),
                    },
                ),
            )
            .unwrap_err();
        assert_eq!(error.code, expected);
        assert!(!serde_json::to_string(&error)
            .unwrap()
            .contains("synthetic-secret"));
        server.join().unwrap();
    }
}
