# Contributing to BranchHarbor

Start with the [README](README.md), [requirements](docs/product-requirements.md),
and [roadmap](docs/roadmap.md) to distinguish existing functionality from plans.

## Language

Use English for all project-authored content: documentation, source comments,
application text, log and error messages, test names and fixtures, issue templates,
commit messages, and PR titles and descriptions. Do not introduce Chinese prose.
External service responses and user-controlled repository data are not authored
project text; preserve them as data rather than translating or rejecting them.

## Environment

Follow the [development environment guide](docs/development-environment.md).
Keep new tools and caches in the disposable project environment. Reuse existing
system prerequisites; avoid global installs and persistent PATH changes. Never
commit downloaded tools, caches, credentials, or build output.

## Branches and commits

- Start feature work from an updated `develop` using `feature/*`.
- Use `fix/*` for repairs, based on the branch that needs the fix.
- Keep changes focused and split independently reviewable work into commits.
- Use English Conventional Commit-style subjects, such as
  `feat(shell): add repository navigation` or `docs: define repository requirements`.
- Use merge commits for synchronization between long-lived branches.

See [branching and releases](docs/branching-and-releases.md) for routing details.

## Documentation accompanies implementation

Update affected documentation in the same branch and PR as the implementation.
Documentation is part of completion, not a separate follow-up task.

| Change | Documentation to review |
| --- | --- |
| Scope or user behavior | Product requirements and README |
| UI flow or text | Product requirements and relevant screenshots/examples |
| Architecture, storage, authentication | Architecture |
| Tools, scripts, developer commands | Development environment |
| Branches, CI, packaging, releases | Branching and releases |
| Stage progress or acceptance | Roadmap and README status |

Clearly distinguish implemented behavior, proposed decisions, and unresolved
questions. If no documentation update is needed, explain why in the PR. Remove
stale instructions when behavior changes and verify local links.

## Validation

Run checks relevant to the change and record actual results. Documentation-only
changes require local link, English-language, and `git diff --check` validation.
Do not infer runtime validation or CI coverage from a documentation review.

Application test commands and cross-platform CI do not exist yet. Document actual
invocations when adding them. For implementation, report tested operating systems
and unverified targets. Check Git mutations using disposable repositories rather
than a contributor's working projects.

## Pull requests

The maintainer creates, reviews, and merges PRs on GitHub's website. Prepare the
branch, validation results, and English PR text for that workflow. Do not create
or merge PRs through GitHub CLI, APIs, or agents unless the maintainer explicitly
changes this instruction.

Use the [PR template](.github/pull_request_template.md). Describe the problem and
final behavior, validation, documentation updates, and material limitations. Add
screenshots for UI changes when a UI exists. Normal feature PRs target `develop`.
