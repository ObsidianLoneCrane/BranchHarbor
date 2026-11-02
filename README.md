# BranchHarbor

A lightweight desktop workspace for GitHub, Gitee, and local Git repositories.

BranchHarbor is being designed to bring repository browsing, everyday Git operations,
pull requests, issues, and personal activity into a desktop interface. GitHub and Gitee
contribution calendars will be displayed separately.

## Project status

The repository currently provides a disposable Windows development toolchain and
project documentation. The application, provider integrations, CI, and release
workflows are not implemented yet. There are no application releases to install.

Windows, macOS, and Linux are intended application targets. The existing local
bootstrap scripts support Windows x64 only.

## Planned capabilities

- Connect personal GitHub and Gitee accounts, including authorized private repositories.
- Browse files, branches, commit history, pull requests, and issues.
- Import local repositories and associate them with multiple remotes.
- Create repositories, inspect changes, commit, fetch, pull, push, and manage branches.
- View dated activity and separate contribution calendars for each platform.
- Keep common tasks focused, with details loaded and displayed when needed.

Gitee contribution data access must be validated before promising parity with its
website. See the [product requirements](docs/product-requirements.md).

## Development

The planned stack is Tauri 2, Rust, Vue 3, TypeScript, Vite, the Git CLI, and SQLite.
Application dependencies will be selected and locked during scaffold implementation.

On Windows, reuse existing Git, Visual Studio C++ tools, Windows SDK, and WebView2:

```powershell
./scripts/windows/setup.ps1
./scripts/windows/dev.ps1
```

Read the [environment guide](docs/development-environment.md) first, including its
cleanup and isolation notes.

## Documentation

| Document | Purpose |
| --- | --- |
| [Product requirements](docs/product-requirements.md) | Scope, workflows, UI principles, and acceptance criteria |
| [Architecture](docs/architecture.md) | Proposed technology, boundaries, and data model |
| [Development environment](docs/development-environment.md) | Local tools, verification, and removal |
| [Branching and releases](docs/branching-and-releases.md) | Branches, manual PR workflow, and planned delivery checks |
| [Roadmap](docs/roadmap.md) | Completed work and implementation stages |
| [Contributing](CONTRIBUTING.md) | Language, commits, documentation, and validation |

## Contributing

All project-authored content uses English, including comments, documentation, UI
text, commit messages, and PR titles and descriptions. Update affected documentation
in the same change as implementation.

Feature work targets `develop`. The maintainer creates and handles PRs on GitHub's
website. Read [CONTRIBUTING.md](CONTRIBUTING.md) before making changes.

## License

BranchHarbor is licensed under the [MIT License](LICENSE).
