# Branching and releases

## Current state

The repository has `main`, `develop`, and `release`. The disposable environment and application
foundation are integrated into `develop`. Start subsequent feature branches from the updated
development branch.

The [CI workflow](../.github/workflows/ci.yml) implements quality checks, PR route validation, and
four native packaging jobs. Signing, public release automation, and updater channels remain planned.
This document does not assert that repository rulesets or required checks have been enabled.

## Branch responsibilities

| Branch      | Purpose                                | Normal routing                                         |
| ----------- | -------------------------------------- | ------------------------------------------------------ |
| `main`      | Stable baseline and published versions | Receives accepted releases and urgent production fixes |
| `develop`   | Next-version integration               | Receives features and development fixes                |
| `release`   | Stabilization of one pending version   | Receives the selected snapshot and candidate fixes     |
| `feature/*` | Focused feature or foundation task     | From `develop`, PR into `develop`                      |
| `fix/*`     | Focused repair                         | From and PR into the affected long-lived branch        |

Use descriptive English names, optionally with an issue number: `feature/12-github-account` or
`fix/35-gitee-pagination`.

## Daily workflow

From a normal terminal with a clean worktree:

```powershell
git switch develop
git pull --ff-only origin develop
git switch -c feature/example-task
```

Implement the scope, update affected docs, run relevant checks, create focused English commits, and
push the feature branch. The maintainer creates, reviews, and merges the PR on GitHub's website. Do
not automate PR creation or merging through GitHub CLI or APIs.

Prefer squash merge for short-lived branches. Use merge commits for `develop -> release`,
`release -> main`, and long-lived branch synchronization to retain shared history. The maintainer
performs all merges.

Update the local target after a web merge before starting another feature. A pushed branch is not
evidence of a merged PR. Retain all three long-lived branches.

### Post-merge synchronization and cleanup

After the maintainer merges a PR on the website:

1. Check for a clean worktree and fetch remote state with `git fetch --prune origin`.
2. Verify that the feature commits are included in the actual target branch. For a squash merge,
   also inspect the merged PR and patch/tree equivalence; ancestry alone is insufficient.
3. Switch to the local target and update it with `git pull --ff-only origin develop` for a normal
   feature. If fast-forward fails, inspect the divergence before making further changes.
4. When the maintainer requests cleanup, delete only the verified merged short-lived branches, both
   locally and remotely if they still exist. Prefer `git branch -d` locally; never force-delete an
   unverified branch. Keep `main`, `develop`, and `release`.
5. Create the next scoped `feature/*` branch from the updated `develop`.

Use a normal terminal for Git synchronization, not the environment with redirected application
configuration. Publishing the next branch can wait until its first reviewable implementation is
ready. PR creation and merging remain manual website operations.

## Fix routing

- Development defect: `fix/*` from `develop`, PR into `develop`.
- Candidate defect: `fix/*` from `release`, PR into `release`. Backport in a separate fix PR if
  development needs the repair before the release completes.
- Published defect: `fix/*` from `main`, PR into `main`, then a patch version. Synchronize the
  accepted fix into `develop` and `release` through web PRs.

For backports, inspect the destination and create a destination-based branch with only the needed
repair. Avoid importing unrelated development changes into fixes.

## Checks and planned protections

Configure long-lived branches to require PRs, successful available checks, and resolved
conversations; reject deletion and force pushes. Keep merge commits available for synchronization. A
solo maintainer can initially omit approval by another person to avoid blocking their own PRs.

Only require check names after their workflows exist and have run. Available job names are
`Quality and browser tests`, `Desktop (windows-x64)`, `Desktop (macos-arm64)`,
`Desktop (macos-x64)`, and `Desktop (linux-x64)`.

The quality job runs `pnpm check`, a production frontend build, and Chromium behavior tests. For PRs
it also validates the head/base route. Desktop jobs depend on quality, run Rust format, Clippy, and
test targets, then produce unsigned/ad-hoc-signed test installers with frozen frontend dependencies
and pinned Rust. Actions are pinned to verified commit SHAs. No job creates or merges a PR,
publishes a release, or has repository write permission.

Pushes to long-lived, feature, and fix branches, plus PRs to long-lived branches, trigger CI.
Concurrency cancels superseded runs for the same ref. Jobs have bounded timeouts; test artifacts and
failure traces are retained for seven days. Duplicate push and PR runs can occur for an open PR. PR
credentials are disabled during checkout and release signing secrets are not used.

Native artifacts are named `branchharbor-windows-x64`, `branchharbor-macos-arm64`,
`branchharbor-macos-x64`, and `branchharbor-linux-x64`. Inspect actual Actions results before
merging; configured targets are not evidence that builds passed or packages ran on clean systems.

## Planned release sequence

1. Select scope and merge `develop` into `release` through a web PR.
2. Freeze candidate scope. Develop the next version on `develop` without merging the entire branch
   into the active candidate again.
3. Prepare a prerelease version and candidate tag, such as `v0.1.0-rc.1`, on a `release` commit;
   validate installation and runtime behavior.
4. Apply candidate fixes through `fix/*` PRs and repeat verification.
5. Prepare the final version and merge `release` into `main` through a web PR.
6. Tag the accepted `main` commit, for example `v0.1.0`. The future release workflow checks
   tag/source/version consistency and builds all required targets.
7. Collect complete assets in a draft release. Verify installation, signatures, checksums, upgrades,
   and notes before the maintainer publishes.
8. Synchronize `main` into `develop` and `release` through merge-commit PRs.

Document tag creation authority and the exact mechanism when implementing release automation. Keep
stable and prerelease update channels separate. Repair published versions with new tags, without
overwriting existing version tags.

## Planned distribution targets

| OS      | Architecture  | Initial packages        |
| ------- | ------------- | ----------------------- |
| Windows | x64           | NSIS `.exe`             |
| macOS   | ARM64 and x64 | `.dmg` per architecture |
| Linux   | x64           | `.AppImage` and `.deb`  |

Declare minimum OS versions and tested Linux distributions before release. Compilation is
insufficient to establish runtime compatibility: test clean installation, upgrades, Git discovery,
credentials, and WebView dependencies. OS code signing and updater signatures are separate
requirements. Other native ARM64 targets remain later work until build and runtime checks exist.

Update this guide with real workflow names, check names, version sources, signing requirements, and
the verified release checklist as they are implemented.
