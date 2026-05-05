param(
  [string]$BaseUrl = "http://127.0.0.1:8812/api",
  [string]$Ticker = "SPY",
  [string]$TradeDate = "2025-06-05",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$url = "$BaseUrl/alpha-trace/agent-runs/submit"
$payload = @{
  assetId = "asset_etf_510300"
  taskType = "single_asset_analysis"
  question = "Use TradingAgents PoC to analyze $Ticker."
  horizon = "medium_term"
  riskPreference = "balanced"
  runnerConfig = @{
    runnerType = "tradingagents"
    modelProvider = "qwen"
    modelName = "qwen-plus"
    enableStreaming = $true
    extraParams = @{
      ticker = $Ticker
      tradeDate = $TradeDate
      offlineData = $true
      selectedAnalysts = @("market")
      maxDebateRounds = 1
      maxRiskDiscussRounds = 1
    }
  }
} | ConvertTo-Json -Depth 8

Write-Host "POST $url"
Write-Host $payload
if ($DryRun) { exit 0 }
Invoke-RestMethod -Uri $url -Method Post -ContentType "application/json" -Body $payload -TimeoutSec 30 | ConvertTo-Json -Depth 8
