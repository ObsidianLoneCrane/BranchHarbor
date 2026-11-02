# Architecture

Status: proposed application design. Only development-toolchain scripts and project
documentation exist today.

## Planned technology

| Layer | Choice | Responsibility |
| --- | --- | --- |
| Desktop shell | Tauri 2 | Windows, lifecycle, system integration, distribution |
| UI | Vue 3, TypeScript, Vite | Task-focused interface |
| Styling/components | Tailwind CSS, shadcn-vue, Lucide | Shared visual language |
| UI state | Pinia | View selection and transient interface state |
| Local core | Rust, Tokio | Commands, background work, process lifecycle |
| Provider transport | reqwest, serde | Requests and response mapping |
| Git execution | System Git CLI | Repository inspection and mutations |
| Metadata | SQLite, rusqlite | Indexes, provider caches, activity |
| Secrets | OS credential storage | Tokens and credential references |
| Contribution graphics | SVG or DOM grid | Independent platform calendars |

These dependencies are not installed application components yet. Select exact
versions and commit lockfiles with the scaffold. Bootstrap tool versions are
separately pinned in [tool-versions.json](../scripts/windows/tool-versions.json).

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

Keep modules in one desktop application initially. The local-first design does not
require a hosted backend. Evaluate any authorization flow requiring a service
before adopting that dependency.

The UI requests explicit business operations. Rust owns process execution, provider
requests, credential access, and durable state. Expose only needed commands and
filesystem capabilities. Invoke Git using paths and argument arrays rather than
shell-built strings; prefer stable machine-readable output.

Serialize mutations for the same repository, accounting for shared Git state in
worktrees. Progress events include task and repository identities.

## Domain model

- Account: provider, host, stable account ID, credential reference.
- Remote repository: provider, host, stable repository ID, owner/name, URLs, permissions.
- Local repository: device-local path, Git directory, worktree context.
- Remote binding: local repository, remote name, fetch/push URLs, recognized provider repository.
- Branch tracking: local branch, configured upstream, last fetched state.
- Activity: source, actor, repository, event identity, timestamp.
- Contribution day: provider/account, provider date, count, source, coverage.
- Operation: target, lifecycle, progress, outcome, diagnostic context.

A local repository can bind to multiple platforms. A remote repository can have
many local copies. Recognize normalized HTTPS/SSH URLs while preserving the actual
transport configuration and stable provider identity across renames.

## Authentication and provider differences

API authorization, commit author identity, and transport credentials are independent.
Initially reuse Git credential helpers and SSH agents. API tokens belong in OS
credential storage, with references in metadata rather than token values in SQLite.

Adapters expose capabilities instead of assuming equal GitHub/Gitee parameters,
permissions, PR semantics, calendars, or OAuth flows. Personal access tokens can
support initial validation; verify each provider's desktop authorization flow before
committing to broader sign-in behavior.

## Data and recovery

Separate cached provider metadata from authoritative local Git state. Preserve
timestamps and distinguish stale, unavailable, and empty results. Fetch directories
and history incrementally with explicit revision context.

Track pushes to different remotes independently; they are not an atomic operation.
After cancellation or failure, refresh state and report the actual result.

Application user data and credentials are separate from the disposable development
environment. Removing `.dev-env` is not an application data-deletion mechanism.
Define migrations and compatibility before persisting application state.

## Open validation items

- Gitee full-year contributions and parity with website statistics.
- Private repository permissions and collaboration write capabilities.
- Provider desktop authentication and token lifecycle.
- Git discovery and credential access outside a developer terminal.
- OS credential storage and native dependencies on supported targets.
- Installation, packaging, and measured resource use on clean systems.

Record material departures and rationale in the same change as implementation.
Track delivery in the [roadmap](roadmap.md).
