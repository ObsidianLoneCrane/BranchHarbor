[CmdletBinding(PositionalBinding = $false)]
param([Parameter(Position = 0, ValueFromRemainingArguments = $true)][string[]]$Command)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Environment.ps1')
$root = Get-LocalEnvironmentRoot
if (-not (Test-Path -LiteralPath (Join-Path $root 'cargo/bin/rustc.exe'))) {
    throw 'Run ./scripts/windows/setup.ps1 first.'
}
$saved = Enter-ProjectEnvironment
$originalLocation = Get-Location
$commandExitCode = 0
try {
    Set-Location -LiteralPath (Get-ProjectRoot)
    if ($Command.Count -gt 0) {
        $executable = $Command[0]
        $arguments = @()
        if ($Command.Count -gt 1) { $arguments = $Command[1..($Command.Count - 1)] }
        & $executable @arguments
        if ($null -ne $LASTEXITCODE) { $commandExitCode = $LASTEXITCODE }
    } else {
        Write-Host 'BranchHarbor environment active in this child shell. Type exit to leave.'
        $shell = (Get-Process -Id $PID).Path
        & $shell -NoLogo -NoProfile -NoExit
        $commandExitCode = $LASTEXITCODE
    }
} finally {
    Set-Location -LiteralPath $originalLocation.Path
    Restore-ProjectEnvironment $saved
}
if ($commandExitCode -ne 0) { throw "Command failed (exit $commandExitCode)." }
