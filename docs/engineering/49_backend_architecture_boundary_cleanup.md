# Backend Architecture Boundary Cleanup

Status: M99 baseline.

## Goal

Clarify AlphaTrace backend ownership boundaries and identify safe cleanup points without changing legacy runtime behavior.

## Current AlphaTrace API Surface

AlphaTrace routers are clearly grouped in `backend/api`:

- `alpha_trace_agent_runtime_routes.py`
- `alpha_trace_asset_routes.py`
- `alpha_trace_data_source_routes.py`
- `alpha_trace_decision_routes.py`
- `alpha_trace_evidence_routes.py`
- `alpha_trace_leaderboard_routes.py`
- `alpha_trace_market_data_routes.py`
- `alpha_trace_portfolio_routes.py`
- `alpha_trace_strategy_routes.py`

These should remain the only public AlphaTrace domain API entrypoints.

## Current AlphaTrace Service/Store Surface

AlphaTrace-specific services are grouped in `backend/services`:

- `agent_orchestrator`
- `agent_runners`
- `agent_runtime_store`
- `asset_store`
- `data_source_store`
- `decision_store`
- `evidence_retrieval`
- `leaderboard_store`
- `market_data_store`
- `portfolio_store`
- `strategy_store`
- `system_config_store`

External integrations currently live under:

- `backend/integrations/bocha`

This is the correct direction: integrations should not be mixed into domain stores or frontend pages.

## Boundary Rules

1. API routes should only translate HTTP query/body into service/store calls.
2. Domain stores should own AlphaTrace domain reads/writes and MySQL/static fallback logic.
3. `agent_runners` should execute tasks and emit AlphaTrace runtime schemas, not own product data tables.
4. `integrations/*` should wrap external APIs and map their payloads into AlphaTrace domain objects before they leave backend.
5. Frontend should never receive raw TradingAgents state, LangAlpha state, or Bocha raw response as primary schema.
6. Legacy Hyperliquid/Binance/BTC modules should not be imported by AlphaTrace domains unless explicitly scoped.

## Legacy Boundary Findings

`backend/main.py` still owns both legacy startup and AlphaTrace router registration. It includes:

- Legacy trading service startup.
- Hyperliquid/Binance/crypto routers.
- BTC indicator warmup.
- AlphaTrace router registration.
- Partial AlphaTrace-only profile gates through `_legacy_runtime_enabled()`.

This is acceptable for the current milestone because the user explicitly asked not to spend effort on BTC/Hyperliquid unless it blocks AlphaTrace. The boundary is documented but not refactored here.

## AlphaTrace Runtime Boundary

Current preferred runner path:

- `alphatrace_native`: AlphaTrace product runner, Qwen/Bocha/MySQL path, stable DAG contract.
- `qwen`: direct Qwen runner, still useful for baseline validation.
- `stub`: deterministic smoke runner.
- `tradingagents`: opt-in PoC only.
- `langalpha`: design-only external adapter candidate.

The backend should keep this hierarchy visible in runner status/capabilities so users know which path is product-facing.

## Store Boundary

Current stores support static seed and/or MySQL paths. Long-term MySQL remains canonical. JSON fallback should stay only for AgentRun runtime fallback, not for new production domain stores.

Recommended future cleanup:

1. Add a domain-store registry or factory map for Asset/Evidence/Strategy/Portfolio/Decision/DataSource.
2. Move seed bootstrap policy into store factories, not routes.
3. Add MySQL schema version/status endpoint for AlphaTrace stores.
4. Add read/write health checks for AgentRunStore and system config store.
5. Keep generated/transient runtime data outside git.

## Integration Boundary

Bocha is currently the first external search integration. Its output is mapped into AlphaTrace Evidence before reaching Qwen/Native or frontend. This pattern should be required for future external providers.

Future provider checklist:

- server-side key only
- explicit timeout
- failure fallback
- evidence/source metadata
- URL/source traceability
- no raw API payload as frontend contract

## Safe Cleanup Applied In This Batch

No backend refactor was applied during M99. The risk of touching `main.py` or startup behavior is higher than the value while the current `8805 -> 8802` chain is healthy.

## Next Low-Risk Backend Work

1. Add an AlphaTrace backend profile script/runbook when legacy noise becomes blocking.
2. Add event payload validation for `alphatrace_agent_runtime_v1`.
3. Add MySQL schema status endpoint for AlphaTrace tables.
4. Add tool registry abstraction before adding more external providers.
5. Add AgentArtifact model before rendering richer tool outputs.

## Validation Note

This milestone is documentation and boundary governance only. No backend Python code changed in M99.
