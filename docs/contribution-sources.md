# Contribution sources

Open **Activity**, select a connected account, and choose **Load source**. This read-only preview
inspects one source at a time. The Home contribution charts, detailed activity timeline, caching,
and offline behavior remain Stage 4 work.

## GitHub

- Leave **UTC day** empty to query GitHub's official GraphQL calendar. GitHub defaults to a one-year
  range ending at the current time. The preview shows its reported range and total. The desktop
  command also returns the weeks, dates, counts, and contribution levels for the future calendar.
  Provider dates are preserved as supplied, with no zero filling.
- Set **UTC day** to request the platform's commit, opened pull request, and opened issue
  contribution counts for that day. The request uses inclusive UTC bounds from midnight through the
  last second of the day. These are contribution counts, with no itemized activity, local commits,
  push-event counts, or merge counts.
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

The preview requests the first page of up to 20 events from
`GET /api/v5/users/{username}/events/public`, without sending the saved token. It shows event
timestamps with their original offsets, event type when supplied, and repository name when
available. The source has unknown coverage dates. An empty response means that the endpoint returned
no public events. The app exposes the Gitee calendar as unavailable and does not derive daily or
annual contribution totals from this feed.

A live anonymous request to the official public endpoint returned HTTP 200 for a public user. The
sample included older events, a string event ID, a null event type, and timestamps with a `+08:00`
offset. This verifies the sampled public endpoint shape. Authenticated or private Gitee activity and
website calendar parity remain unverified.

## Validation

Automated fixtures exercise UTC range construction, viewer identity binding, provider date and
zero-count preservation, GraphQL error handling, and credential-free public event requests. Browser
tests exercise the account selector and the source-specific states.

For live acceptance, use a personal account connected through **Settings**. For GitHub, compare the
preview range and total with the same account and period on GitHub, then query a known UTC day.
Check public and authorized private cases independently, including an account with private
contribution counts disabled. For Gitee, check the available sample and the unavailable-calendar
message. Keep tokens and private repository data out of screenshots and reports. Real GitHub PAT
results and private contribution coverage remain pending.

## Sources

- [GitHub GraphQL User and ContributionsCollection](https://docs.github.com/en/graphql/reference/users)
- [GitHub GraphQL authentication and requests](https://docs.github.com/en/graphql/guides/forming-calls-with-graphql)
- [GitHub profile contribution rules](https://docs.github.com/en/account-and-profile/reference/profile-contributions-reference)
- [Gitee Open API specification](https://gitee.com/api/v5/swagger_doc.json)
