# AlphaTrace Project Spec

Last updated: 2026-05-02

This document is the canonical product and engineering specification for AlphaTrace. Historical documents under `docs/engineering/` remain useful context, but future execution should resolve conflicts in favor of this file and `docs/EXECUTION_PLAN.md`.

## Product Goal

AlphaTrace is a commercial-grade agentic investment research workbench for evidence-aware, replayable, and auditable research workflows.

The product should let a user:

1. Browse assets, evidence, strategies, portfolios, decisions, and runtime quality rankings.
2. Submit investment research tasks to controlled agent runners.
3. Observe agent progress through runtime events, SSE, live output, reports, evidence references, and final decisions.
4. Replay completed runs and inspect why a recommendation was made.
5. Gradually replace static seed data and JSON persistence with governed domain data and MySQL-backed product storage.

## Non-Goals

AlphaTrace must not become a crypto trading bot or a thin wrapper around an external agent framework.

Current non-goals:

1. No real trading execution.
2. No broker or exchange order placement from AlphaTrace MVP flows.
3. No direct exposure of TradingAgents internal state to the frontend.
4. No direct copying of TradingAgents or LangAlpha code into Hyper-Alpha-Arena.
5. No expansion of legacy Hyperliquid / Binance / crypto modules as the AlphaTrace core backend.
6. No claim that runtime quality ranking is realized investment performance.
7. No production multi-tenant permission model until the persistence layer is redesigned.

## Current State

Completed capabilities:

1. Qwen runner with async submit, SSE runtime events, live output, reports, evidence, decision, and JSON store persistence.
2. Bocha search adapter as optional backend-only external evidence source.
3. Evidence id validation and semantic support scoring design.
4. Asset, Evidence, Strategy, Portfolio, Decision, and Leaderboard APIs in real mode.
5. Portfolio Diagnosis Agent Task.
6. Settings support for server-side runtime credentials.
7. TradingAgents opt-in PoC adapter with local venv validation and LangGraph observability.
8. LangAlpha backend deconstruction and adapter boundary design.

Known limitations:

1. JSON store remains the MVP persistence fallback, not production storage.
2. Static seed data remains the default for many domain objects.
3. TradingAgents integration is PoC-level and not production stable.
4. Legacy backend startup still runs crypto market stream and strategy services unless explicitly refactored.
5. Evidence semantic support is currently id-level plus design documentation, not claim-level semantic verification.

## Technical Constraints

1. MySQL 8.0+ is the target production database for AlphaTrace product data.
2. MySQL JSON columns may be used for flexible payloads; query-critical fields must also be stored as typed columns or generated/indexable columns.
3. JSON store must remain available as local development fallback until MySQL store is stable.
4. Frontend API contracts must continue to expose AlphaTrace schemas only.
5. Runner adapters may execute Qwen, TradingAgents, LangAlpha, or custom engines, but they must map outputs into AlphaTrace schemas.
6. API keys must remain backend-only. Frontend must never store or transmit raw provider keys except through approved server-side credential settings.
7. Each milestone must be independently testable and reversible.

## Canonical Backend Direction

The long-term backend is AlphaTrace-owned:

1. API layer: asset, evidence, strategy, portfolio, decision, leaderboard, market data, agent runtime, model config, workspace/auth.
2. Domain services: stable business logic and schema mapping.
3. Domain stores: MySQL-backed implementations with JSON fallback during transition.
4. Agent runtime: submit, status, events, reports, evidence refs, decisions, SSE, cancellation, retry, timeout.
5. Runner adapters: Stub, Qwen, TradingAgents, LangAlpha, Custom.
6. Integrations: model providers, external evidence/data providers, file ingestion, market data providers.

TradingAgents remains an in-process runner adapter candidate. LangAlpha remains an architecture reference and possible external service adapter candidate.

## Final Deliverables

AlphaTrace is considered commercially reviewable when it has:

1. MySQL-backed AgentRunStore.
2. MySQL-backed domain stores for core AlphaTrace objects.
3. Stable Agent Runtime status machine and worker model.
4. Controlled Qwen and TradingAgents runner paths.
5. ETF / fund / index market data domain independent of legacy crypto runtime.
6. Evidence governance with source validation and semantic support scoring.
7. Demo path that can be run from Docker or local real mode.
8. Documentation for startup, validation, limitations, and operational risks.

## Source of Truth

Use these files for future execution:

0. `docs/ARCHITECTURE.md` for full-stack frontend/backend/runtime/store architecture.

1. `docs/PROJECT_SPEC.md` for goals and constraints.
2. `docs/EXECUTION_PLAN.md` for milestone order.
3. `docs/IMPLEMENTATION_LOG.md` for current state and decisions.
4. `docs/VALIDATION.md` for required verification.



