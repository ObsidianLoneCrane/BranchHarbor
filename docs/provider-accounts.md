# Provider accounts: next increment

Status: planned. The branch is prepared; account integration is not implemented yet.

## Goal

Deliver the first real-data workflow: connect a personal GitHub or Gitee account, retain its
authorization securely, and display repositories visible to that account.

The implementation branch is `feature/provider-accounts`, based on the application foundation merged
into `develop`. Keep this increment reviewable before expanding repository browsing.

## Scope

- Add account forms to Settings, initially using personal access tokens and explicit provider
  selection. Evaluate improved authorization flows separately.
- Verify credentials through the provider's current-user API and show the returned account identity.
- Store tokens in OS credential storage and non-secret account metadata in local application data.
  Do not persist tokens in frontend local storage, repository files, remote URLs, or logs.
- Model provider, host, and stable account ID separately; accommodate multiple accounts.
- Add Rust-side provider adapters and typed commands, keeping platform differences explicit.
- Implement an initial repository list with pagination, manual refresh, platform/account filters,
  and ownership/visibility information where available.
- Show loading, empty, unauthorized, permission-limited, offline, and rate-limited states
  distinctly.
- Allow removal of a local account connection and its stored credential without deleting remote
  repositories or silently changing Git author identity or transport configuration.

## Acceptance

1. A user can connect a supported account through Settings and see its verified identity.
2. Invalid or expired credentials produce an actionable error without exposing the token.
3. Restarting retains the account connection securely, or explains an unavailable credential store.
4. Repositories can be refreshed and paginated for the selected account; authorized private
   repositories are covered by explicit integration validation.
5. Disconnect removes the application's local connection and credential reference safely.
6. The UI, logs, docs, commits, and PR description use English.
7. Relevant tests, documentation, and the existing cross-platform checks accompany implementation.

## Validation approach

Use fixtures and mock HTTP responses for automated tests covering pagination, errors, account
isolation, and credential-store failures. Keep provider integration tests separate and record which
live account/permission paths were actually verified. CI must not require personal production
tokens.

Manual private-account validation requires the maintainer's own authorization through the finished
application flow. Do not ask for tokens in chat or commit them as fixtures. Validate native
credential-store behavior on each supported platform before claiming cross-platform persistence.

## Later increments

File trees, revision browsing, PR/issue details, local import, Git mutations, and real contribution
calendars are outside this first increment. Gitee calendar feasibility remains an early research
item, with limitations recorded before official website parity is promised.
