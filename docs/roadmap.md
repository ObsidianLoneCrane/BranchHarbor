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
3. Implemented: separate read-only PR/Issue lists, state filters, details, and paginated discussion
   comments on `feature/pr-issue-reader`. See the [reader guide](pr-issue-reader.md) for provider
   differences and outstanding live validation.
4. Implemented: a read-only Activity preview for GitHub calendar and UTC-day contribution counts,
   and a bounded Gitee public event sample. GitHub PAT checks remain pending and no supported Gitee
   full-year calendar API has been identified. See the [source guide](contribution-sources.md).

- Verify GitHub/Gitee authorization and private repository visibility.
- Browse files, revisions, branches, PRs, and issues.
- Validate GitHub contributions and investigate Gitee full-year data.
- Define coverage and labeling if official Gitee parity is unavailable.
- Validate OS credentials and Git transport on target platforms.

Acceptance: document capability differences and calendar limitations from real integration results
before promising complete cross-provider support.

## Stage 3: everyday local repository workflows - implemented

- Register imported, cloned, or newly initialized local working trees and add multiple named Git
  remotes.
- Inspect changes and staged or working-tree diffs, stage or unstage selected files, and commit.
- Create, switch, and safely delete local branches. Publish or track a branch with an explicit push.
- Fetch and perform fast-forward-only pulls. Show progress, outcomes, and recovery for Git failures.

Acceptance covers the change-to-push workflow using a disposable local remote and a second clone.
Live credential-helper and SSH identities depend on the user's Git setup and need native
verification on the target platforms. See the [local Git guide](local-git.md).

## Stage 4: personal overview and first usable version - implemented, acceptance pending

- Home shows independent GitHub calendar and Gitee public event cards, recent local repositories,
  and a UTC-day local commit summary.
- Activity shows GitHub daily counts, a UTC-day filter for the Gitee event sample, and local commits
  from registered working trees. Provider refreshes persist account-scoped data for offline reads.
- The existing PR and Issue reader provides lists, details, and paginated discussion comments.
- First-usable-version acceptance still requires authenticated native workflows on target platforms.
  The Gitee calendar remains unavailable. See the [contribution guide](contribution-sources.md).

## Frontend optimization - current priority

The workspace uses a common typography and spacing scale. Files, Changes, and History support
resizable desktop panes and a list-to-detail flow in narrow windows.

Home uses an inset repository list and compact activity summary. The main navigation runs across the
top to leave more width for repository content. Inter is bundled for offline rendering.

The first implementation introduces task tabs for local repositories, expandable local and remote
directory trees, a local commit graph, and a persisted language switch. Home surfaces recent work
and contribution summaries. Activity holds the full calendar and switches between platform data and
local history.

- Refine the visual hierarchy, typography, spacing, and light and dark themes across the existing
  desktop views. Check readability in both English and Simplified Chinese.
- Make nested repository workflows easy to follow with breadcrumbs, a clear current location, and
  predictable back navigation that restores the previous context.
- Add an expandable repository directory tree and a Git commit graph that uses parent relationships
  to show branch and merge history. Label branch or tag references where available.
- Add a persistent language preference for English and Simplified Chinese. Translate application UI
  strings and preserve repository names, paths, and commit messages as supplied.

Acceptance includes navigating a deeply nested directory and returning to its original context,
reading a history with diverging branches and a merge, and switching languages across the existing
views without losing the current task. Validate light and dark themes, keyboard navigation, and
readability at the supported window sizes.

## Stage 5: collaboration and distribution - deferred

- Add PR/issue creation, comments, state changes, and supported merge workflows.
- Add conflict assistance.
- Implement release builds, signing, update channels, and migration checks.
- Verify clean installation and upgrades for each declared distribution target.

Release infrastructure may arrive earlier through focused PRs. Public readiness still depends on
target validation and a complete, verified asset set.
