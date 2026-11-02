# Product requirements

Status: agreed product direction. The application shell, PAT account connections, secure credential
storage, and paginated repository discovery are implemented. Live private-account verification is
still pending. Other repository workflows remain planned; see the
[account guide](provider-accounts.md) and [roadmap](roadmap.md) for current delivery status.

## Purpose

BranchHarbor is a personal desktop workspace for GitHub, Gitee, and local Git repositories. It
should reduce repeated switching between hosting websites, terminals, and local folders for common
repository tasks.

Targets are Windows, macOS, and Linux. Mobile Git operations and hosted workspaces are outside the
initial scope. The project is MIT-licensed and all project-authored content uses English.

## Functional scope

| Area               | Intended behavior                                                           |
| ------------------ | --------------------------------------------------------------------------- |
| Accounts           | Connect personal GitHub/Gitee accounts and show authorization state         |
| Discovery          | List accessible repositories with ownership and platform filters            |
| Local repositories | Import, clone, and create repositories                                      |
| Remote association | Recognize existing remotes and associate multiple remotes with a local copy |
| Browsing           | Browse files, selected revisions, branches, and commit history              |
| Daily Git work     | Inspect changes and diffs, stage, commit, fetch, pull, and push             |
| Branches           | Create, switch, delete, publish, and track local/remote branches            |
| Collaboration      | Read PRs and issues first; add write workflows later                        |
| Activity           | Show dated personal activity with platform and repository context           |
| Contributions      | Display independent GitHub and Gitee contribution calendars                 |

Private repository access depends on authorization. Multiple accounts per provider must fit the
model. Account sign-in, Git author name/email, and Git transport credentials are separate concepts
and require distinct state and configuration.

## Repository workflows

- Inspect modified files and diffs, stage selected files, commit, and push to an explicit remote and
  branch.
- Fetch, inspect synchronization status, and pull. Prefer fast-forward-only pull initially; explain
  divergence and provide a recovery path.
- Create a local repository, create and clone a remote repository, or publish an existing local
  repository to a selected platform.
- Associate additional remotes without assuming `origin` identifies a platform. Matching names alone
  do not establish compatible histories.
- Show branch creation start points and exact deletion targets. Surface uncommitted changes,
  unmerged commits, and server restrictions before relevant operations.
- Provide operation progress, results, and actionable failures. Refresh state after cancellation
  because changes may already have completed.

Remote-tracking status reflects the latest fetch, not a live server view. The file browser
identifies the local working tree or selected remote revision. A branch list and commit relationship
graph are separate features; a full interactive graph can follow basic history browsing.

## Activity and contributions

Daily activity and platform contributions are separate datasets. A local commit can appear before
push; a push is not a contribution count. Provider rules and permissions determine contribution
visibility.

- Store and display GitHub/Gitee calendars independently.
- Prefer GitHub's official GraphQL contribution calendar where authorized.
- Validate a supported source for Gitee full-year data before promising website parity. This is an
  open feasibility requirement.
- Label application-derived Gitee statistics with their scope and limitations. Do not present
  estimated counts as an official calendar.
- Do not reconstruct full history from a bounded recent-events feed.
- Preserve provider calendar dates. Activity timestamps may use a user-selected timezone, with an
  explicit policy when implemented.
- Show refresh time; distinguish unavailable data from zero activity.

## Interface principles

Primary destinations are Home, Repositories, Activity, and Settings. Home should show separate
contribution cards, a brief daily summary, and recent repositories. Repository details use
task-focused Changes, Files, History, Branches, Pull Requests, and Issues views.

Show the current task's information first. Load large trees and lists incrementally. Keep advanced
options and logs expandable. Use consistent spacing, accessible controls, restrained colors, and
clear empty/loading/error/offline states. Plan light and dark themes. The first scaffold must label
unavailable features honestly.

## Non-functional requirements

- Minimize application size and idle work; establish measured budgets from a real prototype instead
  of advertising unverified memory or size numbers.
- Keep Git/network work off the UI thread and limit background concurrency.
- Cache metadata locally and show stale-data age when offline.
- Keep credentials out of source, frontend persistent storage, remote URLs, and logs.
- Treat paths, worktrees, and unpushed changes as device-local state. Automatic configuration or
  credential synchronization is outside initial scope.
- Validate installation and runtime behavior on declared OS/architecture targets.

## First usable version acceptance

A user can connect accounts, find repositories, import or clone local copies, associate remotes,
inspect files and changes, commit and synchronize work, manage basic branches, and read PRs/issues.
Home shows separate contribution information with source/coverage labels and dated activity.

Resolve the Gitee calendar feasibility requirement explicitly before claiming full delivery of the
contribution-display requirement. See the [roadmap](roadmap.md) for implementation order and
[architecture](architecture.md) for boundaries.
