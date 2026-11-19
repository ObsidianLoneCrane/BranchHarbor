use super::*;

fn path(folder: &Path) -> String {
    folder.to_str().unwrap().to_owned()
}

fn identity(folder: &Path) {
    run(folder, &["config", "user.name", "BranchHarbor Test"]).unwrap();
    run(folder, &["config", "user.email", "test@example.invalid"]).unwrap();
    run(folder, &["config", "commit.gpgSign", "false"]).unwrap();
}

fn commit(folder: &Path, file: &str, content: &str) {
    std::fs::write(folder.join(file), content).unwrap();
    change(folder, Operation::Stage { path: file.into() }).unwrap();
    change(
        folder,
        Operation::Commit {
            message: "Update project".into(),
            author: author(folder).unwrap().unwrap(),
        },
    )
    .unwrap();
}

#[test]
fn completes_a_local_change_to_push_and_fast_forward_workflow() {
    let temp = tempfile::tempdir().unwrap();
    let database = LocalGit::new(temp.path().join("local.sqlite3"))
        .open()
        .unwrap();
    let remote = temp.path().join("Shared repository.git");
    let local = temp.path().join("First copy");
    let second = temp.path().join("Second copy");
    let url = path(&remote);
    run(
        temp.path(),
        &["init", "--bare", "--initial-branch=main", "--", &url],
    )
    .unwrap();
    let entry = add(&database, AddRepository::Create { path: path(&local) }).unwrap();
    assert_eq!(snapshot(&local).unwrap().branch.as_deref(), Some("main"));
    identity(&local);

    let file = "space [file].txt";
    std::fs::write(local.join(file), "First change\n").unwrap();
    assert!(diff(&local, file, false)
        .unwrap()
        .text
        .contains("+First change"));
    change(&local, Operation::Stage { path: file.into() }).unwrap();
    assert!(diff(&local, file, true)
        .unwrap()
        .text
        .contains("+First change"));
    change(&local, Operation::Unstage { path: file.into() }).unwrap();
    assert_eq!(changes(&local).unwrap()[0].index, '?');
    commit(&local, file, "First change\n");
    run(&local, &["tag", "main"]).unwrap();
    let current = snapshot(&local).unwrap();
    assert_eq!(current.branch.as_deref(), Some("main"));
    assert_eq!(current.branches, ["main"]);

    let again = add(&database, AddRepository::Import { path: path(&local) }).unwrap();
    assert_eq!(again.id, entry.id);
    let reopened = LocalGit::new(temp.path().join("local.sqlite3"))
        .open()
        .unwrap();
    assert_eq!(
        registered(&reopened, entry.id).unwrap(),
        canonical(&local).unwrap()
    );

    change(
        &local,
        Operation::CreateBranch {
            name: "feature/example".into(),
            start: "main".into(),
        },
    )
    .unwrap();
    change(
        &local,
        Operation::SwitchBranch {
            name: "feature/example".into(),
        },
    )
    .unwrap();
    assert_eq!(
        snapshot(&local).unwrap().branch.as_deref(),
        Some("feature/example")
    );
    change(
        &local,
        Operation::SwitchBranch {
            name: "main".into(),
        },
    )
    .unwrap();
    change(
        &local,
        Operation::DeleteBranch {
            name: "feature/example".into(),
        },
    )
    .unwrap();
    for name in ["shared", "mirror"] {
        change(
            &local,
            Operation::AddRemote {
                name: name.into(),
                url: url.clone(),
            },
        )
        .unwrap();
    }
    assert_eq!(snapshot(&local).unwrap().remotes.len(), 2);
    let push = || Operation::Push {
        remote: "shared".into(),
        url: url.clone(),
        branch: "main".into(),
        local_branch: "main".into(),
        track: true,
    };
    change(&local, push()).unwrap();
    assert_eq!(
        snapshot(&local).unwrap().upstream.as_deref(),
        Some("shared/main")
    );

    add(
        &database,
        AddRepository::Clone {
            path: path(&second),
            url: url.clone(),
        },
    )
    .unwrap();
    assert_eq!(
        std::fs::read_to_string(second.join(file))
            .unwrap()
            .trim_end(),
        "First change"
    );
    identity(&second);
    commit(&second, file, "From the second copy\n");
    change(
        &second,
        Operation::Push {
            remote: "origin".into(),
            url: url.clone(),
            branch: "main".into(),
            local_branch: "main".into(),
            track: false,
        },
    )
    .unwrap();
    change(
        &local,
        Operation::Fetch {
            remote: "shared".into(),
            url: url.clone(),
        },
    )
    .unwrap();
    assert_eq!(snapshot(&local).unwrap().behind, Some(1));
    let pull = || Operation::Pull {
        remote: "shared".into(),
        url: url.clone(),
        branch: "main".into(),
        local_branch: "main".into(),
    };
    change(&local, pull()).unwrap();
    assert_eq!(snapshot(&local).unwrap().behind, Some(0));
    assert!(std::fs::read_to_string(local.join(file))
        .unwrap()
        .contains("From the second copy"));

    commit(&local, file, "Diverged locally\n");
    commit(&second, file, "Diverged remotely\n");
    change(
        &second,
        Operation::Push {
            remote: "origin".into(),
            url: url.clone(),
            branch: "main".into(),
            local_branch: "main".into(),
            track: false,
        },
    )
    .unwrap();
    let before = snapshot(&local).unwrap().head;
    assert_eq!(change(&local, pull()), Err(GitError::Diverged));
    assert_eq!(snapshot(&local).unwrap().head, before);
    assert_eq!(change(&local, push()), Err(GitError::PushRejected));
}

#[test]
fn rejects_invalid_locations_and_hides_credential_urls() {
    let temp = tempfile::tempdir().unwrap();
    let database = LocalGit::new(temp.path().join("local.sqlite3"))
        .open()
        .unwrap();
    let bare = temp.path().join("Bare.git");
    run(temp.path(), &["init", "--bare", "--", &path(&bare)]).unwrap();
    assert_eq!(
        add(&database, AddRepository::Import { path: path(&bare) }).unwrap_err(),
        GitError::InvalidRepository
    );
    std::fs::write(temp.path().join("existing.txt"), "Existing file").unwrap();
    assert_eq!(
        add(
            &database,
            AddRepository::Create {
                path: path(temp.path())
            }
        )
        .unwrap_err(),
        GitError::DirectoryNotEmpty
    );
    let local = temp.path().join("Local");
    let repository = add(&database, AddRepository::Create { path: path(&local) }).unwrap();
    run(
        &local,
        &[
            "remote",
            "add",
            "private",
            "https://token@example.invalid/repo.git",
        ],
    )
    .unwrap();
    let snapshot = snapshot(&local).unwrap();
    assert!(snapshot.remotes[0].fetch_url.is_none());
    assert!(snapshot.remotes[0].push_url.is_none());
    assert_eq!(
        validate_remote_url("ext::example"),
        Err(GitError::InvalidRemote)
    );
    assert!(matches!(
        change(
            &local,
            Operation::Fetch {
                remote: "private".into(),
                url: "https://example.invalid/repo.git".into(),
            }
        ),
        Err(GitError::InvalidRemote)
    ));
    std::fs::rename(&local, temp.path().join("Moved")).unwrap();
    assert_eq!(
        registered(&database, repository.id),
        Err(GitError::MissingFolder)
    );
}
