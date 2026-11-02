# Development environment

## Current support

The bootstrap supports Windows x64 with Windows PowerShell 5.1 or PowerShell 7. Native macOS and
Linux setup instructions will follow validated application builds. The Windows bootstrap does not
establish cross-platform application support.

Reuse existing Git, Visual Studio 2022 with the MSVC x64/x86 C++ desktop toolchain, Windows SDK, and
Microsoft Edge WebView2 Runtime. Scripts do not install or remove these components, edit persistent
PATH or PowerShell profiles, or install global npm packages. Docker and WSL are not required.

## Pinned tools

[tool-versions.json](../scripts/windows/tool-versions.json) is the source of truth for bootstrap
versions and installer checksums.

| Tool    | Version |
| ------- | ------- |
| Node.js | 24.22.2 |
| pnpm    | 10.34.9 |
| Rust    | 1.99.1  |
| rustup  | 1.29.2  |

Rustfmt and Clippy accompany the pinned Rust toolchain. Use the independent Node distribution rather
than an editor's internal runtime. Application dependencies are pinned in `package.json`,
`pnpm-lock.yaml`, and `src-tauri/Cargo.lock`. `.node-version`, `rust-toolchain.toml`, and project
checks keep the toolchain requirements aligned with bootstrap configuration.

## Setup and use

Run from the repository root:

```powershell
./scripts/windows/setup.ps1
./scripts/windows/dev.ps1
```

Setup verifies the pinned SHA-256 hashes of the official Node ZIP and rustup executable. Rustup
verifies downloaded components; npm verifies package integrity. Review version and checksum changes
together when upgrading tools.

The bootstrap copies the rustup binary into tool entry points instead of creating proxy links,
supporting restricted filesystems at the cost of additional disk space. Rustup self-update is
disabled; upgrades are explicit configuration changes.

The development script opens a child terminal with project settings. Type `exit` to return to the
parent terminal. A single command can also be run:

```powershell
./scripts/windows/dev.ps1 node --version
./scripts/windows/dev.ps1 pnpm --version
./scripts/windows/dev.ps1 cargo --version
```

Inside the project terminal, install and launch the application:

```powershell
pnpm install --frozen-lockfile
pnpm tauri dev
```

See the [application guide](application-scaffold.md) for browser preview, tests, and packaging.
Prefer `pnpm check:rust` over forwarding a raw Rust command containing `--` through the PowerShell
wrapper: PowerShell can consume that delimiter when binding script arguments.

If local script execution is blocked, use a process-only invocation:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./scripts/windows/setup.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./scripts/windows/dev.ps1
```

Do not change permanent execution policies for this project. Organization-managed policies may still
prevent execution.

## Storage and isolation

```text
.dev-env/                 # Ignored project-local environment
  node-v*-win-x64/        # Portable Node and npm
  tools/                 # Local pnpm package
  cargo/                 # Cargo tools and dependency caches
  rustup/                # Rust toolchains, Rustfmt, and Clippy
  target/                # Rust build output
  pnpm-store/            # pnpm dependency store
  npm-cache/             # npm download cache
  config/                # Local tool configuration
  cache/ data/           # XDG cache and data locations
  local-app-data/        # Child-process LOCALAPPDATA
  app-data/              # Child-process APPDATA
  playwright-browsers/   # Optional downloaded browser test binaries
  webview-profile/       # Disposable Windows development WebView2 profile
  tmp/ downloads/        # Temporary files and downloaded installers
```

Cargo/Rustup locations, npm/pnpm locations, XDG locations, APPDATA, LOCALAPPDATA, TEMP/TMP, and PATH
are set only for the script process and its children. The calling process environment is restored
when the script finishes.

Use the isolated terminal for project development. Do not configure Git credentials or start
unrelated applications there: redirected APPDATA can affect configuration discovery. BranchHarbor's
own account form uses a separate application storage policy described below.

This is a disposable toolchain, not an OS sandbox. Windows, Visual Studio, antivirus tools, crash
reporting, and dependency scripts may still create system logs or files elsewhere. Zero OS traces
are not guaranteed.

`node_modules/`, `dist/`, `test-results/`, and `playwright-report/` remain in the repository and are
ignored separately. Tauri uses `bundle.useLocalToolsDir` so NSIS tools are cached under
`.dev-env/target/.tauri/`. WebView2 development data and optional Playwright browser downloads also
use project-local directories. The development profile contains temporary appearance preferences;
installed application data and real credentials are separate concerns.

The Windows wrapper sets `BRANCHHARBOR_DEV_DATA_DIR` to the ignored repository directory
`.dev-data/`. Debug builds store non-secret account metadata in `.dev-data/accounts.sqlite3` and use
a separate OS credential service ending in `.development.accounts`. Release builds ignore this
override and use Tauri's normal application-local data directory and the production credential
service. Without the wrapper, debug builds use a `development` subdirectory of application-local
data. See [provider accounts](provider-accounts.md#storage-and-recovery) for details.

Launch packaged release builds from a normal desktop session; the development wrapper redirects
APPDATA and LOCALAPPDATA for all child processes, including any packaged application started there.

`.dev-data/` is application data, not a tool cache. Cleanup of `.dev-env/` preserves it and never
deletes OS credentials. Disconnect each development account in Settings before deliberately removing
`.dev-data/`; deleting only the SQLite file leaves credentials in the OS store. Removing tool caches
does not revoke provider tokens.

Windows test packaging uses NSIS; MSI-specific system features are not required. If a hosting
download times out, retry or populate the project cache with the exact official file after verifying
the bundler's expected checksum. Do not disable checksum verification or use untrusted mirrors.

Vite excludes the local toolchain, Rust tree, scratch files, and browser test output from its
development watcher. Keep new cache directories ignored by both Git and any affected file watchers.

## Verification

Initial checks covered tool execution, pnpm store location, Rust compilation and execution with the
existing MSVC installation, environment restoration, unchanged persistent PATH values, and cleanup
behavior.

The scaffold now has frontend checks, unit/component tests, browser tests, Rust checks, and a CI
matrix. Windows native startup, embedded assets, navigation, and the Rust runtime-info command have
been verified. Read the [validation record](application-scaffold.md) for platform limits.

## Cleanup

Close development terminals, servers, and build processes. From a normal terminal:

```powershell
./scripts/windows/clean.ps1 -WhatIf
./scripts/windows/clean.ps1
```

The second command prompts for confirmation. Cleanup only removes the current repository's
`.dev-env` after checking its ownership marker and rejecting a linked environment root. It rejects
cleanup while an executable inside that directory is running.

Source files, Git history, and existing system tools remain. `node_modules/` and `dist/` can be
removed separately. Real application data, credentials, and signing keys must not be treated as
build caches.

## References

- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
- [Rustup installation locations](https://rust-lang.github.io/rustup/installation/index.html#choosing-where-to-install)
- [Rustup environment variables](https://rust-lang.github.io/rustup/environment-variables.html)
