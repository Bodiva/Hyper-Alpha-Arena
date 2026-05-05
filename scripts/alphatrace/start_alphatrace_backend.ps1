param(
  [int]$Port = 8813,
  [string]$Python = "python",
  [string]$LogPath = "",
  [string]$DatabaseUrl = "",
  [string]$SnapshotDatabaseUrl = "",
  [switch]$EnableTradingAgents,
  [string]$TradingAgentsRepoPath = "",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
if (-not $LogPath) {
  $LogPath = Join-Path $repoRoot "backend-alphatrace-local.log"
}
if ($Python -eq "python") {
  $venvPython = Join-Path $repoRoot "backend\.venv\Scripts\python.exe"
  if (Test-Path $venvPython) {
    $Python = $venvPython
  }
}

$env:ALPHATRACE_BACKEND_PROFILE = "alphatrace"
$env:ALPHATRACE_LEGACY_RUNTIME_ENABLED = "false"
$env:ALPHATRACE_FRONTEND_WATCHER_ENABLED = "false"
$env:ALPHATRACE_BACKEND_LOG_PATH = $LogPath
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"

if ($EnableTradingAgents) {
  $env:ALPHATRACE_TRADINGAGENTS_ENABLED = "true"
  if (-not $TradingAgentsRepoPath) {
    $TradingAgentsRepoPath = Join-Path $repoRoot "..\TradingAgents"
  }
  $env:TRADINGAGENTS_REPO_PATH = (Resolve-Path $TradingAgentsRepoPath -ErrorAction SilentlyContinue)
  if (-not $env:TRADINGAGENTS_REPO_PATH) {
    $env:TRADINGAGENTS_REPO_PATH = $TradingAgentsRepoPath
  }
} elseif (-not $env:ALPHATRACE_TRADINGAGENTS_ENABLED) {
  $env:ALPHATRACE_TRADINGAGENTS_ENABLED = "false"
}

if ($DatabaseUrl) {
  $env:DATABASE_URL = $DatabaseUrl
} elseif (-not $env:DATABASE_URL -or $env:DATABASE_URL -match "@postgres:") {
  $env:DATABASE_URL = "postgresql://alpha_user:alpha_pass@127.0.0.1:5432/alpha_arena"
}
if ($SnapshotDatabaseUrl) {
  $env:SNAPSHOT_DATABASE_URL = $SnapshotDatabaseUrl
} elseif (-not $env:SNAPSHOT_DATABASE_URL -or $env:SNAPSHOT_DATABASE_URL -match "@postgres:") {
  $env:SNAPSHOT_DATABASE_URL = "postgresql://alpha_user:alpha_pass@127.0.0.1:5432/alpha_snapshots"
}

if (-not $env:QWEN_BASE_URL) {
  $env:QWEN_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
}
if (-not $env:QWEN_MODEL) {
  $env:QWEN_MODEL = "qwen-plus"
}

$runtimeDataDir = Join-Path $repoRoot "backend\runtime_data"
$localEncryptionKeyFile = Join-Path $runtimeDataDir ".encryption_key"
if (-not $env:HYPERLIQUID_ENCRYPTION_KEY) {
  if (-not (Test-Path $runtimeDataDir)) {
    New-Item -ItemType Directory -Path $runtimeDataDir -Force | Out-Null
  }
  if (-not (Test-Path $localEncryptionKeyFile)) {
    $generatedKey = & $Python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    Set-Content -Path $localEncryptionKeyFile -Value $generatedKey -Encoding ASCII
  }
  $env:HYPERLIQUID_ENCRYPTION_KEY = (Get-Content -Path $localEncryptionKeyFile -Raw).Trim()
}

$cmd = @(
  $Python,
  "-m", "uvicorn",
  "main:app",
  "--host", "127.0.0.1",
  "--port", $Port.ToString(),
  "--app-dir", (Join-Path $repoRoot "backend")
)

Write-Host "AlphaTrace-only local backend"
Write-Host "Repo: $repoRoot"
Write-Host "Port: $Port"
Write-Host "Log: $LogPath"
Write-Host "Profile: $env:ALPHATRACE_BACKEND_PROFILE"
Write-Host "Legacy runtime enabled: $env:ALPHATRACE_LEGACY_RUNTIME_ENABLED"
Write-Host "Frontend watcher enabled: $env:ALPHATRACE_FRONTEND_WATCHER_ENABLED"
Write-Host "TradingAgents enabled: $env:ALPHATRACE_TRADINGAGENTS_ENABLED"
if ($env:TRADINGAGENTS_REPO_PATH) {
  Write-Host "TradingAgents repo path: $env:TRADINGAGENTS_REPO_PATH"
}
Write-Host "Encryption key source: local runtime_data file or environment"
Write-Host "Command: $($cmd -join ' ')"
Write-Host "Secrets: not printed"

if ($DryRun) {
  exit 0
}

Push-Location $repoRoot
try {
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  & $cmd[0] $cmd[1..($cmd.Length - 1)] 2>&1 | ForEach-Object { $_.ToString() } | Tee-Object -FilePath $LogPath -Append
  $exitCode = $LASTEXITCODE
  $ErrorActionPreference = $previousErrorActionPreference
  if ($exitCode -and $exitCode -ne 0) {
    exit $exitCode
  }
} finally {
  if ($previousErrorActionPreference) {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  Pop-Location
}
