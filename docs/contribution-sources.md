# Contribution sources

In the desktop app, open **Home** and refresh the desired platform summary. Each card has an account
selector, source label, and refresh time. Use **Open activity** to view the selected account's
activity for today.

**Activity** defaults to the current UTC date. Use the date picker to review an earlier day. The
selected date applies to the platform and local Git views. A link to a valid earlier day opens that
day directly.

## GitHub

- Select **Show contribution calendar** to open GitHub's official GraphQL calendar. It defaults to a
  one-year range ending at the current time and shows its reported dates, total, and contribution
  levels. Choose a calendar day and select **View activity** to open its daily counts.
- Use **UTC date** to view the platform's commit, opened pull request, and opened issue contribution
  counts for that day. The request uses inclusive UTC bounds from midnight through the last second
  of the day. These are contribution counts, with no itemized activity, local commits, push-event
  counts, or merge counts.
- GitHub reports restricted contributions separately when the profile exposes them. Coverage depends
  on the token, repository permissions, organization policies, and account settings. GitHub
  documents the optional classic PAT scope `read:user` for private and internal contributions. Test
  the intended token type and repository access in the desktop app before relying on private
  coverage.

The desktop command uses the selected account's OS-stored token with a fixed read-only query at
`https://api.github.com/graphql`. It compares the viewer's numeric database ID against the stored
account ID and fails if the ID is missing or differs. HTTP-success GraphQL errors, including partial
responses, are handled as failures. Provider error text stays in the backend.

## Gitee

Gitee's published Open API specification (version 5.4.93 inspected) documents a public user event
feed, a user event feed, and organization-scoped events. The public endpoint accepts an event cursor
and a limit. No endpoint for the profile contribution calendar or a date-bounded annual contribution
history was identified in that specification.

The app requests the first page of up to 20 events from
`GET /api/v5/users/{username}/events/public`, without sending the saved token. It shows event
timestamps with their original offsets, event type when supplied, and repository name when
available. The source has unknown coverage dates. An empty response means that the endpoint returned
no public events. Date filtering matches the UTC day of each event timestamp and keeps the supplied
offset visible. The app exposes the Gitee calendar as unavailable and omits daily and annual
contribution totals for this feed.

A live anonymous request to the official public endpoint returned HTTP 200 for a public user. The
sample included older events, a string event ID, a null event type, and timestamps with a `+08:00`
offset. This verifies the sampled public endpoint shape. Authenticated or private Gitee activity and
website calendar parity remain unverified.

## Refresh and offline behavior

Home and Activity show the last successful provider response from SQLite when available. Activity
loads the selected source automatically when it has no cached response. Choose **Refresh source** to
request new Activity data. If the provider cannot be reached, the app keeps the saved result and
displays its refresh time with a **Cached data** label. A first request with no saved data shows the
error without a count. The app stores a calendar or public sample and up to 30 GitHub day responses
per connected account. Updating credentials or disconnecting removes that account's cache. Tokens
stay in the OS credential store.

## Local activity

Home lists up to five recently opened or registered working trees and the first three local commits
for today. Activity shows up to 20 commits reachable from HEAD in the 12 most recent working trees
for the selected UTC date. Results use each commit's committer timestamp and show its author,
subject, and repository. Missing working trees and truncated results have separate notices. Local
history is read without contacting a remote and remains a separate source from provider contribution
counts.

## Validation

Automated fixtures exercise UTC range construction, viewer identity binding, provider date and
zero-count preservation, GraphQL error handling, and credential-free public event requests. Browser
tests exercise account and date selection, the GitHub calendar, Gitee timestamp offsets, local
activity, and cached results after restart or a failed refresh.

On Windows x64, 50 frontend tests, 41 Rust tests, and 26 Edge end-to-end tests passed. The standard
Rust suite skips the opt-in Windows credential-store test. The Windows preview executable built
successfully. This change was verified through Git CLI tests and browser IPC fixtures. Native
desktop interaction with authenticated providers and cross-platform runtime checks remain pending.

For live acceptance, use a personal account connected through **Settings**. For GitHub, compare the
calendar range and total with the same account and period on GitHub, then query a known UTC day.
Check public and authorized private cases independently, including an account with private
contribution counts disabled. For Gitee, check the available sample and the unavailable-calendar
message. Keep tokens and private repository data out of screenshots and reports. Real GitHub PAT
results and private contribution coverage remain pending.

## Sources

- [GitHub GraphQL User and ContributionsCollection](https://docs.github.com/en/graphql/reference/users)
- [GitHub GraphQL authentication and requests](https://docs.github.com/en/graphql/guides/forming-calls-with-graphql)
- [GitHub profile contribution rules](https://docs.github.com/en/account-and-profile/reference/profile-contributions-reference)
- [Gitee Open API specification](https://gitee.com/api/v5/swagger_doc.json)
