# AlphaTrace Demo Checklist

## Environment

- [ ] Backend reachable at `http://127.0.0.1:8802`.
- [ ] Docker frontend reachable at `http://127.0.0.1:8802/dashboard#dashboard` or Vite real mode is running.
- [ ] Qwen key/config available to backend for real Qwen runs.
- [ ] `ALPHA_TRACE_AGENT_RUN_STORE_PATH` points to persistent JSON store in Docker, typically `/app/data/alpha_trace_agent_runs.json`.
- [ ] Optional: `BOCHA_API_KEY` configured if live Bocha web evidence should be demonstrated.

## API Smoke Checks

- [ ] `GET /api/health`
- [ ] `GET /api/alpha-trace/assets/asset_etf_510300`
- [ ] `GET /api/alpha-trace/evidence?assetId=asset_etf_510300`
- [ ] `GET /api/alpha-trace/strategies?limit=5`
- [ ] `GET /api/alpha-trace/portfolios/portfolio_etf_core_001`
- [ ] `GET /api/alpha-trace/agent-runs?limit=5`
- [ ] `GET /api/alpha-trace/decisions?limit=5`
- [ ] `GET /api/alpha-trace/leaderboard?limit=5`

## Page Checks

- [ ] `/dashboard#dashboard`
- [ ] `/dashboard#assets`
- [ ] `/dashboard#assets/asset_etf_510300`
- [ ] `/dashboard#evidence`
- [ ] `/dashboard#agent-lab`
- [ ] `/dashboard#decision-attribution`
- [ ] `/dashboard#portfolio`
- [ ] `/dashboard#leaderboard`

## Agent Runtime Checks

- [ ] `Submit Qwen Agent Task` returns runId immediately.
- [ ] AgentRunDetail shows `RUNNING` before completion.
- [ ] SSE events appear during execution.
- [ ] Reports are generated after completion.
- [ ] Evidence references are displayed.
- [ ] If Bocha is not configured, events show disabled/fallback and run still completes.
- [ ] Final Decision is displayed.
- [ ] `Submit Portfolio Diagnosis Agent Task` starts a portfolio diagnosis run.
- [ ] Restarting Docker app keeps completed run accessible.

## Talk Track Boundaries

- [ ] State that TradingAgents is not connected yet.
- [ ] State that evidence / asset / strategy / portfolio stores are static seed stores, with optional Bocha web evidence.
- [ ] State that no real trading or live market data is used.
- [ ] State that JSON store is MVP persistence, not production DB.
- [ ] State that Leaderboard is runtime quality ranking, not return/backtest performance.
