# AlphaTrace MVP Freeze

## Freeze Scope

AlphaTrace MVP is frozen after Task 45. This document records the current product shape, validation baseline, known limits, and recommended next roadmap. No additional feature tasks should be implemented in this phase without a new planning round.

## Current MVP Capabilities

- AlphaTrace branded frontend workspace.
- Hash-route based new pages under `/dashboard#<route>`.
- Mock mode and real mode API boundary.
- Agent Lab and AgentRunDetail with Qwen async submit.
- SSE runtime events and live output display.
- Qwen multi-step / lightweight multi-agent flow with Bull and Bear parallel calls.
- Evidence retrieval from static evidence seed.
- AgentRun JSON store persistence with Docker volume support.
- Backend static stores and APIs for:
  - Assets
  - Evidence
  - Strategies
  - Portfolios
  - Decisions derived from AgentRun final decisions
  - Runtime-quality Leaderboard
- Portfolio Workspace can submit Portfolio Diagnosis Agent Task.
- Mobile/narrow AlphaTrace workspace entry for Market / Agent / Portfolio.
- TradingAgents adapter boundary exists as a design-only NotImplemented stub.

## Stable Demo Entry Points

- Dashboard: `/dashboard#dashboard`
- Asset Research: `/dashboard#assets`
- Asset Detail: `/dashboard#assets/asset_etf_510300`
- Evidence Center: `/dashboard#evidence`
- Agent Lab: `/dashboard#agent-lab`
- Agent Run Detail: `/dashboard#agent-lab/runs/{runId}`
- Decision Attribution: `/dashboard#decision-attribution`
- Portfolio Workspace: `/dashboard#portfolio`
- Strategy Lab: `/dashboard#strategy-lab`
- Leaderboard: `/dashboard#leaderboard`

## Startup Notes

### Docker

```powershell
cd H:\git0412\hyperalphaarena_codex\ai-investment-workbench\Hyper-Alpha-Arena
docker compose up -d
```

Open:

```text
http://127.0.0.1:8802/dashboard#dashboard
```

### Vite Real Mode

```powershell
$env:VITE_ALPHA_TRACE_API_MODE="real"
$env:VITE_ALPHA_TRACE_API_BASE_URL="http://127.0.0.1:8802/api"
cd H:\git0412\hyperalphaarena_codex\ai-investment-workbench\Hyper-Alpha-Arena\frontend
pnpm dev
```

Open the Vite URL, for example:

```text
http://127.0.0.1:8804/dashboard#agent-lab
```

### Qwen Configuration

AlphaTrace QwenRunner reads server-side configuration only. Do not put API keys in frontend code.

Supported env fallback:

```powershell
$env:DASHSCOPE_API_KEY="..."
$env:QWEN_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
$env:QWEN_MODEL="qwen-plus"
```

The original Hyper AI backend configuration path may also be used when available.

## Persistence

Default Docker persistence path:

```text
/app/data/alpha_trace_agent_runs.json
```

Local default path:

```text
backend/runtime_data/alpha_trace_agent_runs.json
```

This is MVP JSON-store persistence, not production database persistence.

## Known Limitations

- No TradingAgents execution.
- No external search engine.
- No real-time market data feed.
- No broker, exchange, order execution, or trading workflow.
- No production database for AgentRun persistence.
- Static evidence / asset / strategy / portfolio seed data only.
- Leaderboard is runtime quality and static strategy coverage, not live or backtested performance.
- Qwen output is validated and mapped conservatively, but still model-generated analyst draft content.
- User/session-level authorization for AlphaTrace APIs is not part of this MVP.

## Roadmap Suggestions

Do not implement these in this phase. Use them for the next planning round.

1. Replace JSON store with DB-backed AgentRunStore and migrations.
2. Add real Data Source ingestion and Evidence Store indexing.
3. Add portfolio diagnosis scenario templates and risk budget configuration.
4. Add authenticated server-side model configuration management for AlphaTrace.
5. Add TradingAgents adapter implementation after contract review.
6. Add external data connectors for market snapshots, fund reports and macro events.
7. Add backtest engine integration for Strategy Lab and Leaderboard performance.
8. Add run cancellation, retry and queue controls for Agent Runtime.

## Freeze Decision

AlphaTrace MVP is suitable for a controlled demo focused on:

- Agentic investment research flow.
- Evidence-linked Qwen runtime.
- Runtime observability and replay.
- Static backend store integration across Asset / Evidence / Strategy / Portfolio / Decision / Leaderboard.

It is not a production trading system and should not be positioned as one.
