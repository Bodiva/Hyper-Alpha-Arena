# AlphaTrace Runtime API Smoke Collection

Date: 2026-05-04

Base URL for current Vite real mode:

```powershell
$base = "http://127.0.0.1:8805/api"
```

Backend direct fallback:

```powershell
$base = "http://127.0.0.1:8802/api"
```

## Health and Runtime Config

```powershell
Invoke-RestMethod "$base/health"
Invoke-RestMethod "$base/hyper-ai/profile"
Invoke-RestMethod "$base/hyper-ai/tools"
Invoke-RestMethod "$base/alpha-trace/agent-runs/runners/status"
```

Expected:

1. Health returns `status=healthy`.
2. Qwen profile shows `llm_config_source=mysql_system_config` when configured through Settings.
3. Bocha tool shows `config_source=mysql_system_config` and `api_key_available=true` when configured.
4. Runner status shows `stub=ready`, `qwen=ready` if Qwen key exists, `tradingagents=disabled` unless explicitly enabled.

## Domain APIs

```powershell
Invoke-RestMethod "$base/alpha-trace/assets"
Invoke-RestMethod "$base/alpha-trace/assets/asset_etf_510300"
Invoke-RestMethod "$base/alpha-trace/evidence?limit=5"
Invoke-RestMethod "$base/alpha-trace/decisions"
Invoke-RestMethod "$base/alpha-trace/portfolios"
Invoke-RestMethod "$base/alpha-trace/leaderboard"
```

Expected:

1. Each endpoint returns HTTP 200.
2. Domain payloads are real-mode AlphaTrace data, not frontend-only mock data.

## Market Data APIs

```powershell
Invoke-RestMethod "$base/alpha-trace/market-data/assets/asset_etf_510300/quote"
Invoke-RestMethod "$base/alpha-trace/market-data/assets/asset_etf_510300/snapshot"
Invoke-RestMethod "$base/alpha-trace/market-data/assets/asset_etf_510300/klines?period=1d&limit=5"
Invoke-RestMethod "$base/alpha-trace/market-data/assets/asset_etf_510300/indicators"
```

Expected:

1. Source should be `alphatrace_static_market_seed`.
2. This is not a realtime market feed.

## Stub Runner Submit

```powershell
$body = '{"assetId":"asset_etf_510300","taskType":"single_asset_analysis","question":"Runtime smoke stub","runnerConfig":{"runnerType":"stub","enableStreaming":true}}'
Invoke-RestMethod -Method Post -Uri "$base/alpha-trace/agent-runs/submit" -ContentType "application/json" -Body $body
```

Expected:

1. Submit returns a completed stub run.
2. No external model call is made.

## TradingAgents Disabled Submit

```powershell
$body = '{"assetId":"asset_etf_510300","taskType":"single_asset_analysis","question":"TradingAgents disabled smoke","runnerConfig":{"runnerType":"tradingagents","enableStreaming":true}}'
Invoke-RestMethod -Method Post -Uri "$base/alpha-trace/agent-runs/submit" -ContentType "application/json" -Body $body
```

Expected:

1. If not enabled, returns HTTP 400 with `TradingAgents runner is not enabled.`
2. It must not fallback to Qwen or Stub.

## Page Smoke

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard#dashboard
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard#assets/asset_etf_510300
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard#agent-lab
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard#portfolio
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard#settings
```
