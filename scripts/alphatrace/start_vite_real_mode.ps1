param(
  [string]$ApiBaseUrl = "/api",
  [string]$ApiProxyTarget = "http://127.0.0.1:8802/api",
  [int]$Port = 8805,
  [string]$FrontendDir = "",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($FrontendDir)) {
  $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
  $repoRoot = Resolve-Path (Join-Path $scriptDir "..\..")
  $FrontendDir = Join-Path $repoRoot "frontend"
}

$resolvedFrontendDir = Resolve-Path $FrontendDir

$envVars = @{
  VITE_ALPHA_TRACE_API_MODE = "real"
  VITE_ALPHA_TRACE_API_BASE_URL = $ApiBaseUrl
  VITE_ALPHA_TRACE_API_PROXY_TARGET = $ApiProxyTarget
}

$command = "pnpm exec vite --host 127.0.0.1 --port $Port"

if ($DryRun) {
  Write-Host "AlphaTrace Vite real-mode dry-run"
  Write-Host "FrontendDir: $resolvedFrontendDir"
  Write-Host "VITE_ALPHA_TRACE_API_MODE=$($envVars.VITE_ALPHA_TRACE_API_MODE)"
  Write-Host "VITE_ALPHA_TRACE_API_BASE_URL=$($envVars.VITE_ALPHA_TRACE_API_BASE_URL)"
  Write-Host "VITE_ALPHA_TRACE_API_PROXY_TARGET=$($envVars.VITE_ALPHA_TRACE_API_PROXY_TARGET)"
  Write-Host "Command: $command"
  exit 0
}

$env:VITE_ALPHA_TRACE_API_MODE = $envVars.VITE_ALPHA_TRACE_API_MODE
$env:VITE_ALPHA_TRACE_API_BASE_URL = $envVars.VITE_ALPHA_TRACE_API_BASE_URL
$env:VITE_ALPHA_TRACE_API_PROXY_TARGET = $envVars.VITE_ALPHA_TRACE_API_PROXY_TARGET

Write-Host "Starting AlphaTrace Vite real mode"
Write-Host "FrontendDir: $resolvedFrontendDir"
Write-Host "API base: $ApiBaseUrl"
Write-Host "API proxy target: $ApiProxyTarget"
Write-Host "Port: $Port"

Push-Location $resolvedFrontendDir
try {
  pnpm exec vite --host 127.0.0.1 --port $Port
} finally {
  Pop-Location
}
