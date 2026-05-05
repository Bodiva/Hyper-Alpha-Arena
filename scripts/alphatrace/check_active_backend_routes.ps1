param(
  [string]$BaseUrl = "http://127.0.0.1:8812/api",
  [switch]$DryRun,
  [switch]$FailOnMissing
)

$ErrorActionPreference = "Stop"

$normalizedBaseUrl = $BaseUrl.TrimEnd("/")

$routes = @(
  @{ Name = "health"; Path = "/health"; Required = $false },
  @{ Name = "runner_status"; Path = "/alpha-trace/agent-runs/runners/status"; Required = $true },
  @{ Name = "assets"; Path = "/alpha-trace/assets"; Required = $true },
  @{ Name = "asset_detail"; Path = "/alpha-trace/assets/asset_etf_510300"; Required = $true },
  @{ Name = "asset_evidence"; Path = "/alpha-trace/assets/asset_etf_510300/evidence"; Required = $true },
  @{ Name = "market_quote"; Path = "/alpha-trace/market-data/assets/asset_etf_510300/quote"; Required = $true },
  @{ Name = "market_snapshot"; Path = "/alpha-trace/market-data/assets/asset_etf_510300/snapshot"; Required = $true },
  @{ Name = "market_indicators"; Path = "/alpha-trace/market-data/assets/asset_etf_510300/indicators"; Required = $true },
  @{ Name = "evidence"; Path = "/alpha-trace/evidence?limit=2"; Required = $true },
  @{ Name = "decisions"; Path = "/alpha-trace/decisions"; Required = $true },
  @{ Name = "leaderboard"; Path = "/alpha-trace/leaderboard"; Required = $true },
  @{ Name = "portfolios"; Path = "/alpha-trace/portfolios"; Required = $true }
)

if ($DryRun) {
  Write-Host "AlphaTrace backend route smoke dry-run"
  Write-Host "BaseUrl: $normalizedBaseUrl"
  foreach ($route in $routes) {
    Write-Host ("GET {0}{1}" -f $normalizedBaseUrl, $route.Path)
  }
  exit 0
}

$results = @()

foreach ($route in $routes) {
  $url = "{0}{1}" -f $normalizedBaseUrl, $route.Path
  $statusCode = $null
  $ok = $false
  $message = ""

  try {
    $response = Invoke-WebRequest -Method Get -Uri $url -TimeoutSec 10 -UseBasicParsing
    $statusCode = [int]$response.StatusCode
    $ok = $statusCode -ge 200 -and $statusCode -lt 300
    $message = if ($ok) { "ok" } else { "unexpected status" }
  } catch {
    $response = $_.Exception.Response
    if ($response -and $response.StatusCode) {
      $statusCode = [int]$response.StatusCode
      $message = $_.Exception.Message
    } else {
      $statusCode = 0
      $message = $_.Exception.Message
    }
  }

  $results += [pscustomobject]@{
    Name = $route.Name
    Required = [bool]$route.Required
    Ok = [bool]$ok
    Status = $statusCode
    Url = $url
    Message = $message
  }
}

$results | Format-Table -AutoSize

$missingRequired = @($results | Where-Object { $_.Required -and -not $_.Ok })
$okCount = @($results | Where-Object { $_.Ok }).Count

Write-Host ""
Write-Host ("AlphaTrace route smoke summary: {0}/{1} routes ok" -f $okCount, $results.Count)

if ($missingRequired.Count -gt 0) {
  Write-Host "Missing or stale required routes:"
  foreach ($item in $missingRequired) {
    Write-Host ("- {0}: HTTP {1} {2}" -f $item.Name, $item.Status, $item.Url)
  }
  if ($FailOnMissing) {
    exit 1
  }
}

exit 0
