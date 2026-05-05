# TradingAgents Enablement Preflight

Date: 2026-05-04

## Current State

TradingAgents is present as an AlphaTrace runner adapter candidate, but it is disabled by default.

Current runner status should show:

- `runnerType=tradingagents`
- `executionMode=subprocess`
- `enabled=false`
- `available=false`
- `status=disabled`
- message: `TradingAgents PoC is disabled. Set ALPHATRACE_TRADINGAGENTS_ENABLED=true to enable local PoC.`
- `qwenKeyConfigured=true` if Qwen is configured through MySQL system config
- `qwenConfigSource=mysql_system_config`

## Why Disabled By Default

1. TradingAgents runs a heavier LangGraph/tool workflow than the native Qwen runner.
2. It may require extra Python dependencies and a sibling `TradingAgents` repo path.
3. It is better isolated in a subprocess worker boundary.
4. It should not silently fallback to Qwen or Stub because that would mislead users about what actually ran.

## Required Environment For Local PoC Enablement

```powershell
$env:ALPHATRACE_TRADINGAGENTS_ENABLED="true"
$env:TRADINGAGENTS_REPO_PATH="H:\git0412\hyperalphaarena_codex\ai-investment-workbench\TradingAgents"
$env:QWEN_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
$env:QWEN_MODEL="qwen-plus"
```

Qwen API key should come from one of:

1. AlphaTrace Settings saved into MySQL system config, preferred for the main backend.
2. `DASHSCOPE_API_KEY` in the backend process environment for TradingAgents-compatible libraries that do not read AlphaTrace MySQL config directly.

Do not put any key in frontend code or docs.

## Disabled Submit Smoke

```powershell
$body = '{"assetId":"asset_etf_510300","taskType":"single_asset_analysis","question":"TradingAgents disabled preflight","runnerConfig":{"runnerType":"tradingagents","enableStreaming":true,"extraParams":{"ticker":"SPY","tradeDate":"2025-06-05"}}}'
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8805/api/alpha-trace/agent-runs/submit" -ContentType "application/json" -Body $body
```

Expected when disabled:

```json
{"detail":"TradingAgents runner is not enabled."}
```

## Current Validation Result

- Runner status: disabled.
- Qwen config source visible to runner status: `mysql_system_config`.
- Qwen key availability visible to runner status: `true`.
- Disabled submit returned HTTP 400 with `TradingAgents runner is not enabled.`

## Next Implementation Boundary

Before enabling real TradingAgents runs by default:

1. Confirm dependency install path in local venv or worker environment.
2. Confirm `DASHSCOPE_API_KEY` propagation if TradingAgents requires env-based key access.
3. Confirm subprocess worker log streaming and cancellation behavior.
4. Keep AlphaTrace frontend consuming only AlphaTrace AgentRun/Event/Report/Decision schema.
