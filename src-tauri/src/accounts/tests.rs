use super::*;
use std::{
    collections::HashMap,
    io::{Read, Write},
    net::TcpListener,
    sync::atomic::{AtomicBool, Ordering},
};

#[derive(Default)]
struct MemoryCredentials {
    tokens: Mutex<HashMap<String, String>>,
    fail_write: AtomicBool,
    fail_read: AtomicBool,
    fail_delete: AtomicBool,
}
impl Credentials for MemoryCredentials {
    fn read(&self, id: &str) -> Result<Option<Zeroizing<String>>> {
        if self.fail_read.load(Ordering::Relaxed) {
            return Err(AppError::credential());
        }
        Ok(self
            .tokens
            .lock()
            .unwrap()
            .get(id)
            .cloned()
            .map(Zeroizing::new))
    }
    fn write(&self, id: &str, token: &str) -> Result<()> {
        if self.fail_write.load(Ordering::Relaxed) {
            return Err(AppError::credential());
        }
        self.tokens.lock().unwrap().insert(id.into(), token.into());
        Ok(())
    }
    fn delete(&self, id: &str) -> Result<()> {
        if self.fail_delete.load(Ordering::Relaxed) {
            return Err(AppError::credential());
        }
        self.tokens.lock().unwrap().remove(id);
        Ok(())
    }
}
struct FixtureHosting;
impl Hosting for FixtureHosting {
    fn identity(&self, provider: Provider, token: &str) -> Result<Account> {
        if token == "invalid-fixture" {
            return Err(AppError::new("unauthorized", "Authorization failed."));
        }
        let (id, login) = if token == "bob-fixture" {
            (2, "bob")
        } else {
            (1, "alice")
        };
        Ok(Account {
            id: format!("{}:{}:{id}", provider.slug(), provider.host()),
            provider,
            host: provider.host().into(),
            user_id: id.to_string(),
            login: login.into(),
            name: None,
            verified_at: 1,
            credential_status: CredentialStatus::Saved,
        })
    }
    fn repositories(
        &self,
        account: &Account,
        _: &str,
        query: &RepositoryQuery,
    ) -> Result<RepositoryPage> {
        Ok(RepositoryPage {
            account_id: account.id.clone(),
            items: vec![],
            page: query.page,
            has_next: false,
            access_notice: "Fixture only",
        })
    }
}
fn fixture() -> (tempfile::TempDir, Arc<MemoryCredentials>, AccountService) {
    let dir = tempfile::tempdir().unwrap();
    let credentials = Arc::new(MemoryCredentials::default());
    let service = AccountService {
        path: dir.path().join("accounts.sqlite3"),
        credentials: credentials.clone(),
        hosting: Arc::new(FixtureHosting),
        operations: Mutex::new(()),
    };
    (dir, credentials, service)
}
fn connect(service: &AccountService, provider: Provider, token: &str) -> Account {
    service
        .connect(provider, Zeroizing::new(token.into()), None)
        .unwrap()
}
fn query(id: &str) -> RepositoryQuery {
    RepositoryQuery {
        account_id: id.into(),
        page: 1,
        ownership: Ownership::All,
        visibility: Visibility::All,
    }
}

#[test]
fn metadata_survives_reopen_without_persisting_the_token() {
    let (_dir, credentials, service) = fixture();
    let account = connect(&service, Provider::Github, "alice-fixture-secret");
    let reopened = AccountService {
        path: service.path.clone(),
        credentials,
        hosting: Arc::new(FixtureHosting),
        operations: Mutex::new(()),
    };
    assert_eq!(reopened.list().unwrap()[0].id, account.id);
    let data = std::fs::read(&service.path).unwrap();
    assert!(!data
        .windows(b"alice-fixture-secret".len())
        .any(|v| v == b"alice-fixture-secret"));
    assert!(!serde_json::to_string(&account)
        .unwrap()
        .contains("alice-fixture-secret"));
}

#[test]
fn accounts_are_isolated_by_provider_and_stable_identity() {
    let (_dir, credentials, service) = fixture();
    let github = connect(&service, Provider::Github, "alice-fixture");
    let gitee = connect(&service, Provider::Gitee, "alice-fixture");
    let bob = connect(&service, Provider::Github, "bob-fixture");
    assert_eq!(service.list().unwrap().len(), 3);
    service.disconnect(&github.id).unwrap();
    assert_eq!(service.list().unwrap().len(), 2);
    assert!(credentials.read(&github.id).unwrap().is_none());
    assert!(credentials.read(&gitee.id).unwrap().is_some());
    assert!(credentials.read(&bob.id).unwrap().is_some());
}

#[test]
fn invalid_tokens_never_create_a_connection() {
    let (_dir, credentials, service) = fixture();
    assert_eq!(
        service
            .connect(
                Provider::Github,
                Zeroizing::new("invalid-fixture".into()),
                None
            )
            .unwrap_err()
            .code,
        "unauthorized"
    );
    assert!(service.list().unwrap().is_empty());
    assert!(credentials.tokens.lock().unwrap().is_empty());
}

