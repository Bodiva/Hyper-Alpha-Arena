# Backend Boundary Audit for AlphaTrace Refactor

Status: M117 baseline.  
Date: 2026-05-05.

## Purpose

This document defines the boundary between AlphaTrace product backend code, legacy Hyper Alpha Arena modules, and optional external agent runtimes. It is the working map for the next backend refactor pass.

The goal is not to delete legacy functionality. The goal is to make AlphaTrace-owned modules explicit so future integrations such as TradingAgents, LangAlpha, professional market data providers, MCP tools, and worker schedulers can connect through stable boundaries.

## Boundary Classification

| Class | Meaning | Rule |
|---|---|---|
| AlphaTrace Core | Product-facing API, schemas, domain services, runtime, stores, runner facade. | Can be actively evolved. Frontend should consume only these contracts. |
| AlphaTrace Integration | External service clients and adapters behind AlphaTrace contracts. | Provider-specific code must not leak to frontend contracts. |
| AlphaTrace PoC Runner | Optional research/runtime engines such as TradingAgents and LangAlpha stubs. | Disabled or opt-in by default. Must map into AlphaTrace runtime schema. |
| Legacy Hyper Alpha Arena | Original crypto/trading/exchange modules. | Preserve, but do not expand as AlphaTrace core unless wrapped through a clean AlphaTrace domain boundary. |
| Shared Infrastructure | FastAPI app, database/session, config, logging, health. | Can be shared, but startup side effects must be controlled. |

## Current AlphaTrace Core Modules

### API Layer

| Module | Classification | Notes |
|---|---|---|
| `backend/api/alpha_trace_agent_runtime_routes.py` | AlphaTrace Core | Submit, detail, events, SSE, reports, evidence, decision, runner status, worker/log diagnostics. |
| `backend/api/alpha_trace_asset_routes.py` | AlphaTrace Core | Asset list/detail/evidence. |
| `backend/api/alpha_trace_evidence_routes.py` | AlphaTrace Core | Evidence list/detail/search; must support static, MySQL, Bocha/run-scoped evidence. |
| `backend/api/alpha_trace_strategy_routes.py` | AlphaTrace Core | Strategy store API. |
| `backend/api/alpha_trace_portfolio_routes.py` | AlphaTrace Core | Portfolio store API and diagnosis entry context. |
| `backend/api/alpha_trace_decision_routes.py` | AlphaTrace Core | Decision projection and attribution links. |
| `backend/api/alpha_trace_leaderboard_routes.py` | AlphaTrace Core | Runtime quality ranking, not performance ranking. |
| `backend/api/alpha_trace_market_data_routes.py` | AlphaTrace Core | AlphaTrace ETF/fund/index/future market data seed v1. |
| `backend/api/alpha_trace_data_source_routes.py` | AlphaTrace Core | Data source catalog and future provider governance. |

### Runtime / Runners

| Module | Classification | Notes |
|---|---|---|
| `backend/services/alpha_trace_agent_runtime_service.py` | AlphaTrace Core | Runtime facade; should remain the only service that API routes call for run lifecycle. |
| `backend/services/agent_runtime_store/` | AlphaTrace Core | Store abstraction and MySQL/JSON/memory implementations. |
| `backend/services/agent_runners/base.py` | AlphaTrace Core | Stable runner adapter protocol. |
| `backend/services/agent_runners/stub_runner.py` | AlphaTrace Core smoke | Deterministic validation runner. |
| `backend/services/agent_runners/qwen_runner.py` | AlphaTrace Core runner | Current Qwen/Bocha/native execution implementation; too large and should be decomposed later. |
| `backend/services/agent_runners/native_multi_agent_runner.py` | AlphaTrace Core runner | Product-facing native DAG facade. Should eventually move orchestration out of Qwen runner inheritance. |
| `backend/services/agent_runners/tradingagents_adapter.py` | AlphaTrace PoC Runner | Optional TradingAgents adapter. Keep isolated and opt-in. |
| `backend/services/agent_runners/langalpha_adapter.py` | AlphaTrace PoC Runner | Design-only external adapter placeholder. |
| `backend/services/agent_orchestrator/` | AlphaTrace Core | Runner capability/policy/subprocess boundary. Needs general orchestration interfaces. |

### Domain Stores

