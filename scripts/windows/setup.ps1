[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Environment.ps1')

if ($env:OS -ne 'Windows_NT' -or -not [Environment]::Is64BitOperatingSystem -or $env:PROCESSOR_ARCHITECTURE -eq 'ARM64') {
    throw 'This bootstrap supports Windows x64 only. Other platforms use their own native prerequisites.'
}
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
if (-not (Test-Path -LiteralPath $vswhere)) { throw 'Visual Studio Installer/vswhere was not found.' }
$visualStudio = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $visualStudio) { throw 'The existing Visual Studio installation needs the C++ desktop toolchain.' }

$root = Get-LocalEnvironmentRoot
$marker = Join-Path $root '.branchharbor-environment'
if ((Test-Path -LiteralPath $root) -and -not (Test-Path -LiteralPath $marker)) {
    throw 'An unrecognized .dev-env directory already exists. Refusing to overwrite it.'
}
New-Item -ItemType Directory -Path $root -Force | Out-Null
Set-Content -LiteralPath $marker -Value 'BranchHarbor disposable development environment v1' -Encoding ascii
foreach ($directory in @('downloads','tmp','config','app-data','local-app-data')) {
    New-Item -ItemType Directory -Path (Join-Path $root $directory) -Force | Out-Null
}
$versions = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'tool-versions.json') -Raw | ConvertFrom-Json
$saved = Enter-ProjectEnvironment
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    function Get-VerifiedDownload([string]$Url, [string]$Destination, [string]$Sha256) {
        if (-not (Test-Path -LiteralPath $Destination)) {
            Write-Host "Downloading $Url"
            Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $Destination
        }
        if ((Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash -ne $Sha256) {
            throw "Checksum mismatch: $Destination. Remove that download and retry."
        }
    }

    $nodeArchive = Join-Path $root "downloads/node-v$($versions.node)-win-x64.zip"
    $nodeRoot = Join-Path $root "node-v$($versions.node)-win-x64"
    Get-VerifiedDownload "https://nodejs.org/dist/v$($versions.node)/node-v$($versions.node)-win-x64.zip" $nodeArchive $versions.nodeSha256
    if (-not (Test-Path -LiteralPath (Join-Path $nodeRoot 'node.exe'))) {
        Expand-Archive -LiteralPath $nodeArchive -DestinationPath $root -Force
    }
    $npm = Join-Path $nodeRoot 'npm.cmd'
    $pnpmManifest = Join-Path $root 'tools/node_modules/pnpm/package.json'
    $pnpmInstalled = $false
    if (Test-Path -LiteralPath $pnpmManifest) {
        $pnpmInstalled = (Get-Content -LiteralPath $pnpmManifest -Raw | ConvertFrom-Json).version -eq $versions.pnpm
    }
    if (-not $pnpmInstalled) {
        & $npm install --userconfig (Join-Path $root 'config/npm-bootstraprc') --prefix (Join-Path $root 'tools') --ignore-scripts --no-audit --no-fund "pnpm@$($versions.pnpm)"
        Assert-NativeSuccess 'Local pnpm installation'
    }

    $rustup = Join-Path $root 'downloads/rustup-init.exe'
    Get-VerifiedDownload "https://static.rust-lang.org/rustup/archive/$($versions.rustup)/x86_64-pc-windows-msvc/rustup-init.exe" $rustup $versions.rustupSha256
    # rustup-init and rustup are the same binary; dispatch uses the executable name.
    # File copies also work on filesystems/sandboxes that deny rustup's proxy links.
    $cargoBin = Join-Path $env:CARGO_HOME 'bin'
    New-Item -ItemType Directory -Path $cargoBin -Force | Out-Null
    foreach ($proxy in @('rustup','cargo','rustc','rustdoc','rustfmt','cargo-fmt','cargo-clippy','clippy-driver')) {
        $proxyPath = Join-Path $cargoBin "$proxy.exe"
        if (-not (Test-Path -LiteralPath $proxyPath)) { Copy-Item -LiteralPath $rustup -Destination $proxyPath }
    }
    $rustupCommand = Join-Path $env:CARGO_HOME 'bin/rustup.exe'
    & $rustupCommand set default-host x86_64-pc-windows-msvc
    Assert-NativeSuccess 'Local Rust host configuration'
    & $rustupCommand set auto-self-update disable
    Assert-NativeSuccess 'Pinned rustup configuration'
    & $rustupCommand toolchain install $versions.rust --profile minimal --component rustfmt --component clippy --no-self-update
    Assert-NativeSuccess 'Rust toolchain installation'
    & $rustupCommand default $versions.rust
    Assert-NativeSuccess 'Project-local Rust default'

    & (Join-Path $nodeRoot 'node.exe') --version
    & (Join-Path $root 'tools/node_modules/.bin/pnpm.cmd') --version
    Assert-NativeSuccess 'pnpm verification'
    & (Join-Path $env:CARGO_HOME 'bin/rustc.exe') --version
    Assert-NativeSuccess 'rustc verification'
    & (Join-Path $env:CARGO_HOME 'bin/cargo.exe') --version
    Assert-NativeSuccess 'cargo verification'
    Write-Host "Ready. Existing Visual Studio: $visualStudio"
    Write-Host 'Open an isolated shell: ./scripts/windows/dev.ps1'
} finally {
    Restore-ProjectEnvironment $saved
}
