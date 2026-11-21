# Local Git

Open **Repositories > Local repositories** in the desktop app. The local list is independent of
connected provider accounts and uses the Git installation available to the desktop process.

- **Import repository** opens the operating system's folder picker. Select a working tree or a
  folder within it to register its root. Canceling leaves the list as it was. Importing the same
  canonical path reopens the existing entry.
- **New repository** initializes an empty or new folder with the initial branch `main`. For new
  folders, the parent must exist.
- **Clone repository** clones an existing remote into an empty or new folder and registers the
  result. Supported destinations use absolute paths.
- **Remove from list** removes the local registration. The Git repository and working tree stay in
  their folder. If a repository moves, import its new location and remove the old registration.

## Changes and branches

The repository workspace reads the current branch, HEAD, upstream, and Git's status. Upstream counts
reflect locally stored refs as of the latest applicable fetch. Open a file's working-tree or staged
diff, stage or unstage the file, and commit the staged changes. Diffs appear as inert text and have
an 8 MiB preview limit. Repository paths and status entries must be valid UTF-8. A rename is shown
as a deletion and an addition. For a conflicted working tree, resolve the files in an editor and
stage the resolutions, or use Git to finish or abort the operation.

The commit form shows Git's current author name and email. Configure them in Git if they are
missing, then refresh the workspace. Git uses the repository's commit signing and hook settings.
Open and operate on repositories you trust.

Create a branch from HEAD or an existing local branch, switch branches, or delete a local branch
with Git's merged-branch checks. Git protects branches in use by other worktrees. Use an explicit
push to publish a branch and select **Set upstream after push** to record its tracking target.

## Remotes and credentials

Add one or more named remotes using HTTPS, SSH (including `user@host:path`), or an absolute
filesystem repository path. The workspace displays the configured effective fetch and push targets
after Git URL rewriting. Targets with embedded HTTPS credentials, query strings, or multiple
distinct URLs in one direction are unavailable for synchronization. Use Git credential helpers or
SSH agents for remote authentication and configure them from your normal terminal. Provider PATs
saved in Settings are used for provider APIs. Git chooses its transport identity from its own
configuration. The app can show the selected remote and commit author while the helper or SSH
configuration determines the server-side login.

Select a named remote to fetch. For pull or push, also enter the remote branch. Pull uses
fast-forward only. If histories diverge, resolve them in Git and refresh. A push sends the current
local branch to the named remote branch without forcing it. The workspace refreshes after each
operation, including failures. Git commands time out after three minutes. After a timeout, refresh
and check both the local and remote state before retrying.

## Storage and validation

The app stores canonical working-tree paths in `local-repositories.sqlite3` under its application
data directory (`.dev-data/` with the Windows development wrapper). Each operation verifies the
registered root still exists. Git work runs on a blocking worker and is serialized within the app.
For commands that contact a remote, Git keeps responsibility for repository configuration, signing,
and credential helpers. No provider token is passed to the Git subprocess.

Run `pnpm check:rust` to exercise disposable Git repositories and a local bare remote, including
creation, import, diff, staging, commit, branches, push, clone, fetch, fast-forward pull, and
divergence recovery. Use `pnpm test:e2e` after the frontend build for the desktop IPC fixture and
browser interactions.

On Windows x64 with Git for Windows 2.41.0 and VS 2026, the frontend build, 50 frontend tests, 39
Rust tests, and 26 Edge browser tests passed. The manual credential-store test was skipped by the
standard Rust command. The Git workflow used a local bare remote, and the browser tests used IPC
fixtures. Live private GitHub/Gitee transports and desktop runtime checks require separate
validation.
