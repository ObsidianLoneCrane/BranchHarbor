# Repository instructions

## Language and documentation

- All project-authored content must be English: documentation, comments, UI strings, tests,
  generated project text, commit messages, and PR titles/bodies. Do not add Chinese prose. Preserve
  external and user-controlled data as data.
- Read README.md, CONTRIBUTING.md, and relevant docs before implementation.
- Update affected documentation in the same change as code. Keep requirements, architecture,
  commands, release instructions, and roadmap status synchronized.
- Distinguish completed functionality, planned work, and unresolved API support.

## Branch and PR workflow

- Long-lived branches are main, develop, and release.
- Features use feature/* based on develop. Repairs use fix/* based on the affected branch. Do not
  directly modify long-lived branches for normal work.
- Respect a feature branch explicitly selected by the maintainer.
- Make focused commits with English subjects. Never commit .dev-env, work, credentials, downloaded
  tools, or build output.
- The maintainer creates, reviews, and merges PRs on GitHub's website. Do not use GitHub CLI or APIs
  to create or merge PRs. Provide English titles/descriptions and the intended base and head
  branches instead.
- Do not merge or delete branches on the maintainer's behalf.

## Development and validation

- Reuse existing Git, Visual Studio, Windows SDK, and WebView2 installations.
- Use scripts/windows/dev.ps1 for tools from the disposable local environment. Keep new project
  tools and caches in project-owned, ignored directories.
- Do not install global packages or persistently modify PATH or shell profiles.
- Verify actual files and commands before invoking or documenting application checks; do not assume
  that planned tools or workflows already exist.
- Run checks relevant to the change and state actual results. For docs, check Markdown links,
  English-language consistency, and whitespace.
- Follow docs/branching-and-releases.md for synchronization and release planning.
