# Leaderboard Runtime Quality API

## Task 38: Leaderboard Real Mode Minimal Integration

AlphaTrace Leaderboard real mode is backed by `GET /api/alpha-trace/leaderboard`.

The MVP leaderboard is a runtime quality leaderboard, not a realized investment performance leaderboard. It does not compute or display real strategy returns. Return, drawdown, volatility and Sharpe fields are set to zero in real mode to avoid implying backtested or live performance that does not exist.

## Scoring Inputs

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

Data is derived from the AgentRun JSON store and static StrategyStore. Strategies with no AgentRun still appear with zero runtime quality so the UI remains complete.

## Limitations

- No real backtest engine.
- No live trading performance.
- No external market data.
- No TradingAgents integration.