| Module | Classification | Notes |
|---|---|---|
| `backend/services/asset_store/` | AlphaTrace Core | Static/MySQL asset data. |
| `backend/services/evidence_retrieval/` | AlphaTrace Core + Integration | Static evidence, Bocha, support scoring, retriever. Split provider management later. |
| `backend/services/strategy_store/` | AlphaTrace Core | Static/MySQL strategy data. |
| `backend/services/portfolio_store/` | AlphaTrace Core | Static/MySQL portfolio data. |
| `backend/services/decision_store/` | AlphaTrace Core | Decision projection from AgentRun/MySQL/static seed. |
| `backend/services/leaderboard_store/` | AlphaTrace Core | Runtime quality aggregation. |
| `backend/services/market_data_store/` | AlphaTrace Core | Static market data seed. Should evolve into provider-backed data API. |
| `backend/services/data_source_store/` | AlphaTrace Core | Data provider catalog. |
| `backend/services/system_config_store/` | AlphaTrace Core | MySQL-backed runtime credentials/status. |
| `backend/services/domain_store/` | AlphaTrace Core infrastructure | MySQL domain seed/payload helper. |

### Integration Clients

| Module | Classification | Notes |
|---|---|---|
| `backend/integrations/bocha/` | AlphaTrace Integration | Backend-only web search evidence provider. Should conform to future DataProvider/ToolAdapter contract. |

## Legacy Modules To Keep Out Of AlphaTrace Core

The following route/service families are legacy unless explicitly wrapped by an AlphaTrace domain adapter:

| Area | Examples | Reason |
|---|---|---|
| Crypto exchange/trading | `binance_routes.py`, `hyperliquid_routes.py`, `hyperliquid_action_routes.py`, `order_routes.py`, `exchanges/` | Crypto/exchange semantics and side effects are not AlphaTrace MVP core. |
| AI Trader / Program Trader | `prompt_routes.py`, `prompt_backtest_routes.py`, `bot_routes.py`, `trader_data_routes.py` | Valuable history, but contracts do not match evidence-first AgentRun model. |
| Legacy market streams | BTC fetch / Hyperliquid strategy logs | Startup noise and runtime coupling. Should be disabled by AlphaTrace-only profile later. |
| Legacy analytics/factors/signals | `analytics_routes.py`, `factor_routes.py`, `signal_routes.py` | Can be mined for ideas, but should not be directly exposed as AlphaTrace research API. |

## Current Pain Points

1. `qwen_runner.py` contains prompt construction, tool events, evidence retrieval, market context, streaming, parsing, decision mapping, token metrics, persistence callbacks, and fallback behavior in one large module.
2. Tool invocation semantics are still partly event-payload based rather than governed by a tool registry interface.
3. Data providers are service-specific: Bocha and static market data do not share a provider contract.
4. Async task management exists as ad hoc background threads/subprocess orchestration, not a unified scheduler/status machine.
5. TradingAgents and LangAlpha boundaries are documented but not represented by a generic external workbench abstraction.
6. MySQL is present for runtime/domain/config, but not every store has the same read/write/health surface.
7. Legacy startup side effects still create BTC/Hyperliquid logs; deferred, but should be bounded by profile later.

## Refactor Direction

The next refactor should introduce additive contracts before rewiring behavior:

1. `integration_adapters`: common protocol for data providers, model providers, tool adapters, and external workbench adapters.
2. `async_tasks`: common task status/spec/result protocol for in-process, subprocess, and future durable workers.
3. `agent_orchestrator.base`: orchestration plan/step contracts independent of Qwen, TradingAgents, or LangAlpha.
4. `tool_registry`: provider metadata, auth mode, timeout, retry, redaction, evidence/artifact mapping.
5. `artifact_model`: future report/table/chart/file preview contract separate from raw events.

## Immediate Non-Goals

1. Do not move all existing runner code in one pass.
2. Do not introduce Celery/Redis/Docker changes in this boundary pass.
3. Do not import LangAlpha or copy its code.
4. Do not expose TradingAgents/LangAlpha internal state to the frontend.
5. Do not refactor legacy crypto services until the AlphaTrace-only startup profile is explicitly prioritized.

## Acceptance For This Audit

1. AlphaTrace Core vs Legacy vs Integration boundaries are clear.
2. Future provider/runner/workbench abstractions have a defined place.
3. The plan supports TradingAgents and LangAlpha without making either the main backend.
4. The next implementation step can add interfaces without runtime behavior changes.
