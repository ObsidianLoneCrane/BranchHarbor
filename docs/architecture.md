# Architecture

Status: the application shell, PAT account connections, SQLite account metadata, native credential
storage, paginated provider discovery, repository exploration, and read-only PR/Issue discussions
are implemented. Git workflows, durable repository caches, and contribution data remain planned.

## Implemented foundation

- Tauri 2 and Rust own the desktop window and `get_runtime_info` command.
- Vue 3, TypeScript, Vite, and Vue Router provide four primary views and a lazy repository detail
  route using hash history. The repository list is kept alive in-session to restore filters/pages.
- Shared CSS tokens provide light/dark themes; a Vue composable persists only appearance in local
  storage and follows system changes. No credentials are stored there.
- `@lucide/vue` provides tree-shaken icons. Tailwind/shadcn-vue and Pinia are deferred until shared
  component/data needs justify them; the current shell does not need those dependencies.
- `src/lib/runtime.ts` is the typed native boundary. Browser preview avoids native invocation and
  labels its runtime explicitly. Native errors have a retry path in Settings.
- `pnpm-lock.yaml` and `src-tauri/Cargo.lock` pin dependencies. The Tauri capability file exposes
  core window capabilities; no shell, filesystem, or provider plugins are enabled.

See [application scaffold](application-scaffold.md) for source layout and validation.

## Implemented account boundary

`src/lib/accounts.ts` defines account/repository commands and fixed safe frontend error messages.
`src/composables/accounts.ts` shares non-secret account metadata across views; tokens are transient
form/IPC inputs, never shared store state. The repository view owns its filters, pagination, retry
cooldown, and stale-request guards.

`src-tauri/src/accounts/` contains provider adapters, models, SQLite access, OS credentials, and
`AccountService`. Its four commands are `list_accounts`, `connect_account`, `disconnect_account`,
and `list_repositories`. A fifth command, `explore_repository`, handles typed read-only repository
operations through the same account/credential boundary. Blocking HTTP, vault, and SQLite work runs
on Tauri's blocking worker pool. A service mutex serializes account operations, including network
requests, to avoid credential replacement/removal races; another account's request can wait behind
an active request.

`read_collaboration` is the sixth command. `accounts/reader.rs` normalizes provider-specific issue
identifiers, states, and discussion endpoints through the same native transport and credential
boundary. `src/lib/reader.ts` validates response context; `src/composables/reader.ts` owns transient
list/detail/comment state, retry scope, and request generations. Hash-route query parameters retain
list filters and page context without bodies or secrets. Escaped plain-text descriptions/comments
have explicit byte limits, and failures in comments do not discard readable details. See the
[reader guide](pr-issue-reader.md).

