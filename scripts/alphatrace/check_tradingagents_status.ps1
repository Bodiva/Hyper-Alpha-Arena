param(
  [string]$BaseUrl = "http://127.0.0.1:8812/api",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$url = "$BaseUrl/alpha-trace/agent-runs/runners/status"
Write-Host "GET $url"
if ($DryRun) { exit 0 }
$response = Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 10
$response.runners | Format-Table runnerType, status, enabled, available, repoPathConfigured, importable, qwenKeyConfigured, qwenConfigSource -AutoSize
$response.runners | ConvertTo-Json -Depth 8
