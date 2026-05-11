<#
.SYNOPSIS
  Stop processes started by scripts/start-dev.ps1.
#>
[CmdletBinding()]
param(
  [string]$RuntimeDir = ".codex-run"
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$ResolvedRuntimeDir = Join-Path $Root $RuntimeDir

function Stop-ProcessTree {
  param([int]$ProcessId)

  $children = Get-CimInstance Win32_Process -Filter "ParentProcessId = $ProcessId" -ErrorAction SilentlyContinue
  foreach ($child in $children) {
    Stop-ProcessTree -ProcessId ([int]$child.ProcessId)
  }

  $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if ($process) {
    Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
  }
}

if (-not (Test-Path $ResolvedRuntimeDir)) {
  Write-Host "[stop-dev] no runtime directory found: $ResolvedRuntimeDir"
  exit 0
}

Get-ChildItem -Path $ResolvedRuntimeDir -Filter "*.pid" | ForEach-Object {
  $name = $_.BaseName
  $pidValue = (Get-Content $_.FullName -ErrorAction SilentlyContinue | Select-Object -First 1)
  if (-not $pidValue) {
    return
  }

  $process = Get-Process -Id ([int]$pidValue) -ErrorAction SilentlyContinue
  if ($process) {
    Stop-ProcessTree -ProcessId $process.Id
    Write-Host "[stop-dev] stopped $name pid=$($process.Id)"
  } else {
    Write-Host "[stop-dev] $name pid=$pidValue is not running"
  }
  Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
}
