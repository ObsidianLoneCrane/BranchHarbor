# Roadmap

Stages describe delivery order, not committed dates. Update acceptance and status in the same PR as
implementation and keep the [README](../README.md) consistent.

## Stage 0: disposable development environment - completed

- Project-local Windows x64 Node, pnpm, and Rust bootstrap.
- Process-scoped terminal and single-command entry point.
- Cleanup preview, ownership checks, and ignored caches.
- Verification of tool execution, Rust compilation, and environment restoration.

Completion applies to the development environment, not a runnable application.

## Stage 1: documentation and application foundation - implemented

Documentation preparation:

- Establish English-only project content and PR descriptions.
- Define scope, architecture, branch routing, and release expectations.
- Require documentation updates alongside implementation.

Application foundation:

- Tauri 2 + Vue 3 + TypeScript + Vite scaffold with dependency lockfiles.
- Four English views, hash routing, honest empty states, and persisted appearance.
- Formatting, lint, types, unit/component tests, and browser behavior checks.
- Windows/macOS/Linux CI build matrix and documented local commands.
- Windows native startup, runtime-info IPC, and unsigned NSIS packaging verified locally.

The minimal application launches on the tested Windows host and reproducible checks exist. Read the
[validation record](application-scaffold.md) and actual Actions results for other targets. Clean
installation, signed distribution, and macOS/Linux runtime validation remain release work.

## Stage 2: provider feasibility and read-only discovery - in progress

Deliver this stage through focused increments:

1. Implemented: PAT account connection, OS credential storage, SQLite metadata, and paginated
   repository discovery on `feature/provider-accounts`. Automated mocks and Windows native checks
   pass; live private-account authorization and macOS/Linux vault runtime checks remain pending. See
   the [implementation and validation record](provider-accounts.md).
2. Implemented: repository details, paginated branches, immutable revision selection, lazy directory
   browsing, and bounded text previews on `feature/repository-explorer`. See the
   [explorer guide](repository-explorer.md) for validation limits and maintainer acceptance checks.
3. Read-only PR and issue lists and details in a subsequent feature.
4. Contribution-source validation, including the unresolved Gitee calendar coverage requirement.
   Investigate feasibility early rather than waiting for final dashboard implementation.

- Verify GitHub/Gitee authorization and private repository visibility.
- Browse files, revisions, branches, PRs, and issues.
- Validate GitHub contributions and investigate Gitee full-year data.
- Define coverage and labeling if official Gitee parity is unavailable.
- Validate OS credentials and Git transport on target platforms.

Acceptance: document capability differences and calendar limitations from real integration results
before promising complete cross-provider support.

## Stage 3: everyday local repository workflows - planned

- Import, clone, create, and associate repositories with multiple remotes.
- Implement status, diff, staging, commit, fetch, pull, and push.
- Add basic branch operations, progress, and recovery.
- Test Git mutations using disposable repositories.

Acceptance: complete a change-to-push workflow with identifiable author, account, remote, and branch
targets.

## Stage 4: personal overview and first usable version - planned

- Display separate platform contribution information with source labels.
- Add dated activity, caching, refresh states, and offline behavior.
- Complete task-focused UI and basic PR/issue reading workflows.
- Verify first-usable-version acceptance and unresolved feasibility limits.

## Stage 5: collaboration and distribution - planned

- Add PR/issue creation, comments, state changes, and supported merge workflows.
- Improve commit visualization and conflict assistance.
- Implement release builds, signing, update channels, and migration checks.
- Verify clean installation and upgrades for each declared distribution target.

Release infrastructure may arrive earlier through focused PRs. Public readiness still depends on
target validation and a complete, verified asset set.