reqwest uses fixed HTTPS provider endpoints, sensitive Authorization headers, explicit timeouts,
disabled redirects, bounded bodies, and normalized errors. SQL stores schema-versioned non-secret
identity metadata; keyring stores credentials in the native OS vault. SQL transactions and
credential restoration handle ordinary cross-store failures, but cannot make both stores atomic
across crashes. Missing/locked credentials remain visible and can be repaired by reconnecting. See
[account storage and recovery](provider-accounts.md#storage-and-recovery) for the detailed policy,
debug/release separation, cleanup, and remaining live validation.

## Remaining technology direction

The [repository explorer](repository-explorer.md) resolves branches to commit/tree SHAs and browses
nonrecursive trees and bounded blobs through `src-tauri/src/accounts/explorer.rs`. The frontend
command boundary validates response identity; `src/composables/explorer.ts` owns retry context and
generation guards. Source code is transient view state. Lazy syntax highlighting runs off the UI
thread with selected highlight.js grammars and a two-second fallback; workers are terminated after
use. Source is never executed or rendered as Markdown/HTML, and symbolic links/submodules are not
followed.

| Layer                 | Choice                           | Responsibility                                       |
| --------------------- | -------------------------------- | ---------------------------------------------------- |
| Desktop shell         | Tauri 2                          | Windows, lifecycle, system integration, distribution |
| UI                    | Vue 3, TypeScript, Vite          | Task-focused interface                               |
| Styling/components    | Tailwind CSS, shadcn-vue, Lucide | Shared visual language                               |
| UI state              | Pinia                            | View selection and transient interface state         |
| Local core            | Rust, Tokio                      | Commands, background work, process lifecycle         |
| Provider transport    | reqwest, serde                   | Requests and response mapping                        |
| Git execution         | System Git CLI                   | Repository inspection and mutations                  |
| Metadata              | SQLite, rusqlite                 | Indexes, provider caches, activity                   |
| Secrets               | OS credential storage            | Tokens and credential references                     |
| Contribution graphics | SVG or DOM grid                  | Independent platform calendars                       |

The table describes the broader direction, including deferred dependencies. Bootstrap tools are
pinned in [tool-versions.json](../scripts/windows/tool-versions.json).

## Boundaries

```text
Vue interface
    |
Typed application commands and progress events
    |
Rust application core
    +-- Git process service ------ local repositories
    +-- Provider adapters -------- GitHub / Gitee APIs
    +-- Metadata store ----------- SQLite
    +-- Credential service ------- OS storage / Git credential mechanisms
```

Keep modules in one desktop application initially. The local-first design does not require a hosted
backend. Evaluate any authorization flow requiring a service before adopting that dependency.

The UI requests explicit business operations. Rust owns process execution, provider requests,
credential access, and durable state. Expose only needed commands and filesystem capabilities.
Invoke Git using paths and argument arrays rather than shell-built strings; prefer stable
machine-readable output.

Serialize mutations for the same repository, accounting for shared Git state in worktrees. Progress
events include task and repository identities.

## Domain model

- Account: provider, host, stable account ID, credential reference.
- Remote repository: provider, host, stable repository ID, owner/name, URLs, permissions.
- Local repository: device-local path, Git directory, worktree context.
- Remote binding: local repository, remote name, fetch/push URLs, recognized provider repository.
- Branch tracking: local branch, configured upstream, last fetched state.
- Activity: source, actor, repository, event identity, timestamp.
- Contribution day: provider/account, provider date, count, source, coverage.
- Operation: target, lifecycle, progress, outcome, diagnostic context.

A local repository can bind to multiple platforms. A remote repository can have many local copies.
Recognize normalized HTTPS/SSH URLs while preserving the actual transport configuration and stable
provider identity across renames.

## Authentication and provider differences

API authorization, commit author identity, and transport credentials are independent. Initially
reuse Git credential helpers and SSH agents. API tokens belong in OS credential storage, with
references in metadata rather than token values in SQLite.

Adapters expose capabilities instead of assuming equal GitHub/Gitee parameters, permissions, PR
semantics, calendars, or OAuth flows. Personal access tokens can support initial validation; verify
each provider's desktop authorization flow before committing to broader sign-in behavior.

## Data and recovery

Separate cached provider metadata from authoritative local Git state. Preserve timestamps and
distinguish stale, unavailable, and empty results. Fetch directories and history incrementally with
explicit revision context.

Track pushes to different remotes independently; they are not an atomic operation. After
cancellation or failure, refresh state and report the actual result.

Application user data and credentials are separate from the disposable development environment.
Removing `.dev-env` is not an application data-deletion mechanism. Define migrations and
compatibility before persisting application state.

## Open validation items

- Gitee full-year contributions and parity with website statistics.
- Private repository permissions and collaboration write capabilities.
- Provider desktop authentication and token lifecycle.
- Git discovery and credential access outside a developer terminal.
- OS credential storage and native dependencies on supported targets.
- Installation, packaging, and measured resource use on clean systems.

Record material departures and rationale in the same change as implementation. Track delivery in the
[roadmap](roadmap.md).
