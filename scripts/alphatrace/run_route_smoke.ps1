param(
  [string]$BaseUrl = "http://127.0.0.1:8805",
  [switch]$FailOnError
)

$ErrorActionPreference = "Stop"

$normalizedBaseUrl = $BaseUrl.TrimEnd("/")

$routes = @(
  @{ Name = "dashboard"; Hash = "#dashboard"; Required = $true },
  @{ Name = "assets"; Hash = "#assets"; Required = $true },
  @{ Name = "asset_detail_510300"; Hash = "#assets/asset_etf_510300"; Required = $true },
  @{ Name = "evidence"; Hash = "#evidence"; Required = $true },
  @{ Name = "agent_lab"; Hash = "#agent-lab"; Required = $true },
  @{ Name = "agent_run_latest_known"; Hash = "#agent-lab/runs/run_native_20260505_021040_004774"; Required = $false },
  @{ Name = "portfolio"; Hash = "#portfolio"; Required = $true },
  @{ Name = "decision_attribution"; Hash = "#decision-attribution"; Required = $true },
  @{ Name = "decisions_alias"; Hash = "#decisions"; Required = $true },
  @{ Name = "leaderboard"; Hash = "#leaderboard"; Required = $true },
  @{ Name = "data_sources"; Hash = "#data-sources"; Required = $true },
  @{ Name = "settings"; Hash = "#settings"; Required = $true }
)

$results = @()

foreach ($route in $routes) {
  $url = "$normalizedBaseUrl/dashboard$($route.Hash)"
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Method Get -Uri $url -TimeoutSec 12
    $body = [string]$response.Content
    $looksLikeViteApp = $body -match "<div id=`"root`"></div>" -or $body -match "/src/main.tsx" -or $body -match "Hyper Alpha Arena"
    $ok = ([int]$response.StatusCode -ge 200 -and [int]$response.StatusCode -lt 300 -and $looksLikeViteApp)
    $results += [pscustomobject]@{
      Name = $route.Name
      Required = [bool]$route.Required
      Ok = $ok
      Status = [int]$response.StatusCode
      Url = $url
      Message = if ($looksLikeViteApp) { "vite shell ok" } else { "response did not look like Vite app shell" }
    }
  } catch {
    $status = 0
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $status = [int]$_.Exception.Response.StatusCode
    }
    $results += [pscustomobject]@{
      Name = $route.Name
      Required = [bool]$route.Required
      Ok = $false
      Status = $status
      Url = $url
      Message = $_.Exception.Message
    }
  }
}

$results | Format-Table -AutoSize

$failed = @($results | Where-Object { -not $_.Ok -and ($_.Required -or $FailOnError) })
$okCount = @($results | Where-Object { $_.Ok }).Count

Write-Host ""
Write-Host ("AlphaTrace route smoke summary: {0}/{1} checks ok" -f $okCount, $results.Count)

if ($failed.Count -gt 0) {
  Write-Host "Failed route checks:"
  foreach ($item in $failed) {
    Write-Host ("- {0}: HTTP {1} {2}" -f $item.Name, $item.Status, $item.Message)
  }
  exit 1
}

exit 0
