[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param()
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Environment.ps1')
$root = Get-LocalEnvironmentRoot
if (-not (Test-Path -LiteralPath $root)) { Write-Host 'No local environment to remove.'; return }
$marker = Join-Path $root '.branchharbor-environment'
if (-not (Test-Path -LiteralPath $marker) -or (Get-Content -LiteralPath $marker -Raw).Trim() -ne 'BranchHarbor disposable development environment v1') {
    throw 'Refusing to remove an unrecognized environment directory.'
}
$expected = [IO.Path]::GetFullPath((Join-Path (Get-ProjectRoot) '.dev-env'))
if (-not [string]::Equals($expected, $root, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected cleanup target.' }
foreach ($process in Get-Process) {
    try { $processPath = $process.Path } catch { continue }
    if ($processPath -and $processPath.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Close local development processes before cleanup (PID $($process.Id))."
    }
}
if ($PSCmdlet.ShouldProcess($root, 'Remove project-local tools, caches, temporary files and Rust build output')) {
    Remove-Item -LiteralPath $root -Recurse -Force
}
