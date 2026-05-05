# AlphaTrace Phase 2 Backend Increment Freeze

Date: 2026-05-02

This document freezes the current AlphaTrace backend increment after milestones M0-M7. It is the review checkpoint before deployment hardening or deeper TradingAgents integration.

## Canonical Direction

AlphaTrace is the main product backend. Qwen, TradingAgents, and future external systems are runner or integration adapters. The frontend consumes AlphaTrace schemas only.

The canonical production database direction is MySQL 8.0+. The legacy Hyper Alpha Arena PostgreSQL wiring remains for legacy services, but AlphaTrace-owned persistence moves toward MySQL. JSON store remains an MVP fallback.

## Completed Milestones

1. M0 - Governance files and MySQL direction: complete.
2. M1 - TradingAgents / LangGraph observability cleanup: complete.
3. M2 - AlphaTrace ETF / fund / index market data v1 static APIs: complete.
4. M3 - AgentRunStore MySQL migration: complete at store layer.
5. M4 - Domain Store MySQL migration: complete with optional MySQL-backed seeded domain stores.
6. M5 - Agent Runtime stability layer: complete with cooperative cancel, retry, SSE cursor, and status machine.
7. M6 - TradingAgents Adapter deep PoC stabilization: complete in disabled/import-failure/durable-failure modes; full model completion requires valid provider key.
8. M7 - Evidence governance v1: complete with rule-based support scoring.

## Current MySQL Schema State

Agent runtime tables:

1. `alpha_trace_agent_runs`
2. `alpha_trace_runtime_events`
3. `alpha_trace_agent_reports`
4. `alpha_trace_evidence_refs`
5. `alpha_trace_decisions`

Domain tables:

1. `alpha_trace_assets`
2. `alpha_trace_evidence_items`
3. `alpha_trace_strategies`
4. `alpha_trace_portfolios`
5. `alpha_trace_data_sources`

Implementation notes:

1. Payloads are stored as JSON columns with stable helper columns for filtering.
2. No migration framework is introduced yet.
3. Static seed remains default; MySQL domain store is enabled by `ALPHA_TRACE_DOMAIN_STORE=mysql`.
4. Agent runtime MySQL store is enabled by `ALPHA_TRACE_AGENT_RUN_STORE=mysql`.
5. Docker Compose includes MySQL 8.0 with volume `mysql_data` and host port `ALPHA_TRACE_MYSQL_PORT`, default `3307`.

## Current Runner State

Qwen Runner:

1. Async submit returns immediately.
2. Runtime events and SSE are available.
3. Bull/Bear parallel Qwen calls are supported.
4. Evidence retrieval includes static seed and optional Bocha if configured.
5. Qwen output has JSON structured parsing with markdown fallback.
6. Evidence id validation and rule-based support scoring are applied.

TradingAgents Runner:

1. Opt-in only with `ALPHATRACE_TRADINGAGENTS_ENABLED=true`.
2. Uses sibling repo or installed package via `TRADINGAGENTS_REPO_PATH`.
3. Does not expose TradingAgents internal state to the frontend.
4. Non-US ticker-style symbols fall back to SPY for PoC unless `extraParams.ticker` is provided.
5. Missing package/path/key produces clear errors or durable failed runs.
6. Full successful execution still requires valid model/provider configuration.

Stub Runner:

1. Still available for local smoke tests.
2. Used for retry regression and mock-safe behavior.

## Runtime Stability State

1. Status machine prevents terminal status overwrite.
2. Cancellation is cooperative and does not kill in-flight model calls.
3. Retry reconstructs a best-effort SubmitAgentRunRequest from persisted run state.
4. SSE supports `after=<sequence>` cursor for reconnect.
5. JSON store has a write lock and retry around `os.replace` to reduce Windows background-write failures.
6. Durable queues, real cancellation, global concurrency limits, and worker processes remain future work.

## Known Limitations

1. No real trading or broker integration.
2. No real-time market data ingestion.
3. MySQL migration is implemented without Alembic or a formal migration framework.
4. Domain MySQL store is seed-backed and not yet editable through admin APIs.
5. Evidence semantic support is rule-based, not embedding/LLM-judge based.
6. TradingAgents full completion requires local dependencies and valid model key.
7. LangAlpha remains architecture reference / future external service adapter, not a running integration.
8. Legacy BTC/Hyperliquid services still exist and may emit global logs; AlphaTrace UI filters them by default.
9. Multi-tenant workspace/auth/audit is not implemented for AlphaTrace commercial backend yet.

## Recommended Next Phase

Proceed to deployment-hardening design before adding more product features:

1. Choose migration tooling for MySQL schema management.
2. Add explicit AlphaTrace config profiles for JSON/MySQL/domain store modes.
3. Define worker architecture for long-running agent tasks.
4. Add API-level integration tests for runtime/domain stores.
5. Decide whether TradingAgents should remain in-process or move to an isolated runner service.
6. Define data-source governance for ETF/fund/index feeds before connecting real providers.

## Stop Condition

No new feature work should be added before reviewing this freeze with product and architecture stakeholders.
