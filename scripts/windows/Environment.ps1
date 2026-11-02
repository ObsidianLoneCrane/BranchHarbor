# Shared by setup.ps1 and dev.ps1. All changes apply to this process only.
function Get-ProjectRoot {
    [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
}

function Get-LocalEnvironmentRoot {
    $projectRoot = Get-ProjectRoot
    $localRoot = Join-Path $projectRoot '.dev-env'
    if (Test-Path -LiteralPath $localRoot) {
        $item = Get-Item -LiteralPath $localRoot -Force
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw 'Refusing a .dev-env directory that is a link or junction.'
        }
    }
    $localRoot
}

function Enter-ProjectEnvironment {
    $root = Get-LocalEnvironmentRoot
    $versions = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'tool-versions.json') -Raw | ConvertFrom-Json
    $values = @{
        CARGO_HOME = (Join-Path $root 'cargo')
        RUSTUP_HOME = (Join-Path $root 'rustup')
        CARGO_TARGET_DIR = (Join-Path $root 'target')
        PNPM_HOME = (Join-Path $root 'pnpm-home')
        COREPACK_HOME = (Join-Path $root 'corepack')
        PLAYWRIGHT_BROWSERS_PATH = (Join-Path $root 'playwright-browsers')
        WEBVIEW2_USER_DATA_FOLDER = (Join-Path $root 'webview-profile')
        BRANCHHARBOR_DEV_DATA_DIR = (Join-Path (Get-ProjectRoot) '.dev-data')
        npm_config_cache = (Join-Path $root 'npm-cache')
        npm_config_prefix = (Join-Path $root 'npm-prefix')
        npm_config_userconfig = (Join-Path $root 'config/npmrc')
        npm_config_globalconfig = (Join-Path $root 'config/global-npmrc')
        npm_config_update_notifier = 'false'
        XDG_CACHE_HOME = (Join-Path $root 'cache')
        XDG_CONFIG_HOME = (Join-Path $root 'config')
        XDG_DATA_HOME = (Join-Path $root 'data')
        LOCALAPPDATA = (Join-Path $root 'local-app-data')
        APPDATA = (Join-Path $root 'app-data')
        TEMP = (Join-Path $root 'tmp')
        TMP = (Join-Path $root 'tmp')
    }
    $values['Path'] = @(
        (Join-Path $root "node-v$($versions.node)-win-x64")
        (Join-Path $root 'tools/node_modules/.bin')
        (Join-Path $root 'cargo/bin')
        $env:Path
    ) -join [IO.Path]::PathSeparator
    # Finish filesystem work before changing the process environment, so a
    # configuration write failure cannot leave the caller partially activated.
    Set-Content -LiteralPath (Join-Path $root 'config/npmrc') -Value ('store-dir=' + (Join-Path $root 'pnpm-store').Replace('\', '/')) -Encoding ascii
    $saved = @{}
    foreach ($name in $values.Keys) {
        $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
        [Environment]::SetEnvironmentVariable($name, $values[$name], 'Process')
    }
    $saved
}

function Restore-ProjectEnvironment($Saved) {
    foreach ($name in $Saved.Keys) {
        if ($null -eq $Saved[$name]) {
            Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
        } else {
            [Environment]::SetEnvironmentVariable($name, $Saved[$name], 'Process')
        }
    }
}

function Assert-NativeSuccess([string]$Step) {
    if ($LASTEXITCODE -ne 0) { throw "$Step failed (exit $LASTEXITCODE)." }
}