#[test]
fn rejected_secure_write_rolls_back_account_metadata() {
    let (_dir, credentials, service) = fixture();
    credentials.fail_write.store(true, Ordering::Relaxed);
    assert_eq!(
        service
            .connect(
                Provider::Github,
                Zeroizing::new("alice-fixture".into()),
                None
            )
            .unwrap_err()
            .code,
        "credentialUnavailable"
    );
    assert!(service.list().unwrap().is_empty());
}

#[test]
fn reconnect_updates_one_account_and_checks_its_identity() {
    let (_dir, credentials, service) = fixture();
    let account = connect(&service, Provider::Github, "alice-fixture");
    service
        .connect(
            Provider::Github,
            Zeroizing::new("renewed-fixture".into()),
            Some(account.id.clone()),
        )
        .unwrap();
    assert_eq!(service.list().unwrap().len(), 1);
    assert_eq!(
        credentials.read(&account.id).unwrap().unwrap().as_str(),
        "renewed-fixture"
    );
    assert_eq!(
        service
            .connect(
                Provider::Github,
                Zeroizing::new("bob-fixture".into()),
                Some(account.id.clone())
            )
            .unwrap_err()
            .code,
        "accountMismatch"
    );
    assert_eq!(
        credentials.read(&account.id).unwrap().unwrap().as_str(),
        "renewed-fixture"
    );
}

#[test]
fn failed_credential_removal_preserves_the_account_for_retry() {
    let (_dir, credentials, service) = fixture();
    let account = connect(&service, Provider::Github, "alice-fixture");
    credentials.fail_delete.store(true, Ordering::Relaxed);
    assert_eq!(
        service.disconnect(&account.id).unwrap_err().code,
        "credentialUnavailable"
    );
    assert_eq!(service.list().unwrap().len(), 1);
    credentials.fail_delete.store(false, Ordering::Relaxed);
    service.disconnect(&account.id).unwrap();
    assert!(service.list().unwrap().is_empty());
}

#[test]
fn missing_and_locked_credentials_are_distinct_and_do_not_discard_metadata() {
    let (_dir, credentials, service) = fixture();
    let account = connect(&service, Provider::Github, "alice-fixture");
    credentials.delete(&account.id).unwrap();
    assert_eq!(
        service.list().unwrap()[0].credential_status,
        CredentialStatus::Missing
    );
    assert_eq!(
        service.repositories(query(&account.id)).unwrap_err().code,
        "credentialMissing"
    );
    credentials.fail_read.store(true, Ordering::Relaxed);
    assert_eq!(
        service.list().unwrap()[0].credential_status,
        CredentialStatus::Unavailable
    );
    assert_eq!(
        service.disconnect(&account.id).unwrap_err().code,
        "credentialUnavailable"
    );
    credentials.fail_read.store(false, Ordering::Relaxed);
    service.disconnect(&account.id).unwrap();
}

#[test]
fn commit_failure_restores_the_previous_secure_token() {
    let (_dir, credentials, service) = fixture();
    let account = connect(&service, Provider::Github, "original-fixture");
    let connection = storage::open(&service.path).unwrap();
    connection.execute_batch("PRAGMA foreign_keys=ON; CREATE TABLE parent(id INTEGER PRIMARY KEY); CREATE TABLE guard(id INTEGER REFERENCES parent(id) DEFERRABLE INITIALLY DEFERRED); CREATE TRIGGER fail_update AFTER UPDATE ON accounts BEGIN INSERT INTO guard VALUES(99); END;").unwrap();
    // The production connection enables foreign keys so the deferred constraint fails at commit.
    drop(connection);
    assert_eq!(
        service
            .connect(Provider::Github, Zeroizing::new("new-fixture".into()), None)
            .unwrap_err()
            .code,
        "storage"
    );
    assert_eq!(
        credentials.read(&account.id).unwrap().unwrap().as_str(),
        "original-fixture"
    );
    assert_eq!(service.list().unwrap().len(), 1);
}

#[test]
fn validates_page_numbers_before_requesting_provider_data() {
    let (_dir, _, service) = fixture();
    let mut request = query("missing");
    request.page = 0;
    assert_eq!(
        service.repositories(request).unwrap_err().code,
        "invalidInput"
    );
    assert_eq!(
        service.repositories(query("missing")).unwrap_err().code,
        "accountNotFound"
    );
}

