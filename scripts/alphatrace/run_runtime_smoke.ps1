param(
  [string]$BaseUrl = "http://127.0.0.1:8805/api",
  [switch]$IncludeSubmit,
  [switch]$DryRun,
  [switch]$FailOnError
)

$ErrorActionPreference = "Stop"

$normalizedBaseUrl = $BaseUrl.TrimEnd("/")

$getChecks = @(
  @{ Name = "health"; Path = "/health"; Required = $true },
  @{ Name = "hyper_ai_profile"; Path = "/hyper-ai/profile"; Required = $true },
  @{ Name = "hyper_ai_tools"; Path = "/hyper-ai/tools"; Required = $true },
  @{ Name = "runner_status"; Path = "/alpha-trace/agent-runs/runners/status"; Required = $true },
  @{ Name = "runner_capabilities"; Path = "/alpha-trace/agent-runs/runners/capabilities"; Required = $true },
  @{ Name = "store_health"; Path = "/alpha-trace/agent-runs/runtime/store-health"; Required = $true },
  @{ Name = "assets"; Path = "/alpha-trace/assets"; Required = $true },
  @{ Name = "asset_510300"; Path = "/alpha-trace/assets/asset_etf_510300"; Required = $true },
  @{ Name = "evidence"; Path = "/alpha-trace/evidence?limit=5"; Required = $true },
  @{ Name = "data_sources"; Path = "/alpha-trace/data-sources"; Required = $true },
  @{ Name = "strategies"; Path = "/alpha-trace/strategies"; Required = $true },
  @{ Name = "portfolios"; Path = "/alpha-trace/portfolios"; Required = $true },
  @{ Name = "decisions"; Path = "/alpha-trace/decisions"; Required = $true },
  @{ Name = "leaderboard"; Path = "/alpha-trace/leaderboard"; Required = $true },
  @{ Name = "market_quote_510300"; Path = "/alpha-trace/market-data/assets/asset_etf_510300/quote"; Required = $true }
)

function Invoke-SmokeGet {
  param([hashtable]$Check)

  $url = "{0}{1}" -f $normalizedBaseUrl, $Check.Path
  if ($DryRun) {
    return [pscustomobject]@{
      Name = $Check.Name
      Method = "GET"
      Required = [bool]$Check.Required
      Ok = $true
      Status = "dry-run"
      Url = $url
      Message = "not executed"
    }
  }

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Method Get -Uri $url -TimeoutSec 12
    return [pscustomobject]@{
      Name = $Check.Name
      Method = "GET"
      Required = [bool]$Check.Required
      Ok = ([int]$response.StatusCode -ge 200 -and [int]$response.StatusCode -lt 300)
      Status = [int]$response.StatusCode
      Url = $url
      Message = "ok"
    }
  } catch {
    $status = 0
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $status = [int]$_.Exception.Response.StatusCode
    }
    return [pscustomobject]@{
      Name = $Check.Name
      Method = "GET"
      Required = [bool]$Check.Required
      Ok = $false
      Status = $status
      Url = $url
      Message = $_.Exception.Message
    }
  }
}

function Invoke-SmokePost {
  param(
    [string]$Name,
    [string]$Body,
    [bool]$ExpectFailure = $false,
    [string]$ExpectedMessage = ""
  )

  $url = "$normalizedBaseUrl/alpha-trace/agent-runs/submit"
  if ($DryRun) {
    return [pscustomobject]@{
      Name = $Name
      Method = "POST"
      Required = $false
      Ok = $true
      Status = "dry-run"
      Url = $url
      Message = "not executed"
    }
  }

  try {
    $response = Invoke-RestMethod -Uri $url -Method Post -ContentType "application/json" -Body $Body -TimeoutSec 20
    return [pscustomobject]@{
      Name = $Name
      Method = "POST"
      Required = $false
      Ok = (-not $ExpectFailure)
      Status = 200
      Url = $url
      Message = if ($response.runId) { "runId=$($response.runId)" } else { "ok" }
    }
  } catch {
    $status = 0
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $status = [int]$_.Exception.Response.StatusCode
    }
    $message = $_.Exception.Message
    $expectedClientFailure = $ExpectFailure -and $status -ge 400 -and $status -lt 500
    $expectedMessageMatch = ($ExpectedMessage -eq "") -or ($message -like "*$ExpectedMessage*")
    $ok = $expectedClientFailure -and ($expectedMessageMatch -or $status -eq 400)
    return [pscustomobject]@{
      Name = $Name
      Method = "POST"
      Required = $false
      Ok = $ok
      Status = $status
      Url = $url
      Message = $message
    }
  }
}

$results = @()

foreach ($check in $getChecks) {
  $results += Invoke-SmokeGet -Check $check
}

if ($IncludeSubmit) {
  $stubPayload = @{
    assetId = "asset_etf_510300"
    taskType = "single_asset_analysis"
    question = "AlphaTrace runtime smoke: stub"
    runnerConfig = @{
      runnerType = "stub"
      enableStreaming = $true
    }
  } | ConvertTo-Json -Depth 8

  $tradingAgentsPayload = @{
    assetId = "asset_etf_510300"
    taskType = "single_asset_analysis"
    question = "AlphaTrace runtime smoke: TradingAgents disabled path"
    runnerConfig = @{
      runnerType = "tradingagents"
      enableStreaming = $true
    }
  } | ConvertTo-Json -Depth 8

  $results += Invoke-SmokePost -Name "stub_submit" -Body $stubPayload
  $results += Invoke-SmokePost -Name "tradingagents_disabled_submit" -Body $tradingAgentsPayload -ExpectFailure $true -ExpectedMessage "TradingAgents"
}

$results | Format-Table -AutoSize

$failed = @($results | Where-Object { -not $_.Ok -and ($_.Required -or $FailOnError) })
$okCount = @($results | Where-Object { $_.Ok }).Count

Write-Host ""
Write-Host ("AlphaTrace runtime smoke summary: {0}/{1} checks ok" -f $okCount, $results.Count)

if ($failed.Count -gt 0) {
  Write-Host "Failed required checks:"
  foreach ($item in $failed) {
    Write-Host ("- {0} {1}: HTTP {2} {3}" -f $item.Method, $item.Name, $item.Status, $item.Message)
  }
  exit 1
}

exit 0
