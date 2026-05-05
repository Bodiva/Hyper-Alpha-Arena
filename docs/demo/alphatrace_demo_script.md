# AlphaTrace Demo Script

## Purpose

This script defines a stable 10-minute AlphaTrace MVP demo path. It uses real mode backend APIs, Qwen Agent Runtime, SSE runtime events, JSON store persistence, static domain stores, and optional Bocha external evidence when `BOCHA_API_KEY` is configured.

The demo does not require TradingAgents, real trading, real-time market data, or a production database.

## Runtime Assumptions

- Backend and Docker frontend are available at `http://127.0.0.1:8802`.
- Docker entry URL: `http://127.0.0.1:8802/dashboard#dashboard`.
- Vite real mode can be used for frontend iteration:

```powershell
$env:VITE_ALPHA_TRACE_API_MODE="real"
$env:VITE_ALPHA_TRACE_API_BASE_URL="http://127.0.0.1:8802/api"
cd H:\git0412\hyperalphaarena_codex\ai-investment-workbench\Hyper-Alpha-Arena\frontend
pnpm dev
```

- Qwen is configured server-side through existing backend model config or backend environment variables.
- Bocha is optional. Without `BOCHA_API_KEY`, the demo falls back to static evidence seed and still completes.

## Demo Path

1. Dashboard
   - URL: `/dashboard#dashboard`
   - Explain AlphaTrace as an agentic investment research workbench for ETF, funds, futures and portfolio diagnostics.

2. Asset Research
   - URL: `/dashboard#assets`
   - Open CSI 300 ETF: `/dashboard#assets/asset_etf_510300`
   - Show asset profile, risk/liquidity metadata, related evidence and Agent action entry.

3. Evidence Center
   - URL: `/dashboard#evidence?assetId=asset_etf_510300`
   - Show backend evidence in real mode.
   - Explain the current evidence base is static seed plus optional Bocha web evidence when configured.

4. Submit Single-Asset Qwen Agent Task
   - From Asset Detail or Agent Lab: `/dashboard#agent-lab`
   - Click `Submit Qwen Agent Task`.
   - Expected: immediate navigation to `/dashboard#agent-lab/runs/{runId}`.

5. Observe Agent Runtime
   - Show `RUNNING` status, SSE runtime events, Live Output, Agent Progress Board and Bull/Bear debate.
   - Explain that this is the AlphaTrace Qwen runner, not TradingAgents.

6. Review Final Output
   - Reports: Market View, Bull View, Bear View, Risk Review.
   - Evidence Used: static seed and optional Bocha evidence references.
   - Decision: structured action, confidence, thesis, risks and watch indicators.

7. Decision Attribution
   - URL: `/dashboard#decision-attribution`
   - Show decisions derived from persisted AgentRun final decisions.
   - Explain attribution is currently decision/evidence/run linkage, not realized PnL attribution.

8. Portfolio Workspace
   - URL: `/dashboard#portfolio`
   - Select `portfolio_etf_core_001`.
   - Click `Submit Portfolio Diagnosis Agent Task`.
   - Expected: immediate navigation to AgentRunDetail and running/completed portfolio diagnosis.

9. Leaderboard
   - URL: `/dashboard#leaderboard`
   - Show Runtime Quality Ranking derived from AgentRun history, evidence count, reports, decisions and risk warnings.
   - Clarify it is not real return, backtest, Sharpe, max drawdown or live trading performance.

## Close

MVP boundaries to state explicitly:

- Qwen Agent Runtime is live and asynchronous.
- SSE, Live Output, reports, evidence, decisions and JSON persistence are working.
- Asset, Evidence, Strategy and Portfolio stores are static backend stores.
- Bocha is optional external web evidence; if disabled, static evidence fallback is used.
- TradingAgents, real-time market data, real trading and production DB are not part of this demo.
