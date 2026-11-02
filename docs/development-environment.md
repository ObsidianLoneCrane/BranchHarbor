# Development environment

## Current support

The bootstrap supports Windows x64 with Windows PowerShell 5.1 or PowerShell 7.
Native macOS and Linux setup instructions will follow validated application builds.
The Windows bootstrap does not establish cross-platform application support.

Reuse existing Git, Visual Studio 2022 with the MSVC x64/x86 C++ desktop toolchain,
Windows SDK, and Microsoft Edge WebView2 Runtime. Scripts do not install or remove
these components, edit persistent PATH or PowerShell profiles, or install global
npm packages. Docker and WSL are not required.

## Pinned tools

[tool-versions.json](../scripts/windows/tool-versions.json) is the source of truth
for bootstrap versions and installer checksums.

| Tool | Version |
| --- | --- |
| Node.js | 24.22.2 |
| pnpm | 10.34.9 |
| Rust | 1.99.1 |
| rustup | 1.29.2 |

Rustfmt and Clippy accompany the pinned Rust toolchain. Use the independent Node
distribution rather than an editor's internal runtime. Application dependencies
and lockfiles will be introduced with the scaffold.

## Setup and use

Run from the repository root:

```powershell
./scripts/windows/setup.ps1
./scripts/windows/dev.ps1
```

Setup verifies the pinned SHA-256 hashes of the official Node ZIP and rustup
executable. Rustup verifies downloaded components; npm verifies package integrity.
Review version and checksum changes together when upgrading tools.

The bootstrap copies the rustup binary into tool entry points instead of creating
proxy links, supporting restricted filesystems at the cost of additional disk
space. Rustup self-update is disabled; upgrades are explicit configuration changes.

The development script opens a child terminal with project settings. Type
`exit` to return to the parent terminal. A single command can also be run:

```powershell
./scripts/windows/dev.ps1 node --version
./scripts/windows/dev.ps1 pnpm --version
./scripts/windows/dev.ps1 cargo --version
```

If local script execution is blocked, use a process-only invocation:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./scripts/windows/setup.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./scripts/windows/dev.ps1
```

Do not change permanent execution policies for this project. Organization-managed
policies may still prevent execution.

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
  tmp/ downloads/        # Temporary files and downloaded installers
```

Cargo/Rustup locations, npm/pnpm locations, XDG locations, APPDATA, LOCALAPPDATA,
TEMP/TMP, and PATH are set only for the script process and its children. The
calling process environment is restored when the script finishes.

Use the isolated terminal for project development. Do not configure Git
credentials, sign in to hosting services, or start unrelated applications there:
redirected APPDATA can affect configuration discovery. Application credentials
and real user data will have a separate storage policy.

This is a disposable toolchain, not an OS sandbox. Windows, Visual Studio,
antivirus tools, crash reporting, and dependency scripts may still create system
logs or files elsewhere. Zero OS traces are not guaranteed.

Future `node_modules/` and `dist/` directories remain in the repository and are
ignored separately. Windows packaging is planned to start with NSIS; MSI-specific
system features are not required by the current environment.

## Verification

Initial checks covered tool execution, pnpm store location, Rust compilation and
execution with the existing MSVC installation, environment restoration, unchanged
persistent PATH values, and cleanup behavior.

The application package, test suite, and CI do not exist yet. Do not advertise
`pnpm tauri dev` or `pnpm test` as available until implementation adds and
verifies them. Update this guide with real commands in that change.

## Cleanup

Close development terminals, servers, and build processes. From a normal terminal:

```powershell
./scripts/windows/clean.ps1 -WhatIf
./scripts/windows/clean.ps1
```

The second command prompts for confirmation. Cleanup only removes the current
repository's `.dev-env` after checking its ownership marker and rejecting a
linked environment root. It rejects cleanup while an executable inside that
directory is running.

Source files, Git history, and existing system tools remain. Future
`node_modules/` and `dist/` can be removed separately. Real application data,
credentials, and signing keys must not be treated as build caches.

## References

- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
- [Rustup installation locations](https://rust-lang.github.io/rustup/installation/index.html#choosing-where-to-install)
- [Rustup environment variables](https://rust-lang.github.io/rustup/environment-variables.html)
