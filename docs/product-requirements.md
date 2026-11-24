# Product requirements

Status: agreed product direction. The application shell, PAT account connections, secure credential
storage, paginated repository discovery, read-only branch/directory/text browsing, and PR/Issue
lists, details, and discussion comments are implemented. Live private-account verification is still
pending. Other repository workflows remain planned; see the [account guide](provider-accounts.md)
and [roadmap](roadmap.md) for current delivery status.

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
| Browsing           | Browse files, selected revisions, branches, tags, and commit history        |
| Daily Git work     | Inspect changes and diffs, stage, commit, fetch, pull, and push             |
| Branches and tags  | Browse refs and delete one confirmed remote branch or tag at a time         |
| Collaboration      | Read PRs and issues and open their platform pages in the system browser     |
| Activity           | Show dated personal activity with platform and repository context           |

Private repository access depends on authorization. Multiple accounts per provider must fit the
model. Account sign-in, Git author name/email, and Git transport credentials are separate concepts
and require distinct state and configuration.

## Repository workflows

- Inspect modified files and diffs, stage selected files, commit, and push to an explicit remote and
  branch.
- Fetch, inspect synchronization status, and pull. Prefer fast-forward-only pull initially; explain
  divergence and provide a recovery path.
- Create a local repository, clone an existing remote, or push an existing local repository to a
  configured remote. Creating a hosted repository through a provider API remains planned.
- Associate additional remotes without assuming `origin` identifies a platform. Matching names alone
  do not establish compatible histories.
- Show branch creation start points and exact deletion targets. Surface uncommitted changes,
  unmerged commits, and server restrictions before relevant operations.
- Provide operation progress, results, and actionable failures. Refresh state after cancellation
  because changes may already have completed.

The desktop app implements local registration, working-tree and staged diffs, commits, named
remotes, synchronization, and basic branch operations. See the [local Git guide](local-git.md) for
supported transports and validation limits.

Remote-tracking status reflects the latest fetch, not a live server view. The file browser
identifies the local working tree or selected remote revision. A branch list and commit relationship
graph are separate features; a full interactive graph can follow basic history browsing.

## Activity and contributions

[Activity](contribution-sources.md) combines local commits and available public platform events.
Group them by local date and sort newest first. Filter by source, repository, and activity type. Use
labels for sources and stable emphasis colors for repository names. The platform event feeds cover
recent public activity. The same source guide records earlier contribution API research.

## Interface principles

Primary destinations are Home, Repositories, Activity, and Settings. Home shows frequently used
repositories, recent activity, and equivalent account summaries. The repository catalog combines
local and connected repositories, labels their sources, and opens add actions in a dialog.
Repository details use task-focused Changes, Files, History, Branches, Pull Requests, and Issues
views.

Show the current task's information first. Load large trees and lists incrementally. Keep advanced
options and logs expandable. Use consistent spacing, accessible controls, restrained colors, and
clear empty/loading/error/offline states. Plan light and dark themes. The first scaffold must label
unavailable features honestly. The UI offers English and Simplified Chinese and preserves repository
data as supplied.

## Non-functional requirements

- Minimize application size and idle work; establish measured budgets from a real prototype instead
  of advertising unverified memory or size numbers.
- Keep Git/network work off the UI thread and limit background concurrency.
- Refresh on demand, view entry, and foreground return. Avoid periodic idle polling.
- Cache metadata locally and show stale-data age when offline.
- Keep credentials out of source, frontend persistent storage, remote URLs, and logs.
- Treat paths, worktrees, and unpushed changes as device-local state. Automatic configuration or
  credential synchronization is outside initial scope.
- Validate installation and runtime behavior on declared OS/architecture targets.

## First usable version acceptance

A user can connect accounts, find repositories, import or clone local copies, associate remotes,
inspect files and changes, commit and synchronize work, manage basic branches, and read PRs/issues.
Home and Activity show recent events with source labels. Activity groups entries by local date.

See the [roadmap](roadmap.md) for implementation order and [architecture](architecture.md) for
boundaries.
