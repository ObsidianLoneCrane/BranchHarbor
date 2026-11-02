# Branching and releases

## Current state

The repository has `main`, `develop`, and `release`. The disposable Windows
environment is merged into `develop`. Documentation and scaffold preparation are
on `feature/project-scaffold`.

CI, automated branch-policy checks, signing, and release automation are planned.
This document does not assert that GitHub rulesets or required checks are enabled.

## Branch responsibilities

| Branch | Purpose | Normal routing |
| --- | --- | --- |
| `main` | Stable baseline and published versions | Receives accepted releases and urgent production fixes |
| `develop` | Next-version integration | Receives features and development fixes |
| `release` | Stabilization of one pending version | Receives the selected snapshot and candidate fixes |
| `feature/*` | Focused feature or foundation task | From `develop`, PR into `develop` |
| `fix/*` | Focused repair | From and PR into the affected long-lived branch |

Use descriptive English names, optionally with an issue number:
`feature/12-github-account` or `fix/35-gitee-pagination`.

## Daily workflow

From a normal terminal with a clean worktree:

```powershell
git switch develop
git pull --ff-only origin develop
git switch -c feature/example-task
```

Implement the scope, update affected docs, run relevant checks, create focused
English commits, and push the feature branch. The maintainer creates, reviews,
and merges the PR on GitHub's website. Do not automate PR creation or merging
through GitHub CLI or APIs.

Prefer squash merge for short-lived branches. Use merge commits for
`develop -> release`, `release -> main`, and long-lived branch synchronization to
retain shared history. The maintainer performs all merges.

Update the local target after a web merge before starting another feature. A pushed
branch is not evidence of a merged PR. Retain all three long-lived branches.

## Fix routing

- Development defect: `fix/*` from `develop`, PR into `develop`.
- Candidate defect: `fix/*` from `release`, PR into `release`. Backport in a separate
  fix PR if development needs the repair before the release completes.
- Published defect: `fix/*` from `main`, PR into `main`, then a patch version.
  Synchronize the accepted fix into `develop` and `release` through web PRs.

For backports, inspect the destination and create a destination-based branch with
only the needed repair. Avoid importing unrelated development changes into fixes.

## Planned protections and checks

Configure long-lived branches to require PRs, successful available checks, and
resolved conversations; reject deletion and force pushes. Keep merge commits
available for synchronization. A solo maintainer can initially omit approval by
another person to avoid blocking their own PRs.

Only require check names after their workflows exist and have run. Planned checks
include formatting, lint, types, relevant frontend/Rust tests, branch routing, and
Windows/macOS/Linux builds. Ordinary PR execution should have read-only permissions
and no release signing credentials.

## Planned release sequence

1. Select scope and merge `develop` into `release` through a web PR.
2. Freeze candidate scope. Develop the next version on `develop` without merging
   the entire branch into the active candidate again.
3. Prepare a prerelease version and candidate tag, such as `v0.1.0-rc.1`, on a
   `release` commit; validate installation and runtime behavior.
4. Apply candidate fixes through `fix/*` PRs and repeat verification.
5. Prepare the final version and merge `release` into `main` through a web PR.
6. Tag the accepted `main` commit, for example `v0.1.0`. The future release workflow
   checks tag/source/version consistency and builds all required targets.
7. Collect complete assets in a draft release. Verify installation, signatures,
   checksums, upgrades, and notes before the maintainer publishes.
8. Synchronize `main` into `develop` and `release` through merge-commit PRs.

Document tag creation authority and the exact mechanism when implementing release
automation. Keep stable and prerelease update channels separate. Repair published
versions with new tags, without overwriting existing version tags.

## Planned distribution targets

| OS | Architecture | Initial packages |
| --- | --- | --- |
| Windows | x64 | NSIS `.exe` |
| macOS | ARM64 and x64 | `.dmg` per architecture |
| Linux | x64 | `.AppImage` and `.deb` |

Declare minimum OS versions and tested Linux distributions before release.
Compilation is insufficient to establish runtime compatibility: test clean
installation, upgrades, Git discovery, credentials, and WebView dependencies.
OS code signing and updater signatures are separate requirements. Other native
ARM64 targets remain later work until build and runtime checks exist.

Update this guide with real workflow names, check names, version sources, signing
requirements, and the verified release checklist as they are implemented.
