# Activity and contribution sources

**Home** shows up to five recent activities across sources. **Activity** groups local commits and
public platform events by the device's local date. Days and their entries appear newest first.
Source badges identify Local, GitHub, and Gitee. Repository names use stable emphasis colors. Use
the source, repository, and activity type filters to narrow the timeline.

## Timeline coverage

| Source | Coverage                                                                                                        |
| ------ | --------------------------------------------------------------------------------------------------------------- |
| Local  | Commits reachable from HEAD in registered working trees, up to 30 initially and 200 with **Load more activity** |
| GitHub | Public events for connected accounts, up to 30 per page and ten pages per account                               |
| Gitee  | Up to 20 public events per connected account from `GET /api/v5/users/{username}/events/public`                  |

Local entries use committer timestamps. Their Git reads run without connecting to a remote. Platform
events follow the coverage and retention of each provider's endpoint. The Gitee request does not
send the saved token. Results may include older timestamps, unknown event types, or events without
repository names.

## Refresh and offline behavior

Home and Activity share an in-memory response cache. The latest downloaded Gitee sample is saved in
SQLite and can appear when a refresh fails. GitHub event responses are kept in memory for the
session. Credential changes invalidate account data. Settings can clear the downloaded cache.

## Contribution API research

The native GitHub GraphQL adapter supports calendar and daily counts for the authenticated user. It
validates the response's viewer ID against the saved account. GitHub contribution coverage depends
on repository permissions, organization policy, token type, and profile settings. Gitee's published
API specification (version 5.4.93 inspected) exposes public user events, but no documented endpoint
for the profile contribution calendar or annual date-bounded counts was identified. A live public
sample confirmed the event endpoint shape. Private activity and Gitee calendar parity are
unverified. Calendar and daily counts are outside the current Activity UI.

## Sources

- [GitHub GraphQL User and ContributionsCollection](https://docs.github.com/en/graphql/reference/users)
- [GitHub profile contribution rules](https://docs.github.com/en/account-and-profile/reference/profile-contributions-reference)
- [Gitee Open API specification](https://gitee.com/api/v5/swagger_doc.json)
