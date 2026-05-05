# AlphaTrace Next Roadmap

Date: 2026-05-01

## Recommendation

Stop adding MVP features after Task 45 and move into review. The current MVP is enough to demonstrate the AlphaTrace product thesis: evidence-aware agentic investment research with replayable runtime, persisted decisions and portfolio diagnosis.

## Phase 1: Review and Stabilize

Goals:
- Freeze demo path.
- Review UX, runtime stability and API boundaries.
- Remove confusing legacy branding from AlphaTrace paths where safe.

Do not:
- Add TradingAgents runtime yet.
- Add real trading.
- Add real-time market data.

Acceptance:
- Demo can run end-to-end in Docker and Vite real mode.
- Qwen and Bocha credentials can be configured from Settings.
- Completed runs remain replayable after app restart.

## Phase 2: PostgreSQL AgentRunStore

Goals:
- Move AgentRun, RuntimeEvent, AgentReport, EvidenceReference and AgentDecision from JSON store to PostgreSQL.
- Keep JSON store fallback for development.
- Add indexes for runId, status, taskType, assetId, portfolioId and createdAt.

Do not:
- Migrate all legacy business models.
- Add complex workflow queue yet.

## Phase 3: Domain Store DB Migration

Goals:
- Move Asset, Evidence, Strategy, Portfolio, Decision and DataSource from static seed to database tables.
- Preserve existing API contracts.
- Add admin/import path for evidence and assets.

## Phase 4: Runtime Worker Model

Goals:
- Add stable task status machine.
- Add cancel, retry, timeout reason and error category.
- Add SSE reconnect support.
- Consider lightweight worker process before Celery/Redis.

## Phase 5: TradingAgents Adapter PoC

Goals:
- Implement `runnerType=tradingagents` as a controlled PoC.
- Scope to `taskType=single_asset_analysis` and one asset mapping.
- Map TradingAgents progress/messages/tools/reports/final decision to AlphaTrace schema.

Do not:
- Expose TradingAgents internal graph state to frontend.
- Replace AlphaTrace AgentRunStore with TradingAgents checkpoint.

## Phase 6: Evidence Governance

Goals:
- Implement rule-based semantic support scoring.
- Add source fetch and citation validation.
- Add evidence quality reports.
- Feed support metrics into Decision Attribution and Leaderboard.

## Phase 7: Commercial Backend Hardening

Goals:
- Workspace/user/role model.
- Audit logs.
- Secret management review.
- Deployment observability.
- Data provider compliance.

## Current Do-Not-Do List

- Do not directly copy TradingAgents as AlphaTrace backend.
- Do not expose TradingAgents state to the frontend.
- Do not present runtime quality ranking as realized returns.
- Do not treat JSON store as production DB.
- Do not add real trading before evidence, decision and risk governance mature.
