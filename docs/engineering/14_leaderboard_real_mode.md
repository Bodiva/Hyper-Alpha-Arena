# Leaderboard Real Mode Minimal Integration

Date: 2026-05-01

## Goal

Task 38 adds a backend-backed AlphaTrace leaderboard for real mode. The real mode leaderboard is an Agent Runtime Quality Ranking, not a backtest or live trading performance table.

## Endpoint

- `GET /api/alpha-trace/leaderboard`

## Data Sources

The MVP leaderboard is derived from:

- AgentRun JSON store
- AgentRun final decisions
- AgentRun evidence references
- AgentRun reports
- AgentRun runtime events
- Static StrategyStore for strategy metadata

Runs with `strategyId` are grouped under their strategy. Runs without `strategyId` are grouped by `taskType`, for example `portfolio_diagnosis Runtime Task`.

## Metrics

Real mode exposes runtime quality metrics:

- completedRuns
- failedRuns
- averageConfidence
- evidenceCount
- reportCount
- riskWarnings
- decisionCount
- evidenceScore
- riskScore
- runtimeQualityScore
- latest runtime summary

## Explicit Non-Goals

The real mode leaderboard does not compute or display true realized performance:

- no true cumulative return
- no true annualized return
- no true max drawdown
- no true Sharpe
- no true win rate
- no true turnover
- no live trading performance

Mock mode can still show the original strategy leaderboard demo fields.

## Frontend Behavior

`LeaderboardPage` uses `listLeaderboardAsync` in real mode and labels the page as `Real API / Runtime Quality Leaderboard`. Real mode table columns switch from return metrics to runtime metrics. Mock mode remains unchanged.

## Validation

Validated on 2026-05-01:

- `python -m py_compile backend/api/alpha_trace_leaderboard_routes.py backend/schemas/alpha_trace_leaderboard.py backend/services/leaderboard_store/leaderboard_store.py`
- `cd frontend && pnpm build`
- `GET /api/alpha-trace/leaderboard`

Observed result:

- endpoint returned 10 leaderboard rows
- task-type rows are included for AgentRuns without strategyId
- `portfolio_diagnosis Runtime Task` returned completedRuns=2, evidenceCount=8, reportCount=8, decisionCount=2
- no TradingAgents integration
- no external data source, real-time market data, or real trading
- no real DB write
