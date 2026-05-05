# AlphaTrace MVP Known Limitations

Date: 2026-05-01

## Explicit Non-Goals In Current MVP

- TradingAgents is not connected.
- No real trading or broker execution.
- No real-time market data feed.
- No production PostgreSQL/MySQL domain store.
- No multi-tenant workspace isolation.
- No production-grade permission model.
- No real portfolio risk engine.
- No realized PnL attribution.

## Runtime Limitations

- Qwen Runner is the only live model runner.
- Stub runner remains for demos and contract checks.
- TradingAgents runner is a design-only stub.
- Qwen output is improved with structured JSON blocks but can still fall back to markdown parsing.
- SSE streams runtime events, not a guaranteed token-perfect model transport.
- Background tasks are process-local.

## Persistence Limitations

- AgentRun persistence uses JSON store.
- JSON store survives Docker recreate through a Docker volume, but it is not a production database.
- JSON store has no concurrent write guarantees beyond the current MVP usage pattern.
- Domain stores for assets, evidence, strategies and portfolios are static seeds.

## Evidence Limitations

- Evidence id validation is implemented.
- Semantic support scoring is design-only.
- Bocha web search can provide external evidence, but source verification and claim validation are limited.
- Static evidence seed is not real-time and not exhaustive.
- Evidence quality scores are manually seeded or heuristically assigned.

## Decision / Leaderboard Limitations

- Decision Attribution links decisions to evidence and runs; it is not realized performance attribution.
- Leaderboard real mode is runtime quality ranking, not return/backtest ranking.
- Sharpe, max drawdown and annualized return are not real metrics in real mode.

## Frontend Limitations

- AlphaTrace pages are real-mode capable, but old Hyper Alpha pages still exist and retain legacy semantics.
- Some global app initialization still comes from the original Hyper-Alpha-Arena shell.
- Mobile layout is usable but not fully product-polished.

## Commercialization Risks

- License and third-party dependency obligations must be reviewed before distribution.
- Data provider terms for Bocha and future market data sources must be checked.
- API key storage and encryption require formal security review.
- Production deployment needs real database migrations, backup and observability.
