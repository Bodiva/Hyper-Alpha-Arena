param(
  [int]$Port = 8812,
  [string]$WorkspaceRoot = "",
  [string]$VenvPath = "",
  [string]$TradingAgentsRepoPath = "",
  [string]$LogPath = "",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
if (-not $WorkspaceRoot) {
  $WorkspaceRoot = Resolve-Path (Join-Path $repoRoot "..")
}
if (-not $VenvPath) {
  $VenvPath = Join-Path $WorkspaceRoot ".venv-alphatrace-tg"
}
if (-not $TradingAgentsRepoPath) {
  $TradingAgentsRepoPath = Join-Path $WorkspaceRoot "TradingAgents"
}
if (-not $LogPath) {
  $LogPath = Join-Path $repoRoot "backend-tg-local.log"
}

$python = Join-Path $VenvPath "Scripts\python.exe"
if (-not (Test-Path $python)) {
  throw "Python venv not found: $python"
}
if (-not (Test-Path $TradingAgentsRepoPath)) {
  throw "TradingAgents repo not found: $TradingAgentsRepoPath"
}

$env:ALPHATRACE_TRADINGAGENTS_ENABLED = "true"
$env:TRADINGAGENTS_REPO_PATH = (Resolve-Path $TradingAgentsRepoPath).Path
$env:ALPHATRACE_BACKEND_LOG_PATH = $LogPath
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
if (-not $env:QWEN_BASE_URL) {
  $env:QWEN_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
}
if (-not $env:QWEN_MODEL) {
  $env:QWEN_MODEL = "qwen-plus"
}

$cmd = @(
  $python,
  "-m", "uvicorn",
  "main:app",
  "--host", "127.0.0.1",
  "--port", $Port.ToString(),
  "--app-dir", (Join-Path $repoRoot "backend")
)

Write-Host "AlphaTrace TradingAgents local backend"
Write-Host "Repo: $repoRoot"
Write-Host "Venv: $VenvPath"
Write-Host "TradingAgents: $env:TRADINGAGENTS_REPO_PATH"
Write-Host "Port: $Port"
Write-Host "Log: $LogPath"
Write-Host "Qwen key source: environment DASHSCOPE_API_KEY if set, otherwise server-side Hyper AI profile"
Write-Host "Command: $($cmd -join ' ')"

if ($DryRun) {
  exit 0
}

Push-Location $repoRoot
try {
  & $cmd[0] $cmd[1..($cmd.Length - 1)] *>&1 | Tee-Object -FilePath $LogPath -Append
} finally {
  Pop-Location
}