fn mock_server(
    status: &str,
    headers: &str,
    body: String,
) -> (HttpHosting, std::thread::JoinHandle<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let response = format!("HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n{headers}\r\n{body}", body.len());
    let thread = std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        stream
            .set_read_timeout(Some(std::time::Duration::from_secs(5)))
            .unwrap();
        let mut request = Vec::new();
        let mut buffer = [0; 1024];
        loop {
            let size = stream.read(&mut buffer).unwrap();
            request.extend_from_slice(&buffer[..size]);
            if size == 0 || request.windows(4).any(|v| v == b"\r\n\r\n") {
                break;
            }
        }
        stream.write_all(response.as_bytes()).unwrap();
        String::from_utf8(request).unwrap()
    });
    (
        HttpHosting {
            base_url: Some(url),
        },
        thread,
    )
}

#[test]
fn authenticated_identity_uses_a_header_without_token_urls() {
    for provider in [Provider::Github, Provider::Gitee] {
        let (hosting, server) = mock_server(
            "200 OK",
            "",
            r#"{"id":123,"login":"fixture-user","name":"Fixture User"}"#.into(),
        );
        let account = hosting.identity(provider, "synthetic-test-token").unwrap();
        assert_eq!(account.user_id, "123");
        let request = server.join().unwrap();
        assert!(!request
            .lines()
            .next()
            .unwrap()
            .contains("synthetic-test-token"));
        assert!(request
            .to_lowercase()
            .contains("authorization: bearer synthetic-test-token"));
        if provider == Provider::Github {
            assert!(request
                .to_lowercase()
                .contains("x-github-api-version: 2026-03-10"));
        }
    }
}

#[test]
fn repository_pagination_maps_visibility_ownership_and_provider_specific_filters() {
    for provider in [Provider::Github, Provider::Gitee] {
        let (hosting, server) = mock_server("200 OK", "Link: <https://untrusted.invalid/next>; rel=\"next\"\r\n", r#"[{"id":44,"name":"private-project","full_name":"alice/private-project","owner":{"login":"alice"},"private":true,"description":null,"language":"Rust","default_branch":"main","updated_at":"2026-11-02T00:00:00Z"}]"#.into());
        let account = FixtureHosting.identity(provider, "alice-fixture").unwrap();
        let mut request = query(&account.id);
        request.page = 2;
        request.visibility = Visibility::Private;
        let page = hosting
            .repositories(&account, "synthetic", &request)
            .unwrap();
        assert!(page.has_next);
        assert_eq!(page.page, 2);
        assert_eq!(page.items[0].visibility, "private");
        assert!(page.items[0].owned);
        let raw = server.join().unwrap();
        let line = raw.lines().next().unwrap();
        assert!(line.contains("page=2"));
        assert!(line.contains("visibility=private"));
        assert!(!line.contains("type="));
        assert_eq!(
            line.contains("enterprise_member"),
            provider == Provider::Gitee
        );
    }
}

#[test]
fn internal_repository_visibility_is_preserved_when_private_flag_is_true() {
    let (hosting, server) = mock_server(
        "200 OK",
        "",
        r#"[{"id":45,"name":"internal-project","full_name":"team/internal-project","owner":{"login":"team"},"private":true,"visibility":"internal"}]"#.into(),
    );
    let account = FixtureHosting
        .identity(Provider::Github, "alice-fixture")
        .unwrap();
    let page = hosting
        .repositories(&account, "synthetic", &query(&account.id))
        .unwrap();
    assert_eq!(page.items[0].visibility, "internal");
    assert!(!page.items[0].owned);
    assert!(!page.has_next);
    server.join().unwrap();
}

#[test]
fn provider_errors_are_classified_without_echoing_provider_secrets() {
    for (status, headers, expected) in [
        ("401 Unauthorized", "", "unauthorized"),
        ("403 Forbidden", "", "forbidden"),
        (
            "403 Forbidden",
            "X-RateLimit-Remaining: 0\r\nRetry-After: 45\r\n",
            "rateLimited",
        ),
        (
            "429 Too Many Requests",
            "Retry-After: 45\r\n",
            "rateLimited",
        ),
        ("500 Internal Server Error", "", "provider"),
    ] {
        let (hosting, server) = mock_server(
            status,
            headers,
            r#"{"message":"synthetic-secret-value"}"#.into(),
        );
        let error = hosting
            .identity(Provider::Github, "synthetic-secret-value")
            .unwrap_err();
        assert_eq!(error.code, expected);
        assert!(!serde_json::to_string(&error)
            .unwrap()
            .contains("synthetic-secret-value"));
        if expected == "rateLimited" {
            assert_eq!(error.retry_after_seconds, Some(45));
        }
        server.join().unwrap();
    }
}

#[test]
fn malformed_responses_and_redirects_are_not_treated_as_accounts() {
    for (status, headers, body, expected) in [
        ("200 OK", "", "not JSON", "invalidResponse"),
        (
            "302 Found",
            "Location: http://untrusted.invalid\r\n",
            "",
            "provider",
        ),
    ] {
        let (hosting, server) = mock_server(status, headers, body.into());
        assert_eq!(
            hosting
                .identity(Provider::Gitee, "synthetic")
                .unwrap_err()
                .code,
            expected
        );
        server.join().unwrap();
    }
}
