use super::*;
use std::{
    io::{Read, Write},
    net::TcpListener,
};

const COMMIT: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TREE: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const BLOB: &str = "cccccccccccccccccccccccccccccccccccccccc";
fn account() -> Account {
    Account {
        id: "github:github.com:1".into(),
        provider: Provider::Github,
        host: "github.com".into(),
        user_id: "1".into(),
        login: "alice".into(),
        name: None,
        verified_at: 1,
        credential_status: CredentialStatus::Saved,
    }
}
fn query(operation: ExploreOperation) -> ExploreQuery {
    ExploreQuery {
        account_id: account().id,
        owner: "alice".into(),
        name: "workspace".into(),
        operation,
    }
}
fn mock(body: serde_json::Value, headers: &str) -> (HttpHosting, std::thread::JoinHandle<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let headers = headers.to_string();
    let server = std::thread::spawn(move || {
        let (mut socket, _) = listener.accept().unwrap();
        socket
            .set_read_timeout(Some(std::time::Duration::from_secs(5)))
            .unwrap();
        let mut request = Vec::new();
        loop {
            let mut chunk = [0; 2048];
            let count = socket.read(&mut chunk).unwrap();
            if count == 0 {
                break;
            }
            request.extend_from_slice(&chunk[..count]);
            if request.windows(4).any(|s| s == b"\r\n\r\n") {
                break;
            }
        }
        let body = body.to_string();
        write!(socket, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n{headers}Connection: close\r\n\r\n{body}", body.len()).unwrap();
        String::from_utf8(request).unwrap()
    });
    (
        HttpHosting {
            base_url: Some(url),
        },
        server,
    )
}

#[test]
fn validates_untrusted_repository_paths_and_object_references_before_network_access() {
    for owner in ["..", "a/b", "a\\b", "", "line\nbreak"] {
        let mut request = query(ExploreOperation::Detail);
        request.owner = owner.into();
        assert_eq!(
            request.validate().unwrap_err().code,
            "invalidRepositoryInput"
        );
    }
    for operation in [
        ExploreOperation::Branches { page: 0 },
        ExploreOperation::Directory {
            sha: "../../secret".into(),
        },
        ExploreOperation::Branch {
            branch: "feature/../main".into(),
        },
    ] {
        assert!(query(operation).validate().is_err());
    }
    assert!(query(ExploreOperation::Branch {
        branch: "feature/path#with%spaces here".into()
    })
    .validate()
    .is_ok());
}

#[test]
fn resolves_slash_branches_to_an_immutable_commit_and_tree_for_both_providers() {
    for provider in [Provider::Github, Provider::Gitee] {
        let (hosting, server) = mock(
            serde_json::json!({"name":"feature/read files", "commit":{"sha":COMMIT,"commit":{"tree":{"sha":TREE}}}}),
            "",
        );
        let mut account = account();
        account.provider = provider;
        let response = hosting
            .explore_repository(
                &account,
                "synthetic",
                &query(ExploreOperation::Branch {
                    branch: "feature/read files".into(),
                }),
            )
            .unwrap();
        assert!(
            matches!(response.data, ExploreData::Branch { commit_sha, tree_sha, .. } if commit_sha == COMMIT && tree_sha == TREE)
        );
        let request = server.join().unwrap();
        assert!(request
            .lines()
            .next()
            .unwrap()
            .contains("/branches/feature%2Fread%20files"));
        assert!(!request.lines().next().unwrap().contains("synthetic"));
    }
}

#[test]
fn paginates_branches_without_following_provider_links() {
    let (hosting, server) = mock(
        serde_json::json!([{"name":"main","commit":{"sha":COMMIT},"protected":true}]),
        "Link: <https://untrusted.invalid/token>; rel=\"next\"\r\n",
    );
    let response = hosting
        .explore_repository(
            &account(),
            "synthetic",
            &query(ExploreOperation::Branches { page: 2 }),
        )
        .unwrap();
    assert!(matches!(
        response.data,
        ExploreData::Branches {
            page: 2,
            has_next: true,
            ..
        }
    ));
    assert!(server
        .join()
        .unwrap()
        .lines()
        .next()
        .unwrap()
        .contains("page=2"));
}

#[test]
fn directory_reads_are_nonrecursive_sorted_and_preserve_special_entry_modes() {
    let (hosting, server) = mock(
        serde_json::json!({"sha":TREE,"truncated":true,"tree":[
            {"path":"read me%.md","mode":"100644","type":"blob","sha":BLOB,"size":4},
            {"path":"src","mode":"040000","type":"tree","sha":TREE},
            {"path":"link","mode":"120000","type":"blob","sha":BLOB,"size":4},
            {"path":"vendor","mode":"160000","type":"commit","sha":COMMIT}
        ]}),
        "",
    );
    let response = hosting
        .explore_repository(
            &account(),
            "synthetic",
            &query(ExploreOperation::Directory { sha: TREE.into() }),
        )
        .unwrap();
    if let ExploreData::Directory {
        items, truncated, ..
    } = response.data
    {
        assert!(truncated);
        assert_eq!(items[0].path, "src");
        assert_eq!(items[1].mode, "120000");
        assert!(items.iter().any(|entry| entry.path == "read me%.md"));
        assert!(items.iter().any(|entry| entry.kind == "commit"));
    } else {
        panic!("Expected directory data");
    }
    assert!(!server
        .join()
        .unwrap()
        .lines()
        .next()
        .unwrap()
        .contains("recursive"));
}

fn blob(bytes: &[u8], encoding: &str) -> RawBlob {
    RawBlob {
        sha: BLOB.into(),
        size: bytes.len() as u64,
        encoding: encoding.into(),
        content: STANDARD.encode(bytes),
    }
}
#[test]
fn file_preview_distinguishes_safe_source_empty_binary_and_unsupported_encoding() {
    for (bytes, encoding, expected) in [
        (b"<script>alert(1)</script>\n".as_slice(), "base64", "text"),
        (b"", "base64", "text"),
        (b"a\0b", "base64", "binary"),
        (&[255, 254], "base64", "unsupportedEncoding"),
        (b"hello", "raw", "unsupportedEncoding"),
    ] {
        let data = decode_blob(BLOB, blob(bytes, encoding)).unwrap();
        assert!(matches!(data, ExploreData::File { status, .. } if status == expected));
    }
}
#[test]
fn malformed_or_mismatched_blob_data_is_rejected_and_large_files_are_bounded() {
    let mut malformed = blob(b"hello", "base64");
    malformed.content = "not base64!".into();
    assert!(decode_blob(BLOB, malformed).is_err());
    assert!(decode_blob(TREE, blob(b"hello", "base64")).is_err());
    let mut mismatch = blob(b"hello", "base64");
    mismatch.size = 1;
    assert!(decode_blob(BLOB, mismatch).is_err());
    let lines = "x\n".repeat(5001);
    assert!(matches!(
        decode_blob(BLOB, blob(lines.as_bytes(), "base64")).unwrap(),
        ExploreData::File {
            status: "tooLarge",
            ..
        }
    ));
    let mac_lines = "x\r".repeat(5001);
    assert!(matches!(
        decode_blob(BLOB, blob(mac_lines.as_bytes(), "base64")).unwrap(),
        ExploreData::File {
            status: "tooLarge",
            ..
        }
    ));
    let hosting = HttpHosting {
        base_url: Some("http://127.0.0.1:1".into()),
    };
    let response = hosting
        .explore_repository(
            &account(),
            "synthetic",
            &query(ExploreOperation::File {
                sha: BLOB.into(),
                size: PREVIEW_LIMIT + 1,
            }),
        )
        .unwrap();
    assert!(matches!(
        response.data,
        ExploreData::File {
            status: "tooLarge",
            ..
        }
    ));
}

#[test]
fn large_directories_are_explicitly_limited_before_returning_to_the_ui() {
    let entries: Vec<_> = (0..2001).map(|index| serde_json::json!({"path":format!("file-{index}.txt"),"mode":"100644","type":"blob","sha":BLOB,"size":1})).collect();
    let (hosting, server) = mock(serde_json::json!({"sha":TREE,"tree":entries}), "");
    let response = hosting
        .explore_repository(
            &account(),
            "synthetic",
            &query(ExploreOperation::Directory { sha: TREE.into() }),
        )
        .unwrap();
    assert!(
        matches!(response.data, ExploreData::Directory { items, truncated: true, .. } if items.len() == 2000)
    );
    server.join().unwrap();
}

#[test]
fn verifies_blob_response_identity_and_normalizes_detail_visibility() {
    let (hosting, server) = mock(
        serde_json::json!({"id":44,"full_name":"alice/workspace","default_branch":"main","private":true,"visibility":"internal"}),
        "",
    );
    let response = hosting
        .explore_repository(&account(), "synthetic", &query(ExploreOperation::Detail))
        .unwrap();
    assert!(
        matches!(response.data, ExploreData::Detail { visibility, .. } if visibility == "internal")
    );
    server.join().unwrap();
    let (hosting, server) = mock(
        serde_json::json!({"sha":BLOB,"size":5,"encoding":"base64","content":"aGVsbG8=\n"}),
        "",
    );
    let response = hosting
        .explore_repository(
            &account(),
            "synthetic",
            &query(ExploreOperation::File {
                sha: BLOB.into(),
                size: 5,
            }),
        )
        .unwrap();
    assert!(matches!(response.data, ExploreData::File { text: Some(text), .. } if text == "hello"));
    server.join().unwrap();
}
