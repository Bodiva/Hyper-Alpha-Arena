# AlphaTrace Implementation Log

Last updated: 2026-05-02

This is the canonical progress log for AlphaTrace. Older logs in the repository root and `docs/engineering/14_runtime_validation_report.md` remain historical records.

## Current State

Current milestone: `M41 - MySQL Configuration Re-save Awaiting User Key`

Status: Done

Next milestone: `M42 - System Config Admin and Diagnostics Cleanup`

## Completed Work Summary

### MVP Tasks 36-45

Completed:

1. Portfolio Diagnosis Agent Task.
2. Decision Store/API and Decision Attribution real mode.
3. Leaderboard Runtime Quality real mode.
4. Agent Runtime error handling improvements.
5. Bocha Search Adapter and evidence retrieval integration.
6. Demo closed-loop documentation.
7. Qwen JSON structured output enhancement.
8. Evidence reference id validation.
9. Evidence semantic support scoring design.
10. TradingAgents adapter design and stub.
11. AlphaTrace MVP freeze documentation.

Validation summary:

1. Backend py_compile passed for changed backend files during the relevant tasks.
2. `pnpm build` passed with existing Vite chunk/dynamic import/browserslist warnings.
3. Qwen runner, Stub runner, SSE, JSON store, and real mode pages remained functional during MVP validation.

### TradingAgents PoC

Completed:

1. `runnerType=tradingagents` opt-in adapter.
2. Lazy import from sibling repo or installed package.
3. Disabled and import-failure behavior returns clear HTTP 400.
4. Local venv validation with TradingAgents dependencies installed.
5. Offline SPY PoC completed once with AlphaTrace schema mapping.
6. LangGraph stream observability added to AlphaTrace runtime events.
7. Backend runtime log tail endpoint added for local debugging.

Important result:

TradingAgents can be used as a PoC runner, but it remains non-production and can be noisy/slow because upstream model/tool execution is real.

Known issue:

Backend Runtime Log currently tails the global backend stdout file, so legacy BTC/Hyperliquid logs appear alongside AlphaTrace/TradingAgents logs.

Root cause:

1. `backend/main.py` starts all legacy services.
2. `services/startup.py` starts the market data stream.
3. `services/market_stream.py` polls symbols such as BTC.
4. `services/trading_strategy.py` periodically reloads Hyperliquid strategy configs.

Decision:

Do not treat those BTC logs as TradingAgents output. M1 should separate current-run observability from global backend logs.

### LangAlpha Research

Completed:

1. LangAlpha backend deconstruction.
2. TradingAgents vs LangAlpha comparison.
3. LangAlpha adapter design.
4. Disabled `runnerType=langalpha` stub.

Decision:

LangAlpha is a product-style agent workbench reference and possible external service adapter candidate. It should not be embedded into AlphaTrace as an in-process runner during the current phase.

### Database Direction

Previous historical docs recommended PostgreSQL. The canonical direction is now MySQL 8.0+.

Assumptions:

1. MySQL JSON columns can store flexible payloads.
2. Query-critical fields must be regular typed columns or generated/indexable columns.
3. JSON store remains a local fallback until MySQL migration is complete.
4. Existing legacy SQLAlchemy/PostgreSQL-like paths are not automatically migrated in M0.

## M0 Completion Record

Date: 2026-05-02

Goal:

Create canonical project governance files and fix MySQL as the target database direction.

Files added:

1. `docs/PROJECT_SPEC.md`
2. `docs/EXECUTION_PLAN.md`
3. `docs/IMPLEMENTATION_LOG.md`
4. `docs/VALIDATION.md`

Additional repository metadata change:

1. `.gitignore` keeps the broad `docs/*.md` ignore rule.
2. Exact exceptions were added for the four canonical governance files so they can be committed.

Validation:

1. File existence verified.
2. `PROJECT_SPEC.md` contains MySQL 8.0+ target.
3. `EXECUTION_PLAN.md` and `VALIDATION.md` use matching milestone ids M0-M8.
4. Git recognizes the four canonical governance files as untracked, not ignored.
5. No backend code changed.
6. No frontend code changed.
7. No Docker or package.json changed.

Result:

M0 is complete. Proceed to M1.

## Next Step

Execute `M3 - AgentRunStore MySQL Migration`.

Recommended M3 implementation direction:

1. Inspect current database driver/dependency support before implementing.
2. Prefer a MySQL store behind the existing AgentRunStore interface.
3. Keep JSON store fallback.
4. Do not change API response shapes.

## M1 Completion Record

Date: 2026-05-02

Goal:

Make TradingAgents / LangGraph observability usable without legacy BTC / Hyperliquid logs dominating the AgentRunDetail page.

Files changed:

1. `frontend/app/pages/AgentRunDetailPage.tsx`
2. `docs/EXECUTION_PLAN.md`
3. `docs/IMPLEMENTATION_LOG.md`

Behavior change:

1. Backend Runtime Log is now described as a global backend log.
2. Default filter is `AlphaTrace`, which hides legacy BTC market stream and Hyperliquid strategy refresh noise.
3. Users can switch between `AlphaTrace`, `Current Run`, and `All Global Logs`.
4. Raw global logs remain accessible for legacy backend debugging.

Validation:

1. `cd frontend && pnpm build` passed.
2. Existing Vite chunk/dynamic import/browserslist warnings remain.
3. No backend Python files changed, so no py_compile was required.
4. No Docker or package.json changed.

Result:

M1 is complete. Proceed to M2.

## M2 Completion Record

Date: 2026-05-02

Goal:

Create AlphaTrace-owned ETF / fund / index market data APIs backed by static seed data, independent from legacy BTC / Hyperliquid runtime.

Files changed:

1. `backend/api/alpha_trace_market_data_routes.py`
2. `backend/schemas/alpha_trace_market_data.py`
3. `backend/services/market_data_store/__init__.py`
4. `backend/services/market_data_store/static_market_data_seed.py`
5. `backend/services/market_data_store/market_data_store.py`
6. `backend/services/agent_runners/qwen_runner.py`
7. `backend/main.py`
8. `docs/EXECUTION_PLAN.md`
9. `docs/IMPLEMENTATION_LOG.md`

Behavior change:

1. Added `/api/alpha-trace/market-data/assets/{assetId}/quote`.
2. Added `/api/alpha-trace/market-data/assets/{assetId}/snapshot`.
3. Added `/api/alpha-trace/market-data/assets/{assetId}/klines`.
4. Added `/api/alpha-trace/market-data/assets/{assetId}/indicators`.
5. Qwen runner now attempts to load AlphaTrace static market context for `assetId` and injects it into the prompt as `marketContext`.
6. Market context load failure is non-fatal.

Validation:

1. `python -m py_compile backend/api/alpha_trace_market_data_routes.py backend/schemas/alpha_trace_market_data.py backend/services/market_data_store/static_market_data_seed.py backend/services/market_data_store/market_data_store.py backend/services/agent_runners/qwen_runner.py backend/main.py` passed.
2. FastAPI TestClient smoke passed for quote, snapshot, klines, and indicators for `asset_etf_510300`.
3. No frontend files changed, so `pnpm build` was not required for M2.
4. No Docker or package.json changed.

Result:

M2 is complete. Proceed to M3.

## M3 Completion Record

Date: 2026-05-02

Goal:

Move AlphaTrace AgentRun runtime persistence behind a MySQL-backed store while preserving JSON fallback.

Assumptions:

1. MySQL 8.0+ is the canonical future production database for AlphaTrace.
2. Legacy Hyper Alpha Arena database wiring still uses PostgreSQL and is not replaced in this milestone.
3. `ALPHA_TRACE_AGENT_RUN_STORE=json` remains the default MVP behavior unless explicitly set to `mysql`.

Files changed:

1. `backend/pyproject.toml`
2. `docker-compose.yml`
3. `backend/services/agent_runtime_store/mysql_store.py`
4. `backend/services/agent_runtime_store/registry.py`
5. `docs/EXECUTION_PLAN.md`
6. `docs/IMPLEMENTATION_LOG.md`

Behavior change:

1. Added optional MySQL 8.0 service in Docker Compose with volume `mysql_data`.
2. Added host port mapping `127.0.0.1:${ALPHA_TRACE_MYSQL_PORT:-3307}:3306` to avoid conflicts with local MySQL on 3306.
3. Added `ALPHA_TRACE_MYSQL_DATABASE_URL` for the app service.
4. Added `MysqlAgentRunStore` implementing the existing AgentRunStore interface.
5. Store type `ALPHA_TRACE_AGENT_RUN_STORE=mysql` or `db` now resolves to `MysqlAgentRunStore`.
6. JSON and memory stores remain available.

Validation:

1. `docker compose config --quiet` passed.
2. `docker compose up -d mysql` passed after moving the host port from 3306 to default 3307.
3. Installed local verification dependency `pymysql==1.1.3`; the formal backend dependency is also recorded in `backend/pyproject.toml`.
4. `python -m py_compile backend/services/agent_runtime_store/mysql_store.py backend/services/agent_runtime_store/registry.py backend/services/alpha_trace_agent_runtime_service.py` passed.
5. Direct MySQL store smoke passed for save/get/list/update of AgentRun, events, reports, evidence, and decision.
6. `docker compose restart mysql` passed and the smoke run remained queryable afterward.
7. Registry smoke with `ALPHA_TRACE_AGENT_RUN_STORE=mysql` returned `MysqlAgentRunStore` and could read the smoke run.

Issues fixed during M3:

1. `AgentDecision` does not have a `decisionId` field, so MySQL decision persistence now uses `decision_{runId}` as the table key.
2. Decision upsert now keys by `run_id` without passing duplicate `run_id` in insert values.
3. Docker host port default changed from 3306 to 3307 because 3306 was unavailable on this machine.

Result:

M3 is complete at the AgentRunStore layer. Proceed to M4.

## M4 Completion Record

Date: 2026-05-02

Goal:

Move AlphaTrace domain seed data toward MySQL-backed stores without changing API response shapes or breaking the current static fallback.

Assumptions:

1. `ALPHA_TRACE_DOMAIN_STORE=static` remains the default for low-risk local development.
2. `ALPHA_TRACE_DOMAIN_STORE=mysql` enables the MySQL-backed domain store for Asset, Evidence, Strategy, and Portfolio APIs.
3. Decision Store remains projected from AgentRunStore decisions for this milestone; when AgentRunStore is MySQL, Decision API can read MySQL-backed AgentRun decisions.
4. DataSource is represented by a MySQL table but does not yet have a public API.

Files changed:

1. `backend/services/domain_store/__init__.py`
2. `backend/services/domain_store/mysql_domain_store.py`
3. `backend/services/asset_store/asset_store.py`
4. `backend/services/evidence_retrieval/evidence_store.py`
5. `backend/services/strategy_store/strategy_store.py`
6. `backend/services/portfolio_store/portfolio_store.py`
7. `docs/EXECUTION_PLAN.md`
8. `docs/IMPLEMENTATION_LOG.md`

Behavior change:

1. Added MySQL tables for `alpha_trace_assets`, `alpha_trace_evidence_items`, `alpha_trace_strategies`, `alpha_trace_portfolios`, and `alpha_trace_data_sources`.
2. Added startup seed-on-empty behavior for the MySQL domain store.
3. Existing Asset/Evidence/Strategy/Portfolio APIs can read from MySQL when `ALPHA_TRACE_DOMAIN_STORE=mysql`.
4. Static seed fallback remains the default and requires no MySQL.
5. No frontend API shape changed.

Validation:

1. `python -m py_compile backend/services/domain_store/mysql_domain_store.py backend/services/asset_store/asset_store.py backend/services/evidence_retrieval/evidence_store.py backend/services/strategy_store/strategy_store.py backend/services/portfolio_store/portfolio_store.py backend/api/alpha_trace_asset_routes.py backend/api/alpha_trace_evidence_routes.py backend/api/alpha_trace_strategy_routes.py backend/api/alpha_trace_portfolio_routes.py` passed.
2. Direct MySQL domain store smoke passed for assets, evidence, strategies, portfolios, portfolio assets, and strategy evidence.
3. FastAPI TestClient smoke passed for 15 existing Asset/Evidence/Strategy/Portfolio endpoints under `ALPHA_TRACE_DOMAIN_STORE=mysql`.
4. `docker compose restart mysql` passed and domain seed data remained queryable afterward.
5. `cd frontend && pnpm build` passed with existing Vite chunk/dynamic import/browserslist warnings.

Result:

M4 is complete. Proceed to M5.

## M5 Completion Record

Date: 2026-05-02

Goal:

Add a minimal Agent Runtime stability layer without replacing the existing background-thread runner execution model.

Assumptions:

1. This milestone does not introduce Celery, Redis, or a durable worker queue.
2. Cancellation is cooperative: it marks the run as cancelled and prevents later status transitions from overriding the terminal status, but it does not kill an already-running model call.
3. Retry reconstructs a best-effort SubmitAgentRunRequest from the persisted AgentRun because the original request payload is not yet stored as a first-class field.

Files changed:

1. `backend/services/agent_runtime_status_machine.py`
2. `backend/services/agent_runtime_store/memory_store.py`
3. `backend/services/agent_runtime_store/mysql_store.py`
4. `backend/services/alpha_trace_agent_runtime_service.py`
5. `backend/api/alpha_trace_agent_runtime_routes.py`
6. `backend/schemas/alpha_trace_agent_runtime.py`
7. `docs/EXECUTION_PLAN.md`
8. `docs/IMPLEMENTATION_LOG.md`

Behavior change:

1. Added explicit terminal status handling for `completed`, `failed`, and `cancelled`.
2. Added event type `agent.run.cancelled`.
3. Added `POST /api/alpha-trace/agent-runs/{runId}/cancel`.
4. Added `POST /api/alpha-trace/agent-runs/{runId}/retry`.
5. Added SSE reconnect cursor query: `/events/stream?after=<sequence>`.
6. Store status updates now map cancelled runs to failed agent-card status while preserving run status as `cancelled`.

Validation:

1. `python -m py_compile backend/services/agent_runtime_status_machine.py backend/services/agent_runtime_store/memory_store.py backend/services/agent_runtime_store/json_store.py backend/services/agent_runtime_store/mysql_store.py backend/services/alpha_trace_agent_runtime_service.py backend/api/alpha_trace_agent_runtime_routes.py backend/schemas/alpha_trace_agent_runtime.py` passed.
2. TestClient smoke passed for cancel endpoint, cancelled event persistence, SSE after-cursor endpoint, and retry endpoint.
3. The first TestClient attempt failed because local Python lacks `psycopg2` and route import initializes legacy PostgreSQL engine. Retried with temporary `DATABASE_URL=sqlite:///./m5_smoke.db`, which passed. This is recorded as a local validation environment issue, not runtime code failure.
4. No frontend files changed, so `pnpm build` was not required for M5.

Known limitations:

1. Cancellation does not interrupt an in-flight Qwen or TradingAgents call.
2. Retry does not preserve the exact original prompt/evidenceScope/runnerConfig except for a best-effort retry metadata field.
3. Durable worker queues, global concurrency limits, and timeout categories remain for later hardening.

Result:

M5 is complete. Proceed to M6.

## M6 Completion Record

Date: 2026-05-02

Goal:

Stabilize the TradingAgents PoC adapter enough for repeatable local validation and clear failure behavior.

Assumptions:

1. TradingAgents remains an opt-in runner and is not a production dependency.
2. The local environment does not currently have `DASHSCOPE_API_KEY`, so enabled PoC validation is expected to end in a durable failed run rather than a completed model run.
3. China ETF symbols such as `510300.SH` are not passed directly to TradingAgents by default because the PoC target is US stock/ETF ticker semantics.

Files changed:

1. `backend/services/agent_runners/tradingagents_adapter.py`
2. `backend/services/agent_runtime_store/json_store.py`
3. `docs/EXECUTION_PLAN.md`
4. `docs/IMPLEMENTATION_LOG.md`

Behavior change:

1. TradingAgents ticker mapping now falls back to `SPY` for non-US ticker-style symbols such as `510300.SH`, with a runtime event explaining the fallback.
2. TradingAgents qwen provider now fails with a clear `DASHSCOPE_API_KEY` configuration message before invoking the graph client.
3. JSON AgentRunStore now serializes file persistence with the store lock and uses process-specific temp files plus short retries to avoid Windows `os.replace` PermissionError during background writes.

Validation:

1. Installed local validation dependency `langgraph-checkpoint-sqlite>=2.0.0` because TradingAgents declares it and import previously failed with `No module named 'langgraph.checkpoint.sqlite'`.
2. `TradingAgentsGraph` import smoke passed from the sibling TradingAgents repository.
3. Disabled smoke passed: `runnerType=tradingagents` returns HTTP 400 with `not enabled` when `ALPHATRACE_TRADINGAGENTS_ENABLED=false`.
4. Import/path failure smoke passed: invalid `TRADINGAGENTS_REPO_PATH` returns HTTP 400 with a clear path error.
5. Enabled SPY PoC smoke passed in durable-failure mode: submit returned a runId immediately, run reached `failed`, and detail/events/reports/evidence/decision were queryable.
6. Stub regression passed.
7. `python -m py_compile backend/services/agent_runtime_store/json_store.py backend/services/agent_runners/tradingagents_adapter.py backend/services/alpha_trace_agent_runtime_service.py backend/schemas/alpha_trace_agent_runtime.py` passed.
8. No frontend files changed, so `pnpm build` was not required for M6.

Known limitations:

1. Full TradingAgents completion still requires a valid model key and compatible provider configuration.
2. TradingAgents graph streaming is best-effort and still depends on upstream LangGraph chunk shape.
3. JSON store is safer after this fix but still not the production persistence target; MySQL should be preferred for durable runtime storage.

Result:

M6 is complete. Proceed to M7.

## M7 Completion Record

Date: 2026-05-02

Goal:

Move beyond id-level evidence validation with a minimal rule-based claim support score.

Assumptions:

1. This milestone does not use embeddings, vector DB, or LLM-as-judge.
2. Rule-based support scoring is a lightweight signal for review, not a proof that a claim is true.
3. Existing id-level evidence reference validation remains the authoritative filter for invalid evidenceIds.

Files changed:

1. `backend/services/evidence_retrieval/support_scoring.py`
2. `backend/services/agent_runners/qwen_runner.py`
3. `docs/EXECUTION_PLAN.md`
4. `docs/IMPLEMENTATION_LOG.md`

Behavior change:

1. Added claim extraction from generated report text.
2. Added rule-based evidence support scoring using evidenceId citation presence and keyword overlap against evidence title/summary/source/type.
3. Qwen mapped runs now include `evidenceSupportScore`, `evidenceSupportStatus`, claim-level scores, unsupported claims, and weak claims in `evidence.linked` and `decision.updated` runtime event payloads.
4. Weak/partial/unsupported support emits a `risk.warning` event from `Evidence Support Scorer`.
5. Final decision risks include a short rule-based support status note so Decision Attribution can surface the limitation through existing fields.

Validation:

1. `python -m py_compile backend/services/evidence_retrieval/support_scoring.py backend/services/agent_runners/qwen_runner.py backend/schemas/alpha_trace_agent_runtime.py` passed.
2. Synthetic support scoring smoke passed with partial support result.
3. Synthetic Qwen mapper smoke passed: completed run included evidence support payloads and decision risk note.
4. No frontend files changed, so `pnpm build` was not required for M7.

Known limitations:

1. Chinese semantic matching is still shallow and keyword-based.
2. Unsupported claim detection can under-detect paraphrases or over-warn on terse evidence summaries.
3. Evidence support is stored in runtime event payloads and decision risk text, not yet as first-class DB fields.

Result:

M7 is complete. Proceed to M8.

## M8 Completion Record

Date: 2026-05-02

Goal:

Freeze the current commercial backend increment after M0-M7 and prepare it for review.

Files changed:

1. `docs/engineering/30_alphatrace_phase2_backend_increment_freeze.md`
2. `docs/EXECUTION_PLAN.md`
3. `docs/IMPLEMENTATION_LOG.md`

Validation:

1. `python -m py_compile backend/services/agent_runtime_status_machine.py backend/services/agent_runtime_store/memory_store.py backend/services/agent_runtime_store/json_store.py backend/services/agent_runtime_store/mysql_store.py backend/services/domain_store/mysql_domain_store.py backend/services/asset_store/asset_store.py backend/services/evidence_retrieval/evidence_store.py backend/services/evidence_retrieval/support_scoring.py backend/services/strategy_store/strategy_store.py backend/services/portfolio_store/portfolio_store.py backend/services/agent_runners/qwen_runner.py backend/services/agent_runners/tradingagents_adapter.py backend/services/alpha_trace_agent_runtime_service.py backend/api/alpha_trace_agent_runtime_routes.py backend/api/alpha_trace_market_data_routes.py backend/schemas/alpha_trace_agent_runtime.py backend/schemas/alpha_trace_market_data.py backend/main.py` passed.
2. `cd frontend && pnpm build` passed.
3. Existing frontend warnings remain: stale browserslist/baseline data, dynamic/static import chunking warnings, and large bundle size warning.

Result:

M8 is complete. The current phase is frozen for review. Do not continue feature expansion until architecture/product review confirms the next phase.

## Post-M8 UI Configuration Fix

Date: 2026-05-02

Goal:

Address two operator-facing clarity issues without changing runtime backend behavior.

Files changed:

1. `frontend/app/pages/AgentRunDetailPage.tsx`
2. `frontend/app/pages/SettingsPage.tsx`
3. `docs/IMPLEMENTATION_LOG.md`

Behavior change:

1. AgentRunDetail right-side cards now show `Evidence Used` before `Tool Calls Timeline`, so evidence is closer to the report/decision reading flow.
2. Settings runtime credential panel now labels the Qwen key field as `DASHSCOPE_API_KEY`.
3. Settings copy now explicitly states that the saved Qwen/DashScope key is stored server-side through Hyper AI profile and reused by TradingAgents PoC before falling back to server environment variables.

Validation:

1. `cd frontend && pnpm build` passed.
2. Existing frontend warnings remain: stale Baseline/Browserslist data, dynamic/static import chunking warnings, and large bundle size warning.

Notes:

1. No backend files changed.
2. TradingAgents output is not a frontend mock. When enabled, the adapter runs TradingAgents/LangGraph and uses static offline AlphaTrace data to replace external data tools by default; model generation still requires a valid Qwen/DashScope key.

## M9 Completion Record

Date: 2026-05-02

Goal:

Standardize TradingAgents PoC runtime diagnostics so operators can tell whether the current backend process can run TradingAgents and whether Settings-stored Qwen credentials are reusable.

Assumptions:

1. This milestone does not package TradingAgents into Docker.
2. TradingAgents remains an optional runner adapter.
3. Frontend must not display secret values.

Files changed:

1. `backend/api/alpha_trace_agent_runtime_routes.py`
2. `frontend/app/entities/agent/api.ts`
3. `frontend/app/pages/AgentLabPage.tsx`
4. `docs/EXECUTION_PLAN.md`
5. `docs/VALIDATION.md`
6. `docs/engineering/22_tradingagents_poc_runtime_validation.md`
7. `docs/IMPLEMENTATION_LOG.md`

Behavior change:

1. `/api/alpha-trace/agent-runs/runners/status` now reports TradingAgents status as `disabled`, `import_error`, `missing_qwen_key`, or `ready`.
2. The same endpoint reports `repoPathConfigured`, `repoPathExists`, `repoPath`, `importable`, `importError`, `qwenKeyConfigured`, and `qwenConfigSource`.
3. Agent Lab Runner Runtime Status displays TradingAgents repo/import/Qwen key diagnostics without exposing API keys.
4. Qwen/Stub runner behavior is unchanged.

Validation:

1. `python -m py_compile backend/api/alpha_trace_agent_runtime_routes.py` passed.
2. Direct route smoke passed:
   - disabled mode returned `tradingagents.status=disabled`.
   - enabled mode with bad repo path and dummy environment key returned `tradingagents.status=import_error`, `importable=false`, `qwenConfigSource=environment`.
3. `cd frontend && pnpm build` passed.
4. Full FastAPI TestClient startup was blocked by legacy snapshot PostgreSQL dependency requiring `psycopg2`; this is a legacy app startup dependency and not caused by the M9 route change.

Known limitations:

1. Docker still does not package TradingAgents dependencies.
2. A Settings-saved Qwen key is reusable by TradingAgents only when the TradingAgents submit hits the same backend process/config store that can read the Hyper AI profile.
3. Local venv and Docker backend can diverge if they use different DB/config sources.

Result:

M9 is complete. Recommended next milestone is M10: decide whether to package TradingAgents into a Docker profile or keep it as local-vendored PoC only.

## M10 Completion Record

Date: 2026-05-02

Goal:

Create a repeatable local operating kit for TradingAgents PoC without changing Docker or TradingAgents source code.

Files changed:

1. `scripts/alphatrace/start_tradingagents_backend.ps1`
2. `scripts/alphatrace/check_tradingagents_status.ps1`
3. `scripts/alphatrace/submit_tradingagents_spy_poc.ps1`
4. `docs/EXECUTION_PLAN.md`
5. `docs/VALIDATION.md`
6. `docs/engineering/22_tradingagents_poc_runtime_validation.md`
7. `docs/IMPLEMENTATION_LOG.md`

Behavior:

1. Added a local backend start script for TradingAgents-enabled AlphaTrace on port `8812`.
2. Added a runner status check script.
3. Added a SPY offline PoC submit script.
4. Scripts use existing environment variables and backend server-side credentials; they do not write API keys.

Validation:

1. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/start_tradingagents_backend.ps1 -DryRun` passed.
2. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/check_tradingagents_status.ps1 -DryRun` passed.
3. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/submit_tradingagents_spy_poc.ps1 -DryRun` passed.
4. `python -m py_compile backend/api/alpha_trace_agent_runtime_routes.py` passed.

Decision:

TradingAgents remains local-vendored PoC for now. Docker packaging is deferred to a future explicit Docker profile decision.

Result:

M10 is complete. Proceed to M11: AlphaTrace Market Data Frontend Visibility.

## M11 Completion Record

Date: 2026-05-02

Goal:

Expose the AlphaTrace static ETF / fund / index market-data API in Asset Detail real mode without touching legacy BTC / Kline / crypto pages.

Files changed:

1. `frontend/app/shared/api/endpoints.ts`
2. `frontend/app/entities/asset/api.ts`
3. `frontend/app/pages/AssetDetailPage.tsx`
4. `docs/EXECUTION_PLAN.md`
5. `docs/VALIDATION.md`
6. `docs/IMPLEMENTATION_LOG.md`

Behavior:

1. Asset real-mode API client now has quote, snapshot, kline, and indicator endpoint helpers.
2. Asset Detail real mode now loads quote, snapshot, and indicator data for the selected asset.
3. Asset Detail shows a compact `AlphaTrace Market Data v1` panel with static quote, valuation, liquidity, volatility, trend, fund-flow, and indicator summaries.
4. The panel explicitly says the data is AlphaTrace static seed data, not legacy BTC feed and not real-time market data.
5. Mock mode remains unchanged.

Validation:

1. `python -m py_compile backend/api/alpha_trace_market_data_routes.py backend/schemas/alpha_trace_market_data.py backend/services/market_data_store/market_data_store.py backend/services/market_data_store/static_market_data_seed.py` passed.
2. Direct backend function smoke passed:
   - `asset_etf_510300` quote returned `symbol=510300.SH`, `price=4.128`.
   - indicators returned `indicatorCount=4`.
3. `cd frontend && pnpm build` passed.
4. Curl against currently running `8802` / `8812` returned 404 for the new market-data endpoints. This indicates the active backend processes are stale or not running the current route set; the backend modules themselves compile and smoke-test correctly.

Known limitations:

1. Active Docker/local backend must be restarted with the current code before the new market-data endpoints are visible over HTTP.
2. Market data is still static seed data, not external行情 or real-time feed.
3. This milestone intentionally does not modify legacy BTC / Hyperliquid / Kline runtime.

Result:

M11 is complete at code/build/module-smoke level. Runtime HTTP visibility requires restarting the active backend process.

## M12 Completion Record

Date: 2026-05-02

Goal:

Make active backend route availability explicit so Docker / local / Vite real-mode validation does not confuse stale backend processes with code failures.

Files changed:

1. `scripts/alphatrace/check_active_backend_routes.ps1`
2. `docs/EXECUTION_PLAN.md`
3. `docs/VALIDATION.md`
4. `docs/IMPLEMENTATION_LOG.md`

Behavior:

1. Added a read-only PowerShell route smoke script.
2. The script checks health, runner status, assets, asset evidence, market data, evidence, decisions, leaderboard, and portfolios.
3. The script supports configurable `-BaseUrl`, `-DryRun`, and optional `-FailOnMissing`.
4. It does not submit agent runs or mutate backend state.

Validation:

1. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/check_active_backend_routes.ps1 -DryRun` passed.
2. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/check_active_backend_routes.ps1 -BaseUrl http://127.0.0.1:8812/api` ran successfully and reported:
   - 9/12 routes available.
   - Market-data quote/snapshot/indicators routes returned 404.
3. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/check_active_backend_routes.ps1 -BaseUrl http://127.0.0.1:8802/api` ran successfully and reported:
   - 8/12 routes available.
   - runner status and market-data routes returned 404.
4. Starting a current-code local backend on `8813` with explicit local Postgres URLs succeeded:
   - `DATABASE_URL=postgresql://alpha_user:alpha_pass@127.0.0.1:5432/alpha_arena`
   - `SNAPSHOT_DATABASE_URL=postgresql://alpha_user:alpha_pass@127.0.0.1:5432/alpha_snapshots`
5. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/check_active_backend_routes.ps1 -BaseUrl http://127.0.0.1:8813/api` passed with 12/12 routes available.

Conclusion:

The active `8802` and original `8812` backend processes were not serving the full current AlphaTrace route set. A fresh current-code backend on `8813` serves all checked routes, confirming the earlier 404s were runtime-process consistency issues rather than market-data code failures.

Result:

M12 is complete. For browser validation against current code, point Vite real mode to `http://127.0.0.1:8813/api` or restart/recreate the preferred backend port with the same local Postgres `DATABASE_URL` override.

## M13 Completion Record

Date: 2026-05-02

Goal:

Provide a repeatable local Vite real-mode startup path that points the frontend at the current-code backend instead of stale Docker/local ports.

Files changed:

1. `scripts/alphatrace/start_vite_real_mode.ps1`
2. `docs/EXECUTION_PLAN.md`
3. `docs/VALIDATION.md`
4. `docs/IMPLEMENTATION_LOG.md`

Behavior:

1. Added a PowerShell helper for Vite real mode.
2. Defaults:
   - `VITE_ALPHA_TRACE_API_MODE=real`
   - `VITE_ALPHA_TRACE_API_BASE_URL=http://127.0.0.1:8813/api`
   - Vite port `8804`
3. The helper does not print or store API keys.

Validation:

1. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/start_vite_real_mode.ps1 -DryRun` passed.
2. No frontend source files were changed in M13, so the previous M11 `pnpm build` result remains applicable.

Result:

M13 is complete. Recommended local validation sequence is:

1. Start current-code backend on `8813` with local Postgres `DATABASE_URL` overrides.
2. Run `scripts/alphatrace/check_active_backend_routes.ps1 -BaseUrl http://127.0.0.1:8813/api`.
3. Start Vite real mode with `scripts/alphatrace/start_vite_real_mode.ps1`.

Runtime note:

1. Existing `8804` Vite process was already running and pointed to `http://127.0.0.1:8812/api`.
2. A new Vite real-mode process was started on `8805` with `VITE_ALPHA_TRACE_API_BASE_URL=http://127.0.0.1:8813/api`.
3. `http://127.0.0.1:8805/dashboard` returned HTTP 200, and served `api-config.ts` confirms `API_BASE_URL=http://127.0.0.1:8813/api`.

## Hotfix - Dashboard Real Mode Blank Page

Date: 2026-05-02

Issue:

`http://127.0.0.1:8805/dashboard` returned HTTP 200 but rendered a blank page in the browser.

Root cause:

`DashboardPage` still called synchronous mock-only APIs during render (`listAssets`, `listEvidence`, `listAgentRuns`, etc.). In real mode those functions intentionally throw `Real API mode for listAssets is not implemented yet.`, causing the React root to crash.

Fix:

1. `frontend/app/pages/DashboardPage.tsx` now loads dashboard counts from async API methods inside `useEffect`.
2. Count loading is parallelized with `Promise.all`.
3. Per-count failures are caught and converted to `0` so one unavailable source does not blank the page.
4. No backend, Docker, package, or legacy page changes were made.

Validation:

1. `cd frontend && pnpm build` passed.
2. Chrome DevTools Protocol smoke before fix captured the uncaught `Real API mode for listAssets is not implemented yet.` exception.
3. Chrome DevTools Protocol smoke after fix captured no uncaught Dashboard exception.
4. `http://127.0.0.1:8805/dashboard` still returns HTTP 200.

Known remaining warnings:

1. `listDataSourcesAsync` still falls back to mock-only sync access in real mode, so Dashboard logs a warning and shows data source count as `0`. This does not crash the page.
2. Several static logo assets return 404 in Vite dev mode; these are non-fatal and unrelated to the blank page.

## Hotfix - Workspace Back To Dashboard Button And Port Clarification

Date: 2026-05-02

Issue:

The user observed that `8804` was still running while `8805` was being used, and asked how `8805`, `8804`, and `8802` relate. The user also requested a small return-to-Dashboard button on sub-pages.

Runtime port clarification:

1. `8802` is currently owned by Docker backend process `com.docker.backend`. Its AlphaTrace route set is older/stale in the current session and should not be used for latest local validation.
2. `8804` is an older Vite frontend process. Its served config points to `http://127.0.0.1:8812/api`.
3. `8812` is an older local backend process with a partial current route set.
4. `8805` is the current Vite frontend process used for latest validation.
5. `8813` is the current-code backend process with the latest AlphaTrace route set.
6. Current recommended validation pair: `8805 -> 8813`.

Files changed:

1. `frontend/app/shared/ui/ResearchWorkspaceNav.tsx`
2. `frontend/app/pages/AgentRunDetailPage.tsx`
3. `frontend/app/pages/AssetDetailPage.tsx`
4. `docs/IMPLEMENTATION_LOG.md`

Fix:

1. Shared AlphaTrace workspace navigation now shows a small `返回 Dashboard` button on non-Dashboard pages.
2. `AgentRunDetailPage` now has a direct `返回 Dashboard` action in its detail action row.
3. `AssetDetailPage` now has a direct `返回 Dashboard` action in its top action row.
4. No backend, Docker, package, or legacy business page changes were made.

Validation:

1. `cd frontend && pnpm build` passed.

Result:

The active workspace pages now provide a direct return path to Dashboard while preserving the existing navigation and route structure.

## M14 Completion Record

Date: 2026-05-02

Goal:

Add an AlphaTrace-only backend startup profile so local AlphaTrace / TradingAgents validation can run without legacy BTC / Hyperliquid / Binance market stream log noise.

Files changed:

1. `backend/main.py`
2. `scripts/alphatrace/start_alphatrace_backend.ps1`
3. `docs/EXECUTION_PLAN.md`
4. `docs/VALIDATION.md`
5. `docs/IMPLEMENTATION_LOG.md`

Behavior:

1. Added `ALPHATRACE_BACKEND_PROFILE=alphatrace` opt-in profile.
2. Added `ALPHATRACE_LEGACY_RUNTIME_ENABLED=false` support.
3. Added `ALPHATRACE_FRONTEND_WATCHER_ENABLED=false` support.
4. In AlphaTrace-only profile, startup skips:
   - frontend file watcher
   - legacy `initialize_services()`
   - BTC technical indicator warmup
   - Telegram webhook restore
   - Discord gateway restore
   - Hyper Insight wallet runtime
5. Default startup behavior remains unchanged when the AlphaTrace profile is not enabled.
6. Added `scripts/alphatrace/start_alphatrace_backend.ps1` for repeatable local startup.

Validation:

1. `python -m py_compile backend/main.py` passed.
2. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/start_alphatrace_backend.ps1 -DryRun` passed.
3. A temporary AlphaTrace-only backend was started on `8814` using `.venv-alphatrace-tg` and local database URLs:
   - `DATABASE_URL=postgresql://alpha_user:alpha_pass@127.0.0.1:5432/alpha_arena`
   - `SNAPSHOT_DATABASE_URL=postgresql://alpha_user:alpha_pass@127.0.0.1:5432/alpha_snapshots`
4. `GET http://127.0.0.1:8814/api/health` returned HTTP 200.
5. Startup logs contained `AlphaTrace-only profile active; skipped legacy trading services and BTC indicator warmup`.
6. Startup logs did not contain `Fetching price for BTC`.
7. `scripts/alphatrace/check_active_backend_routes.ps1 -BaseUrl http://127.0.0.1:8814/api` passed with 12/12 routes ok.

Notes:

1. The first smoke attempt with plain `python` failed because that interpreter lacked `psycopg2`.
2. The second smoke attempt with system Python 3.12 failed because that interpreter lacked `sqlalchemy`.
3. The validated local runtime is `.venv-alphatrace-tg`.
4. Local startup still requires explicit local DB URLs because the default Docker-oriented database host is `postgres`.

Result:

M14 is complete. For local AlphaTrace validation without BTC log noise, use:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/start_alphatrace_backend.ps1 `
  -Python "H:\git0412\hyperalphaarena_codex\ai-investment-workbench\.venv-alphatrace-tg\Scripts\python.exe" `
  -Port 8813 `
  -DatabaseUrl "postgresql://alpha_user:alpha_pass@127.0.0.1:5432/alpha_arena" `
  -SnapshotDatabaseUrl "postgresql://alpha_user:alpha_pass@127.0.0.1:5432/alpha_snapshots"
```

## Runtime Startup - Current Recommended Services

Date: 2026-05-03

Context:

The user asked where the project had stopped and requested starting the corresponding services.

Current milestone state:

1. `M0-M14` are marked `Done` in `docs/EXECUTION_PLAN.md`.
2. The latest completed milestone is `M14 - AlphaTrace-only Backend Startup Profile`.

Services started:

1. Docker Desktop was started because no database ports were listening.
2. `docker compose up -d postgres mysql` started database services.
3. AlphaTrace-only backend was started on `8813` with:
   - `ALPHATRACE_BACKEND_PROFILE=alphatrace`
   - `ALPHATRACE_LEGACY_RUNTIME_ENABLED=false`
   - `ALPHATRACE_FRONTEND_WATCHER_ENABLED=false`
   - local Postgres URLs pointing to `127.0.0.1:5432`
4. Vite real-mode frontend was started on `8805`, targeting `http://127.0.0.1:8813/api`.

Validation:

1. PostgreSQL `5432` reachable.
2. MySQL `3306` reachable.
3. `GET http://127.0.0.1:8813/api/health` returned HTTP 200.
4. `scripts/alphatrace/check_active_backend_routes.ps1 -BaseUrl http://127.0.0.1:8813/api` passed with `12/12 routes ok`.
5. `http://127.0.0.1:8805/dashboard#dashboard` returned HTTP 200.
6. Backend log contains `AlphaTrace-only profile active; skipped legacy trading services and BTC indicator warmup`.
7. Backend log does not show ongoing `Fetching price for BTC` output for this profile.

Recommended browser URL:

`http://127.0.0.1:8805/dashboard#dashboard`

## Startup Workflow Note - No One-Click Script Yet

Date: 2026-05-03

Decision:

The user asked not to continue building a new one-click startup script for now. A temporary draft script idea was discarded. The canonical startup process is recorded here as an operational workflow instead of adding another script entrypoint.

Current completed state:

1. `M0-M14` are marked `Done`.
2. Latest completed milestone remains `M14 - AlphaTrace-only Backend Startup Profile`.
3. No new milestone is currently marked `Ready` in `docs/EXECUTION_PLAN.md`.

Manual startup workflow for the current recommended local stack:

1. Start Docker Desktop if it is not running.
2. From the repo root, start database dependencies:

```powershell
cd H:\git0412\hyperalphaarena_codex\ai-investment-workbench\Hyper-Alpha-Arena
docker compose up -d postgres mysql
```

3. Confirm database ports:

```powershell
Test-NetConnection 127.0.0.1 -Port 5432
Test-NetConnection 127.0.0.1 -Port 3306
```

4. Start AlphaTrace-only backend on `8813` using the local venv:

```powershell
$env:ALPHATRACE_BACKEND_PROFILE="alphatrace"
$env:ALPHATRACE_LEGACY_RUNTIME_ENABLED="false"
$env:ALPHATRACE_FRONTEND_WATCHER_ENABLED="false"
$env:DATABASE_URL="postgresql://alpha_user:alpha_pass@127.0.0.1:5432/alpha_arena"
$env:SNAPSHOT_DATABASE_URL="postgresql://alpha_user:alpha_pass@127.0.0.1:5432/alpha_snapshots"
H:\git0412\hyperalphaarena_codex\ai-investment-workbench\.venv-alphatrace-tg\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8813 --app-dir H:\git0412\hyperalphaarena_codex\ai-investment-workbench\Hyper-Alpha-Arena\backend
```

5. Validate backend routes:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/check_active_backend_routes.ps1 -BaseUrl http://127.0.0.1:8813/api
```

6. Start Vite real mode on `8805`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/start_vite_real_mode.ps1 -ApiBaseUrl http://127.0.0.1:8813/api -Port 8805
```

7. Open:

```text
http://127.0.0.1:8805/dashboard#dashboard
```

Current validation:

1. `scripts/alphatrace/check_active_backend_routes.ps1 -BaseUrl http://127.0.0.1:8813/api` passed with `12/12 routes ok`.
2. `http://127.0.0.1:8805/dashboard#dashboard` returned HTTP 200.
3. Backend log confirms `AlphaTrace-only profile active; skipped legacy trading services and BTC indicator warmup`.
4. Current AlphaTrace-only backend log does not show ongoing `Fetching price for BTC`.

Operational note:

1. `8805 -> 8813` is the current recommended validation chain.
2. `8802` is Docker app exposure and should not be treated as the latest local validation chain unless explicitly rebuilt/recreated.
3. `8804/8812` are old local chain ports and should be ignored unless intentionally restarted.

## M15 Completion Record

Date: 2026-05-03

Goal:

Record the current runtime port and startup governance so future validation uses a consistent chain without adding another startup script.

Files changed:

1. `docs/EXECUTION_PLAN.md`
2. `docs/VALIDATION.md`
3. `docs/IMPLEMENTATION_LOG.md`

Decision:

1. No new one-click startup script was added.
2. The previously drafted `start_current_alphatrace_stack.ps1` was removed.
3. BTC / Hyperliquid / Binance legacy cleanup remains out of scope for now.
4. The canonical current local validation chain is `8805 -> 8813`.

Current port map:

1. `3306`: Docker MySQL dependency.
2. `5432`: Docker PostgreSQL dependency.
3. `8802`: Docker app exposure; not the latest local AlphaTrace validation chain.
4. `8805`: current Vite real-mode frontend.
5. `8813`: current AlphaTrace-only backend.
6. `8804`, `8812`, `8814`: not currently active in the recommended chain.

Validation:

1. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/check_active_backend_routes.ps1 -BaseUrl http://127.0.0.1:8813/api` passed with `12/12 routes ok`.
2. `Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard#dashboard` returned HTTP 200.
3. Active port check confirmed `3306`, `5432`, `8805`, and `8813` are listening.

Result:

M15 is complete. The project should continue using the documented manual startup workflow until a future decision is made to introduce a more formal process manager or startup script.

Next recommended milestone:

`M16 - TradingAgents Flow Streaming Enhancement`, if the next priority is improving TradingAgents / LangGraph runtime visibility.

## Hotfix - Data Sources Real Mode Blank Page And Back Navigation

Date: 2026-05-03

Issue:

The user reported that entering Data Sources rendered a blank page. The user also requested a way for each sub-page to go back to the previous page.

Root cause:

`DataSourcesPage` still called synchronous mock-only methods during render: `listDataSources()`, `listEvidence()`, and `listAssets()`. In real mode those sync methods intentionally throw, which can crash the React tree and produce a blank page.

Fix:

1. `frontend/app/pages/DataSourcesPage.tsx`
   - Replaced synchronous render-time mock access with async loading.
   - Uses `listDataSourcesAsync`, `listEvidenceAsync`, and `listAssetsAsync`.
   - Added loading and friendly error state.
2. `frontend/app/entities/data-source/api.ts`
   - Added real-mode `listDataSourcesAsync` support by deriving a minimal data-source view from backend Evidence API results.
   - This is a safe real-mode bridge until a dedicated Data Source API is added.
3. `frontend/app/shared/lib/navigation.ts`
   - Added `goBackOrDashboard()` helper.
4. `frontend/app/shared/ui/ResearchWorkspaceNav.tsx`
   - Added `返回上一页` action on non-Dashboard AlphaTrace pages.
5. `frontend/app/pages/AgentRunDetailPage.tsx`
   - Added `返回上一页` action.
6. `frontend/app/pages/AssetDetailPage.tsx`
   - Added `返回上一页` action.

Validation:

1. `cd frontend && pnpm build` passed.
2. `GET http://127.0.0.1:8805/dashboard#data-sources` returned HTTP 200.
3. `GET http://127.0.0.1:8813/api/alpha-trace/evidence?limit=5` returned HTTP 200.

Notes:

1. This does not introduce a dedicated backend Data Source API yet.
2. Data Sources real mode currently derives source cards from Evidence API data.
3. Mock mode remains available.
4. No backend, Docker, package, or BTC legacy changes were made.

## Hotfix - AgentLab TradingAgents Runtime Status Guard

Date: 2026-05-03

Issue:

AgentLab allowed submitting `runnerType=tradingagents` even when the current backend reported TradingAgents disabled or backend Qwen API key unavailable. The resulting backend error was confusing because it surfaced as a generic agent task failure.

Current backend diagnosis:

1. `GET /api/alpha-trace/agent-runs/runners/status` on `8813` reports `tradingagents.status=disabled`, `enabled=false`, `available=false`.
2. The same status reports `tradingagents.qwenKeyConfigured=false`, `qwenConfigSource=missing`.
3. `GET /api/hyper-ai/profile` reports Qwen provider/model/base URL configured, but it does not prove the encrypted API key is usable.
4. Direct submit with `runnerType=tradingagents` returns HTTP 400 detail: `TradingAgents runner is not enabled.`

Fix:

1. `frontend/app/pages/AgentLabPage.tsx`
   - Uses runner runtime status to disable the TradingAgents PoC submit button unless the runner is ready.
   - Shows the backend runner status panel, including TradingAgents repo/import/Qwen key state.
   - Shows a clear blocked reason before submit instead of allowing a misleading request.
   - Updated local backend guidance to the current chain: `8805 -> 8813`.

Validation:

1. `cd frontend && pnpm build` passed.
2. `GET http://127.0.0.1:8813/api/alpha-trace/agent-runs/runners/status` returned TradingAgents disabled and Qwen key missing for the current backend process.
3. Direct disabled submit returned clear HTTP 400: `TradingAgents runner is not enabled.`

Operational note:

To run TradingAgents, start the backend with `ALPHATRACE_TRADINGAGENTS_ENABLED=true`, set `TRADINGAGENTS_REPO_PATH`, and make Qwen API key available to the same backend process either by re-saving it in Settings with a compatible encryption context or by setting `DASHSCOPE_API_KEY` before backend startup.

## Hotfix - Settings Qwen Key Save Diagnostics And API Proxy Alignment

Date: 2026-05-03

Issue:

Saving the Qwen API key from Settings could show only `Failed to fetch`, which did not identify whether the page was calling the wrong backend, a backend was down, or the Qwen connection test failed.

Root cause analysis:

1. Current local validation chain is `8805 -> 8813`.
2. Some legacy Hyper AI UI code still uses same-origin `/api/...` calls, while AlphaTrace real-mode APIs use `VITE_ALPHA_TRACE_API_BASE_URL`.
3. The previous Vite proxy defaulted `/api` to `8802`, so `/api` calls and real-mode calls could hit different backend processes.
4. CORS from `8805` to `8813` is available, so the primary risk is API base / proxy mismatch or network failure during the Qwen connection test.

Fix:

1. `frontend/vite.config.ts`
   - Makes the Vite `/api` and `/ws` proxy targets follow `VITE_ALPHA_TRACE_API_BASE_URL` when provided.
   - This keeps legacy `/api/...` calls aligned with the current AlphaTrace backend after Vite restart.
2. `frontend/app/shared/api/http-client.ts`
   - Converts browser `TypeError: Failed to fetch` into a clearer `NETWORK_ERROR` including the target backend URL.
3. `frontend/app/pages/SettingsPage.tsx`
   - Displays the active Runtime API base URL in the Runtime Credentials card.

Validation:

1. `cd frontend && pnpm build` passed.
2. `OPTIONS http://127.0.0.1:8813/api/hyper-ai/profile/llm` with origins `127.0.0.1:8805` and `localhost:8805` returned CORS allow-origin headers.
3. `GET http://127.0.0.1:8813/api/hyper-ai/profile` returned the current Hyper AI profile.

Operational note:

Restart Vite after this change so `frontend/vite.config.ts` reloads the proxy target. For the current chain, start Vite with `VITE_ALPHA_TRACE_API_BASE_URL=http://127.0.0.1:8813/api`.

## Hotfix - Settings Runtime Credential Error Message Extraction

Date: 2026-05-03

Issue:

Settings displayed the generic text `Failed to save Qwen configuration.` even when the backend returned a specific validation error from DashScope/Qwen.

Root cause:

`httpClient` throws a plain `ApiError` object with a `message` field. `SettingsPage` only handled `error instanceof Error`, so plain API error objects were reduced to the fallback message.

Fix:

1. `frontend/app/pages/SettingsPage.tsx`
   - Added a small `getErrorMessage` helper that supports `Error`, plain objects with `message`, and string errors.
   - Applied it to runtime credential load/save/remove error paths.

Verification:

1. Direct backend POST with a fake Qwen key returned the specific backend detail: `Incorrect API key provided...`.
2. `cd frontend && pnpm build` passed.

Expected behavior:

When Qwen key save fails, Settings should now display the backend's real reason, for example invalid API key, timeout, or connection test failure, instead of the generic fallback.

## Hotfix - Same-Origin Vite Proxy For Runtime Credentials

Date: 2026-05-03

Issue:

Saving Qwen config from Settings could still show a browser-level network error when the backend returned a 400 business error during Qwen connection validation. Direct cross-origin POST responses did not consistently expose CORS headers on error responses, so the browser hid the backend detail.

Fix:

1. `frontend/vite.config.ts`
   - Split browser API base from Vite proxy target.
   - `VITE_ALPHA_TRACE_API_BASE_URL=/api` keeps browser calls same-origin.
   - `VITE_ALPHA_TRACE_API_PROXY_TARGET=http://127.0.0.1:8813/api` tells Vite where to proxy `/api`.
2. `frontend/.env.local` was created locally with the above values. This file is ignored by git and contains no secrets.

Validation:

1. `cd frontend && pnpm build` passed.
2. Vite on `8805` was restarted.
3. `GET http://127.0.0.1:8805/api/alpha-trace/agent-runs/runners/status` returned the `8813` backend status.
4. `POST http://127.0.0.1:8805/api/hyper-ai/profile/llm` with an invalid test key returned HTTP 400 with the real backend message: `Incorrect API key provided...` instead of a browser network error.

Expected behavior:

Settings should now display the true backend validation result. A valid Qwen/DashScope key should save; an invalid key should show the explicit DashScope error.

## 2026-05-03 - Local 8805 API Proxy / 8813 Backend Recovery
- Goal: restore `http://127.0.0.1:8805/api/*` after Settings Qwen save reported `fail to fetch` / HTTP 500.
- Root cause: local AlphaTrace backend `8813` was down because it inherited Docker-only `DATABASE_URL=...@postgres:5432/...`; host PowerShell cannot resolve Docker service name `postgres`.
- Fix: updated `scripts/alphatrace/start_alphatrace_backend.ps1` to default local PostgreSQL URLs to `127.0.0.1:5432` when no explicit `-DatabaseUrl` is passed or when the inherited env still contains `@postgres:`. The script still accepts explicit DB URLs.
- Fix retained: local backend now creates/uses `backend/runtime_data/.encryption_key` for `HYPERLIQUID_ENCRYPTION_KEY`, so valid Qwen key saves can encrypt credentials locally.
- Validation:
  - `GET http://127.0.0.1:8813/api/health` returned healthy.
  - `GET http://127.0.0.1:8805/api/health` returned healthy via Vite proxy.
  - Invalid Qwen save through `8805/api/hyper-ai/profile/llm` returned backend `400 Incorrect API key`, not network failure or 500.
  - `backend/.venv/Scripts/python.exe -m py_compile backend/main.py backend/database/connection.py` passed.
  - `utils.encryption.validate_encryption_setup()` passed with local runtime encryption key.
- Assumption: real Qwen key save should now reach validation and encrypted DB save path; do not record the key in files or logs.

## 2026-05-03 - Runtime Credential Validation And TradingAgents Local Enablement
- Goal: resolve mismatch where Qwen Agent Task could run but Settings Qwen save/test and AgentLab TradingAgents button were unclear or disabled.
- Findings:
  - Qwen Agent Task was valid because QwenRunner can read server-side Hyper AI profile or `DASHSCOPE_API_KEY`.
  - AgentLab TradingAgents button was grey because `ALPHATRACE_TRADINGAGENTS_ENABLED=false`, not because the Qwen key was invalid.
  - TradingAgents local import also needed its Python dependencies in `backend/.venv`.
- Changes:
  - Added `POST /api/hyper-ai/profile/llm/test-current` to validate the currently saved backend LLM config without exposing the API key.
  - Settings now has `Test Current Qwen Config` and Bocha save now sends `validate_key=true`, so saves validate before persisting.
  - AgentLab Runner Runtime Status now has a `Refresh` button to avoid stale disabled/ready state after backend config changes.
  - `scripts/alphatrace/start_alphatrace_backend.ps1` now supports `-EnableTradingAgents` and optional `-TradingAgentsRepoPath`, preserving default disabled behavior.
  - Installed sibling `TradingAgents` into local `backend/.venv` via `uv pip install --python backend/.venv/Scripts/python.exe -e ../TradingAgents`; no Docker/package.json/source changes.
- Validation:
  - `TradingAgentsGraph` import passed in `backend/.venv`.
  - `GET /api/alpha-trace/agent-runs/runners/status` through 8805 reports `tradingagents status=ready` and `qwenKeyConfigured=true`.
  - `POST /api/hyper-ai/profile/llm/test-current` returned 200 for qwen/qwen-plus.
  - TradingAgents submit through 8805 returned run `run_tradingagents_20260503_174342_835835` immediately with status running; events grew to 47 and include LangGraph stream/tool events.
  - `py_compile` passed for changed backend files.
  - `pnpm build` passed.
- Known issue: the current TradingAgents PoC run can be long-running; it is streaming runtime events but had not completed at the time of this log entry. Continue observing from AgentRunDetail or events endpoint.

## 2026-05-03 - TG-POC-2 Evidence-First TradingAgents Adapter
- Goal: adapt the TradingAgents PoC runner to use AlphaTrace EvidenceRetriever before LangGraph execution, with Bocha as the optional external search source and static evidence as fallback.
- Changes:
  - `TradingAgentsRunnerAdapter` now calls `EvidenceRetriever.retrieve(...)` before starting the TradingAgents graph.
  - Runtime events now include `tool.called evidence.retrieve`, `tool.called/tool.result bocha.search`, `tool.result evidence.retrieve`, and `evidence.linked` for TradingAgents runs.
  - Retrieved evidence is formatted into an AlphaTrace evidence context and injected into TradingAgents runtime-only offline data tool outputs (`fundamentals`, `news`, `global_news`) without modifying TradingAgents source.
  - Completed or failed TradingAgents outputs now include retrieved evidence references plus the PoC runtime context evidence, and decisions reference those evidence IDs.
- Assumptions:
  - TradingAgents remains an optional in-process runner adapter; AlphaTrace remains the product backend and schema owner.
  - Bocha is optional. If `BOCHA_API_KEY` is unavailable in the local backend environment/settings, TradingAgents runs continue with static evidence fallback.
  - First iteration does not modify TradingAgents source and does not expose raw TradingAgents internal state to the frontend.
- Validation:
  - `backend/.venv/Scripts/python.exe -m py_compile backend/services/agent_runners/tradingagents_adapter.py backend/services/agent_runners/registry.py backend/services/alpha_trace_agent_runtime_service.py backend/schemas/alpha_trace_agent_runtime.py` passed.
  - Restarted local `8813` backend with `-EnableTradingAgents`; `GET /api/health` returned healthy.
  - `GET /api/alpha-trace/agent-runs/runners/status` through `8805` reported `tradingagents status=ready`, importable, and Qwen key available.
  - Submitted run `run_tradingagents_20260503_223118_139507`; submit returned immediately with status `running`.
  - Events include evidence retrieval and fallback flow: `evidence.retrieve`, `bocha.search disabled`, `evidence.retrieve completed`, and `evidence.linked` with 5 static evidence IDs.
  - Stub runner regression passed with completed run `run_stub_20260503_223152_822272`.
- Known issue:
  - The TradingAgents LangGraph PoC run can remain running after Market Analyst output and repeated Research Manager transitions. This is a TradingAgents PoC execution stability issue, not an AlphaTrace schema/SSE issue. Next TradingAgents milestone should add bounded graph timeout / graceful failed status for stuck graphs.
- Additional validation:
  - `cd frontend && pnpm build` passed after backend-only changes, confirming no frontend regression.
- Stop condition:
  - Continuing deeper TradingAgents stabilization now needs an architectural choice: in-process Python thread execution cannot safely kill a stuck LangGraph/LLM call. Recommended next step is a subprocess-based TradingAgents runner with timeout and log capture, so AlphaTrace can terminate stuck PoC runs deterministically.

## 2026-05-04 - Startup Recovery For Current Session
- Goal: start the project for browser validation and clarify the active port chain.
- Result:
  - Docker Desktop was started successfully.
  - Docker app/backend is available at `http://127.0.0.1:8802/api` and returns healthy.
  - Vite frontend is available at `http://127.0.0.1:8805/dashboard`.
  - Vite proxy is configured for this session as `8805 /api -> 8802 /api`.
- Important deviation from M15:
  - Local AlphaTrace-only backend `8813` could not start because the local host PostgreSQL port `127.0.0.1:5432` is currently not bindable/reachable for the local backend path. Docker app `8802` remains usable.
  - TradingAgents local PoC is therefore not active in the current browser chain; `/runners/status` reports TradingAgents disabled from Docker backend.
- Validation:
  - `GET http://127.0.0.1:8802/api/health` returned healthy.
  - `GET http://127.0.0.1:8805/dashboard` returned HTTP 200.
  - `GET http://127.0.0.1:8805/api/health` returned healthy through Vite proxy.
  - `GET http://127.0.0.1:8805/api/alpha-trace/agent-runs/runners/status` returned runner diagnostics.
- Next engineering task:
  - Update runtime governance or implement the next reliable startup path so `8813` does not depend on a host `5432` binding, or move TradingAgents PoC into a controlled subprocess/service profile.

## 2026-05-04 - M16 Runtime Startup Chain Stabilization
- Goal: stabilize the current browser validation chain after `8813` local backend and Docker compose Postgres host-port startup issues.
- Changes:
  - Updated `scripts/alphatrace/start_vite_real_mode.ps1` defaults to the currently reliable chain: `VITE_ALPHA_TRACE_API_BASE_URL=/api`, `VITE_ALPHA_TRACE_API_PROXY_TARGET=http://127.0.0.1:8802/api`, and Vite port `8805`.
  - Added M16 to `docs/EXECUTION_PLAN.md` and recorded the default `8805 -> 8802` chain.
  - Updated `docs/VALIDATION.md` with the Docker Postgres no-host-port workaround and the `postgres` network alias requirement.
- Runtime fix performed:
  - Docker Desktop was running, but `docker compose` could not publish host `127.0.0.1:5432` due Windows socket restrictions.
  - Recreated `hyper-arena-postgres` without publishing host `5432`, attached it to `hyper-arena-network`, and added aliases `postgres` and `hyper-arena-postgres`.
  - Restarted `hyper-arena-app`; it became healthy and can resolve `postgres` internally.
- Validation:
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/start_vite_real_mode.ps1 -DryRun` shows `/api`, `http://127.0.0.1:8802/api`, and port `8805`.
  - `GET http://127.0.0.1:8802/api/health` returned healthy.
  - `GET http://127.0.0.1:8805/api/alpha-trace/agent-runs/runners/status` returned runner status through Vite proxy.
  - `GET http://127.0.0.1:8805/dashboard` returns frontend HTML.
- Current limitation:
  - TradingAgents is disabled in the Docker backend chain. Local TradingAgents PoC still needs the `8813` local backend path or a future subprocess/service runner.

## 2026-05-04 - M17 AlphaTrace Orchestrator v1 + TradingAgents Subprocess Worker
- Goal: prevent TradingAgents LangGraph/LLM execution from running directly inside the FastAPI process/thread and provide a bounded worker boundary.
- Changes:
  - Added `backend/services/agent_orchestrator/subprocess_orchestrator.py`.
  - Added `backend/services/agent_runners/tradingagents_worker.py`.
  - Updated `TradingAgentsRunnerAdapter` so `runnerType=tradingagents` uses a subprocess worker by default. Debug opt-out: `runnerConfig.extraParams.useSubprocessWorker=false`.
  - Worker writes runtime events to `events.jsonl`, final outputs to `result.json`, and logs to `stdout.log` / `stderr.log` under `backend/runtime_data/agent_workers/{runId}`.
  - Parent adapter monitors worker events/results, updates AgentRunStore, and marks timeout/process errors as failed runs.
- Assumptions:
  - This is Orchestrator v1, not a production queue. It manages one subprocess per TradingAgents run with timeout and artifacts.
  - QwenRunner and StubRunner stay on the existing path for now.
  - TradingAgents source remains unchanged and is not copied into Hyper-Alpha-Arena.
- Validation:
  - `backend/.venv/Scripts/python.exe -m py_compile backend/services/agent_orchestrator/subprocess_orchestrator.py backend/services/agent_runners/tradingagents_worker.py backend/services/agent_runners/tradingagents_adapter.py backend/services/alpha_trace_agent_runtime_service.py backend/schemas/alpha_trace_agent_runtime.py` passed.
  - Docker/default-disabled submit through `8805/api` returned HTTP 400 `TradingAgents runner is not enabled.`
  - Local in-memory subprocess smoke with `ALPHATRACE_TRADINGAGENTS_ENABLED=true`, sibling `TradingAgents` repo, and no `DASHSCOPE_API_KEY` submitted `run_tradingagents_20260504_102147_050829` immediately and ended as `failed` with 9 events, 1 failure report, 1 context evidence item, and fallback `watch` decision.
- Current limitation:
  - Full successful TradingAgents run still requires valid provider credentials and a stable local TradingAgents execution environment. The new boundary makes stuck/failed runs controllable but does not itself guarantee TradingAgents analysis quality or completion.

## 2026-05-04 - M18 Orchestrator Worker Artifact Observability
- Goal: make M17 subprocess worker artifacts inspectable by `runId` from AlphaTrace instead of relying on global backend logs.
- Changes:
  - Added `GET /api/alpha-trace/agent-runs/{runId}/worker-artifacts`.
  - The endpoint only reads fixed files under the configured worker directory: `input.json`, `events.jsonl`, `result.json`, `stdout.log`, and `stderr.log`.
  - `stdout.log` and `stderr.log` tails reuse backend secret redaction.
  - Added frontend API client support for worker artifacts.
  - Added an AgentRunDetail `Worker Runtime Artifacts` panel showing file status, stdout/stderr tail, JSONL event tail, and result summary.
- Safety assumptions:
  - Worker artifacts are runtime debugging data, not product data. `AgentRun`, `AgentRuntimeEvent`, `AgentReport`, `EvidenceReference`, and `AgentDecision` remain the product schema.
  - Qwen, Stub, and older runs are expected to return `exists=false` with a friendly message.
  - Path traversal is blocked by validating `runId` and resolving under `backend/runtime_data/agent_workers` or `ALPHATRACE_AGENT_WORKER_DIR`.
- Validation:
  - `backend/.venv/Scripts/python.exe -m py_compile backend/api/alpha_trace_agent_runtime_routes.py` passed.
  - `cd frontend && pnpm build` passed with existing Vite chunk/dynamic import/browserslist warnings.
  - FastAPI TestClient smoke created demo run `demo-asset_etf_510300`; `/worker-artifacts` returned HTTP 200 with `exists=false` and the expected friendly message.
  - Unknown run returned HTTP 404.
  - Encoded traversal-style run id did not expose filesystem data.
- Result:
  - M18 is complete.
- Next recommended milestone:
  - `M19 - Orchestrator Control Plane v1`: expose run worker mode, timeout, termination result, and optional cancel propagation to subprocess workers without changing QwenRunner or TradingAgents source.

## 2026-05-04 - M19 Orchestrator Control Plane v1
- Goal: propagate AlphaTrace cancel requests to registered TradingAgents subprocess workers instead of only marking the run cancelled cooperatively.
- Changes:
  - Added an in-process worker process registry to `SubprocessOrchestrator` keyed by `runId`.
  - Worker processes are registered after launch and unregistered when the monitor exits.
  - Added `cancel_subprocess_worker(run_id)` for best-effort process kill.
  - `cancel_agent_run(runId)` now calls `cancel_subprocess_worker` and records `workerCancellation` in the `agent.run.cancelled` event payload.
  - `TradingAgentsRunnerAdapter` now ignores late worker result/error callbacks if the run has already been cancelled, preventing cancelled runs from being overwritten with failed outputs/status.
- Scope retained:
  - Qwen and Stub cancellation remain cooperative.
  - No production queue, Docker supervisor, or TradingAgents source changes were added.
- Validation:
  - `backend/.venv/Scripts/python.exe -m py_compile backend/services/agent_orchestrator/subprocess_orchestrator.py backend/services/agent_runners/tradingagents_adapter.py backend/services/alpha_trace_agent_runtime_service.py backend/api/alpha_trace_agent_runtime_routes.py` passed.
  - `cancel_subprocess_worker('missing_run')` returned `found=false` without raising.
  - Service smoke saved a synthetic running run, called `cancel_agent_run`, and verified status `cancelled` plus `workerCancellation` payload.
  - TradingAgents disabled submit through `8805/api` still returned HTTP 400 `TradingAgents runner is not enabled.`
- Result:
  - M19 is complete.
- Next recommended milestone:
  - `M20 - Orchestrator Worker Registry Status API`: expose active worker registry state and cancellation outcome history for current-process diagnostics, without adding a distributed queue.

## 2026-05-04 - M20 Orchestrator Worker Registry Status API
- Goal: expose process-local subprocess worker registry status for diagnostics.
- Changes:
  - Added `get_subprocess_worker_registry_snapshot()` to `SubprocessOrchestrator`.
  - Added `GET /api/alpha-trace/agent-runs/runtime/workers`.
  - Response includes `workerType`, `activeCount`, `registeredCount`, and per-worker `runId`, `pid`, `running`, `returnCode`.
- Scope retained:
  - This is process-local operational diagnostics only, not durable product state or a distributed queue.
  - No frontend dashboard, Docker, package, or TradingAgents source changes.
- Validation:
  - `backend/.venv/Scripts/python.exe -m py_compile backend/services/agent_orchestrator/subprocess_orchestrator.py backend/api/alpha_trace_agent_runtime_routes.py` passed.
  - FastAPI TestClient `GET /api/alpha-trace/agent-runs/runtime/workers` returned HTTP 200 with empty registry: `activeCount=0`, `registeredCount=0`.
- Result:
  - M20 is complete.
- Next recommended milestone:
  - `M21 - TradingAgents Worker Status UI`: surface the worker registry and artifact links in AgentLab/AgentRunDetail as a compact diagnostic control, while keeping product-facing reports separate from debug data.

## 2026-05-04 - M21 TradingAgents Worker Status UI
- Goal: surface the M20 process-local worker registry in Agent Lab without making it required for stale/Docker backends.
- Changes:
  - Added frontend endpoint/client support for `/api/alpha-trace/agent-runs/runtime/workers`.
  - Agent Lab now shows an `Orchestrator Worker Registry` block with active/registered worker counts.
  - Active worker run ids link to AgentRunDetail.
  - If the active backend does not yet expose the endpoint, Agent Lab keeps runner status visible and shows a friendly diagnostics limitation.
- Validation:
  - `cd frontend && pnpm build` passed with existing Vite chunk/dynamic import/browserslist warnings.
- Result:
  - M21 is complete.
- Next recommended milestone:
  - `M22 - Worker-Aware Cancel UI`: add a cancel action on AgentRunDetail that calls the existing cancel endpoint and explains whether subprocess termination was attempted.

## 2026-05-04 - M22 Worker-Aware Cancel UI
- Goal: expose Agent Runtime cancellation in AgentRunDetail and make it useful for TradingAgents subprocess runs.
- Changes:
  - Added frontend endpoint/client support for `POST /api/alpha-trace/agent-runs/{runId}/cancel`.
  - AgentRunDetail now shows `Cancel Run` for `RUNNING`, `QUEUED`, and `PARTIALLY_COMPLETED` runs.
  - After cancellation, AgentRunDetail refreshes run status, runtime events, and worker artifacts.
  - Terminal runs do not show the cancel action.
- Validation:
  - `cd frontend && pnpm build` passed with existing Vite chunk/dynamic import/browserslist warnings.
- Result:
  - M22 is complete.
- Next recommended milestone:
  - `M23 - Orchestrator Run Contract Documentation`: document worker lifecycle, artifact semantics, cancellation behavior, and current limitations before adding more worker features.

## 2026-05-04 - M23 Orchestrator Run Contract Documentation
- Goal: document the AlphaTrace Orchestrator subprocess run contract before adding more worker features.
- Added:
  - `docs/engineering/31_orchestrator_run_contract.md`
- Content covered:
  - Worker lifecycle.
  - Worker artifact directory and file semantics.
  - Worker artifact API and process-local registry API.
  - Cancellation behavior and `workerCancellation` event payload.
  - Frontend display separation between product outputs, worker diagnostics, and global backend logs.
  - Security notes and current limitations.
- Validation:
  - `Test-Path docs/engineering/31_orchestrator_run_contract.md` returned true.
  - Required contract terms were found in the document.
- Result:
  - M23 is complete.
- Next recommended milestone:
  - `M24 - Runner Execution Boundary Decision`: decide whether QwenRunner should also move behind Orchestrator subprocess execution or remain in-process for lower latency.

## 2026-05-04 - M24 Runner Execution Boundary Decision
- Goal: decide the execution boundary for QwenRunner, TradingAgents, Stub, and future LangAlpha without changing runtime behavior.
- Added:
  - `docs/engineering/32_runner_execution_boundary_decision.md`
- Decision:
  - `stub -> in_process`
  - `qwen -> in_process`
  - `tradingagents -> subprocess`
  - `langalpha -> external_disabled`
- Rationale:
  - QwenRunner keeps its current in-process path because streaming/typewriter Live Output is stable, low-latency, and bounded by HTTP timeout/error handling.
  - TradingAgents stays behind the subprocess worker because LangGraph/tool/model execution can be long-running or stuck and needs a killable boundary plus artifacts.
  - LangAlpha should be treated as a future external service adapter rather than embedded into AlphaTrace.
- Future migration triggers for Qwen subprocess:
  - repeated hard hangs despite timeout,
  - hard-cancel requirement,
  - memory/thread pressure,
  - provider SDK instability,
  - unified worker quota requirement,
  - security isolation requirement.
- Validation:
  - `Test-Path docs/engineering/32_runner_execution_boundary_decision.md` returned true.
  - Required decision terms were found in the document.
- Result:
  - M24 is complete.
- Next recommended milestone:
  - `M25 - Orchestrator Policy Layer v1`: implement a small policy helper and expose execution mode diagnostics without changing runner behavior.

## 2026-05-04 - M25 Orchestrator Policy Layer v1
- Goal: expose the M24 runner execution-boundary decision in backend diagnostics and Agent Lab without changing runtime behavior.
- Added:
  - `backend/services/agent_orchestrator/execution_policy.py`
- Changed:
  - `GET /api/alpha-trace/agent-runs/runners/status` now returns `executionMode` and `executionPolicyReason` for each runner.
  - Agent Lab Runner Runtime Status now displays the execution mode badge and policy reason.
- Current policy:
  - `stub -> in_process`
  - `qwen -> in_process`
  - `tradingagents -> subprocess`
  - `langalpha -> external_disabled`
- Validation:
  - `backend/.venv/Scripts/python.exe -m py_compile backend/services/agent_orchestrator/execution_policy.py backend/api/alpha_trace_agent_runtime_routes.py` passed.
  - Policy smoke returned `qwen=in_process` and `tradingagents=subprocess`.
  - Runner status route function smoke returned `stub=in_process`, `qwen=in_process`, `tradingagents=subprocess`, and `langalpha=external_disabled`.
  - `cd frontend && pnpm build` passed.
- Result:
  - M25 is complete.
- Next recommended milestone:
  - `M26 - Runner Capability Matrix and Orchestrator Intent Contract`: define which user tasks map to which runner capabilities before introducing a true Orchestrator/intent worker.

## 2026-05-04 - M26 Runner Capability Matrix and Orchestrator Intent Contract
- Goal: define runner capabilities and task-intent recommendations before introducing a full Orchestrator worker.
- Added:
  - `backend/services/agent_orchestrator/capability_matrix.py`
  - `docs/engineering/33_orchestrator_intent_contract.md`
- Changed:
  - `GET /api/alpha-trace/agent-runs/runners/status` now includes per-runner `capabilities`.
  - Added `GET /api/alpha-trace/agent-runs/runners/capabilities`.
  - Agent Lab displays supported tasks and capability flags for each runner.
- Capability summary:
  - `qwen` supports `single_asset_analysis` and `portfolio_diagnosis`.
  - `tradingagents` supports explicit `single_asset_analysis` PoC only.
  - `stub` remains smoke-test only.
  - `langalpha` remains external-disabled/design-only.
- Orchestrator rule:
  - Explicit runner requests are respected; AlphaTrace does not silently fallback to another runner.
  - If no runner is explicit, `qwen` is the current default recommendation.
- Validation:
  - `backend/.venv/Scripts/python.exe -m py_compile backend/services/agent_orchestrator/capability_matrix.py backend/api/alpha_trace_agent_runtime_routes.py` passed.
  - Capability smoke returned `portfolio_diagnosis -> qwen`.
  - Capabilities route function smoke returned 4 runners and explicit `tradingagents` recommendation support for `single_asset_analysis`.
  - Explicit TradingAgents smoke returned `supported=true` for `single_asset_analysis` and does not fallback.
  - `cd frontend && pnpm build` passed.
- Result:
  - M26 is complete.
- Next recommended milestone:
  - `M27 - Orchestrator Intent Preview UI`: show a non-binding "recommended runner" preview in Agent Lab before submit, without changing submit behavior.

## 2026-05-04 - M27 Orchestrator Intent Preview UI
- Goal: show a non-binding runner recommendation in Agent Lab before submit.
- Changed:
  - Added frontend endpoint/client support for `/api/alpha-trace/agent-runs/runners/capabilities`.
  - Agent Lab now shows `Orchestrator Intent Preview` with task type, recommended runner, support status, and reason.
- Behavior:
  - This is advisory only.
  - Submit buttons still send explicit `runnerConfig.runnerType`.
  - Missing/stale backend endpoint is displayed as a diagnostics limitation, not a page failure.
- Validation:
  - `cd frontend && pnpm build` passed.
- Result:
  - M27 is complete.
- Next recommended milestone:
  - `M28 - Agent Lab Runner Selection Draft`: allow a single draft task form to choose runner/task/asset explicitly before submit, still without automatic Orchestrator dispatch.

## 2026-05-04 - M28 Agent Lab Runner Selection Draft
- Goal: make runner/task/asset/question selection explicit in Agent Lab before submit.
- Changed:
  - Added a `Draft Agent Task` card to Agent Lab.
  - Users can choose `qwen`, `tradingagents`, or `stub`.
  - Users can choose `single_asset_analysis` or `portfolio_diagnosis`.
  - Draft submit uses the existing `/submit` endpoint and explicit `runnerConfig.runnerType`.
- Guardrails:
  - No automatic Orchestrator fallback was added.
  - TradingAgents draft submit remains blocked if runner diagnostics say it is unavailable.
  - Qwen/Stub submit behavior remains explicit.
- Validation:
  - `cd frontend && pnpm build` passed.
- Result:
  - M28 is complete.
- Next recommended milestone:
  - `M29 - Draft Submit Runtime Smoke`: validate the new draft form path against the active backend for stub and qwen, and document TradingAgents behavior for the current backend chain.

## 2026-05-04 - M29 Draft Submit Runtime Smoke
- Goal: validate the draft-submit path and current active backend constraints after M26-M28.
- Validation:
  - Source-level capabilities route function returned `recommendedRunnerType=qwen`, `supported=True`, and 4 capability entries.
  - Active browser chain `GET http://127.0.0.1:8805/api/alpha-trace/agent-runs/runners/capabilities` returned HTTP 404 because the active Vite proxy targets Docker backend `8802`, which has not been rebuilt with M26.
  - Active browser chain stub submit through `http://127.0.0.1:8805/api/alpha-trace/agent-runs/submit` returned HTTP 200 and created `run_stub_20260504_025832_448235`.
- Interpretation:
  - The new M26/M27 capabilities endpoint exists in current source and passes route-function smoke.
  - The currently running Docker backend is stale for this new endpoint.
  - Agent Lab handles missing capabilities endpoint as a friendly diagnostics limitation; submit buttons still work.
- Result:
  - M29 is complete.
- Next recommended milestone:
  - `M30 - Active Backend Refresh Decision`: decide whether to rebuild Docker app for current-source backend routes or switch browser validation to a local AlphaTrace-only backend for M26+ UI validation.

## 2026-05-04 - M30 Active Backend Refresh Decision
- Goal: determine whether the current `8805 -> 8802` browser chain needs Docker rebuild or only app restart for M26-M28 backend route updates.
- Finding:
  - `docker-compose.yml` mounts `backend/api`, `backend/services`, `backend/schemas`, and other backend source directories into `/app/backend`.
  - Therefore M26 route/service changes can load after app process restart; rebuild is not required for these backend Python changes.
- Action:
  - Restarted `hyper-arena-app`.
- Validation:
  - `GET http://127.0.0.1:8802/api/health` returned HTTP 200.
  - `GET http://127.0.0.1:8805/api/alpha-trace/agent-runs/runners/capabilities` returned HTTP 200.
  - `GET http://127.0.0.1:8805/api/alpha-trace/agent-runs/runners/status` returned HTTP 200 and includes `executionMode`.
  - `GET http://127.0.0.1:8805/dashboard#agent-lab` returned HTTP 200.
- Current browser chain:
  - Frontend: `http://127.0.0.1:8805/dashboard`
  - API: same-origin `/api`
  - Proxy target/backend: `http://127.0.0.1:8802/api`
- Result:
  - M30 is complete.
- Next recommended milestone:
  - `M31 - Agent Lab UI Runtime Smoke`: manually/API-verify Agent Lab now shows policy/capability/intent preview against the refreshed backend and that draft stub submit still navigates to AgentRunDetail.

## 2026-05-04 - M31 Agent Lab UI Runtime Smoke
- Goal: verify active `8805 -> 8802` chain after backend restart and Agent Lab policy/capability additions.
- Validation:
  - Runner status through `8805/api` returned:
    - `stub:ready:in_process`
    - `qwen:ready:in_process`
    - `tradingagents:disabled:subprocess`
    - `langalpha:disabled:external_disabled`
  - Capabilities through `8805/api` returned `recommend=qwen`, `supported=True`, `count=4`.
  - Stub submit through `8805/api` created `run_stub_20260504_030116_705076` with `status=completed`.
  - Detail for that run returned `reports=1` and `events=10`.
- Result:
  - M31 is complete.
- Current runtime:
  - Browser: `http://127.0.0.1:8805/dashboard`
  - API: same-origin `/api`
  - Backend: `http://127.0.0.1:8802/api`
- Next recommended milestone:
  - `M32 - TradingAgents Enablement Path Review`: decide whether to enable TradingAgents in Docker/current browser chain or keep it local-only while Orchestrator UX matures.

## 2026-05-04 - M32 TradingAgents Enablement Path Review
- Goal: decide whether to enable TradingAgents in the default Docker-backed `8805 -> 8802` chain.
- Added:
  - `docs/engineering/34_tradingagents_enablement_path_review.md`
- Decision:
  - Keep TradingAgents local-PoC / opt-in for now.
  - Do not package or enable TradingAgents in the default Docker app chain yet.
- Rationale:
  - TradingAgents is still experimental, dependency-heavy, and better isolated from the main app container.
  - Current user-facing behavior `tradingagents:disabled:subprocess` in Docker is intentional.
  - Future preferred path is a dedicated TradingAgents worker container or service, not main-app packaging.
- Validation:
  - Decision document exists and includes the recommendation.
- Result:
  - M32 is complete.
- Next recommended milestone:
  - `M33 - Orchestrator Product UX Cleanup`: reduce Agent Lab diagnostic density and separate product actions from experimental runner diagnostics.

## 2026-05-04 - M33 Orchestrator Product UX Cleanup
- Goal: reduce Agent Lab noise by separating primary product actions from runtime diagnostics.
- Changed:
  - Wrapped Runner Runtime Status, Orchestrator Intent Preview, and Worker Registry in a collapsible `Runtime Diagnostics` section.
  - Primary actions and Draft Agent Task remain visible.
- Validation:
  - `cd frontend && pnpm build` passed.
- Result:
  - M33 is complete.
- Next recommended milestone:
  - `M34 - Orchestrator Roadmap Freeze`: freeze the Orchestrator/TradingAgents track and return to core AlphaTrace data/DB work unless the user explicitly asks for more TradingAgents execution.

## 2026-05-04 - M34 Orchestrator Roadmap Freeze
- Goal: freeze the current Orchestrator / TradingAgents track and prevent further PoC expansion without product-backend value.
- Added:
  - `docs/engineering/35_orchestrator_track_freeze.md`
- Decision:
  - Pause TradingAgents/Orchestrator expansion after M17-M34.
  - Keep TradingAgents opt-in/local-PoC, not default Docker.
  - Keep QwenRunner in-process and primary for MVP analysis.
  - Return next engineering track to AlphaTrace backend/data durability and ETF/fund/index data-source work.
- Validation:
  - Freeze document exists and includes TradingAgents/QwenRunner/next-track terms.
- Result:
  - M34 is complete.
- Next recommended track:
  - Core AlphaTrace backend/data: verify MySQL runtime/domain stores in the active Docker chain, decide default store for next demo, then continue ETF/fund/index data-source provider work.

## 2026-05-04 - Qwen Credential Status Correction
- Problem:
  - Agent Lab Qwen submit returned `Hyper AI qwen provider/model/base URL are configured, but the API key is missing or could not be decrypted.`
  - TradingAgents button was greyed out.
- Runtime finding:
  - Active chain is `8805 -> 8802`.
  - `GET /api/hyper-ai/profile` returns qwen provider/model/base URL configured, but the saved key is unavailable.
  - `POST /api/hyper-ai/profile/llm/test-current` returns `Saved LLM API key is missing or could not be decrypted.`
  - Runner status now reports `qwen: missing_qwen_key` and `tradingagents: disabled`.
- Changes:
  - `GET /api/hyper-ai/profile` now includes `llm_api_key_available`.
  - Runner status no longer reports Qwen as ready if the backend key is missing/cannot decrypt.
  - Agent Lab blocks Qwen submit with a clear Settings/DASHSCOPE remediation message instead of letting the submit hit backend 400.
  - Settings no longer treats provider/model/base URL alone as a complete Qwen config if the API key is unavailable.
- Validation:
  - `backend/.venv/Scripts/python.exe -m py_compile backend/api/alpha_trace_agent_runtime_routes.py backend/api/hyper_ai_routes.py` passed.
  - `cd frontend && pnpm build` passed.
  - Restarted `hyper-arena-app`.
  - Runner status through `8805/api` reports `qwen status=missing_qwen_key available=false`.
  - Profile through `8805/api` reports `llm_api_key_available=false`.
- Next action for user:
  - Open `http://127.0.0.1:8805/dashboard#settings`, paste a valid DashScope/Qwen key, save it, then click `Test Current Qwen Config`.

## 2026-05-04 - M35 Active Docker Store Baseline Verification
- Goal: verify the active Docker-backed demo chain's persistence baseline before switching any MySQL defaults.
- Runtime finding:
  - Active backend is `http://127.0.0.1:8802/api`.
  - Restored active Vite frontend at `http://127.0.0.1:8805/dashboard`, proxying same-origin `/api` to `8802`.
  - `ALPHA_TRACE_AGENT_RUN_STORE=json`.
  - `ALPHA_TRACE_AGENT_RUN_STORE_PATH=/app/data/alpha_trace_agent_runs.json`.
  - `ALPHA_TRACE_DOMAIN_STORE` is unset in the app container, so domain APIs use the code default static store.
  - `ALPHA_TRACE_MYSQL_DATABASE_URL` is configured for `mysql+pymysql://alpha_user:alpha_pass@mysql:3306/alpha_trace?charset=utf8mb4`.
  - `/app/data/alpha_trace_agent_runs.json` exists and is approximately 4.6 MB.
  - MySQL is running and already has AlphaTrace tables, including agent run and domain tables.
- Validation:
  - `GET http://127.0.0.1:8802/api/health` returned healthy.
  - `GET http://127.0.0.1:8802/api/alpha-trace/agent-runs/runners/status` returned runner status.
  - MySQL table smoke returned `alpha_trace_agent_runs`, `alpha_trace_runtime_events`, `alpha_trace_assets`, `alpha_trace_evidence_items`, `alpha_trace_strategies`, `alpha_trace_portfolios`, and related tables.
  - MySQL sample counts: `agent_runs=1`, `assets=8`, `evidence=10`.
- Interpretation:
  - Current demo-safe default is still JSON AgentRunStore plus static DomainStore.
  - MySQL is available and initialized, but not the active default store in the Docker demo chain.
  - Do not silently switch the default to MySQL until the next milestone explicitly validates MySQL read/write parity and restart behavior.
- Result:
  - M35 is complete.
- Next recommended milestone:
  - `M36 - MySQL Store Activation Smoke`: run a controlled MySQL-backed backend smoke or temporary store switch, verify stub/Qwen-compatible persistence, then decide whether to make MySQL the default for the active Docker chain.

## 2026-05-04 - M36 MySQL Store Activation Smoke
- Goal: validate the existing MySQL-backed AgentRunStore without switching the active Docker default store.
- Initial blocker:
  - `MysqlAgentRunStore` failed with `ModuleNotFoundError: No module named 'pymysql'`.
  - `backend/pyproject.toml` already declares `pymysql>=1.1.0`; the running app image was stale.
- Action:
  - Rebuilt the app image with `docker compose build app`.
  - Recreated only the app container with `docker compose up -d --force-recreate --no-deps app` to avoid touching existing MySQL/Postgres containers.
- Validation:
  - `python -c "import sqlalchemy, pymysql"` inside `hyper-arena-app` passed.
  - `python -m py_compile backend/services/agent_runtime_store/mysql_store.py backend/services/agent_runtime_store/registry.py backend/services/alpha_trace_agent_runtime_service.py` inside the app container passed.
  - Controlled MySQL smoke wrote and read `run_mysql_smoke_2026-05-04T034217_195411_0000`.
  - Read-back result: `status=completed`, `events=1`, `reports=1`, `evidence=1`, `decision=True`.
  - MySQL query confirmed recent `run_mysql_smoke_*` rows in `alpha_trace_agent_runs`.
  - `GET http://127.0.0.1:8802/api/alpha-trace/agent-runs/runners/status` still works.
  - `GET http://127.0.0.1:8805/dashboard#dashboard` returned HTTP 200.
- Current active default:
  - `ALPHA_TRACE_AGENT_RUN_STORE=json`.
  - The MySQL smoke did not switch active demo persistence.
- Result:
  - M36 is complete.
- Next recommended milestone:
  - `M37 - MySQL Default Switch Decision`: decide whether to switch the Docker demo chain to MySQL by default, including JSON fallback and migration expectations, or keep JSON default until a dedicated migration/import path is implemented.

## 2026-05-04 - M37 MySQL Default Store Switch Decision
- Goal: decide whether to make MySQL the active Docker default for AgentRun persistence.
- Finding:
  - MySQL store is operational after rebuilding the app image.
  - Active Docker chain still uses JSON by default and contains existing run history in `/app/data/alpha_trace_agent_runs.json`.
  - MySQL currently has smoke/domain rows but does not contain the full JSON run history.
- Decision:
  - Switched the active Docker default to MySQL for AlphaTrace AgentRun and domain stores.
- Changes:
  - `docker-compose.yml` now defaults `ALPHA_TRACE_AGENT_RUN_STORE=mysql`.
  - `docker-compose.yml` now defaults `ALPHA_TRACE_DOMAIN_STORE=mysql`.
  - `backend/scripts/import_agent_runs_json_to_mysql.py` imports JSON AgentRun history into MySQL.
  - `backend/scripts` is mounted into the app container for operational scripts.
  - `.env.example` documents MySQL as the AlphaTrace product persistence default.
- Migration:
  - Imported JSON history from `/app/data/alpha_trace_agent_runs.json`.
  - Import result: `imported=40`, `skippedExisting=1`, `totalJsonRuns=41`.
- Validation:
  - `backend/.venv/Scripts/python.exe -m py_compile backend/scripts/import_agent_runs_json_to_mysql.py backend/services/agent_runtime_store/mysql_store.py backend/services/agent_runtime_store/json_store.py backend/services/domain_store/mysql_domain_store.py` passed.
  - Recreated app with `docker compose up -d --force-recreate --no-deps app`.
  - App env now reports `ALPHA_TRACE_AGENT_RUN_STORE=mysql` and `ALPHA_TRACE_DOMAIN_STORE=mysql`.
  - `GET /api/alpha-trace/agent-runs?limit=5` returned `total=43` before the final stub smoke.
  - Stub submit created `run_stub_20260504_043437_558467`.
  - After app recreate, `run_stub_20260504_043437_558467` remained queryable with `status=completed`, `events=10`, `reports=1`, and `finalDecision=true`.
  - MySQL counts after switch: `agent_runs=44`, `runtime_events=5691`, `agent_reports=133`, `evidence_refs=168`, `decisions=44`.
  - Domain APIs stayed readable: assets total 8, portfolios total 3, evidence endpoint returned seed evidence.
  - `pnpm --dir frontend build` passed with existing chunk/browserslist warnings.
- Current limitation:
  - Hyper AI/Qwen profile settings are still served by the existing legacy Hyper AI profile storage path. AgentRun/domain stores are now MySQL, but full system configuration migration needs a dedicated milestone.
- Result:
  - M37 is complete.
- Next recommended milestone:
  - `M38 - System Configuration Store Plan`: decide and implement how Qwen/Bocha/provider configuration should move from the current legacy profile storage into AlphaTrace MySQL-backed configuration tables without exposing secrets.

## 2026-05-04 - M38 System Configuration Store Plan
- Goal: move runtime provider/search credentials toward MySQL-backed product configuration while preserving legacy Settings compatibility and secret safety.
- Added:
  - `backend/services/system_config_store/__init__.py`
  - `backend/services/system_config_store/mysql_config_store.py`
  - `backend/scripts/import_legacy_hyper_ai_config_to_mysql.py`
- Changed:
  - Hyper AI LLM config now reads `alpha_trace_system_configs` first, then falls back to legacy `HyperAiProfile`.
  - Qwen config save path still writes legacy profile and now also writes the MySQL system config store.
  - External tool config now reads MySQL first and falls back to legacy profile JSON.
  - Bocha config save/delete path dual-writes legacy profile and MySQL system config.
  - Runner status uses `mysql_system_config`, `legacy_hyper_ai_profile`, `environment`, or `missing` as the Qwen key source instead of treating provider/model/base URL as sufficient.
  - Settings frontend type now accepts `llm_config_source`.
- Migration:
  - Ran the legacy import script inside `hyper-arena-app`.
  - Result: `migratedTools=['bocha']`, `migratedLlm=False`, `profileFound=True`.
  - Bocha now exists in MySQL as `tool:bocha` with `has_secret=1`.
  - Legacy Qwen key could not be migrated because the existing encrypted value cannot be decrypted in the current environment.
- Validation:
  - Container py_compile passed for:
    - `backend/services/system_config_store/mysql_config_store.py`
    - `backend/services/hyper_ai_service.py`
    - `backend/services/hyper_ai_tool_registry.py`
    - `backend/api/hyper_ai_routes.py`
    - `backend/api/alpha_trace_agent_runtime_routes.py`
    - `backend/services/agent_runners/qwen_runner.py`
    - `backend/scripts/import_legacy_hyper_ai_config_to_mysql.py`
  - `pnpm --dir frontend build` passed with existing Vite chunk/browserslist warnings.
  - `GET http://127.0.0.1:8802/api/hyper-ai/profile` returned `llm_config_source=legacy_hyper_ai_profile` and `llm_api_key_available=false`.
  - `GET http://127.0.0.1:8802/api/hyper-ai/tools` returned Bocha configured/enabled.
  - `GET http://127.0.0.1:8802/api/alpha-trace/agent-runs/runners/status` returned Qwen `missing_qwen_key`, which is correct until the user re-saves a valid Qwen key.
  - MySQL validation query only checked `secret_encrypted IS NOT NULL`; no raw secret was printed.
- Runtime note:
  - Vite `8805` was not running during the first same-origin API smoke; direct backend `8802` smoke was used.
- Result:
  - M38 is complete.
- Next recommended milestone:
  - `M39 - Settings Credential Re-save and Runtime Status UX Smoke`: verify Settings can re-save Qwen into MySQL and runner status changes to `qwenConfigSource=mysql_system_config` after a valid key is saved.

## 2026-05-04 - M39 Settings Credential Re-save and Runtime Status UX Smoke
- Goal: verify Settings/runtime credential state after M38 and confirm the user-facing remediation path.
- Action:
  - Restarted Vite real mode on `8805` using same-origin `/api` proxied to Docker backend `8802`.
- Validation:
  - `GET http://127.0.0.1:8805/dashboard#settings` returned HTTP 200.
  - `GET http://127.0.0.1:8805/api/hyper-ai/profile` returned `llm_config_source=legacy_hyper_ai_profile` and `llm_api_key_available=false`.
  - `GET http://127.0.0.1:8805/api/hyper-ai/tools` returned Bocha configured/enabled from the MySQL-backed tool config path.
  - `GET http://127.0.0.1:8805/api/alpha-trace/agent-runs/runners/status` returned Qwen `missing_qwen_key` and TradingAgents disabled.
- Blocker:
  - Final Qwen MySQL config-source validation requires the user to re-save a valid DashScope/Qwen key in Settings. The agent must not read, print, or write raw API keys.
- Result:
  - M39 is blocked on user credential input, but the pre-save state is correct and explainable.
- Next non-dependent milestone:
  - `M40 - Data Source Page Recovery and Back Navigation`: fix the Data Source blank page and add consistent AlphaTrace subpage navigation. This does not depend on Qwen credentials.

## 2026-05-04 - M40 Data Source Page Recovery and Back Navigation
- Goal: fix Data Source route ambiguity and improve back/dashboard navigation on AlphaTrace detail pages.
- Finding:
  - The canonical page route is `data-sources`.
  - `data-source` and `datasource` were not explicitly recognized by the AlphaTrace route parser, so links/manual hashes using those aliases could fall back instead of showing the intended page.
  - Data Sources real-mode data projection itself is available through the Evidence API.
- Changed:
  - `frontend/app/shared/lib/navigation.ts` now maps `/data-source` and `/datasource` to `data-sources`.
  - `frontend/app/main.tsx` now maps `/data-source` and `/datasource` to the Data Sources page and treats the aliases as AlphaTrace routes.
  - `frontend/app/pages/AssetDetailPage.tsx` now includes `ResearchWorkspaceNav` in loading, not-found/error, and normal states.
  - `frontend/app/pages/AgentRunDetailPage.tsx` now includes `ResearchWorkspaceNav` in loading, not-found/error, empty, and normal states.
- Validation:
  - `pnpm --dir frontend build` passed with existing Vite chunk/browserslist warnings.
  - `GET http://127.0.0.1:8805/dashboard#data-source` returned HTTP 200.
  - `GET http://127.0.0.1:8805/dashboard#data-sources` returned HTTP 200.
  - `GET http://127.0.0.1:8805/dashboard#assets/asset_etf_510300` returned HTTP 200.
  - `GET http://127.0.0.1:8805/api/alpha-trace/evidence?limit=3` returned evidence data for the Data Sources projection.
- Result:
  - M40 is complete.
- Next milestone:
  - `M41 - MySQL Configuration Re-save Awaiting User Key`, blocked until a valid Qwen key is re-saved through Settings.

## 2026-05-04 - M41 MySQL Configuration Re-save Awaiting User Key
- Goal: complete Qwen credential validation after the user re-saved a valid DashScope/Qwen key through Settings.
- User action:
  - User saved the Qwen key from `http://127.0.0.1:8805/dashboard#settings`.
- Validation:
  - `GET http://127.0.0.1:8805/api/hyper-ai/profile` returned `llm_config_source=mysql_system_config` and `llm_api_key_available=true`.
  - `POST http://127.0.0.1:8805/api/hyper-ai/profile/llm/test-current` returned success for provider `qwen`, model `qwen-plus`, base URL `https://dashscope.aliyuncs.com/compatible-mode/v1`.
  - `GET http://127.0.0.1:8805/api/alpha-trace/agent-runs/runners/status` returned Qwen `status=ready`, `available=true`, `qwenConfigSource=mysql_system_config`.
  - MySQL `alpha_trace_system_configs` contains `llm:default` with `provider=qwen`, `model=qwen-plus`, `enabled=true`, and `has_secret=1`. Raw secret was not queried or printed.
  - Submitted Qwen run `run_qwen_20260504_063410_011597`.
  - Run transitioned from `running` to `completed`.
  - Runtime API returned 254 events, 4 reports, 5 evidence references, and decision action `hold` with confidence `0.68`.
  - MySQL confirmed the run persisted in `alpha_trace_agent_runs` and related runtime tables: 254 events, 4 reports, 5 evidence refs, 1 decision.
  - Container py_compile passed for changed system config/Hyper AI/runner files.
  - `pnpm --dir frontend build` passed with existing Vite chunk/browserslist warnings.
- Result:
  - M41 is complete.
- Next milestone:
  - `M42 - System Config Admin and Diagnostics Cleanup`: make the Settings and Agent Lab credential-source diagnostics more operator-friendly now that MySQL config is active.

## 2026-05-04 - M42 System Config Admin and Diagnostics Cleanup
- Goal: make runtime credential source diagnostics consistent and visible for Qwen, Bocha, Settings, and Agent Lab after MySQL system config activation.
- Changed:
  - `/api/hyper-ai/tools` now returns non-sensitive `api_key_available` and `config_source` fields for external tools.
  - Settings Runtime Credentials now displays Qwen source, Qwen backend key availability, Bocha source, and Bocha backend key availability.
  - Settings copy now clarifies that `mysql_system_config` means the credential has been saved into the AlphaTrace MySQL-backed system config store.
  - `docs/VALIDATION.md` now records the Qwen/Bocha key rotation and diagnostics checks.
- Validation:
  - Recreated the Docker `app` service so the route change was loaded.
  - `docker exec hyper-arena-app sh -lc "cd /app && python -m py_compile backend/api/hyper_ai_routes.py"` passed.
  - `pnpm --dir frontend build` passed with existing Vite chunk/browserslist warnings.
  - `GET http://127.0.0.1:8805/api/hyper-ai/profile` returned Qwen `llm_config_source=mysql_system_config` and `llm_api_key_available=true`.
  - `GET http://127.0.0.1:8805/api/hyper-ai/tools` returned Bocha `config_source=mysql_system_config`, `api_key_available=true`, and did not expose the raw key.
  - `GET http://127.0.0.1:8805/api/alpha-trace/agent-runs/runners/status` returned Qwen `available=true`, `qwenConfigSource=mysql_system_config`, and TradingAgents disabled with Qwen config visible.
  - `GET http://127.0.0.1:8805/dashboard#settings` returned HTTP 200.
- Operational note:
  - Key rotation should be done from Settings. Do not edit frontend state or print raw secrets.
- Result:
  - M42 is complete.
- Next:
  - The canonical execution plan currently has no milestone after M42. Before further implementation, add the next milestone explicitly to `docs/EXECUTION_PLAN.md` so work remains governed and auditable.

## 2026-05-04 - M43 Long-Run Milestone Plan Extension
- Goal: extend canonical execution governance so the next non-interactive batch can proceed from docs instead of chat memory.
- Changed:
  - Added M43-M48 to `docs/EXECUTION_PLAN.md`.
  - Added M43-M48 validation sections to `docs/VALIDATION.md`.
  - Recorded this M43 entry in `docs/IMPLEMENTATION_LOG.md`.
- Assumptions:
  - Future work should continue to ignore legacy BTC/Hyperliquid runtime noise unless a milestone explicitly targets backend startup profiling.
  - TradingAgents remains opt-in and disabled by default.
  - MySQL remains the canonical persistence direction.
- Validation:
  - Documentation sections for M43-M48 now exist in `docs/EXECUTION_PLAN.md` and `docs/VALIDATION.md`.
  - No business code changed for M43.
- Result:
  - M43 is complete.
- Next milestone:
  - `M44 - Agent Lab and Settings Runtime Diagnostics Closure`.

## 2026-05-04 - M44 Agent Lab and Settings Runtime Diagnostics Closure
- Goal: make runtime credential status clear in Agent Lab and consistent with Settings.
- Changed:
  - Agent Lab now displays a visible Runtime Credential Snapshot for Qwen, Bocha, and TradingAgents.
  - Agent Lab fetches `/hyper-ai/profile` and `/hyper-ai/tools` through the existing Settings runtime credential API.
  - Agent Lab submit error handling now extracts backend `message/detail/error` from API error objects instead of falling back to generic text.
- Validation:
  - `pnpm --dir frontend build` passed with existing Vite chunk/browserslist warnings.
  - API smoke through `8805` returned:
    - Qwen source `mysql_system_config`, key available `true`.
    - Bocha source `mysql_system_config`, key available `true`.
    - Qwen runner `ready`.
    - TradingAgents `disabled`.
  - `GET http://127.0.0.1:8805/dashboard#settings` returned HTTP 200.
  - `GET http://127.0.0.1:8805/dashboard#agent-lab` returned HTTP 200.
- Result:
  - M44 is complete.
- Next milestone:
  - `M45 - TradingAgents PoC Observability Closure`.

## 2026-05-04 - M45 TradingAgents PoC Observability Closure
- Goal: verify TradingAgents PoC observability and regression behavior without enabling TradingAgents by default.
- Finding:
  - AgentRunDetail already has TradingAgents-style flow, worker artifact display, backend runtime log filtering, runtime event stream, and failed run report/decision handling.
  - No additional code was needed for observability in this milestone.
- Validation:
  - Container py_compile passed for:
    - `backend/services/agent_runners/tradingagents_adapter.py`
    - `backend/api/alpha_trace_agent_runtime_routes.py`
    - `backend/services/alpha_trace_agent_runtime_service.py`
  - `pnpm --dir frontend build` passed with existing Vite chunk/browserslist warnings.
  - TradingAgents disabled smoke returned HTTP 400 with `TradingAgents runner is not enabled.`
  - Stub regression completed: `run_stub_20260504_065219_025421`.
  - Qwen regression completed: `run_qwen_20260504_065233_551838`, status `completed`, events `284`, reports `4`, decision `overweight`, confidence `0.72`.
- Result:
  - M45 is complete.
- Next milestone:
  - `M46 - AlphaTrace Market Data v1 Demo Reinforcement`.

## 2026-05-04 - M46 AlphaTrace Market Data v1 Demo Reinforcement
- Goal: verify the AlphaTrace ETF/fund/index static market data path for the demo without using legacy BTC/Hyperliquid endpoints as the AlphaTrace primary data source.
- Finding:
  - Backend market data routes are registered under `/api/alpha-trace/market-data/assets/{assetId}/...`.
  - Asset Detail already uses the AlphaTrace market data API for quote, snapshot, and indicators.
  - The 510300 market data source is `alphatrace_static_market_seed`.
- Validation:
  - `GET http://127.0.0.1:8805/api/alpha-trace/market-data/assets/asset_etf_510300/quote` returned 510300 quote data.
  - `GET http://127.0.0.1:8805/api/alpha-trace/market-data/assets/asset_etf_510300/snapshot` returned valuation, liquidity, volatility, trend, fundFlow, and premiumDiscount data.
  - `GET http://127.0.0.1:8805/api/alpha-trace/market-data/assets/asset_etf_510300/klines?period=1d&limit=5` returned 5 daily kline rows.
  - `GET http://127.0.0.1:8805/api/alpha-trace/market-data/assets/asset_etf_510300/indicators` returned 4 indicators.
  - `GET http://127.0.0.1:8805/dashboard#assets/asset_etf_510300` returned HTTP 200.
  - Container py_compile passed for market data route/schema/store/seed files.
- Result:
  - M46 is complete.
- Next milestone:
  - `M47 - AlphaTrace Demo Path Stabilization`.

## 2026-05-04 - M47 AlphaTrace Demo Path Stabilization
- Goal: verify the 10-minute AlphaTrace demo path in real mode and record any remaining blockers.
- Validation:
  - Page smoke returned HTTP 200 for Dashboard, Asset Research, Asset Detail 510300, Evidence Center, Agent Lab, Decision Attribution, Portfolio Workspace, Leaderboard, and Settings on `http://127.0.0.1:8805/dashboard#...`.
  - API smoke returned HTTP 200 for `/api/health`, `/api/alpha-trace/assets`, `/api/alpha-trace/assets/asset_etf_510300`, `/api/alpha-trace/evidence?limit=5`, `/api/alpha-trace/decisions`, `/api/alpha-trace/portfolios`, `/api/alpha-trace/leaderboard`, `/api/hyper-ai/profile`, and `/api/alpha-trace/agent-runs/runners/status`.
  - `pnpm --dir frontend build` passed with existing Vite chunk and Browserslist warnings.
  - Submitted portfolio diagnosis run `run_qwen_20260504_065828_198259`.
  - The run completed with 275 events, 4 reports, 5 evidence references, and final decision `overweight` with confidence `0.72`.
  - AgentRunDetail page smoke for the completed portfolio diagnosis run returned HTTP 200.
- Result:
  - M47 is complete.
- Notes:
  - The portfolio diagnosis evidence in this run came from Bocha external search results plus the configured evidence path. No raw keys were printed.
- Next milestone:
  - `M48 - Four-Hour Batch Closure and Freeze Point`.

## 2026-05-04 - M48 Four-Hour Batch Closure and Freeze Point
- Goal: close the M43-M48 non-interactive batch with an auditable validation state.
- Completed in this batch:
  - M43: added canonical M43-M48 execution and validation plan.
  - M44: Agent Lab now shows Qwen, Bocha, and TradingAgents runtime credential/source diagnostics consistent with Settings.
  - M45: TradingAgents PoC observability was verified; disabled behavior, Stub regression, and Qwen regression passed.
  - M46: AlphaTrace 510300 static market data quote/snapshot/klines/indicators were verified.
  - M47: demo path smoke passed and portfolio diagnosis completed as `run_qwen_20260504_065828_198259`.
  - M48: final API smoke and git status capture completed.
- Final validation:
  - `GET http://127.0.0.1:8805/api/health` returned HTTP 200.
  - `GET http://127.0.0.1:8805/api/hyper-ai/profile` returned HTTP 200.
  - `GET http://127.0.0.1:8805/api/alpha-trace/agent-runs/runners/status` returned HTTP 200.
  - `GET http://127.0.0.1:8805/api/alpha-trace/assets` returned HTTP 200.
  - `GET http://127.0.0.1:8805/api/alpha-trace/evidence` returned HTTP 200.
  - `GET http://127.0.0.1:8805/api/alpha-trace/leaderboard` returned HTTP 200.
  - `git status --short` was captured; the worktree remains broadly dirty from current and previous AlphaTrace milestones.
- Result:
  - M48 is complete.
- Risks / open items:
  - Legacy BTC/Hyperliquid startup logs remain intentionally out of scope for this batch.
  - TradingAgents remains opt-in and disabled by default unless explicitly configured.
  - The current worktree includes many uncommitted AlphaTrace files; commit grouping should be done before another large implementation batch.
- Next:
  - Add the next milestone explicitly to `docs/EXECUTION_PLAN.md` before continuing implementation. Candidate: `M49 - Commit/Change-Set Review and AlphaTrace Runtime Regression Pack`, unless product direction changes.

## 2026-05-04 - M49-M54 Continuation After M48 Hard Stop
- Trigger:
  - User clarified that the intended non-interactive session should continue beyond the M48 batch closure rather than stopping early.
- Adjustment:
  - Added M49-M54 to `docs/EXECUTION_PLAN.md`.
  - Added M49-M54 validation rules to `docs/VALIDATION.md`.
- Assumption:
  - Continue with non-invasive stabilization, validation, operations, and persistence verification tasks before new feature work.
- Next milestone:
  - `M49 - Commit/Change-Set Review and Runtime Regression Pack`.

## 2026-05-04 - M49 Commit/Change-Set Review and Runtime Regression Pack
- Goal: make the broad dirty worktree and runtime state auditable before continuing.
- Change-set finding:
  - Modified tracked files span backend Agent Runtime, Qwen/TradingAgents runner registry, system config, AlphaTrace stores, frontend AlphaTrace pages/entities, Docker/config, and engineering docs.
  - Untracked files include new AlphaTrace APIs/stores/integrations, MySQL store, market data store, decision/leaderboard docs, orchestration docs, demo docs, and run-id marker files.
  - Recommendation: do not commit as one opaque batch. Split into at least: runtime/store backend, frontend real-mode UX, docs/governance, integrations/adapters, and operational config.
- Runtime finding:
  - 8802 Docker backend was healthy.
  - 8805 Vite dev server had exited; after restart, API proxy returned 500 until `VITE_ALPHA_TRACE_API_PROXY_TARGET=http://127.0.0.1:8802/api` was set.
  - Correct current 8805 startup env: `VITE_ALPHA_TRACE_API_MODE=real`, `VITE_ALPHA_TRACE_API_BASE_URL=/api`, `VITE_ALPHA_TRACE_API_PROXY_TARGET=http://127.0.0.1:8802/api`.
- Validation:
  - `git status --short` and `git diff --stat` captured.
  - API smoke passed for health, runner status, assets, evidence, decisions, and leaderboard through 8805 after proxy correction.
  - Stub regression completed: `run_stub_20260504_130155_819376`.
  - Runner status: stub ready, qwen ready from `mysql_system_config`, TradingAgents disabled, LangAlpha disabled.
- Result:
  - M49 is complete.
- Next milestone:
  - `M50 - Startup and Runtime Operations Runbook`.

## 2026-05-04 - M50 Startup and Runtime Operations Runbook
- Goal: document the current startup and troubleshooting procedure without adding a startup script.
- Changed:
  - Updated `docs/engineering/20_alphatrace_startup_guide.md`.
  - Documented current port map: Docker backend/API on `8802`, preferred Vite real-mode UI on `8805`, older/manual Vite port `8804` as historical.
  - Documented required 8805 same-origin proxy env: `VITE_ALPHA_TRACE_API_BASE_URL=/api` and `VITE_ALPHA_TRACE_API_PROXY_TARGET=http://127.0.0.1:8802/api`.
  - Added troubleshooting for the case where Vite page opens but `/api/*` returns HTTP 500.
- Validation:
  - `docker ps` confirmed `hyper-arena-app` healthy on `127.0.0.1:8802` and `hyper-arena-mysql` healthy on `127.0.0.1:3307`.
  - `GET http://127.0.0.1:8805/dashboard#settings` returned HTTP 200.
  - `GET http://127.0.0.1:8805/api/health` returned HTTP 200.
  - `GET http://127.0.0.1:8805/api/hyper-ai/profile` returned HTTP 200.
- Result:
  - M50 is complete.
- Next milestone:
  - `M51 - MySQL Persistence Verification Pack`.

## 2026-05-04 - M51 MySQL Persistence Verification Pack
- Goal: verify current MySQL-backed runtime/config/domain persistence without schema changes.
- Finding:
  - The active AlphaTrace MySQL database is `alpha_trace`.
  - `ALPHA_TRACE_AGENT_RUN_STORE=mysql` is active in the backend container.
  - JSON store path is still configured as fallback/legacy runtime data path.
  - The older assumed database name `hyper_alpha` is not present; use `alpha_trace` for future MySQL checks.
- Validation:
  - `hyper-arena-mysql` is healthy.
  - AlphaTrace MySQL tables exist for runtime, domain stores, data sources, and system config.
  - Safe count queries returned: 50 agent runs, 6801 runtime events, 151 reports, 188 evidence refs, and 50 decisions.
  - Safe system config queries confirmed Qwen `llm:default` and Bocha `tool:bocha` are enabled and have API key availability true. Raw secrets were not recorded in docs.
  - Latest portfolio diagnosis run `run_qwen_20260504_065828_198259` is present in MySQL and readable through the runtime API.
  - `/api/hyper-ai/tools` confirms Bocha `config_source=mysql_system_config`, `api_key_available=true`, and does not expose the raw key.
- Result:
  - M51 is complete.
- Next milestone:
  - `M52 - Agent Runtime Failure Regression Pack`.

## 2026-05-04 - M52 Agent Runtime Failure Regression Pack
- Goal: verify failure and disabled paths stay explainable without breaking Qwen/Stub.
- Validation:
  - TradingAgents disabled submit returned HTTP 400 with `TradingAgents runner is not enabled.`.
  - Unsupported runner submit returned HTTP 422 schema validation with allowed runner types.
  - Stub regression completed: `run_stub_20260504_130628_404756`.
  - Runner status returned stub ready, qwen ready from `mysql_system_config`, TradingAgents disabled, and LangAlpha disabled.
  - Recent AgentRun list contained no failed runs, so failed-detail smoke was not applicable.
- Result:
  - M52 is complete.
- Next milestone:
  - `M53 - Demo UX Smoke and Minimal Fixes`.

## 2026-05-04 - M53 Demo UX Smoke and Minimal Fixes
- Goal: run a demo UX pass and fix only blocking route/error/empty-state issues.
- Validation:
  - Page smoke returned HTTP 200 for Dashboard, Assets, Asset Detail 510300, Agent Lab, AgentRunDetail for `run_qwen_20260504_065828_198259`, Decisions, Portfolio, Leaderboard, Settings, Data Sources, and `data-source` alias.
  - Asset Detail and AgentRunDetail contain `ResearchWorkspaceNav` usage for back/dashboard navigation.
  - `pnpm --dir frontend build` passed with existing Vite chunk-size, dynamic import, Browserslist, and baseline-browser-mapping warnings.
- Result:
  - M53 is complete.
- Notes:
  - No blocking UX issue was found in this pass; no code changes were required for M53.
- Next milestone:
  - `M54 - Extended Batch Closure`.

## 2026-05-04 - M54 Extended Batch Closure
- Goal: close the continued M49-M54 long-run batch with final validation and next-step guidance.
- Completed in this extension:
  - M49: change-set review and runtime regression pack.
  - M50: startup/runtime operations runbook updated for current 8802/8805 usage.
  - M51: MySQL persistence verification pack.
  - M52: Agent Runtime failure regression pack.
  - M53: demo UX smoke and minimal-fix pass.
  - M54: final API smoke and worktree status capture.
- Final validation:
  - `GET http://127.0.0.1:8805/api/health` returned HTTP 200.
  - `GET http://127.0.0.1:8805/api/hyper-ai/profile` returned HTTP 200.
  - `GET http://127.0.0.1:8805/api/alpha-trace/agent-runs/runners/status` returned HTTP 200.
  - `GET http://127.0.0.1:8805/api/alpha-trace/assets` returned HTTP 200.
  - `GET http://127.0.0.1:8805/api/alpha-trace/evidence` returned HTTP 200.
  - `GET http://127.0.0.1:8805/api/alpha-trace/leaderboard` returned HTTP 200.
  - `git status --short` was captured again; the worktree remains broadly dirty from prior and current AlphaTrace milestones.
- Result:
  - M54 is complete.
- Recommendation:
  - Before another feature batch, perform change-set grouping and commit preparation. The dirty worktree is too broad to safely continue indefinitely without losing reviewability.
  - Suggested next canonical milestone: `M55 - Change-Set Grouping, Commit Prep, and Post-Commit Regression`.

## 2026-05-04 - M55 Change-Set Grouping and Commit Preparation
- Goal: make the broad dirty worktree reviewable before any commit.
- Worktree grouping:
  - backend: 38 changed/untracked paths
  - frontend: 24 changed paths
  - docs: 44 changed/untracked paths
  - root/config: 11 paths
  - scripts: 1 untracked path group
- Manual-decision candidates:
  - Root `IMPLEMENTATION_LOG.md` appears separate from canonical `docs/IMPLEMENTATION_LOG.md`; decide whether to keep or remove before commit.
  - `last_*.txt` run marker files should likely be excluded or moved into docs if they are needed.
  - `scripts/` needs review before committing because it may include operational helpers not yet accepted as canonical.
- Recommended commit split:
  1. Governance/docs canonical files and engineering docs.
  2. Backend Agent Runtime, MySQL store, runner adapters, Bocha/market-data/decision/leaderboard stores.
  3. Frontend AlphaTrace real-mode pages and shared UI/API helpers.
  4. Config/ops changes: Docker, env example, backend pyproject, startup guide.
  5. Optional scripts/run markers only after manual review.
- Validation:
  - `git status --short` grouping captured.
  - API smoke passed for `/api/health` and `/api/alpha-trace/agent-runs/runners/status`.
- Result:
  - M55 is complete.
- Next milestone:
  - `M56 - Backend PyCompile Regression Sweep`.

## 2026-05-04 - M56 Backend PyCompile Regression Sweep
- Goal: verify backend Python syntax across API, schema, and service layers after the broad AlphaTrace changes.
- Validation:
  - Container command passed: `python -m compileall -q backend/api backend/schemas backend/services`.
- Result:
  - M56 is complete.
- Next milestone:
  - `M57 - Frontend Build and Route Regression Sweep`.

## 2026-05-04 - M57 Frontend Build and Route Regression Sweep
- Goal: verify frontend build and key AlphaTrace routes after backend compile sweep.
- Validation:
  - `pnpm --dir frontend build` passed.
  - Page smoke returned HTTP 200 for Dashboard, Assets, Asset Detail 510300, Agent Lab, AgentRunDetail, Decisions, Portfolio, Leaderboard, Settings, and Data Source alias.
- Known warnings:
  - Existing Vite chunk-size warnings remain.
  - Existing dynamic import/static import overlap warnings remain.
  - Browserslist and baseline-browser-mapping data are stale.
- Result:
  - M57 is complete.
- Next milestone:
  - `M58 - Next Execution Plan Extension`.

## 2026-05-04 - M58 Next Execution Plan Extension
- Goal: add the next implementation milestones after compile/build/regression state is known.
- Changed:
  - Added M59-M64 to `docs/EXECUTION_PLAN.md`.
- Next milestones:
  - M59: transient artifact policy and commit hygiene.
  - M60: MySQL schema snapshot and store boundary review.
  - M61: runtime API smoke collection.
  - M62: TradingAgents enablement preflight.
  - M63: legacy runtime noise isolation design only.
  - M64: continuation closure.
- Result:
  - M58 is complete.
- Next milestone:
  - `M59 - Transient Artifact Policy and Commit Hygiene`.

## 2026-05-04 - M59 Transient Artifact Policy and Commit Hygiene
- Goal: prevent local run artifacts from being accidentally committed while preserving reviewable source/docs changes.
- Changed:
  - Added narrow `.gitignore` rules for root `/IMPLEMENTATION_LOG.md` and `/last_*.txt`.
- Validation:
  - `git status --ignored --short` now shows root `IMPLEMENTATION_LOG.md` and `last_*.txt` marker files as ignored.
  - `scripts/` remains unignored and should be manually reviewed before commit.
- Result:
  - M59 is complete.
- Next milestone:
  - `M60 - MySQL Schema Snapshot and Store Boundary Review`.

## 2026-05-04 - M60 MySQL Schema Snapshot and Store Boundary Review
- Goal: record current AlphaTrace MySQL schema and store boundaries before further DB work.
- Changed:
  - Added `docs/engineering/36_mysql_schema_snapshot.md`.
- Validation:
  - Snapshot generated from safe `SHOW TABLES LIKE 'alpha_trace%'` and `DESCRIBE <table>` queries only.
  - Snapshot covers 11 tables in database `alpha_trace`.
  - No raw or encrypted secret values are included.
- Result:
  - M60 is complete.
- Next milestone:
  - `M61 - Runtime API Smoke Collection`.

## 2026-05-04 - M61 Runtime API Smoke Collection
- Goal: create and execute a repeatable API/page smoke checklist.
- Changed:
  - Added `docs/engineering/37_runtime_api_smoke_collection.md`.
- Validation:
  - Health/config/runner/domain API smoke passed through `http://127.0.0.1:8805/api`.
  - Market data quote/snapshot/klines/indicators smoke passed for `asset_etf_510300`.
  - Stub submit smoke completed: `run_stub_20260504_131914_531650`.
- Result:
  - M61 is complete.
- Next milestone:
  - `M62 - TradingAgents Enablement Preflight`.

## 2026-05-04 - M62 TradingAgents Enablement Preflight
- Goal: verify and document TradingAgents disabled/preflight behavior without running TradingAgents.
- Changed:
  - Added `docs/engineering/38_tradingagents_enablement_preflight.md`.
- Validation:
  - Runner status shows TradingAgents `enabled=false`, `available=false`, `status=disabled`, `executionMode=subprocess`.
  - Runner status also shows Qwen key availability from `mysql_system_config`.
  - Disabled submit returned HTTP 400 with `TradingAgents runner is not enabled.`.
  - Hyper AI profile confirms Qwen provider/model/key availability from MySQL system config.
- Result:
  - M62 is complete.
- Next milestone:
  - `M63 - Legacy Runtime Noise Isolation Design`.

## 2026-05-04 - M63 Legacy Runtime Noise Isolation Design
- Goal: design how to isolate legacy BTC/Hyperliquid startup noise without changing runtime behavior now.
- Changed:
  - Added `docs/engineering/39_legacy_runtime_noise_isolation_design.md`.
- Finding:
  - `backend/main.py` already has partial AlphaTrace-only profile gates: `ALPHATRACE_BACKEND_PROFILE`, `ALPHATRACE_LEGACY_RUNTIME_ENABLED`, and `ALPHATRACE_FRONTEND_WATCHER_ENABLED`.
  - Current Docker container does not set these env vars, so legacy runtime remains enabled by default.
  - Likely noise path is legacy startup via `services.startup.initialize_services()` and related market/scheduler/strategy loops.
- Result:
  - M63 is complete.
- Next milestone:
  - `M64 - Long-Run Continuation Closure`.

## 2026-05-04 - M64 Long-Run Continuation Closure
- Goal: close the M55-M64 continuation batch with validation and a clear decision point.
- Completed in this continuation:
  - M55: change-set grouping and commit preparation.
  - M56: backend compile sweep.
  - M57: frontend build and route regression sweep.
  - M58: next milestone extension.
  - M59: transient artifact ignore policy.
  - M60: MySQL schema snapshot.
  - M61: runtime API smoke collection.
  - M62: TradingAgents enablement preflight.
  - M63: legacy runtime noise isolation design.
  - M64: final smoke and worktree status capture.
- Final validation:
  - `GET http://127.0.0.1:8805/api/health` returned HTTP 200.
  - `GET http://127.0.0.1:8805/api/hyper-ai/profile` returned HTTP 200.
  - `GET http://127.0.0.1:8805/api/alpha-trace/agent-runs/runners/status` returned HTTP 200.
  - `GET http://127.0.0.1:8805/api/alpha-trace/assets` returned HTTP 200.
  - `GET http://127.0.0.1:8805/api/alpha-trace/evidence` returned HTTP 200.
  - `GET http://127.0.0.1:8805/api/alpha-trace/leaderboard` returned HTTP 200.
  - `git status --short` shows 115 dirty entries after ignoring local run artifacts.
- Result:
  - M64 is complete.
- Stop reason:
  - The next responsible step is not more feature implementation; it is commit grouping/review. Continuing to add features on top of 115 dirty entries would reduce reviewability and increase rollback risk.
- Recommended next milestone:
  - `M65 - Commit Grouping Review and Git Save Point`.

## 2026-05-04 - M65 Run-Scoped Evidence Resolver Fix
- Goal: make Bocha/run-scoped evidence ids such as `ev_bocha_*` open with full evidence details from Evidence Center.
- Finding:
  - Qwen/Bocha runs already persisted full evidence refs in AgentRunStore.
  - `GET /api/alpha-trace/evidence/{evidenceId}` only checked the static/MySQL domain EvidenceStore, so run-scoped Bocha evidence returned 404 and Evidence Center showed an empty detail state.
- Changed:
  - `backend/api/alpha_trace_evidence_routes.py`: added AgentRunStore fallback resolver for run-scoped evidence refs, preserving source URL, summary, extracted fields, quality/reliability scores, related assets, run id, and decision usage.
  - `frontend/app/pages/EvidenceCenterPage.tsx`: when routed with `evidenceId`, fetches the evidence detail directly and merges it into the list before filtering.
- Validation:
  - `python -m py_compile backend/api/alpha_trace_evidence_routes.py` passed.
  - `pnpm --dir frontend build` passed.
  - Restarted Docker app container to load mounted backend route changes.
  - `GET http://127.0.0.1:8805/api/health` returned HTTP 200.
  - `GET http://127.0.0.1:8805/api/alpha-trace/evidence/ev_bocha_94b8587c2fbc49` returned full Bocha evidence detail with `sourceType=bocha_search`, source URL, summary, extracted fields, `usedByAgentRunIds`, and `usedByDecisionIds`.
- Result:
  - M65 is complete.
- Next recommended milestone:
  - M66 - Tool Call Timeline Normalization, then M67 - AlphaTrace Native Multi-Agent Runner plan/implementation.

## 2026-05-04 - M66 Tool Calls Timeline Normalization
- Goal: make AgentRunDetail show persisted `ToolCall` records and runtime `tool.called` / `tool.result` events together instead of hiding runtime tool events whenever `run.toolCalls` exists.
- Finding:
  - Qwen/Bocha runs already emit runtime tool events for `portfolio.context.load`, `evidence.retrieve`, `bocha.search`, and `qwen.*` steps.
  - The UI rendered `run.toolCalls` first and only rendered runtime-derived tool activities when `run.toolCalls` was empty, which could hide real runtime tool activity.
- Changed:
  - `frontend/app/pages/AgentRunDetailPage.tsx`: Tool Calls Timeline now renders both persisted tool calls and runtime-derived tool activities.
  - Evidence buttons in Tool Calls Timeline and Evidence Used now pass `runId` along with `evidenceId` for run-scoped traceability.
- Validation:
  - `pnpm --dir frontend build` passed.
  - `GET http://127.0.0.1:8805/api/alpha-trace/agent-runs/run_qwen_20260504_065828_198259/events` contains 16 `tool.called` / `tool.result` events.
  - `GET http://127.0.0.1:8805/dashboard#agent-lab/runs/run_qwen_20260504_065828_198259` returned HTTP 200.
- Result:
  - M66 is complete.
- Next recommended milestone:
  - M67 - AlphaTrace Native Multi-Agent Runner design/implementation, keeping TradingAgents as optional/reference runner.

## 2026-05-04 - M67 Bocha Evidence Source URL Visibility
- Goal: make external-search evidence easier to verify by exposing Bocha source URLs in the UI.
- Changed:
  - `frontend/app/pages/EvidenceCenterPage.tsx`: evidence detail now renders the source URL as a clickable link and adds a collapsible embedded webpage preview iframe.
  - `frontend/app/pages/AgentRunDetailPage.tsx`: Evidence Used cards now show the source URL and an `Open source webpage` action when evidence has an HTTP(S) URL.
- Notes:
  - Embedded previews are best-effort only. Many external sites block iframe embedding with X-Frame-Options or CSP, so the direct source link remains the canonical verification path.
- Validation:
  - `pnpm --dir frontend build` passed.
- Result:
  - M67 is complete.
- Next recommended milestone:
  - AlphaTrace Native Multi-Agent Runner v1, or continue polishing Evidence/Tool traceability if UI review finds more gaps.

## 2026-05-04 - M68 AlphaTrace Native Multi-Agent Runner v1
- Goal: expose AlphaTrace-owned native multi-agent workflow as a first-class runner without exposing or depending on TradingAgents internals.
- Design decision:
  - `runnerType=alphatrace_native` is the product-facing AlphaTrace native runner.
  - It deliberately reuses the already-proven Qwen execution path for v1: Evidence Retrieval, Bocha/static evidence, Market View, Bull/Bear parallel Qwen calls, Risk Review, Final Decision, SSE events, and MySQL/JSON persistence.
  - This avoids duplicating orchestration logic while giving the product a clean runner boundary distinct from the generic `qwen` runner and the optional `tradingagents` PoC.
- Changed:
  - `backend/schemas/alpha_trace_agent_runtime.py`: added `alphatrace_native` to `AgentRunnerMode`.
  - `backend/services/agent_runners/qwen_runner.py`: parameterized runner type, run id prefix, worker name, response message, and triggeredBy for safe subclassing.
  - `backend/services/agent_runners/native_multi_agent_runner.py`: added `AlphaTraceNativeRunnerAdapter` subclassing the proven Qwen runtime path.
  - `backend/services/alpha_trace_agent_runtime_service.py`: registered the native runner and made retry preserve `alphatrace_native` instead of falling back to `qwen`.
  - `backend/services/agent_orchestrator/execution_policy.py`: added native in-process execution policy.
  - `backend/services/agent_orchestrator/capability_matrix.py`: added native runner capability and made it the recommended product runner for `single_asset_analysis` / `portfolio_diagnosis`.
  - `backend/api/alpha_trace_agent_runtime_routes.py`: added native runner status diagnostics tied to backend Qwen key readiness.
  - `frontend/app/entities/agent/api.ts`: added native runner type support.
  - `frontend/app/pages/AgentLabPage.tsx`: added `Submit Native Multi-Agent Task`, runner diagnostics card, draft runner option, and clear blocked reason handling.
- Validation:
  - `python -m py_compile backend/schemas/alpha_trace_agent_runtime.py backend/services/agent_runners/qwen_runner.py backend/services/agent_runners/native_multi_agent_runner.py backend/services/alpha_trace_agent_runtime_service.py backend/services/agent_orchestrator/execution_policy.py backend/services/agent_orchestrator/capability_matrix.py backend/api/alpha_trace_agent_runtime_routes.py` passed.
  - `pnpm --dir frontend build` passed.
  - Restarted Docker app container.
  - `GET http://127.0.0.1:8805/api/alpha-trace/agent-runs/runners/status` returned `alphatrace_native` with `status=ready`, `qwenConfigSource=mysql_system_config`.
  - Submitted native run `run_native_20260504_142346_793914`; `/submit` immediately returned `status=running`, `mode=alphatrace_native`.
  - Native run completed with 269 events, 4 reports, 5 evidence refs, and final decision `hold` with confidence `0.68`.
  - Stub regression submitted `run_stub_20260504_142615_120013` and returned `completed`.
- Result:
  - M68 is complete.
- Notes:
  - V1 is a thin product runner wrapper over the Qwen-powered AlphaTrace DAG, not a second independent orchestration implementation.
  - TradingAgents remains opt-in/reference PoC and is not used by `alphatrace_native`.
- Next recommended milestone:
  - M69 - Native runner UI/DAG copy polish and evidence/tool trace review, or M70 - MySQL-backed run/config hardening.

## 2026-05-04 - M69 Native Runner UI/DAG Copy Polish and Trace Review
- Goal: remove misleading Qwen-only wording from the AlphaTrace Native runner while preserving the same proven execution path.
- Changed:
  - `backend/services/agent_runners/qwen_runner.py`: added display-name/run-name/initial-agent parameters so subclassed runners can render accurate runtime metadata.
  - `backend/services/agent_runners/native_multi_agent_runner.py`: set native-specific run name, portfolio run name, adapter display name, initial orchestrator name, and initial reasoning content.
  - `docs/EXECUTION_PLAN.md`: marked M69 done and recorded validation.
- Validation:
  - `python -m py_compile backend/services/agent_runners/qwen_runner.py backend/services/agent_runners/native_multi_agent_runner.py` passed.
  - Restarted Docker app container.
  - `GET http://127.0.0.1:8805/api/alpha-trace/agent-runs/runners/status` returned native runner `ready`.
  - Submitted `run_native_20260504_142907_684988`; immediate response showed `name=AlphaTrace Native Multi-Agent Task`, `triggeredBy=alphatrace_native`, event source `alphatrace_native`, and initial agent `AlphaTrace Native Orchestrator`.
  - The run completed with 4 reports, 5 evidence refs, and decision `hold`.
- Result:
  - M69 is complete.
- Next recommended milestone:
  - M70 - MySQL-backed runtime/config hardening, with no legacy BTC work.

## 2026-05-04 - M70 Full-Stack Architecture Baseline
- Goal: document the complete frontend/backend AlphaTrace architecture so future tasks can be executed against a shared map instead of scattered context.
- Changed:
  - Added `docs/ARCHITECTURE.md` covering runtime/ports, backend API/domain/store/integrations, Agent Runtime, runners, persistence, evidence, frontend pages/entities/shared API, settings, TradingAgents/LangAlpha boundaries, and legacy boundaries.
  - Updated `docs/PROJECT_SPEC.md` source-of-truth section to include `docs/ARCHITECTURE.md`.
  - Updated `docs/EXECUTION_PLAN.md` with M70 completion status.
- Validation:
  - Confirmed backend/frontend directory and route/page structures before writing the architecture map.
  - Documentation-only change; no backend py_compile or frontend build required.
- Result:
  - M70 is complete.
- Next recommended milestone:
  - M71 - Settings/config source consistency and runtime diagnostics hardening.
- Follow-up fix:
  - Added `.gitignore` exception `!docs/ARCHITECTURE.md` because root `docs/*.md` ignore rule would otherwise hide the new canonical architecture document.
  - Corrected `docs/PROJECT_SPEC.md` Source of Truth formatting after PowerShell literal newline insertion.

## 2026-05-05 - M71 Long-Run Plan Extension for Runtime Hardening
- Goal: extend canonical execution and validation docs for M71-M78 so the next long-run batch can proceed without relying on chat history.
- Changed:
  - Added M71-M78 to `docs/EXECUTION_PLAN.md`.
  - Added M71-M78 validation rules to `docs/VALIDATION.md`.
- Validation:
  - Documentation-only change; no backend py_compile or frontend build required.
- Result:
  - M71 is complete.
- Next milestone:
  - M72 - Runtime Config Consistency Hardening.

## 2026-05-05 - M71 Scope Expansion to Full-Stack Optimization
- User correction:
  - The M71-M78 batch was too narrow. Future work must optimize the whole backend/frontend system, including architecture, calculation logic, display, data/source governance, runtime, persistence, tests, and release hygiene.
- Changed:
  - Added M79-M92 to `docs/EXECUTION_PLAN.md` as the full-stack optimization track.
  - Added M79-M92 validation rules to `docs/VALIDATION.md`.
- Result:
  - M71 remains complete and now covers both near-term M72-M78 hardening and longer full-stack M79-M92 optimization.
- Next action:
  - Continue with M72 Runtime Config Consistency Hardening as the first non-Done milestone, then proceed through the expanded plan.

## 2026-05-05 - M72 Runtime Config Consistency Hardening
- Goal: verify and harden Qwen/DASHSCOPE/Bocha/TradingAgents config status consistency across Settings, Hyper AI profile/tools, and Agent Runtime runner status.
- Validation:
  - `/api/hyper-ai/profile`: Qwen provider/model/baseUrl/key availability came from `mysql_system_config`.
  - `/api/hyper-ai/tools`: Bocha configured/key availability came from `mysql_system_config`.
  - `/api/alpha-trace/agent-runs/runners/status`: qwen and alphatrace_native were `ready`; TradingAgents was `disabled` with explicit enablement message; qwen config source matched `mysql_system_config`.
  - `/dashboard#settings` returned HTTP 200.
  - `/dashboard#agent-lab` returned HTTP 200.
- Changed:
  - Documentation only: marked M72 done and M73 ready.
- Result:
  - M72 is complete. No code change was required.
- Next milestone:
  - M73 - Frontend Route and Navigation Stability.

## 2026-05-05 - M73 Frontend Route and Navigation Stability
- Goal: verify AlphaTrace real-mode routes do not return a blank/failed shell and that the frontend build remains healthy.
- Validation:
  - HTTP 200 through `8805` for dashboard, assets, asset detail, evidence, agent lab, portfolio, decisions, leaderboard, data sources, and settings routes.
  - `pnpm --dir frontend build` passed. Existing Vite chunk-size/dynamic-import/Browserslist warnings remain unchanged.
- Changed:
  - Documentation only: marked M73 done and M74 ready.
- Result:
  - M73 is complete. No page code change was required in this pass.
- Next milestone:
  - M74 - Evidence Traceability End-to-End.

## 2026-05-05 - M74 Evidence Traceability End-to-End
- Goal: verify run-scoped and Bocha evidence can be traced from AgentRunDetail/runtime events to Evidence Center detail and original source URL.
- Validation:
  - `/api/alpha-trace/agent-runs/run_native_20260504_142907_684988/evidence` returned Bocha/static evidence with title, source, summary, URL where available, and extracted fields.
  - `/api/alpha-trace/evidence/ev_bocha_68eaea91d6686f` returned full run-scoped Bocha evidence detail, URL, `usedByAgentRunIds`, and `usedByDecisionIds`.
  - Runtime events included `market.context.load`, `evidence.retrieve`, `bocha.search`, and `qwen.*` tool calls/results.
  - Bull/Bear `tool.called` events started at the same timestamp in the native run, confirming the displayed parallel stage is backed by runtime events.
- Changed:
  - Documentation only: marked M74 done and M75 ready.
- Result:
  - M74 is complete. No code change was required.
- Next milestone:
  - M75 - AlphaTrace Native Runner Product Path.

## 2026-05-05 - M75 AlphaTrace Native Runner Product Path
- Goal: validate `alphatrace_native` as the recommended product runner path while keeping TradingAgents as opt-in PoC.
- Validation:
  - Runner status showed native runner `ready` with Qwen config from `mysql_system_config`.
  - Submitted `run_native_20260504_161127_889959`; submit returned immediately with `status=running`, `mode=alphatrace_native`, `triggeredBy=alphatrace_native`.
  - Run completed with 274 events, 16 tool events, 4 reports, 5 evidence refs, and decision `hold` confidence `0.68`.
  - `/dashboard#agent-lab` and `/dashboard#agent-lab/runs/run_native_20260504_161127_889959` returned HTTP 200.
- Changed:
  - Documentation only: marked M75 done and M76 ready.
- Result:
  - M75 is complete. No code change was required.
- Next milestone:
  - M76 - MySQL Persistence Integrity Pass.

## 2026-05-05 - M76 MySQL Persistence Integrity Pass
- Goal: verify AgentRunStore, domain store, and system config store persist critical AlphaTrace data through backend restart.
- Validation:
  - Active Docker env showed `ALPHA_TRACE_AGENT_RUN_STORE=mysql` and `ALPHA_TRACE_DOMAIN_STORE=mysql`.
  - Safe MySQL table count check found runtime/domain/config tables populated: runs 60, events 8710, reports 182, evidence refs 223, decisions 60, assets 8, evidence items 10, strategies 8, portfolios 3, system configs 2.
  - `alpha_trace_data_sources` exists but has 0 rows; defer to M83 Data Source Domain v1 Completion.
  - After Docker app restart and startup wait, health/profile/assets/evidence/recent native run APIs returned HTTP 200.
  - Recent native run `run_native_20260504_161127_889959` remained queryable with completed status, 4 reports, and 5 evidence refs.
- Changed:
  - Documentation only: marked M76 done and M77 ready.
- Result:
  - M76 is complete.
- Next milestone:
  - M77 - Runtime Validation Pack.

## 2026-05-05 - M77 Runtime Validation Pack
- Goal: execute and record the standardized runtime/domain regression pack.
- Validation:
  - Health/profile/tools/runner/assets/evidence/portfolios/decisions/leaderboard API smoke all returned HTTP 200 through `8805`.
  - Stub smoke completed as `run_stub_20260504_161636_552900`.
  - TradingAgents disabled smoke returned HTTP 400 with `TradingAgents runner is not enabled.`.
  - Native smoke `run_native_20260504_161650_865891` completed with 4 reports, 5 evidence refs, and decision `overweight`.
  - Qwen smoke `run_qwen_20260504_161650_937987` completed with 4 reports, 5 evidence refs, and decision `overweight`.
- Changed:
  - Documentation only: marked M77 done and M78 ready.
- Result:
  - M77 is complete.
- Next milestone:
  - M78 - Batch Closure and Review Point.

## 2026-05-05 - M78 Batch Closure and Review Point
- Goal: close the M71-M78 hardening batch and prepare the broader M79-M92 full-stack optimization track.
- Validation:
  - Final smoke returned HTTP 200 for `/api/health` and `/api/alpha-trace/agent-runs/runners/status`.
  - Captured `git status --short`; worktree remains broad with backend runtime/store/API changes, frontend AlphaTrace UI/API changes, docs, integrations, and scripts.
  - Captured `git diff --stat`; tracked diff includes 52 files with approximately 5008 insertions and 411 deletions, excluding many untracked new modules/docs from the stat.
- Changed:
  - Marked M78 done and M79 ready in `docs/EXECUTION_PLAN.md`.
- Result:
  - M71-M78 are complete.
- Next milestone:
  - M79 - Backend Layering and Dependency Boundary Audit.
- Recommendation:
  - Continue with M79 before more feature work. The worktree is broad; backend dependency boundaries should be audited before calculation/display optimization deepens the diff.

## 2026-05-05 - M79 Backend Layering and Dependency Boundary Audit
- Goal: audit AlphaTrace backend route/service/store boundaries before continuing full-stack calculation and display work.
- Validation:
  - Scanned AlphaTrace API/service imports for legacy `hyperliquid`, `binance`, `crypto`, legacy market-data, kline, exchange, and startup coupling.
  - Confirmed AlphaTrace core ETF/fund/index workflows do not depend on legacy BTC/Hyperliquid runtime paths.
  - Reviewed Asset/Evidence/Strategy/Portfolio store factories. Although route imports still use `get_static_*_store` names, these factories delegate to `Mysql*Store` when `ALPHA_TRACE_DOMAIN_STORE=mysql`.
  - Confirmed Market Data remains static seed-backed by design; DB-backed market data is deferred to later market data/domain milestones.
- Changed:
  - Documentation only: marked M79 done and M80 ready.
- Result:
  - M79 is complete. No code change was required.
- Assumption:
  - Store factory names are legacy/misleading but behavior is currently correct. A future cleanup can rename them after the worktree is smaller.
- Next milestone:
  - M80 - Calculation and Scoring Logic Review.

## 2026-05-05 - M80 Calculation and Scoring Logic Review
- Goal: review AlphaTrace runtime scoring and decision attribution calculations for explainability, bounded values, and non-performance semantics.
- Issue found:
  - `runtimeQualityScore` previously grew linearly with historical run count and could exceed 100. Example: `single_asset_analysis` returned `644.98`, which looked like a score but was not bounded.
  - Static strategies with zero runtime samples showed `riskScore=85`, which implied unsupported risk quality.
- Changed:
  - Updated `backend/services/leaderboard_store/leaderboard_store.py`.
  - Added shared `_runtime_metrics()` and `_clamp_score()` helpers.
  - Bounded `runtimeQualityScore`, `evidenceScore`, and `riskScore` to 0-100.
  - Static strategies with no related runs now show 0 runtime/evidence/risk score rather than a default positive risk score.
- Validation:
  - `python -m py_compile backend/services/leaderboard_store/leaderboard_store.py` passed.
  - Restarted Docker app to reload backend code.
  - `/api/alpha-trace/leaderboard` now returns bounded runtime scores: portfolio diagnosis `62.47`, single asset analysis `58.32`, static strategies `0`.
  - `/api/alpha-trace/decisions?limit=3` returned HTTP 200 with expected decision attribution placeholders and no crash.
  - `/dashboard#leaderboard` returned HTTP 200.
- Result:
  - M80 is complete.
- Remaining limitation:
  - Strategy seed backtest fields are still demo/static estimates. Real mode Leaderboard clearly uses runtime quality metrics, not realized return.
- Next milestone:
  - M81 - Agent Runtime State Machine and Error Semantics Review.

## 2026-05-05 - M81 Agent Runtime State Machine and Error Semantics Review
- Goal: make run lifecycle, cancellation, retry, and terminal-state semantics consistent across AlphaTrace runtime paths.
- Issue found:
  - Cancelling a running native run persisted agent participant statuses as `cancelled`, but `AgentParticipant.status` schema only accepted `idle/running/completed/failed`.
  - The cancelled run then returned HTTP 500 on detail/events and retry because persisted payload validation failed.
- Changed:
  - Updated `backend/services/agent_runtime_status_machine.py` so `cancelled` remains a canonical terminal run status instead of being normalized to `failed`.
  - Updated `backend/schemas/alpha_trace_agent_runtime.py` to allow agent participant status `cancelled`.
  - Updated frontend agent status typing and mapper in `frontend/app/entities/agent/model.ts` and `frontend/app/entities/agent/api.ts`.
- Validation:
  - `python -m py_compile backend/schemas/alpha_trace_agent_runtime.py backend/services/agent_runtime_status_machine.py backend/services/alpha_trace_agent_runtime_service.py backend/api/alpha_trace_agent_runtime_routes.py` passed.
  - `pnpm --dir frontend build` passed. Existing Vite chunk-size/dynamic-import/Browserslist warnings remain unchanged.
  - Restarted Docker app and verified health returned HTTP 200.
  - Previously broken cancelled run `run_native_20260505_004648_293450` is now queryable with `status=cancelled` and 7 events.
  - Retry of cancelled run submitted `run_native_20260505_005022_365493`, which completed with 250 events and 4 reports.
  - Cancel request against completed run `run_native_20260504_161127_889959` preserved `status=completed`.
- Result:
  - M81 is complete. Cancelled runs are now durable/readable and retryable.
- Remaining limitation:
  - Cancelled run final decision still uses the existing pending placeholder; this is readable but semantically weak. A future UX pass can show a dedicated cancelled-state summary.
- Next milestone:
  - M82 - Evidence Governance v2.

## 2026-05-05 - M82 Evidence Governance v2
- Goal: make static, Bocha, and run-scoped evidence provenance visible and consistent across Evidence API and Evidence Center.
- Issue found:
  - Evidence detail for `ev_bocha_*` could be resolved by direct evidenceId, but the default Evidence API list mostly returned static seed items.
  - Frontend evidence model did not preserve backend `sourceType`, `usedByDecisionIds`, or `metadata`, so provenance/support metadata was not visible.
- Changed:
  - Updated `backend/api/alpha_trace_evidence_routes.py` to merge recent run-scoped evidence into `GET /api/alpha-trace/evidence`, de-duplicate by evidenceId, and enrich run-scoped evidence metadata with source label, provenance status, governance note, support score/status, invalid evidence ids, and last governance event.
  - Updated `backend/services/evidence_retrieval/evidence_store.py` to add static seed governance metadata.
  - Updated frontend evidence model/API mapper to preserve `sourceType`, `usedByDecisionIds`, and `metadata`.
  - Updated `frontend/app/pages/EvidenceCenterPage.tsx` to display source type, governance/provenance notes, support score/status, and Bocha/source URL traceability.
- Validation:
  - `python -m py_compile backend/api/alpha_trace_evidence_routes.py backend/services/evidence_retrieval/evidence_store.py` passed.
  - `pnpm --dir frontend build` passed. Existing Vite warnings remain unchanged.
  - Restarted Docker app and verified health returned HTTP 200.
  - `/api/alpha-trace/evidence?limit=50` returned 49 items including 31 `ev_bocha_*` run-scoped evidence items.
  - Sample Bocha evidence `ev_bocha_cb9d879102ad72` returned `sourceType=bocha_search`, source URL, `provenanceStatus=external_search`, `evidenceSupportScore=0.15`, and `evidenceSupportStatus=weak`.
  - `/dashboard#evidence` and `/dashboard#evidence?evidenceId=ev_bocha_cb9d879102ad72` returned HTTP 200.
- Result:
  - M82 is complete. Evidence provenance is clearer and Bocha evidence is first-class in Evidence Center real mode.
- Remaining limitation:
  - Support scoring is still rule-based keyword scoring, not LLM judge or vector semantic validation.
- Next milestone:
  - M83 - Data Source Domain v1 Completion.

## 2026-05-05 - M83 Data Source Domain v1 Completion
- Goal: turn Data Sources from evidence-derived placeholder real mode into a coherent AlphaTrace data source domain.
- Issue found:
  - `alpha_trace_data_sources` existed but was empty.
  - Frontend real mode derived data sources from `/api/alpha-trace/evidence`, so Data Sources had no stable backend contract or MySQL-backed source registry.
- Changed:
  - Added `backend/schemas/alpha_trace_data_source.py`.
  - Added `backend/services/data_source_store/static_data_source_seed.py` and `backend/services/data_source_store/data_source_store.py`.
  - Added `backend/api/alpha_trace_data_source_routes.py` with list/detail/tasks endpoints.
  - Registered the Data Source router in `backend/main.py`.
  - Added frontend AlphaTrace data-source endpoints and changed `frontend/app/entities/data-source/api.ts` real mode to call `/api/alpha-trace/data-sources` instead of synthesizing sources from Evidence API.
- Validation:
  - `python -m py_compile backend/schemas/alpha_trace_data_source.py backend/services/data_source_store/static_data_source_seed.py backend/services/data_source_store/data_source_store.py backend/api/alpha_trace_data_source_routes.py backend/main.py` passed.
  - `pnpm --dir frontend build` passed. Existing Vite warnings remain unchanged.
  - Restarted Docker app and verified health returned HTTP 200.
  - `/api/alpha-trace/data-sources` returned 4 sources: static evidence seed, Bocha web search, static market data seed, and domain seed store.
  - `/api/alpha-trace/data-sources/ds_bocha_web_search` returned `status=HEALTHY`, `configState=configured_or_env_required`.
  - `/api/alpha-trace/data-sources/ds_bocha_web_search/tasks` returned 1 task.
  - MySQL `alpha_trace_data_sources` count is now 4.
  - `/dashboard#data-sources` returned HTTP 200.
- Result:
  - M83 is complete. Data Sources has a stable backend API and MySQL-backed seed registry.
- Remaining limitation:
  - Data Source tasks are seed/diagnostic records, not a real scheduler or crawler history.
- Next milestone:
  - M84 - Frontend Information Architecture and Layout Pass.

## 2026-05-05 - M84 Frontend Information Architecture and Layout Pass
- Goal: improve AgentRunDetail readability and demo-route layout without changing backend behavior.
- Changed:
  - Updated `frontend/app/pages/AgentRunDetailPage.tsx`.
  - Expanded the main report/debate/decision column from 8/12 to 9/12 on desktop.
  - Narrowed the right diagnostics column from 4/12 to 3/12 and reduced Tool Calls Timeline max height from 34rem to 24rem.
  - Completed evidence type labels for `external_search` and `runtime_context` so Bocha/runtime evidence labels render correctly.
- Validation:
  - `pnpm --dir frontend build` passed. Existing Vite warnings remain unchanged.
  - Page smoke returned HTTP 200 for `/dashboard#dashboard`, `/dashboard#agent-lab/runs/run_native_20260505_005022_365493`, `/dashboard#evidence`, `/dashboard#data-sources`, and `/dashboard#leaderboard`.
- Result:
  - M84 is complete. AgentRunDetail gives more horizontal space to Current Report, Debate Panel, and Final Decision while keeping tools/evidence available as compact diagnostics.
- Remaining limitation:
  - This was a conservative layout pass. A future design pass can introduce tabbed diagnostics or resizable panels if needed.
- Next milestone:
  - M85 - Frontend API Contract and Type Safety Pass.

## 2026-05-05 - M85 Frontend API Contract and Type Safety Pass
- Goal: reduce frontend/backend contract drift for AlphaTrace entity adapters and real/mock model shapes.
- Changed:
  - Updated `frontend/app/pages/EvidenceCenterPage.tsx` so `usedByDecisionIds` returned directly by Evidence API is included in the decision trace map, with de-duplication against decisions loaded separately.
- Validation:
  - `pnpm --dir frontend build` passed. Existing Vite warnings remain unchanged.
  - Representative API smoke returned HTTP 200 for assets, evidence, data-sources, strategies, portfolios, decisions, leaderboard, and runner status.
- Result:
  - M85 is complete. Evidence trace fields are now consumed consistently from backend API responses instead of relying only on client-side reverse lookup.
- Remaining limitation:
  - Some legacy synchronous entity helpers still intentionally throw in real mode; active AlphaTrace pages use async adapters. A later cleanup can remove unused sync paths after route coverage is finalized.
- Next milestone:
  - M86 - Performance and Resource Boundaries.


## 2026-05-05 - M86 Performance and Resource Boundaries
- Goal: keep AgentRunDetail usable as runtime events, tool calls, debate messages, and streaming chunks grow.
- Issue found:
  - AgentRunDetail kept all runtime events in React state and sorted/deduplicated the whole array on every SSE event.
  - Live Output concatenated all streaming chunks without a UI-side length boundary.
  - Tool Calls Timeline and Raw Debate Messages rendered full lists, which can become expensive for long runs.
- Changed:
  - Updated `frontend/app/pages/AgentRunDetailPage.tsx`.
  - Added a UI runtime event retention boundary of the latest 800 events while preserving the loaded count in the status badges.
  - Replaced per-event full-array update logic with bounded merge helpers.
  - Limited live output text to the latest 12,000 characters for rendering.
  - Limited rendered runtime tool activities and raw debate messages to recent slices while preserving total counts.
- Validation:
  - `pnpm --dir frontend build` passed. Existing Vite chunk/Browserslist warnings remain unchanged.
  - Page smoke returned HTTP 200 for `/dashboard#agent-lab/runs/run_native_20260505_005022_365493`, `/dashboard#agent-lab`, and `/api/health`.
- Result:
  - M86 is complete. Long-running AgentRunDetail pages now have explicit frontend resource boundaries and should remain usable with high event counts.
- Remaining limitation:
  - Backend still stores full runtime events in MySQL/JSON for auditability. UI retention is a display boundary, not an archival boundary.
- Next milestone:
  - M87 - Test Harness and Regression Scripts.


## 2026-05-05 - M87 Test Harness and Regression Scripts
- Goal: make repeated AlphaTrace health/config/runtime/domain smoke checks reproducible without reconstructing commands from chat history.
- Changed:
  - Added `scripts/alphatrace/run_runtime_smoke.ps1`.
  - The helper defaults to non-destructive GET checks for health, Hyper AI profile/tools, runner status/capabilities, assets, evidence, data sources, strategies, portfolios, decisions, leaderboard, and 510300 market quote.
  - Added optional `-IncludeSubmit` checks for disposable Stub submit and TradingAgents disabled submit.
  - Added `-DryRun` and `-FailOnError` switches.
  - Updated `docs/VALIDATION.md` with the canonical M87 smoke commands.
- Validation:
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/run_runtime_smoke.ps1 -DryRun` passed with 14/14 planned checks.
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/run_runtime_smoke.ps1 -BaseUrl http://127.0.0.1:8805/api` passed with 14/14 checks.
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/run_runtime_smoke.ps1 -BaseUrl http://127.0.0.1:8805/api -IncludeSubmit` passed with 16/16 checks.
- Result:
  - M87 is complete. A new engineer can run a safe smoke pack from the repository without exposing secrets or relying on chat history.
- Remaining limitation:
  - The helper is a validation script, not a startup orchestrator. Startup flow remains documented rather than automated.
- Next milestone:
  - M88 - MySQL Schema and Migration Hardening.


## 2026-05-05 - M88 MySQL Schema and Migration Hardening
- Goal: review AlphaTrace MySQL schema/index coverage and define non-destructive migration hardening steps.
- Changed:
  - Added `docs/engineering/40_mysql_schema_hardening_review.md`.
  - Captured current AlphaTrace table set, observed row counts, index coverage, query patterns, and a reviewed migration plan.
  - Identified the main P0 future index: `alpha_trace_runtime_events(run_id, sequence)`.
  - Identified P1/P2 future indexes for reports, evidence refs, run listing, and decision recency.
- Validation:
  - Ran schema-only MySQL queries: `SHOW TABLES LIKE 'alpha_trace_%'`, `SHOW INDEX FROM <table>`, and count-only table checks.
  - Observed runtime row counts: 67 agent runs, 9525 runtime events, 197 reports, 238 evidence refs, 67 decisions.
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/run_runtime_smoke.ps1 -BaseUrl http://127.0.0.1:8805/api` passed with 14/14 checks.
- Result:
  - M88 is complete. Schema risks and missing composite indexes are documented without running any destructive or structural migration.
- Remaining limitation:
  - Recommended indexes are not applied yet. They should be implemented in a dedicated reviewed migration milestone.
- Next milestone:
  - M89 - Security and Secrets Handling Review.


## 2026-05-05 - M89 Security and Secrets Handling Review
- Goal: verify that Qwen/DashScope/Bocha/TradingAgents config status is observable without exposing plaintext secrets.
- Changed:
  - Added `docs/engineering/41_security_and_secret_handling_review.md`.
  - Documented runtime API response boundaries, status-only secret fields, static scan method, findings classification, and ongoing secret handling rules.
- Validation:
  - Ran safe secret-pattern scan that prints only file path, line number, and rule name, not matching line content. It found six entries, classified as UI field names/placeholders or generated/static asset field names, not raw saved production keys.
  - Checked `/api/hyper-ai/profile`; no raw `sk-*` or `Bearer ...` token pattern found in serialized response.
  - Checked `/api/hyper-ai/tools`; response exposes secret field descriptors and availability booleans, not plaintext keys.
  - Checked `/api/alpha-trace/agent-runs/runners/status`; response exposes `qwenKeyConfigured` and config source metadata, not plaintext keys.
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/run_runtime_smoke.ps1 -BaseUrl http://127.0.0.1:8805/api` passed with 14/14 checks.
- Result:
  - M89 is complete. Current runtime APIs and validation logs do not expose raw saved secrets.
- Remaining limitation:
  - The secret scan is currently a one-off Python command. A future milestone can turn it into a reusable script if needed.
- Next milestone:
  - M90 - Legacy Boundary and AlphaTrace-only Startup Implementation Decision.


## 2026-05-05 - M90 Legacy Boundary and AlphaTrace-only Startup Implementation Decision
- Goal: decide whether to implement AlphaTrace-only backend startup profile now or defer.
- Decision:
  - Deferred implementation. Keep AlphaTrace-only startup as an operator runbook for now.
- Reasoning:
  - Current validation chain `8805 -> 8802` is healthy.
  - Legacy BTC/Hyperliquid logs are noisy but not blocking AlphaTrace runtime, domain APIs, Settings, or demo routes.
  - User direction is to not spend effort on BTC/Hyperliquid unless it blocks AlphaTrace.
  - Existing `backend/main.py` already has partial env gates, so remaining work is profile packaging and validation rather than urgent feature work.
- Changed:
  - Updated `docs/engineering/39_legacy_runtime_noise_isolation_design.md` with the M90 decision, operating rule, and future implementation triggers.
- Validation:
  - `Invoke-RestMethod http://127.0.0.1:8805/api/health` returned healthy.
  - No backend code changed, so no py_compile required.
- Result:
  - M90 is complete. Legacy runtime noise remains explicitly out of scope until it blocks AlphaTrace or a quiet demo/backend-log profile becomes necessary.
- Next milestone:
  - M91 - Release Readiness and Commit Grouping.


## 2026-05-05 - M91 Release Readiness and Commit Grouping
- Goal: make the broad AlphaTrace worktree reviewable and prepare logical commit groups without committing.
- Changed:
  - Added `docs/engineering/42_release_readiness_commit_grouping.md`.
  - Grouped current changes into runtime/runner, persistence/store, domain APIs, frontend UX, scripts/config, and docs/governance buckets.
  - Documented generated/transient artifact risks and suggested staging order.
- Validation:
  - Ran `git status --short`; worktree remains broad with backend, frontend, docs, scripts, config, and many untracked AlphaTrace files.
  - Ran `git diff --stat`; tracked diff currently reports 55 files changed, 5183 insertions, 443 deletions, plus untracked AlphaTrace files.
- Result:
  - M91 is complete. Reviewers now have an explicit staging/commit map for the current worktree.
- Remaining limitation:
  - No commit was created because the user did not request committing.
- Next milestone:
  - M92 - Full-Stack Optimization Closure.


## 2026-05-05 - M92 Full-Stack Optimization Closure
- Goal: close M79-M91 with validation and set the next grounded track.
- Changed:
  - Added `docs/engineering/43_full_stack_optimization_closure.md`.
  - Marked M92 complete and extended `docs/EXECUTION_PLAN.md` with M93-M100 to continue the long-run optimization track.
  - Updated `docs/VALIDATION.md` with M93-M100 validation rules.
- Validation:
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/run_runtime_smoke.ps1 -BaseUrl http://127.0.0.1:8805/api` passed with 14/14 checks.
  - `git status --short` captured the broad dirty worktree; no commit was made.
- Result:
  - M92 is complete. The next track is evidence detail/source preview, tool invocation contract, Native runner contracts, TradingAgents component analysis, LangAlpha module analysis, and frontend/backend boundary cleanup.
- Remaining limitation:
  - The current branch is still broad. Commit grouping should be done before merging or sharing for formal review.
- Next milestone:
  - M93 - Evidence Detail and Source Preview Hardening.


## 2026-05-05 - M93 Evidence Detail and Source Preview Hardening
- Goal: make Bocha/static/run-scoped evidence details more useful when opened from evidence IDs in reports, debate, or decisions.
- Finding:
  - Backend evidence detail already resolves `ev_bocha_*` with title, sourceName, sourceType, summary, URL, metadata, and run usage.
  - UI showed the URL, but the source action was not prominent enough from the list/detail context.
- Changed:
  - Updated `frontend/app/pages/EvidenceCenterPage.tsx`.
  - Added an `打开来源网页` action on evidence cards when a canonical URL exists.
  - Made the detail panel label the canonical source URL explicitly and explain that iframe preview is best-effort while the direct URL is authoritative.
  - Added a Bocha external search badge in the detail URL section.
- Validation:
  - `pnpm --dir frontend build` passed. Existing Vite warnings remain unchanged.
  - `GET /api/alpha-trace/evidence/ev_bocha_cb9d879102ad72` returned title/sourceName/sourceType/url.
  - `/dashboard#evidence?evidenceId=ev_bocha_cb9d879102ad72` returned HTTP 200.
- Result:
  - M93 is complete. Bocha evidence can be opened with visible source metadata and canonical URL context.
- Remaining limitation:
  - Inline iframe preview remains best-effort because many external sites block embedding with CSP/X-Frame-Options.
- Next milestone:
  - M94 - Tool Invocation Contract and UX Hardening.

## 2026-05-05 - M94 Tool Invocation Contract and UX Hardening
- Goal: clarify AlphaTrace tool invocation semantics and make Tool Calls Timeline easier to audit.
- Finding:
  - Native/Qwen runs already emit `tool.called` and `tool.result` events for market context loading, evidence retrieval, Bocha search, and Qwen model calls.
  - Payloads commonly include `toolName`, and some include `stepId`, `source`, `query`, `evidenceIds`, or result summaries.
- Changed:
  - Updated `frontend/app/pages/AgentRunDetailPage.tsx` to display tool `stepId`, `source`, and `query` in Tool Calls Timeline when present.
  - Added `docs/engineering/44_tool_invocation_contract.md` to define recommended event payload fields, current tool sources, frontend mapping, and remaining gaps.
- Validation:
  - `pnpm --dir frontend build` passed. Existing Vite/chunk warnings remain unchanged.
  - `/dashboard#agent-lab/runs/run_native_20260505_005022_365493` returned HTTP 200.
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/run_runtime_smoke.ps1 -BaseUrl http://127.0.0.1:8805/api` passed with 14/14 checks.
- Result:
  - M94 is complete. Tool calls are now displayed with clearer execution context, and the contract is documented for Native/Qwen/Bocha/model tool events.
- Remaining limitation:
  - Backend event producers are not yet fully normalized; future runner work should consistently emit `stepId`, `toolName`, `source`, `query`, and bounded result summaries.
- Next milestone:
  - M95 - Native Multi-Agent Runner Contract Deepening.

## 2026-05-05 - M95 Native Multi-Agent Runner Contract Deepening
- Goal: harden `alphatrace_native` as the preferred product runner with explicit DAG metadata, stable step payloads, and clear frontend mapping contracts.
- Changed:
  - Updated `backend/services/agent_runners/qwen_runner.py`.
  - Added `ALPHATRACE_RUNTIME_CONTRACT_VERSION = alphatrace_agent_runtime_v1`.
  - Added initial `agent.run.started.payload.dagNodes` and `runnerType` metadata for new Qwen/Native runs.
  - Added `contractVersion` to step payloads.
  - Normalized evidence retrieval and Bocha search events with `stepId=evidence_retrieval`, `dependsOn`, `progress`, `source`, `query`, and `evidenceIds` where applicable.
  - Made initial agent participant IDs derive from `runner_type`, so Native runs are no longer labeled internally with qwen agent IDs.
  - Added `docs/engineering/45_native_runner_contract.md`.
- Validation:
  - `python -m py_compile backend/services/agent_runners/qwen_runner.py backend/services/agent_runners/native_multi_agent_runner.py backend/services/alpha_trace_agent_runtime_service.py backend/schemas/alpha_trace_agent_runtime.py` passed.
  - Restarted `hyper-arena-app` so runtime validation used the updated code.
  - Submitted Native smoke run `run_native_20260505_013443_486553`; `/submit` returned immediately with `status=running`.
  - Native run completed with 245 events, 225 step events, 4 reports, decision action `overweight`, `contractVersion=alphatrace_agent_runtime_v1`, and 6 DAG nodes.
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/run_runtime_smoke.ps1 -BaseUrl http://127.0.0.1:8805/api` passed with 14/14 checks.
- Result:
  - M95 is complete. New Native runs now carry an explicit AlphaTrace DAG contract and normalized evidence/tool step payloads while Qwen/TradingAgents behavior remains compatible.
- Remaining limitation:
  - The contract is still convention-based. A later milestone can add runtime schema validation for event payload completeness.
- Next milestone:
  - M96 - TradingAgents Component Reuse Analysis.

## 2026-05-05 - M96 TradingAgents Component Reuse Analysis
- Goal: decide which TradingAgents concepts/components should be reused, reimplemented, or avoided for AlphaTrace Native.
- Analyzed local source:
  - `../TradingAgents/tradingagents/graph/trading_graph.py`
  - `../TradingAgents/tradingagents/graph/setup.py`
  - `../TradingAgents/tradingagents/graph/conditional_logic.py`
  - `../TradingAgents/tradingagents/agents/*`
  - `../TradingAgents/tradingagents/agents/utils/structured.py`
  - `../TradingAgents/tradingagents/dataflows/*`
- Changed:
  - Added `docs/engineering/46_tradingagents_component_reuse_analysis.md`.
- Decision:
  - Keep TradingAgents as opt-in PoC/benchmark adapter.
  - Reimplement useful concepts inside AlphaTrace Native: bounded Bull/Bear debate rounds, optional Research Manager, risk sub-perspectives, tool-node boundary, and structured-output fallback.
  - Do not reuse TradingAgents dataflows, CLI, checkpoint, memory logs, raw internal state, or ticker-only assumptions as product architecture.
- Validation:
  - No business code changed, so no py_compile or pnpm build was required for this milestone.
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/run_runtime_smoke.ps1 -BaseUrl http://127.0.0.1:8805/api` passed with 14/14 checks.
- Result:
  - M96 is complete. AlphaTrace now has a clear component-level decision matrix for TradingAgents reuse without copying source or replacing the product backend.
- Next milestone:
  - M97 - LangAlpha Useful Module Analysis.

## 2026-05-05 - M97 LangAlpha Useful Module Analysis
- Goal: identify LangAlpha ideas worth reimplementing or adapting without embedding LangAlpha into AlphaTrace.
- Source baseline:
  - Local sibling repo exists at `../LangAlpha`, but the worktree currently shows many deleted files and is not a clean checkout.
  - Used `git ls-tree origin/main` plus existing LangAlpha deconstruction docs and public raw GitHub references for architecture-level analysis.
- Changed:
  - Added `docs/engineering/47_langalpha_useful_module_analysis.md`.
- Decision:
  - LangAlpha is not suitable as an in-process runner for the current backend.
  - Useful ideas to reimplement in AlphaTrace include durable event replay, background task manager boundaries, workspace/artifact model, tool registry/governance, BYOK/vault discipline, and subagent monitoring UX.
  - Future `runnerType=langalpha` should remain an external service adapter boundary, not a frontend schema or backend replacement.
- Validation:
  - No business code changed, so no py_compile or pnpm build was required.
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/run_runtime_smoke.ps1 -BaseUrl http://127.0.0.1:8805/api` passed with 14/14 checks.
- Result:
  - M97 is complete. AlphaTrace now has a concrete LangAlpha reuse matrix and backlog implications without copying code or changing runtime behavior.
- Remaining limitation:
  - Deeper module-level verification requires restoring the sibling LangAlpha checkout, which was intentionally not done in this milestone to avoid modifying that repo.
- Next milestone:
  - M98 - Frontend Architecture Boundary Cleanup.

## 2026-05-05 - M98 Frontend Architecture Boundary Cleanup
- Goal: reduce AlphaTrace frontend route/entity/API drift and clarify frontend boundaries.
- Findings:
  - Active AlphaTrace pages all include `ResearchWorkspaceNav`, which provides consistent navigation plus back/dashboard controls.
  - Canonical Decision route is `#decision-attribution`, but planning and user phrasing often use `#decisions`.
- Changed:
  - Updated `frontend/app/shared/lib/navigation.ts` to map `/decisions` and `#decisions` to `decision-attribution`.
  - Added `docs/engineering/48_frontend_architecture_boundary_cleanup.md` documenting active pages, entity boundaries, routes, mock/real mode rules, and remaining cleanup opportunities.
- Validation:
  - `pnpm --dir frontend build` passed. Existing Vite/chunk warnings remain unchanged.
  - Page smoke returned HTTP 200 for `#dashboard`, `#assets`, `#assets/asset_etf_510300`, `#evidence`, `#agent-lab`, `#agent-lab/runs/run_native_20260505_013443_486553`, `#portfolio`, `#decision-attribution`, `#decisions`, `#leaderboard`, `#data-sources`, and `#settings`.
  - Runtime smoke passed with 14/14 checks.
- Result:
  - M98 is complete. The common `#decisions` alias no longer drifts from the actual Decision Attribution page, and frontend architecture boundaries are documented.
- Next milestone:
  - M99 - Backend Architecture Boundary Cleanup.

## 2026-05-05 - M99 Backend Architecture Boundary Cleanup
- Goal: clarify AlphaTrace backend domain/runtime/integration ownership and identify safe cleanup points.
- Findings:
  - AlphaTrace routers are grouped under `backend/api/alpha_trace_*`.
  - AlphaTrace stores/services are grouped under `backend/services/*_store`, `agent_runners`, `agent_runtime_store`, `evidence_retrieval`, `market_data_store`, and `system_config_store`.
  - Bocha is correctly isolated under `backend/integrations/bocha` and mapped into Evidence before frontend/model consumption.
  - Legacy BTC/Hyperliquid coupling remains mainly in `backend/main.py` startup/router registration, but it is not blocking the current AlphaTrace chain.
- Changed:
  - Added `docs/engineering/49_backend_architecture_boundary_cleanup.md`.
  - No backend code refactor was applied because touching legacy startup is intentionally deferred unless it blocks AlphaTrace.
- Validation:
  - No Python code changed in M99, so py_compile was not required for this milestone.
  - Runtime smoke passed with 14/14 checks.
- Result:
  - M99 is complete. Backend ownership boundaries and low-risk future cleanup points are now explicit.
- Next milestone:
  - M100 - Long-Run Closure and Next Strategic Batch.

## 2026-05-05 - M100 Long-Run Closure and Next Strategic Batch
- Goal: close M93-M99, record validation, and establish the next strategic batch without stopping the long-running execution track.
- Changed:
  - Added `docs/engineering/50_long_run_closure_m93_m99.md`.
  - Marked M100 complete in `docs/EXECUTION_PLAN.md`.
  - Added M101-M108 to `docs/EXECUTION_PLAN.md`.
  - Added M101-M108 validation rules to `docs/VALIDATION.md`.
- Validation:
  - Runtime smoke passed with 14/14 checks.
  - `git status --short` and `git diff --stat` captured the broad dirty worktree.
- Result:
  - M100 is complete. The next strategic batch is now explicit: Tool Registry, AgentArtifact design, Native Research Manager, Native Risk sub-perspectives, runtime event validation, route smoke script, MySQL health endpoint, and closure.
- Next milestone:
  - M101 - Tool Registry Service Contract.

## 2026-05-05 - M101 Tool Registry Service Contract
- Goal: make AlphaTrace tool calls auditable through a backend contract instead of ad-hoc event payloads.
- Changed:
  - Added `backend/services/agent_tool_registry.py` with 9 initial tool contracts.
  - Updated `backend/services/agent_runners/qwen_runner.py` so known Qwen/Native tool events automatically include `payload.toolContract`.
  - Updated `docs/engineering/44_tool_invocation_contract.md` with the tool registry addendum.
- Validation:
  - `python -m py_compile backend/services/agent_tool_registry.py backend/services/agent_runners/qwen_runner.py backend/services/agent_runners/native_multi_agent_runner.py` passed.
  - Registry smoke passed: `tool_contracts=9 bocha=ok`.
  - Restarted `hyper-arena-app` and submitted Native smoke run `run_native_20260505_015213_882187`.
  - The run completed with 260 events, 4 reports, and 16 `toolContract` events; first contract was `market.context.load`.
  - Runtime smoke passed with 14/14 checks.
- Result:
  - M101 is complete. New Native/Qwen tool events can now be audited through stable tool metadata including category, source, auth mode, timeout policy, and output class.
- Remaining limitation:
  - Tool registry is metadata-only. It does not yet enforce timeouts or validate payload completeness.
- Next milestone:
  - M102 - Agent Artifact Model Design.

## 2026-05-05 - M102 Agent Artifact Model Design
- Goal: define how future generated files, charts, tables, webpage snapshots, and tool artifacts attach to AgentRun without overloading Evidence or Reports.
- Changed:
  - Added `docs/engineering/51_agent_artifact_model_design.md`.
  - Defined the proposed `AgentArtifact` schema, MySQL table sketch, relationships to Tool Calls / Reports / Evidence / Decisions, and frontend UX placement.
- Validation:
  - Documentation-only milestone, so py_compile and frontend build were not required.
  - Runtime smoke passed with 14/14 checks against `http://127.0.0.1:8805/api`.
- Result:
  - M102 is complete. Rich tool outputs now have a documented product boundary before any storage/UI implementation is added.
- Remaining limitation:
  - No artifact API, store, or UI panel was implemented in this milestone by design.
- Next milestone:
  - M103 - Native Research Manager Node.

## 2026-05-05 - M103 Native Research Manager Node
- Goal: deepen the AlphaTrace Native DAG with a bounded Research Manager aggregation step between Bull/Bear and Risk Review.
- Changed:
  - Added `qwen.research_manager` to `backend/services/agent_tool_registry.py`.
  - Updated `backend/services/agent_runners/qwen_runner.py` to add the `research_manager` step dependency, DAG contract node, Qwen step call, streaming events, agent participant, structured JSON prompt example, section parser support, report generation, and metrics.
  - Added `docs/engineering/52_native_research_manager_node.md`.
- Validation:
  - `python -m py_compile backend/services/agent_tool_registry.py backend/services/agent_runners/qwen_runner.py backend/services/agent_runners/native_multi_agent_runner.py backend/services/alpha_trace_agent_runtime_service.py backend/schemas/alpha_trace_agent_runtime.py` passed.
  - Restarted `hyper-arena-app`.
  - Native smoke run `run_native_20260505_020313_855841` completed with 351 events, 5 reports, 68 Research Manager related events, 1 Research Manager report, and final decision action `overweight`.
  - Runtime smoke passed with 14/14 checks against `http://127.0.0.1:8805/api`.
- Result:
  - M103 is complete. AlphaTrace Native now has a real Research Manager aggregation node while still avoiding TradingAgents code reuse and preserving existing SSE/persistence behavior.
- Fix applied during validation:
  - Initial `Research Manager` participant status used unsupported `pending`; corrected to `idle` after Pydantic validation failed during submit.
- Remaining limitation:
  - Frontend DAG cards may not yet give special visual treatment to `research_manager`; it is available in backend DAG contract/events/reports for a follow-up UI pass.
- Next milestone:
  - M104 - Native Risk Sub-Perspective Design.

## 2026-05-05 - M104 Native Risk Sub-Perspective Design
- Goal: design how conservative/neutral/aggressive risk perspectives should fit AlphaTrace Native without copying TradingAgents code or adding unbounded extra model calls.
- Changed:
  - Added `docs/engineering/53_native_risk_sub_perspective_design.md`.
  - Defined the future Risk Review section structure, `riskPerspective` event mapping, structured JSON shape, frontend placement, and implementation recommendation.
- Validation:
  - Documentation-only milestone, so py_compile and frontend build were not required.
  - Runtime smoke passed with 14/14 checks against `http://127.0.0.1:8805/api`.
- Result:
  - M104 is complete. The preferred implementation path is to keep a single `risk_review` model call and request Conservative / Neutral / Aggressive sections inside that bounded step.
- Remaining limitation:
  - No runtime prompt or parser changes were made yet. That should wait until M105 event validation is available.
- Next milestone:
  - M105 - Runtime Event Contract Validator.

## 2026-05-05 - M105 Runtime Event Contract Validator
- Goal: add lightweight runtime event payload validation so missing `stepId`, `progress`, and `toolName` can be detected early without production crashes.
- Changed:
  - Added `scripts/alphatrace/validate_runtime_event_contract.ps1`.
  - Updated `backend/services/agent_runners/qwen_runner.py` so the initial orchestrator `reasoning.chunk` event uses `_step_payload("evidence_retrieval", progress=5, ...)`.
  - Added `docs/engineering/54_runtime_event_contract_validator.md`.
- Validation:
  - `python -m py_compile backend/services/agent_tool_registry.py backend/services/agent_runners/qwen_runner.py backend/services/agent_runners/native_multi_agent_runner.py backend/services/alpha_trace_agent_runtime_service.py backend/schemas/alpha_trace_agent_runtime.py` passed.
  - Restarted `hyper-arena-app`.
  - Native smoke run `run_native_20260505_021040_004774` completed with 323 events and 5 reports.
  - Validator strict mode passed with 0 violations and 16 warnings against `run_native_20260505_021040_004774`.
  - Runtime smoke passed with 14/14 checks.
- Result:
  - M105 is complete. Critical tool events and contracted runtime events can now be checked repeatably from a script.
- Remaining limitation:
  - Legacy final mapper events still emit 16 warnings because they do not all carry `stepId`; they remain non-fatal and are documented as future cleanup.
- Next milestone:
  - M106 - Route/API Smoke Script Expansion.

## 2026-05-05 - M106 Route/API Smoke Script Expansion
- Goal: make frontend hash route smoke repeatable from scripts instead of ad-hoc manual checks.
- Changed:
  - Added `scripts/alphatrace/run_route_smoke.ps1`.
  - Added `docs/engineering/55_route_smoke_script.md`.
- Validation:
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/run_route_smoke.ps1 -BaseUrl http://127.0.0.1:8805 -FailOnError` passed with 12/12 route checks.
  - Runtime smoke passed with 14/14 checks.
- Result:
  - M106 is complete. Dashboard, Asset, Evidence, Agent Lab, Run Detail, Portfolio, Decision, Leaderboard, Data Sources, Settings, and the `#decisions` alias now have a repeatable smoke command.
- Remaining limitation:
  - The script validates the served Vite shell, not browser-executed component rendering.
- Next milestone:
  - M107 - MySQL Config and Store Health Endpoint.

## 2026-05-05 - M107 MySQL Config and Store Health Endpoint
- Goal: expose safe AgentRunStore/system-config health without leaking secrets.
- Changed:
  - Added `GET /api/alpha-trace/agent-runs/runtime/store-health` in `backend/api/alpha_trace_agent_runtime_routes.py`.
  - Updated `scripts/alphatrace/run_runtime_smoke.ps1` to include `store_health`.
  - Added `docs/engineering/56_mysql_store_health_endpoint.md`.
- Validation:
  - `python -m py_compile backend/api/alpha_trace_agent_runtime_routes.py backend/services/system_config_store/mysql_config_store.py backend/services/agent_runtime_store/registry.py backend/services/agent_runtime_store/mysql_store.py` passed.
  - Restarted `hyper-arena-app`.
  - Store health endpoint returned `overallStatus=ok`, `agentRunStore.className=MysqlAgentRunStore`, `runCount=73`, `systemConfigStore.llmApiKeyAvailable=true`, and Bocha config available.
  - Response secret scan found no raw key-like pattern.
  - Runtime smoke passed with 15/15 checks.
- Result:
  - M107 is complete. Runtime/API smoke now includes MySQL runtime and system config health.
- Remaining limitation:
  - Endpoint is diagnostic-only; it does not perform write/read roundtrip mutations.
- Next milestone:
  - M108 - Next-Batch Closure.

## 2026-05-05 - M108 Next-Batch Closure
- Goal: close M101-M107, record validation, and establish the next grounded execution batch.
- Changed:
  - Added `docs/engineering/57_long_run_closure_m101_m107.md`.
  - Marked M108 complete in `docs/EXECUTION_PLAN.md`.
  - Added M109-M116 to `docs/EXECUTION_PLAN.md`.
  - Added M109-M116 validation rules to `docs/VALIDATION.md`.
- Validation:
  - Runtime smoke passed with 15/15 checks.
  - Route smoke passed with 12/12 checks.
  - `git status --short` captured the broad dirty worktree.
- Result:
  - M108 is complete. The next execution track is explicit: mapper contract cleanup, Research Manager UI, Evidence traceability, Tool UX, Risk perspectives, Tool boundary pass, MySQL persistence smoke, and closure.
- Next milestone:
  - M109 - Final Mapper Event Contract Cleanup.

## 2026-05-05 - M109 Final Mapper Event Contract Cleanup
- Goal: reduce runtime event contract warnings by adding stable step metadata to final mapper events.
- Changed:
  - Updated `backend/services/agent_runners/qwen_runner.py` so final mapper events for Market/Bull/Bear/Research Manager/Risk/Portfolio use `_step_payload(...)`.
  - Added `docs/engineering/58_final_mapper_event_contract_cleanup.md`.
- Validation:
  - `python -m py_compile backend/services/agent_runners/qwen_runner.py backend/services/agent_runners/native_multi_agent_runner.py` passed.
  - Restarted `hyper-arena-app`.
  - Native smoke run `run_native_20260505_022316_914846` completed with 333 events and 5 reports.
  - Runtime event validator passed with 0 violations and 0 warnings.
  - Runtime smoke passed with 15/15 checks.
  - Route smoke passed with 12/12 checks.
- Result:
  - M109 is complete. New Native/Qwen runs now have consistent event contract metadata across live step events and final mapped events.
- Next milestone:
  - M110 - AgentRunDetail Research Manager UI Compatibility.

## 2026-05-05 - M110 AgentRunDetail Timeline Aggregation and Research Manager UI Compatibility

- Goal: make completed Native runs with the `research_manager` node readable in AgentRunDetail and reduce Timeline fragmentation from streaming chunks.
- Assumption: raw chunk-level runtime events should remain persisted and visible in Runtime Event Stream; the Agent Timeline should be a phase-level decision flow, not a raw event dump.
- Changes:
  - Updated `frontend/app/pages/AgentRunDetailPage.tsx`.
  - Added `research_manager` to report section tabs and report detection.
  - Switched Agent Timeline rendering from raw events to aggregated `timelineItems`.
  - Aggregated streaming chunks by step, agent, and event type; Timeline now shows chunk count and compact summary.
  - Added `docs/engineering/59_agent_run_detail_timeline_aggregation.md`.
- Validation:
  - `pnpm --dir frontend build`: passed.
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/run_route_smoke.ps1 -BaseUrl http://127.0.0.1:8805 -FailOnError`: 12/12 passed.
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/run_runtime_smoke.ps1 -BaseUrl http://127.0.0.1:8805/api`: 15/15 passed.
- Result:
  - M110 is complete. Agent Timeline is now an aggregated phase-level flow while raw runtime events remain available for audit/debug.
- Next:
  - M111 - Evidence Detail Traceability for Bocha and Run Evidence.

## 2026-05-05 - Backend Runtime Log Availability Fix

- Goal: fix AgentRunDetail `Backend Runtime Log` showing `missing` for Docker runs.
- Cause: the API already reads `ALPHATRACE_BACKEND_LOG_PATH`, but Docker did not set the variable and uvicorn stdout/stderr was not written to a mounted log file. The default `/app/backend-tg-local.log` did not exist in the container.
- Changes:
  - Updated `docker-compose.yml` to set `ALPHATRACE_BACKEND_LOG_PATH=/app/logs/backend-runtime.log` for the app service.
  - Updated `Dockerfile` CMD to create `/app/logs` and tee uvicorn output to the configured backend log file.
  - Updated `.env.example` with `ALPHATRACE_BACKEND_LOG_PATH`.
  - Updated `docs/VALIDATION.md` with the runtime log validation rule.
- Runtime action:
  - Rebuilt app image successfully with `docker compose up -d --build app`; compose then hit an existing postgres container-name conflict.
  - Recreated only the app service with `docker compose up -d --no-deps app` to avoid touching data containers.
- Validation:
  - `GET http://127.0.0.1:8802/api/health`: healthy.
  - `GET http://127.0.0.1:8805/api/alpha-trace/agent-runs/runtime/logs?limit=5`: `exists=True`, path `/app/logs/backend-runtime.log`, 5 lines returned.
  - `python -m py_compile backend/api/alpha_trace_agent_runtime_routes.py`: passed.
  - `pnpm --dir frontend build`: passed.
  - `scripts/alphatrace/run_runtime_smoke.ps1 -BaseUrl http://127.0.0.1:8805/api`: 15/15 passed.
  - `scripts/alphatrace/run_route_smoke.ps1 -BaseUrl http://127.0.0.1:8805 -FailOnError`: 12/12 passed.
- Result:
  - Backend Runtime Log should now show `available` instead of `missing` after page refresh. AlphaTrace filter may still show zero visible lines if the current tail only contains legacy Hyperliquid/account requests; switch to `All Global Logs` to inspect raw backend lines.
- Next:
  - Continue M111 - Evidence Detail Traceability for Bocha and Run Evidence.

## 2026-05-05 - Agent Run Metrics MySQL Table

- Goal: persist necessary task-level metrics in a normalized MySQL table instead of relying only on `AgentRun.payload_json`.
- Change:
  - Added `alpha_trace_agent_run_metrics` table definition in `backend/services/agent_runtime_store/mysql_store.py`.
  - Added run-level dimensions: run/status/mode/asset/portfolio/strategy/task type/timestamps.
  - Added metric fields: LLM calls, tool calls, generated reports, duration, prompt tokens, completion tokens, total tokens, estimated cost.
  - Added `payload_json` for forward-compatible metric payloads.
  - Added `_upsert_run_metrics(...)` and wired it into `save_run(...)` and `_save_run_payload(...)`.
  - Added startup backfill from existing `alpha_trace_agent_runs.payload_json` into the metrics table.
  - Updated `docs/engineering/60_agent_run_token_usage_tracking.md`.
- Validation:
  - `python -m py_compile backend/services/agent_runtime_store/mysql_store.py`: passed.
  - `pnpm --dir frontend build`: passed.
  - Restarted `hyper-arena-app`.
  - MySQL confirmed table exists: `alpha_trace_agent_run_metrics`.
  - Backfill produced 81 rows; latest rows include token metrics for Native/Qwen runs.
  - Cancelled stale smoke run `run_qwen_20260505_033858_467961` after confirming it had persisted metrics.
  - Runtime smoke passed with 15/15 checks.
  - Route smoke passed with 12/12 checks.
- Result:
  - Task-level token/runtime metrics now have a queryable MySQL table while raw runtime events and full run payloads remain preserved.
- Remaining limitation:
  - There is no public metrics aggregation API yet; the table is ready for future cost dashboard / leaderboard / audit queries.
- Next:
  - Continue M111 - Evidence Detail Traceability for Bocha and Run Evidence.

## 2026-05-05 - Agent Run Token Usage Tracking

- Goal: add single-task token statistics that update during model streaming and persist to the run record.
- Assumption: Qwen streaming does not reliably expose provider billing usage in each chunk, so the MVP uses deterministic estimated token counts and keeps the contract replaceable with exact provider usage later.
- Changes:
  - Updated `backend/schemas/alpha_trace_agent_runtime.py` to add `promptTokens`, `completionTokens`, and `totalTokens` to `RuntimeMetrics`.
  - Updated `backend/services/agent_runners/qwen_runner.py` to estimate prompt/completion tokens, emit `metric.updated` runtime events, and save latest token totals to `AgentRun.metrics`.
  - Serialized Qwen runner event/metric updates with a re-entrant lock to avoid Bull/Bear parallel stale-run overwrites.
  - Updated `frontend/app/entities/agent/model.ts` and `frontend/app/pages/AgentRunDetailPage.tsx` to show live Prompt / Completion / Total token metrics.
  - Updated `frontend/app/entities/agent/runtime-adapter.ts` so metric timeline summaries include token totals.
  - Updated `backend/services/agent_runtime_store/mysql_store.py` so `list_runs()` no longer sorts large `payload_json` rows directly, fixing MySQL `Out of sort memory` seen during smoke validation.
  - Added `docs/engineering/60_agent_run_token_usage_tracking.md`.
- Validation:
  - `python -m py_compile backend/schemas/alpha_trace_agent_runtime.py backend/services/agent_runners/qwen_runner.py backend/services/alpha_trace_agent_runtime_service.py backend/services/agent_runtime_store/memory_store.py backend/services/agent_runtime_store/json_store.py backend/services/agent_runtime_store/mysql_store.py`: passed.
  - `pnpm --dir frontend build`: passed.
  - Restarted `hyper-arena-app`.
  - Submitted Native run `run_native_20260505_032154_858435`; observed real-time token metrics via 13 `metric.updated` events in the initial smoke window.
  - Verified token totals were monotonic after the locking fix.
  - Cancelled the smoke run to avoid unnecessary model usage.
  - Restarted the app and verified the same run remained queryable with persisted token metrics: status `cancelled`, total tokens present.
  - Fixed and revalidated API smoke for `/api/health`, `/api/alpha-trace/assets`, `/api/alpha-trace/evidence`, `/api/alpha-trace/leaderboard`, and `/api/alpha-trace/agent-runs/runners/status`: all returned 200.
- Result:
  - Single-task token statistics are now visible in AgentRunDetail, update through SSE/runtime events, and persist in the run metrics payload.
- Remaining limitations:
  - Token counts are estimates, not provider-billed exact usage.
  - Current persistence is run-level metrics, not a separate per-step token usage table.
  - Cancelling an in-process run does not immediately abort an already-open provider stream; the worker may write a few final events before process restart or stream exit.
- Next:
  - Continue M111 - Evidence Detail Traceability for Bocha and Run Evidence.

## 2026-05-05 - M110 Follow-up: Agent Run Progress Recent Event Aggregation

- Goal: fix the expanded `Agent Run Progress` card still showing raw `reasoning.chunk` rows in `最近事件`.
- Cause: `AgentRunProgressCard` consumes `buildAgentRunProgress(...)`, and the mapper preferred the raw runtime snapshot timeline. That snapshot still contains chunk-level streaming events even though the lower Agent Timeline had already been switched to aggregated items.
- Changes:
  - Updated `frontend/app/shared/lib/runtime-step-mapper.ts`.
  - Recent events now prefer an aggregated runtime-event timeline built from `AgentRuntimeEvent[]`.
  - Streaming `reasoning.chunk` / `debate.message` events are grouped into `live.output` entries by step, agent, and event type.
  - Raw snapshot timeline is only used as a fallback and filters raw chunk/debate rows.
  - Added `research_manager` to the progress mapper step definitions and inference.
  - Updated `docs/engineering/59_agent_run_detail_timeline_aggregation.md`.
- Validation:
  - `pnpm --dir frontend build`: passed.
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/run_route_smoke.ps1 -BaseUrl http://127.0.0.1:8805 -FailOnError`: 12/12 passed.
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/run_runtime_smoke.ps1 -BaseUrl http://127.0.0.1:8805/api`: 15/15 passed.
- Result:
  - Agent Run Progress expanded Recent Events should no longer be dominated by raw `reasoning.chunk` rows. Chunk-level details remain available in Runtime Event Stream.
- Next:
  - Continue M111 - Evidence Detail Traceability for Bocha and Run Evidence.

## 2026-05-05 - Agent Lab Runtime Status Loading Guard

- Goal: fix Agent Lab transient UI state where submit buttons and runner cards could remain in `still loading` / `Submitting stub task...` even though backend `/runners/status` and submit APIs were healthy.
- Cause: Agent Lab inferred runtime status loading from an empty `runnerStatuses` array and had no explicit runner-status loading flag. This made slow, stale, or interrupted requests indistinguishable from a missing backend response.
- Changes:
  - Updated `frontend/app/pages/AgentLabPage.tsx`.
  - Added explicit `isLoadingRunnerStatus` state.
  - Runner blocked-reason text now distinguishes `checking backend status`, `status unavailable`, and concrete backend errors.
  - Runtime cards now show `checking` instead of `unknown` while status is actively loading.
  - Submit success now clears `submittingRunner` and the transient submit message before route navigation.
- Validation:
  - `pnpm --dir frontend build`: passed.
  - `GET http://127.0.0.1:8805/api/health`: passed.
  - `GET http://127.0.0.1:8805/api/alpha-trace/agent-runs/runners/status`: passed; qwen and alphatrace_native reported ready, tradingagents reported disabled by policy.
  - Route smoke: 12/12 passed.
  - Stub submit smoke produced `run_stub_20260505_041340_680513` with status `completed`.
- Result:
  - The screenshot state was not a backend outage. Backend and stub submit were healthy; the frontend now has explicit status lifecycle handling and clearer diagnostics.
- Next:
  - Continue M111 - Evidence Detail Traceability for Bocha and Run Evidence.

## 2026-05-05 - Qwen Token Metric Write Amplification Fix

- Goal: address observed Qwen/Native runs feeling stuck after token display was added.
- Finding:
  - Backend and model stream were not fully deadlocked; run `run_qwen_20260505_043402_423756` progressed into `Market Analyst` streaming.
  - However, the old implementation emitted `metric.updated` and saved the full run payload after nearly every small streaming chunk.
  - That doubled runtime-event writes and increased MySQL write amplification during provider streaming, making slow model output look worse and increasing stall risk.
- Changes:
  - Updated `backend/services/agent_runners/qwen_runner.py`.
  - Added per-run token metric cache in `QwenRunnerAdapter`.
  - Prompt token metrics still persist immediately at step start.
  - Completion token metrics now persist/emit only when pending token delta reaches about 120 tokens or when the step finishes.
  - Final step flush uses `force=True` so persisted totals remain available even when the last delta is small.
  - Cancelled stale run `run_qwen_20260505_043402_423756` after app restart interrupted the in-process worker.
- Validation:
  - `python -m py_compile backend/services/agent_runners/qwen_runner.py`: passed.
  - `docker exec hyper-arena-app python -m py_compile /app/backend/services/agent_runners/qwen_runner.py`: passed.
  - Restarted `hyper-arena-app`; initial health returned transient 500 during startup migrations, then recovered to healthy.
  - Runtime smoke: 15/15 passed.
- Result:
  - Token statistics remain available, but token metric persistence no longer writes on every tiny model chunk.
- Remaining limitation:
  - Qwen provider streaming itself may still emit tiny chunks with long gaps; this is provider/network/model latency, not fully controlled by token display.
  - In-process cancellation remains cooperative; restarting the app interrupts active Qwen workers and requires marking old running runs cancelled/failed.
- Next:
  - Continue M111 - Evidence Detail Traceability for Bocha and Run Evidence, then M112 timeline aggregation cleanup.

## 2026-05-05 - M111 Evidence Detail Traceability

Goal:
- Make Bocha/run-scoped evidence traceable from AgentRunDetail and Evidence Center.

Changes:
- Extended AgentRun evidence frontend mapper to preserve sourceType, extractedFields, usedByDecisionIds, and metadata.
- Extended Evidence API search to merge run-scoped evidence from AgentRunStore, not only static evidence seed.
- Added canonicalSourceUrl/rawExtractedFields metadata for run-scoped evidence API items.
- Added collapsible raw metadata/source payload display in Evidence Center detail panel.

Validation:
- python -m py_compile backend/api/alpha_trace_evidence_routes.py: passed.
- pnpm --dir frontend build: passed.
- GET /api/health via 8805: healthy.
- GET /api/alpha-trace/evidence?sourceType=bocha_search&limit=5: returned Bocha evidence with URL, extractedFields, usedByAgentRunIds, usedByDecisionIds.

Notes:
- The currently running backend had not reloaded the new /evidence/search merge behavior during smoke, but list/detail already confirmed Bocha evidence exists and is traceable.
- Existing unrelated Settings module preset changes remain uncommitted and are not part of M111.

## 2026-05-05 - M112 Agent Timeline Aggregation Cleanup

Goal:
- Reduce AgentRunDetail timeline fragmentation caused by raw streaming chunks and frequent runtime metric events.

Changes:
- Updated `frontend/app/pages/AgentRunDetailPage.tsx`.
- Agent Timeline now keeps only key lifecycle/tool/report/decision/risk events as individual rows.
- Streaming `reasoning.chunk` / `debate.message` events are aggregated into `live.output.summary` rows per step/agent/type.
- `metric.updated` events are aggregated into `metric.updated.summary` rows per step/agent with latest token estimates when available.
- Raw chunk-level and metric-level details remain available in Runtime Event Stream; Agent Timeline is now a decision-chain summary view.

Validation:
- `pnpm --dir frontend build`: passed.
- `GET http://127.0.0.1:8805/api/health`: healthy.

Notes:
- Existing unrelated Settings/layout changes remain uncommitted and were not included in this milestone.

Next:
- Continue with runtime log availability / backend log path hardening, or proceed to evidence preview UX depending on demo priority.

## 2026-05-05 - M113 Backend Runtime Log Availability Diagnostics

Goal:
- Make AgentRunDetail backend log availability understandable when the configured file log is missing, especially in Docker/stdout deployments.

Changes:
- Updated `backend/api/alpha_trace_agent_runtime_routes.py`.
- Runtime log endpoint now resolves known local AlphaTrace log candidates when `ALPHATRACE_BACKEND_LOG_PATH` is not set.
- Runtime log endpoint returns `source` and `candidates` metadata.
- Missing-log message now explains that Docker deployments usually write process logs to stdout and suggests `docker logs hyper-arena-app` or `ALPHATRACE_BACKEND_LOG_PATH`.
- Updated `frontend/app/entities/agent/api.ts` and `frontend/app/pages/AgentRunDetailPage.tsx` to display log source and checked candidates.

Validation:
- `python -m py_compile backend/api/alpha_trace_agent_runtime_routes.py`: passed.
- `pnpm --dir frontend build`: passed.
- `GET http://127.0.0.1:8805/api/alpha-trace/agent-runs/runtime/logs?limit=5`: returned available `/app/logs/backend-runtime.log` from the running backend.
- Direct local route import smoke was skipped because the host Python environment is missing `psycopg2`; py_compile and running API smoke covered this change.

Notes:
- This does not attempt to read Docker stdout from inside FastAPI. Runtime Event Stream remains the canonical per-run execution source.
- Existing unrelated Settings/layout changes remain uncommitted and were not included in this milestone.

Next:
- Continue with AgentRunDetail visual consistency cleanup or Native runner/token metric persistence review.

## 2026-05-05 - M112 Tool Invocation Detail UX

Goal:
- Make Tool Calls Timeline auditable without changing backend tool payloads.

Changes:
- Updated `frontend/app/pages/AgentRunDetailPage.tsx`.
- Added tool contract descriptions for Bocha search, evidence retrieval, market context/data, Qwen/LLM calls, and TradingAgents PoC calls.
- Runtime tool activities now preserve called/result payloads for expandable inspection.
- Tool details now show source, query, result summary, timing, related evidence, and sanitized args/event payloads.
- Sensitive payload keys and `sk-*` style values are redacted before display.
- Updated `docs/EXECUTION_PLAN.md`: M111 and M112 marked completed.

Validation:
- `pnpm --dir frontend build`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/run_route_smoke.ps1 -BaseUrl http://127.0.0.1:8805 -FailOnError`: 12/12 passed.

Notes:
- This is a display-only pass. It does not introduce new backend tool execution and does not expose secrets.
- Existing unrelated Settings/layout changes remain uncommitted and were not included in this milestone.

Next:
- Continue M113 - Native Risk Sub-Perspective Implementation.

## 2026-05-05 - M113 Native Risk Sub-Perspective Implementation

Goal:
- Add Conservative / Neutral / Aggressive risk perspectives to the bounded Native/Qwen Risk Review step without adding extra model calls.

Changes:
- Updated `backend/services/agent_runners/qwen_runner.py`.
- Risk Review prompt now explicitly asks for Conservative Risk Perspective, Neutral Risk Perspective, and Aggressive Risk Perspective.
- Structured JSON example now includes `riskReview.riskPerspectives.conservative/neutral/aggressive`.
- Risk Review output is normalized with fallback sections when the model does not explicitly separate all perspectives.
- Mapper emits additive `risk.warning` runtime events with `riskPerspective=conservative|neutral|aggressive` when perspectives are available.
- Updated `docs/EXECUTION_PLAN.md`: M113 marked in progress because runtime validation is pending.

Validation:
- `python -m py_compile backend/services/agent_runners/qwen_runner.py backend/services/agent_runners/native_multi_agent_runner.py`: passed.
- Runner status API: qwen and alphatrace_native reported ready from `mysql_system_config`; tradingagents remained disabled by policy.
- Runtime smoke attempted, but timed out on multiple read endpoints while an existing long-running Native run was active and `hyper-arena-app` CPU was high.

Reason runtime validation is pending:
- Existing active run(s) are still in `running` state and streaming slowly.
- Restarting the app or cancelling active runs would interrupt user-visible runtime work.
- M113 needs a safe validation window after current runs complete or after explicit approval to cancel stale runs/restart app.

Notes:
- No new event type was introduced; `risk.warning` is reused for schema compatibility.
- This does not change TradingAgents or add extra model calls.

Next:
- When safe, restart/reload backend, submit one `runnerType=alphatrace_native` smoke run, and verify Risk Review report plus three `riskPerspective` events.
- If current long-running runs remain stale, decide whether to cancel them before continuing runtime-heavy validation.

## 2026-05-05 - M117-M125 Backend Abstraction Baseline

Goal:
- Start the 4-hour backend refactor track for future open-source component integration without destabilizing current runtime flows.
- Make AlphaTrace Core / Integration / PoC Runner / Legacy boundaries explicit.
- Add minimal abstraction skeletons for data/model/tool/workbench integrations, async tasks, and orchestration plans.

Assumptions:
- Existing unrelated frontend/settings/asset changes are out of scope for this architecture batch and remain uncommitted.
- LangAlpha local worktree currently shows many deleted files, so deeper LangAlpha inspection should use git objects (`origin/main`) or upstream docs until the checkout is repaired.
- TradingAgents and LangAlpha remain optional adapters/reference systems; AlphaTrace Native remains the product runner path.
- Runtime wiring is intentionally unchanged in this batch to avoid interrupting active AgentRun work.

Changes:
- Added `docs/engineering/60_backend_boundary_audit.md`.
- Added `docs/engineering/61_integration_abstraction_layer.md`.
- Added `docs/engineering/62_tradingagents_langalpha_component_strategy.md`.
- Added `backend/services/integration_adapters/base.py` and package exports.
- Added `backend/services/async_tasks/base.py` and package exports.
- Added `backend/services/agent_orchestrator/base.py`.
- Updated `docs/EXECUTION_PLAN.md` with M117-M126.
- Updated `docs/VALIDATION.md` with M117-M126 validation rules.

Current decisions:
- Data APIs, model providers, backend tools, external workbenches, runner adapters, and async task schedulers must have separate boundaries.
- TradingAgents is best treated as a runner/subprocess/LangGraph benchmark path.
- LangAlpha is best treated as an external workbench adapter or architecture reference, not an in-process runner.
- Native AlphaTrace orchestration should eventually be extracted out of `qwen_runner.py` into a dedicated orchestrator using the new `OrchestrationPlan` vocabulary.

Validation:
- Pending py_compile for newly added abstraction skeletons.

Next:
- Complete M126 by running py_compile and recording git status.
- Continue with M119/M120/M121 implementation detail if validation passes: orchestration boundary model, async task manager design, and data API management design.

## 2026-05-05 - M126 Architecture Review and Next Refactor Queue

Goal:
- Close the first architecture-refactor batch and make the next implementation queue explicit.

Validation:
- `python -m py_compile backend/services/integration_adapters/base.py backend/services/integration_adapters/__init__.py backend/services/async_tasks/base.py backend/services/async_tasks/__init__.py backend/services/agent_orchestrator/base.py`: passed.
- `git status --short`: captured. Existing unrelated frontend/settings/asset changes remain dirty and are not part of this architecture batch.

Completed in M117-M126:
- Backend boundary audit.
- Integration abstraction design.
- Orchestration boundary model.
- Async task manager design.
- Data API management design.
- LangAlpha external adapter design.
- TradingAgents/LangAlpha component selection strategy.
- Additive Python skeletons for integration adapters, async task scheduler contracts, and orchestration plans.

Next refactor queue:
1. M127 Tool Adapter Catalog: centralize real backend tool contracts and metadata.
2. M128 Bocha/DataProvider adapter wrapper: adapt existing `ExternalEvidenceSearch` to `DataProviderAdapter` without changing runner behavior.
3. M129 MarketData provider adapter wrapper: adapt static market data to provider/tool contracts.
4. M130 ModelProvider adapter extraction plan for Qwen: separate model invocation from runner orchestration in a small tested slice.
5. M131 Native OrchestrationPlan builder: make Native DAG plan explicit before moving execution out of `qwen_runner.py`.
6. M132 AsyncTask status persistence PoC: design or implement minimal MySQL task snapshot only if safe.
7. M133 AgentArtifact contract design: prepare for LangAlpha-style tables/charts/files/web previews.
8. M134 Batch validation and commit grouping.

## 2026-05-05 - M127 Runtime Tool Catalog Endpoint

Goal:
- Provide a backend source of truth for tool-call contracts used by AgentRunDetail diagnostics.

Changes:
- Updated `backend/api/alpha_trace_agent_runtime_routes.py`.
- Added `GET /api/alpha-trace/agent-runs/runtime/tools` returning contracts from existing `services.agent_tool_registry`.

Validation:
- Pending py_compile.
- Runtime smoke is pending backend reload/restart because the running Docker app may not yet include the new route.

Notes:
- No runner behavior changed.
- No secrets are returned; the endpoint exposes metadata only.

Next:
- Run py_compile and continue with M128 Bocha/DataProvider adapter wrapper.

## 2026-05-05 - M128 Bocha DataProviderAdapter Wrapper

Goal:
- Wrap Bocha search as a first-class data provider adapter without changing current evidence retrieval behavior.

Changes:
- Added `backend/services/integration_adapters/bocha_adapter.py`.
- Exported `BochaDataProviderAdapter` from `backend/services/integration_adapters/__init__.py`.

Validation:
- Pending py_compile.

Notes:
- Existing Qwen/Native EvidenceRetriever still calls `ExternalEvidenceSearch` directly. This avoids behavior changes while providing the migration target.

## 2026-05-05 - M129 Static Market Data ProviderAdapter Wrapper

Goal:
- Wrap AlphaTrace static market data as a provider adapter so professional data APIs can later replace the same interface.

Changes:
- Added `backend/services/integration_adapters/market_data_adapter.py`.
- Exported `StaticMarketDataProviderAdapter`.

Validation:
- Pending py_compile.

Notes:
- Existing APIs and runner market context loading are unchanged.

## 2026-05-05 - M130 Qwen ModelProviderAdapter Boundary

Goal:
- Create an additive Qwen/DashScope model provider boundary for future extraction from `qwen_runner.py`.

Changes:
- Added `backend/services/integration_adapters/qwen_model_adapter.py`.
- Exported `QwenModelProviderAdapter`.

Validation:
- Pending py_compile.

Notes:
- Current QwenRunner model-call and streaming behavior is unchanged.

## 2026-05-05 - M131 AlphaTrace Native OrchestrationPlan Builder

Goal:
- Make the Native DAG explicit as data before moving execution logic out of `qwen_runner.py`.

Changes:
- Added `backend/services/agent_orchestrator/native_plan.py`.

Validation:
- Pending py_compile.

Notes:
- Runtime execution remains unchanged.

## 2026-05-05 - M132 Native OrchestrationPlan Diagnostics Endpoint

Goal:
- Let frontend/diagnostics retrieve the Native logical DAG from backend instead of relying only on hardcoded UI mapping.

Changes:
- Updated `backend/api/alpha_trace_agent_runtime_routes.py`.
- Added `GET /api/alpha-trace/agent-runs/runners/plans/alphatrace-native`.

Validation:
- Pending py_compile.
- Runtime smoke is pending backend reload/restart because running Docker app may not yet include the new route.

Notes:
- The endpoint returns expected plan/dependencies, not live run progress.

## 2026-05-05 - M133 AgentArtifact Contract Skeleton

Goal:
- Prepare for LangAlpha-style files/tables/charts/web previews through a product-facing artifact contract.

Changes:
- Added `backend/services/agent_artifacts/base.py`.
- Added `backend/services/agent_artifacts/__init__.py`.
- Added `docs/engineering/67_agent_artifact_contract.md`.

Validation:
- Pending py_compile.

## 2026-05-05 - M134 Architecture Refactor Batch Validation

Goal:
- Validate M117-M133 additive architecture/refactor baseline and prepare a reviewable save point.

Validation:
- `python -m py_compile backend/api/alpha_trace_agent_runtime_routes.py backend/services/agent_tool_registry.py backend/services/integration_adapters/base.py backend/services/integration_adapters/__init__.py backend/services/integration_adapters/bocha_adapter.py backend/services/integration_adapters/market_data_adapter.py backend/services/integration_adapters/qwen_model_adapter.py backend/services/async_tasks/base.py backend/services/async_tasks/__init__.py backend/services/agent_orchestrator/base.py backend/services/agent_orchestrator/native_plan.py backend/services/agent_artifacts/base.py backend/services/agent_artifacts/__init__.py`: passed.
- `git diff --check` for the M117-M133 scoped files: passed; only existing CRLF normalization warnings for canonical docs.
- Frontend build not run because this batch did not modify frontend code.
- Runtime endpoint smoke for new routes is pending backend reload/restart; current running Docker app may not include these source changes yet.

Current save-point scope:
- Backend route addition: runtime tool contracts endpoint and native plan endpoint.
- Additive backend abstraction skeletons: integration adapters, async tasks, orchestrator plan, artifacts.
- Architecture/design docs M117-M133.

Unrelated dirty files intentionally excluded:
- Existing Settings/layout/asset frontend changes.
- `backend/api/config_routes.py` existing change.
- `frontend/app/shared/ui/LanguageToggle.tsx` and `ResearchAssetChart.tsx` existing untracked UI work.

Next:
- Commit only the M117-M134 scoped files.
- Continue with M135: begin a small runtime-safe migration by making provider/tool metadata queryable from status diagnostics, or M136: extract market/evidence tool execution helpers from `qwen_runner.py` without changing outputs.

## 2026-05-05 - M135 Runtime Integration Diagnostics Endpoint

Goal:
- Surface adapter capability/health for Bocha, static market data, and Qwen provider boundaries.

Changes:
- Updated `backend/api/alpha_trace_agent_runtime_routes.py`.
- Added `GET /api/alpha-trace/agent-runs/runtime/integrations`.
- Updated `QwenModelProviderAdapter` health/invoke config resolution to read MySQL system config in addition to environment variables.

Validation:
- Pending py_compile.
- Runtime smoke is pending backend reload/restart.

Notes:
- No raw API keys are returned.
- Existing runner behavior is unchanged.

## 2026-05-05 - M136 Tool Contract Enrichment for TradingAgents Events

Goal:
- Make TradingAgents PoC tool events consume the same backend tool contract metadata as Qwen/Native tool events.

Changes:
- Updated `backend/services/agent_tool_registry.py` with `tradingagents.subprocess_worker` and `tradingagents.graph.run` contracts.
- Updated `backend/services/agent_runners/tradingagents_adapter.py` to attach `toolContract` payload metadata for known `toolName` values.

Validation:
- Pending py_compile.

Notes:
- No TradingAgents execution behavior changed.

## 2026-05-05 - M137 IntegrationAdapterRegistry

Goal:
- Centralize integration adapter construction and diagnostics outside the API route.

Changes:
- Added `backend/services/integration_adapters/registry.py`.
- Updated `backend/services/integration_adapters/__init__.py` exports.
- Updated runtime integrations endpoint to use `build_default_integration_registry()`.

Validation:
- Pending py_compile.

## 2026-05-05 - M138 Integration Registry Local Smoke

Goal:
- Verify default integration registry diagnostics locally without server reload.

Validation:
- First attempt used bash heredoc syntax and failed under PowerShell; command issue only.
- PowerShell pipe smoke passed and printed three integrations:
  - `bocha_web_search data_provider missing_config environment_or_mysql_system_config`
  - `alphatrace_static_market_data data_provider ready static_market_data_seed`
  - `qwen_openai_compatible model_provider missing_config missing`
- No obvious `sk-`, `Bearer`, or `api_key` secret markers were present in diagnostics.
- Local Python emitted a requests dependency warning unrelated to this code path.

Notes:
- Qwen reports missing in local host smoke because local Python environment does not share the running Docker/MySQL runtime config. The backend route should use runtime configuration when the app reloads.

## 2026-05-05 - M139 MySQL AsyncTaskStore Skeleton

Goal:
- Create the durable task table/store boundary needed for future AgentRun worker scheduling, cancellation, retry, and timeout management.

Changes:
- Added `backend/services/async_tasks/mysql_store.py`.
- Updated `backend/services/async_tasks/__init__.py` exports.

Validation:
- Pending py_compile.

Notes:
- Submit flow is not wired to this store yet. This keeps current runtime behavior stable.

## 2026-05-05 - M140 AsyncTask Diagnostics Endpoint

Goal:
- Add a safe read-only endpoint for future async task store diagnostics.

Changes:
- Updated `backend/api/alpha_trace_agent_runtime_routes.py` with `GET /runtime/tasks`.

Validation:
- Pending py_compile.

Notes:
- Current submit flow is not yet writing task snapshots, so the endpoint may return an empty list until a later wiring milestone.

## 2026-05-05 - M141-M142 Evidence and Market ToolAdapters

Goal:
- Add governed ToolAdapter wrappers for `evidence.retrieve` and `market.context.load`.

Changes:
- Added `backend/services/integration_adapters/tool_adapters.py`.
- Registered `EvidenceRetrieveToolAdapter` and `MarketContextToolAdapter` in default integration registry.
- Updated integration adapter exports.

Validation:
- Pending py_compile and optional local static smoke.

Notes:
- Current Qwen/Native runners are not rewired yet. This keeps behavior stable while introducing the future execution boundary.

## 2026-05-05 - M141-M142 ToolAdapter Local Smoke

Validation:
- `python -m py_compile backend/services/integration_adapters/tool_adapters.py backend/services/integration_adapters/registry.py backend/services/integration_adapters/__init__.py`: passed.
- Local static smoke passed:
  - `EvidenceRetrieveToolAdapter` returned 2 evidence IDs for `asset_etf_510300` with `includeExternal=False`.
  - `MarketContextToolAdapter` returned market context for `asset_etf_510300`.
- Local Python emitted the same requests dependency warning; unrelated to adapter behavior.

Next:
- M143 can begin a runtime-safe migration by optionally letting Native/Qwen runner call these ToolAdapters behind a feature flag, or continue with ModelProvider extraction tests.

## 2026-05-05 - M143 ToolExecutor Event Payload Helper

Goal:
- Centralize future tool invocation event payload generation.

Changes:
- Added `backend/services/agent_orchestrator/tool_executor.py`.

Validation:
- Pending py_compile and optional local smoke.

## 2026-05-05 - M143 ToolExecutor Local Smoke

Validation:
- `python -m py_compile backend/services/agent_orchestrator/tool_executor.py`: passed.
- Local smoke executed `MarketContextToolAdapter` through `ToolExecutor`:
  - result status `completed`
  - tool contract `market.context.load` present in called payload
  - result payload contained market context
- Local Python emitted the same requests dependency warning; unrelated to ToolExecutor behavior.

Next:
- M144 can add a ToolExecutor-backed smoke script or start a feature-flagged migration of market/evidence context loading inside Native/Qwen runner.

## 2026-05-05 - M144 Feature-Flagged Market Context ToolAdapter Path

Goal:
- Add a default-off migration point for `market.context.load` to use ToolAdapter/ToolExecutor from Qwen/Native runner.

Changes:
- Updated `backend/services/agent_runners/qwen_runner.py`.
- When `ALPHATRACE_USE_TOOL_ADAPTERS=true`, market context loading uses `MarketContextToolAdapter` and `ToolExecutor` event payloads.
- Default path remains unchanged.

Validation:
- Pending py_compile.

Notes:
- This is intentionally feature-flagged because existing runs and UI are stable on the current event shape.

## 2026-05-05 - M145 Feature-Flagged Evidence Retrieve ToolAdapter Path

Goal:
- Add a default-off migration point for `evidence.retrieve` to use ToolAdapter/ToolExecutor from Qwen/Native runner.

Changes:
- Updated `backend/services/agent_runners/qwen_runner.py`.
- When `ALPHATRACE_USE_TOOL_ADAPTERS=true`, evidence retrieval uses `EvidenceRetrieveToolAdapter` and `ToolExecutor` event payloads.
- Default path remains unchanged.

Validation:
- Pending py_compile.

Notes:
- Existing detailed static/Bocha retrieval events remain the default path. The adapter path is for controlled migration testing.

## 2026-05-05 - M146 Backend Abstraction Smoke Script

Goal:
- Add a repeatable validation script for integration adapters, tool adapters, async task contracts, orchestrator contracts, and artifacts.

Changes:
- Added `scripts/alphatrace/smoke_backend_abstractions.ps1`.

Validation:
- Pending script run.

## 2026-05-05 - M146 Backend Abstraction Smoke Script Validation

Validation:
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_backend_abstractions.ps1`: passed.
- Script compiled backend abstraction files and ran local registry/tool adapter smoke:
  - integrations: 5
  - evidence adapter: completed, 2 evidence IDs
  - market tool through ToolExecutor: completed, `market.context.load`
- Local Python emitted the same requests dependency warning; unrelated to script result.

Next:
- M147 should start documenting/implementing the next safe extraction slice: Qwen model invocation adapter migration behind feature flag, or integration diagnostics UI when frontend changes are safe.

## 2026-05-05 - M147-M148 Frontend Architecture Boundary Docs

Goal:
- Extend the architecture refactor beyond backend by documenting AlphaTrace frontend page/entity/shared boundaries and API client growth path.

Changes:
- Added `docs/engineering/68_frontend_boundary_audit.md`.
- Added `docs/engineering/69_frontend_api_client_abstraction_plan.md`.
- Updated `docs/EXECUTION_PLAN.md` and `docs/VALIDATION.md`.

Validation:
- Documentation-only; no frontend build required.

Next:
- M149 can implement `agent/api.ts` client methods for runtime tools/integrations/tasks/native plan when it is safe to touch frontend code.

## 2026-05-05 - M149 Runtime Config Facade

Goal:
- Centralize sanitized runtime configuration diagnostics for Qwen, Bocha, TradingAgents, and LangAlpha.

Changes:
- Added `backend/services/runtime_config/facade.py` and package exports.
- Added `GET /api/alpha-trace/agent-runs/runtime/config`.
- Updated `GET /api/alpha-trace/agent-runs/runners/status` to reuse `RuntimeConfigFacade` while keeping existing response fields.

Validation:
- `python -m py_compile backend/services/runtime_config/facade.py backend/services/runtime_config/__init__.py backend/api/alpha_trace_agent_runtime_routes.py`: passed.
- Local facade smoke passed for qwen/bocha/tradingagents/langalpha keys and verified no obvious secret markers.
- Local host smoke reported Bocha config_store_error because this Python process is not connected to the Docker/MySQL runtime config. This is acceptable for local smoke and is surfaced explicitly.

Next:
- M150 should make the Qwen provider adapter reuse RuntimeConfigFacade for source consistency, then add a small model adapter smoke that does not call the network when key is missing.

## 2026-05-05 - M150 In-Process Async Task Scheduler Boundary

Goal:
- Add a minimal scheduler abstraction for future AgentRun worker migration without changing current submit behavior.

Changes:
- Added `backend/services/async_tasks/memory_store.py`.
- Added `backend/services/async_tasks/in_process_scheduler.py`.
- Updated async task exports.

Validation:
- `python -m py_compile backend/services/async_tasks/base.py backend/services/async_tasks/memory_store.py backend/services/async_tasks/in_process_scheduler.py backend/services/async_tasks/__init__.py`: passed.
- Local scheduler smoke passed:
  - callable result persisted as `completed`
  - raised `ValueError` persisted as `failed`

Notes:
- Current AgentRun `/submit` is not wired to this scheduler yet. This keeps Qwen/Native/TradingAgents behavior stable while establishing the future execution boundary.

Next:
- M151 should add a queue/scheduler design doc that maps current AgentRun background threads to `AsyncTaskSpec`, then decide the smallest safe wiring point.

## 2026-05-05 - M151 AgentRun TaskSpec Factory

Goal:
- Map AlphaTrace submit requests into scheduler-neutral `AsyncTaskSpec` records for future worker migration.

Changes:
- Added `backend/services/agent_orchestrator/task_spec_factory.py`.

Validation:
- `python -m py_compile backend/services/agent_orchestrator/task_spec_factory.py`: passed.
- Local smoke built a TradingAgents task spec from `SubmitAgentRunRequest`, derived tags, timeout, and redacted an accidental `apiKey` extra param.

Notes:
- The factory is not wired into `/submit` yet. It gives the future scheduler a stable input contract without changing current runtime behavior.

Next:
- M152 should define the concrete migration point in `alpha_trace_agent_runtime_service.submit_agent_run`: create task spec, persist pending task, then let existing runner submit continue until scheduler cutover is explicitly enabled.

## 2026-05-05 - M152 Optional AgentRun Submit Task Snapshot Recording

Goal:
- Add a default-off bridge from current AgentRun submit flow to `AsyncTaskStore` diagnostics.

Changes:
- Updated `backend/services/alpha_trace_agent_runtime_service.py`.
- After runner submit returns a response, `_record_async_task_snapshot_if_enabled` can persist `AsyncTaskSpec` to MySQL when `ALPHATRACE_RECORD_ASYNC_TASKS=true`.

Validation:
- `python -m py_compile backend/services/alpha_trace_agent_runtime_service.py backend/services/agent_orchestrator/task_spec_factory.py backend/services/async_tasks/mysql_store.py`: passed.

Notes:
- Default behavior is unchanged because the feature flag is off.
- Task diagnostics never fail submit; errors are swallowed intentionally until scheduler migration is explicit.

Next:
- M153 should add a runtime-safe API smoke once the backend is restarted/reloaded, or continue with backend data API management abstractions that do not require a restart.

## 2026-05-05 - M153 AlphaTrace Data API Catalog

Goal:
- Create a product-owned catalog for AlphaTrace data API boundaries before adding more external data providers.

Changes:
- Added `backend/services/data_api/catalog.py` and package exports.
- Added `GET /api/alpha-trace/data-sources/api-catalog`.

Validation:
- `python -m py_compile backend/services/data_api/catalog.py backend/services/data_api/__init__.py backend/api/alpha_trace_data_source_routes.py`: passed.
- Local catalog smoke passed with 8 resources including `market_data.static_v1` and `agent_runtime`.
- Smoke verified no obvious key/secret/bearer markers in the catalog response.

Notes:
- This catalog is a management/diagnostic boundary. It does not add a real ETF data provider yet.
- Legacy BTC/Hyperliquid APIs remain outside the AlphaTrace market-data boundary.

Next:
- M154 should define the Adapter Composition Matrix for Native / TradingAgents / LangAlpha / future ETF providers, then identify which pieces are implemented vs design-only.

## 2026-05-05 - M154 Runner Adapter Composition Matrix

Goal:
- Expose a product-facing matrix describing how Stub, Qwen, AlphaTrace Native, TradingAgents, and LangAlpha compose orchestration/model/data/tool/persistence/streaming/artifact boundaries.

Changes:
- Added `backend/services/agent_orchestrator/adapter_matrix.py`.
- Added `GET /api/alpha-trace/agent-runs/runners/adapter-matrix`.

Validation:
- `python -m py_compile backend/services/agent_orchestrator/adapter_matrix.py backend/api/alpha_trace_agent_runtime_routes.py`: passed.
- Local smoke verified matrix entries for qwen, alphatrace_native, tradingagents, and langalpha.

Notes:
- TradingAgents remains opt-in PoC.
- LangAlpha remains design-only external service candidate.
- No external code is copied or executed.

Next:
- M155 should start reducing runner/orchestrator coupling by extracting a Native Agent Flow descriptor that can feed both UI and future scheduler execution.

## 2026-05-05 - M155 Runner Flow Catalog

Goal:
- Expose runner flow descriptors for UI/diagnostics without hardcoding flow order in pages or exposing external framework internals.

Changes:
- Added `backend/services/agent_orchestrator/flow_catalog.py`.
- Added `GET /api/alpha-trace/agent-runs/runners/flows`.
- Added `GET /api/alpha-trace/agent-runs/runners/flows/{runner_type}`.

Validation:
- `python -m py_compile backend/services/agent_orchestrator/flow_catalog.py backend/api/alpha_trace_agent_runtime_routes.py`: passed.
- Local flow catalog smoke passed:
  - qwen: 7 nodes
  - alphatrace_native: 7 nodes
  - tradingagents: 8 nodes
  - langalpha: 5 nodes

Notes:
- TradingAgents and LangAlpha flow descriptors are AlphaTrace-owned diagnostics. They are not raw external framework state.

Next:
- M156 should add a backend endpoint smoke script for all new abstraction endpoints, without restarting services unless needed.

## 2026-05-05 - M156 Abstraction Endpoint Smoke Script

Goal:
- Add a repeatable HTTP smoke script for new abstraction diagnostics endpoints.

Changes:
- Added `scripts/alphatrace/smoke_abstraction_endpoints.ps1`.

Validation:
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_abstraction_endpoints.ps1 -SkipHttp`: passed.
- Full HTTP smoke against `http://127.0.0.1:8805/api` failed for 8 new endpoints with 404 because the currently running backend has not reloaded this branch's new routes yet.
- Existing old endpoints `/runners/status` and `/runners/capabilities` returned OK, confirming the base URL is reachable.

Notes:
- Runtime HTTP validation should be rerun after a safe backend reload/restart.
- I did not restart the backend in this step to avoid interrupting any active AgentRun.

Next:
- Continue backend abstraction work that can be validated statically; schedule endpoint HTTP smoke after a reload window.

## 2026-05-05 - M157 AgentArtifact Store Boundary

Goal:
- Add a product-owned artifact persistence boundary for future LangAlpha/workbench files, tables, charts, web previews, and tool outputs.

Changes:
- Added `backend/services/agent_artifacts/memory_store.py`.
- Added `backend/services/agent_artifacts/mysql_store.py`.
- Added `backend/services/agent_artifacts/registry.py`.
- Updated artifact package exports.
- Added `GET /api/alpha-trace/agent-runs/{run_id}/artifacts`.

Validation:
- `python -m py_compile backend/services/agent_artifacts/base.py backend/services/agent_artifacts/memory_store.py backend/services/agent_artifacts/mysql_store.py backend/services/agent_artifacts/registry.py backend/services/agent_artifacts/__init__.py backend/api/alpha_trace_agent_runtime_routes.py`: passed.
- Local memory artifact store smoke passed for save/get/list.

Notes:
- Existing Qwen/Native runs may return empty artifacts until artifact-producing tools are wired.
- This store prevents LangAlpha-style workspace/file objects from becoming frontend product state directly.

Next:
- M158 should add a lightweight Artifact mapping design for Bocha URL previews and LangAlpha external files, then decide whether Evidence detail should create web_url artifacts.

## 2026-05-05 - M158 Evidence URL to AgentArtifact Mapper

Goal:
- Map evidence items with canonical source URLs into product-owned `web_url` AgentArtifacts for future preview/detail UI.

Changes:
- Added `backend/services/agent_artifacts/evidence_mapper.py`.
- Updated artifact package exports.

Validation:
- `python -m py_compile backend/services/agent_artifacts/evidence_mapper.py backend/services/agent_artifacts/__init__.py`: passed.
- Local smoke mapped `ev_bocha_test` with `https://example.com/a` into `art_run_test_ev_bocha_test_web` and ignored placeholder URL `#`.

Notes:
- The mapper is pure and does not fetch external pages.
- Source URL remains canonical; embedded preview is a best-effort frontend concern.

Next:
- M159 should decide whether run evidence persistence should optionally create web_url artifacts behind a feature flag.

## 2026-05-05 - M159 Optional Evidence URL Artifact Creation

Goal:
- Optionally create `web_url` AgentArtifacts from run evidence with canonical URLs after run outputs are persisted.

Changes:
- Updated `backend/services/alpha_trace_agent_runtime_service.py`.
- Added default-off `ALPHATRACE_CREATE_EVIDENCE_URL_ARTIFACTS=true` path.

Validation:
- `python -m py_compile backend/services/alpha_trace_agent_runtime_service.py backend/services/agent_artifacts/evidence_mapper.py backend/services/agent_artifacts/registry.py`: passed.

Notes:
- Default behavior is unchanged.
- Artifact creation failures are intentionally isolated from report/evidence/decision persistence.
- The backend does not fetch external pages; source URL remains canonical.

Next:
- M160 should update abstraction smoke scripts to include artifact mapper/store checks.

## 2026-05-05 - M160 Backend Abstraction Smoke Coverage Expansion

Goal:
- Expand the repeatable backend abstraction smoke script to cover newly added runtime config, scheduler, data API, flow, matrix, and artifact boundaries.

Changes:
- Updated `scripts/alphatrace/smoke_backend_abstractions.ps1`.

Validation:
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_backend_abstractions.ps1`: passed.
- Script now compiles and smoke-tests integration adapters, tool executor, runtime config, adapter matrix, flow catalog, data API catalog, in-process scheduler, artifact memory store, and evidence URL mapper.
- Local Python emitted an existing `requests` dependency warning; unrelated to abstraction behavior.

Next:
- M161 should update architecture docs with the new abstraction modules and then choose the next code slice: frontend API client wiring or controlled backend reload/runtime endpoint smoke.

## 2026-05-05 - M161 Architecture Documentation Sync for New Abstractions

Goal:
- Update canonical architecture documentation to include the new runtime config, async task, data API, adapter matrix, flow catalog, and artifact boundaries.

Changes:
- Updated `docs/ARCHITECTURE.md` backend directory roles and abstraction baseline.

Validation:
- Documentation review passed; no code build required.

Next:
- M162 should do a repository status checkpoint and decide whether to reload backend for HTTP endpoint smoke or continue static-safe refactoring.

## 2026-05-05 - M162 Stale AgentRun Diagnostics

Goal:
- Add read-only diagnostics for AgentRuns that remain running/submitted beyond a threshold.

Changes:
- Added `backend/services/agent_runtime_health.py`.
- Added `GET /api/alpha-trace/agent-runs/runtime/stale-runs`.

Validation:
- `python -m py_compile backend/services/agent_runtime_health.py backend/api/alpha_trace_agent_runtime_routes.py`: passed.
- Local stale run detector smoke passed; old running run detected and completed run ignored.

Runtime observation:
- Current running backend reports two old `alphatrace_native` runs still marked `running`, so I avoided backend restart in this milestone.

Next:
- M163 should either add a safe stale-run UI/client plan or perform a backend reload only after confirming no active user-important run should continue.

## 2026-05-05 - M163 Qwen Adapter Health Configuration Alignment

Goal:
- Keep Qwen integration diagnostics consistent with Settings and Agent Lab runner status by reusing the unified runtime configuration facade.

Changes:
- Updated `backend/services/integration_adapters/qwen_model_adapter.py`.
- `QwenModelProviderAdapter.health()` now calls `RuntimeConfigFacade.qwen()`.
- Model invocation remains unchanged; this is a diagnostics-only boundary cleanup.

Validation:
- `python -m py_compile backend/services/integration_adapters/qwen_model_adapter.py backend/services/runtime_config/facade.py`: passed.
- Local smoke for `QwenModelProviderAdapter().health()`: passed.
- Smoke returned `missing_config` in the local shell because that shell did not have Qwen env/MySQL config loaded; this is expected for the isolated local smoke and does not expose a raw key.

Notes:
- No frontend changes.
- No Docker/package changes.
- No runner behavior change.

Next:
- M164 should continue backend abstraction cleanup around model provider/catalog boundaries or add runtime-safe HTTP smoke after a backend reload window.

## 2026-05-05 - M164 Model Provider Catalog Boundary

Goal:
- Add a model provider catalog boundary for Qwen, future OpenAI-compatible providers, TradingAgents model bridge, LangAlpha BYOK bridge, and future local providers.

Changes:
- Added `backend/services/model_providers/catalog.py`.
- Added `backend/services/model_providers/__init__.py`.
- Added `GET /api/alpha-trace/agent-runs/runtime/model-providers`.
- Updated `scripts/alphatrace/smoke_backend_abstractions.ps1`.
- Updated `scripts/alphatrace/smoke_abstraction_endpoints.ps1`.

Validation:
- `python -m py_compile backend/services/model_providers/catalog.py backend/services/model_providers/__init__.py backend/api/alpha_trace_agent_runtime_routes.py`: passed.
- Local smoke for `list_model_provider_descriptors()`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_backend_abstractions.ps1`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_abstraction_endpoints.ps1 -SkipHttp`: passed.

Notes:
- This is diagnostics/catalog only. It does not invoke models or change runner execution.
- Full HTTP smoke for new endpoints still requires a backend reload because the currently running service predates these route additions.

Next:
- M165 should add a product-owned AgentRun artifact/metrics task persistence model or continue frontend-safe observability cleanup, depending on active runtime stability.

## 2026-05-05 - M165 AgentRun Metrics Snapshot Endpoint

Goal:
- Provide a single-run metrics snapshot endpoint so frontend/runtime diagnostics can display token and task statistics without treating every `metric.updated` event as primary timeline content.

Changes:
- Added `backend/services/agent_runtime_metrics.py`.
- Added `GET /api/alpha-trace/agent-runs/{run_id}/metrics`.

Validation:
- `python -m py_compile backend/services/agent_runtime_metrics.py backend/api/alpha_trace_agent_runtime_routes.py`: passed.
- Local missing-run smoke for `get_agent_run_metrics_snapshot`: passed.

Notes:
- This does not change how QwenRunner emits `metric.updated` events.
- MySQL deployments already mirror run metrics into `alpha_trace_agent_run_metrics`; this endpoint exposes a cleaner read model.
- Runtime HTTP validation should be rerun after backend reload.

Next:
- M166 should either adjust frontend AgentRunDetail to consume the metrics snapshot, or continue backend orchestration abstraction with a formal task scheduler registry.

## 2026-05-05 - M166 Orchestrator Catalog Boundary

Goal:
- Make execution boundaries explicit for current inline runner execution, in-process scheduler, subprocess workers, TradingAgents LangGraph PoC, and future LangAlpha external service adapter.

Changes:
- Added `backend/services/agent_orchestrator/orchestrator_catalog.py`.
- Added `GET /api/alpha-trace/agent-runs/runtime/orchestrators`.
- Updated backend abstraction smoke scripts to include orchestrator catalog checks.

Validation:
- `python -m py_compile backend/services/agent_orchestrator/orchestrator_catalog.py backend/api/alpha_trace_agent_runtime_routes.py`: passed.
- Local smoke for `list_orchestrator_descriptors()`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_backend_abstractions.ps1`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_abstraction_endpoints.ps1 -SkipHttp`: passed.

Notes:
- No submit behavior changed.
- TradingAgents remains opt-in PoC and LangAlpha remains design-only.

Next:
- M167 should add a concise backend abstraction index endpoint or architecture doc that ties data APIs, model providers, orchestrators, runner flows, tools, and artifacts together for frontend consumption.

## 2026-05-05 - M167 AlphaTrace Runtime Architecture Index

Goal:
- Add one product-owned backend index that ties together AlphaTrace API, runtime config, data API, model provider, orchestrator, runner, tool and artifact boundaries.

Changes:
- Added `backend/services/architecture_index.py`.
- Added `GET /api/alpha-trace/agent-runs/runtime/architecture`.
- Updated abstraction smoke scripts.

Validation:
- `python -m py_compile backend/services/architecture_index.py backend/api/alpha_trace_agent_runtime_routes.py`: passed.
- Local smoke for `get_alphatrace_architecture_index()`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_backend_abstractions.ps1`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_abstraction_endpoints.ps1 -SkipHttp`: passed.

Notes:
- The index references TradingAgents/LangAlpha only through AlphaTrace-owned descriptors.
- No external framework internal state is exposed.

Next:
- M168 should start consuming the new metrics/architecture endpoints in frontend diagnostics when safe, or add a static frontend architecture audit if existing frontend dirty changes make code edits risky.

## 2026-05-05 - M168 Frontend Runtime Diagnostics API Client Boundary

Goal:
- Add frontend entity-layer accessors for the new runtime architecture/model/orchestrator/metrics endpoints without touching existing dirty pages.

Changes:
- Updated `frontend/app/shared/api/endpoints.ts`.
- Added `frontend/app/entities/runtime/api.ts`.

Validation:
- `pnpm --dir frontend build`: passed.

Notes:
- Build produced existing Vite chunk and browserslist warnings; no build failure.
- No page UI was changed in this milestone.

Next:
- M169 should either wire these APIs into a dedicated diagnostics page/panel after reconciling existing frontend dirty changes, or continue backend contracts for data source/tool result artifacts.

## 2026-05-05 - M169 LangAlpha Reuse Backlog

Goal:
- Convert LangAlpha architecture review into a concrete AlphaTrace reuse backlog.

Changes:
- Added `docs/engineering/70_langalpha_reuse_backlog.md`.

Validation:
- `git -C ../LangAlpha log --oneline -1`: passed.
- `git -C ../LangAlpha show HEAD:README.md`: passed.
- `git -C ../LangAlpha show HEAD:pyproject.toml`: passed.
- `git -C ../LangAlpha ls-tree -r --name-only HEAD`: passed.

Notes:
- The sibling LangAlpha worktree currently contains only `.git`; files were read from HEAD without modifying the repo.
- Recommended path: LangAlpha as architecture reference or external service adapter, not embedded main backend.

Next:
- M170 should define a design-only LangAlpha adapter boundary in AlphaTrace code or continue strengthening data/tool artifact contracts.

## 2026-05-05 - M170 LangAlpha External Workbench Adapter Boundary

Goal:
- Add a design-only LangAlpha external workbench adapter to the backend integration registry.

Changes:
- Added `backend/services/integration_adapters/langalpha_workbench_adapter.py`.
- Updated `backend/services/integration_adapters/registry.py`.
- Updated `backend/services/integration_adapters/__init__.py`.
- Updated `scripts/alphatrace/smoke_backend_abstractions.ps1`.

Validation:
- `python -m py_compile backend/services/integration_adapters/langalpha_workbench_adapter.py backend/services/integration_adapters/registry.py backend/services/integration_adapters/__init__.py`: passed.
- Local smoke for adapter health and registry diagnostics: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_backend_abstractions.ps1`: passed.

Notes:
- LangAlpha is not imported or executed.
- `submit_task` and `fetch_task` return skipped design-only results.

Next:
- M171 should define a stricter tool result/artifact contract so Bocha URLs, market data snapshots, and future PTC outputs can all become traceable AgentArtifacts.

## 2026-05-05 - M171 ToolResult to AgentArtifact Mapper

Goal:
- Add a pure mapper from tool outputs to product-owned AgentArtifacts for Bocha URLs, structured payloads, and text outputs.

Changes:
- Added `backend/services/agent_artifacts/tool_result_mapper.py`.
- Updated `backend/services/agent_artifacts/__init__.py`.
- Updated `scripts/alphatrace/smoke_backend_abstractions.ps1`.

Validation:
- `python -m py_compile backend/services/agent_artifacts/tool_result_mapper.py backend/services/agent_artifacts/__init__.py`: passed.
- Local mapper smoke: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_backend_abstractions.ps1`: passed.

Notes:
- Mapper is not yet wired to runner persistence.
- It is intended for future Bocha/tool/PTC/LangAlpha artifact capture.

Next:
- M172 should add a default-off tool-result artifact persistence path or expose artifact mapping in ToolExecutor records.

## 2026-05-05 - M172 ToolExecutor Artifact Mapping Hook

Goal:
- Let ToolExecutor records expose mapped AgentArtifacts and artifact ids without changing default persistence behavior.

Changes:
- Updated `backend/services/agent_orchestrator/tool_executor.py`.

Validation:
- `python -m py_compile backend/services/agent_orchestrator/tool_executor.py backend/services/agent_artifacts/tool_result_mapper.py`: passed.
- Local ToolExecutor artifact mapping smoke: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_backend_abstractions.ps1`: passed.

Notes:
- Artifacts are persisted only when `ALPHATRACE_PERSIST_TOOL_RESULT_ARTIFACTS=true`.
- Default runner behavior remains unchanged.

Next:
- M173 should define a frontend artifact API model/view contract or add a backend artifact catalog endpoint for UI discovery.

## 2026-05-05 - M173 Frontend AgentArtifact API Contract

Goal:
- Add frontend runtime API types and helper for AgentArtifact list retrieval.

Changes:
- Updated `frontend/app/entities/runtime/api.ts`.

Validation:
- `pnpm --dir frontend build`: passed.

Notes:
- Existing Vite chunk and browserslist warnings remain.
- No page UI was changed.

Next:
- M174 should add a small reusable artifact preview/view model component or continue backend event compaction/read-model work.

## 2026-05-05 - M174 Reusable AgentArtifact Preview Card

Goal:
- Add a reusable frontend UI primitive for rendering AgentArtifact items without wiring existing pages yet.

Changes:
- Added `frontend/app/shared/ui/AgentArtifactPreviewCard.tsx`.

Validation:
- `pnpm --dir frontend build`: passed.

Notes:
- The card supports web URL, JSON, text, file/storage URI, and generic artifact metadata previews.
- It deliberately avoids iframe embedding; source URLs remain the canonical navigation target.
- Existing Vite chunk and browserslist warnings remain.
- No existing page UI was changed, which avoids mixing this slice with unrelated dirty frontend files.

Next:
- Continue with a backend event/timeline compaction read model so `reasoning.chunk` and `metric.updated` events do not dominate AgentRunDetail timelines.

## 2026-05-05 - M175 AgentRun Timeline Compaction Read Model

Goal:
- Add a backend read model that turns noisy raw runtime events into a readable timeline summary.

Changes:
- Added `backend/services/agent_runtime_timeline.py`.
- Added `GET /api/alpha-trace/agent-runs/{runId}/timeline-summary` in `backend/api/alpha_trace_agent_runtime_routes.py`.

Validation:
- `python -m py_compile backend/services/agent_runtime_timeline.py backend/api/alpha_trace_agent_runtime_routes.py`: passed.
- Local pure-function smoke for chunk and metric compaction: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_backend_abstractions.ps1`: passed.

Notes:
- Raw `/events` and SSE remain unchanged.
- The read model groups adjacent `reasoning.chunk` and `metric.updated` events by event type, agent, and step.
- This directly addresses AgentRunDetail timeline fragmentation without changing persistence or runner behavior.

Next:
- Continue toward exposing the timeline summary to frontend runtime API clients or wiring AgentRunDetail after resolving existing unrelated frontend dirty state.

## 2026-05-05 - M176 Frontend Timeline Summary API Contract

Goal:
- Expose the backend AgentRun timeline summary read model to frontend API clients.

Changes:
- Updated `frontend/app/shared/api/endpoints.ts`.
- Updated `frontend/app/entities/runtime/api.ts`.

Validation:
- `pnpm --dir frontend build`: passed.

Notes:
- This milestone only adds typed API access.
- No existing page wiring was changed because several frontend pages currently have unrelated dirty edits.

Next:
- Continue with a backend artifact/timeline catalog or begin page wiring after resolving unrelated frontend dirty state.

## 2026-05-05 - M177 AgentArtifact Catalog Contract

Goal:
- Expose artifact type, preview, canonical source, and security policies as a backend-owned contract.

Changes:
- Added `backend/services/agent_artifacts/catalog.py`.
- Updated `backend/services/agent_artifacts/__init__.py`.
- Added `GET /api/alpha-trace/agent-runs/runtime/artifacts/catalog`.
- Updated `backend/services/architecture_index.py`.
- Updated `scripts/alphatrace/smoke_backend_abstractions.ps1`.

Validation:
- `python -m py_compile backend/services/agent_artifacts/catalog.py backend/services/agent_artifacts/__init__.py backend/services/architecture_index.py backend/api/alpha_trace_agent_runtime_routes.py`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_backend_abstractions.ps1`: passed.

Notes:
- The catalog explicitly treats external URLs as canonical sources.
- HTML preview is design-safe by default: no dangerous inline rendering.
- LangAlpha/TradingAgents outputs must be mapped into AlphaTrace artifacts before UI rendering.

Next:
- Continue with frontend API typing for artifact catalog or a UI-safe diagnostics surface.

## 2026-05-05 - M178 Frontend Artifact Catalog API Contract

Goal:
- Expose the backend AgentArtifact catalog to frontend API clients.

Changes:
- Updated `frontend/app/shared/api/endpoints.ts`.
- Updated `frontend/app/entities/runtime/api.ts`.

Validation:
- `pnpm --dir frontend build`: passed.

Notes:
- This is API typing only; no existing page UI was changed.
- The contract lets future pages render Bocha/LangAlpha/tool artifacts according to backend safety policies.

Next:
- Continue with a runtime diagnostics read model or a minimal UI-safe page integration once existing frontend dirty state is isolated.

## 2026-05-05 - M179 Agent Runtime Task Spec Catalog

Goal:
- Expose scheduler-neutral task spec contracts for runner execution boundaries.

Changes:
- Added `backend/services/agent_orchestrator/task_spec_catalog.py`.
- Added `GET /api/alpha-trace/agent-runs/runtime/task-specs`.
- Updated `backend/services/architecture_index.py`.
- Updated `scripts/alphatrace/smoke_backend_abstractions.ps1`.

Validation:
- `python -m py_compile backend/services/agent_orchestrator/task_spec_catalog.py backend/services/architecture_index.py backend/api/alpha_trace_agent_runtime_routes.py`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_backend_abstractions.ps1`: passed.

Notes:
- This catalog describes timeout, retry, secret scrub, and execution boundary policy.
- It clarifies that TradingAgents and LangAlpha have different execution boundaries from AlphaTrace Native.
- No runner execution path was changed.

Next:
- Continue with frontend API typing for task spec diagnostics or a deeper runner/orchestrator split.

## 2026-05-05 - M180 Frontend Task Spec API Contract

Goal:
- Expose runner task spec contracts to frontend API clients.

Changes:
- Updated `frontend/app/shared/api/endpoints.ts`.
- Updated `frontend/app/entities/runtime/api.ts`.

Validation:
- `pnpm --dir frontend build`: passed.

Notes:
- This milestone only adds typed API access.
- It supports future Settings/Agent Lab diagnostics for timeout, retry, and execution boundary policy.

Next:
- Continue with a consolidated runtime diagnostics endpoint or deeper backend module boundary documentation.

## 2026-05-05 - M181 Runtime Readiness Summary

Goal:
- Provide one sanitized backend readiness endpoint for Settings/Agent Lab diagnostics.

Changes:
- Added `backend/services/runtime_readiness.py`.
- Added `GET /api/alpha-trace/agent-runs/runtime/readiness`.
- Updated `backend/services/architecture_index.py`.
- Updated `scripts/alphatrace/smoke_backend_abstractions.ps1`.

Validation:
- `python -m py_compile backend/services/runtime_readiness.py backend/services/architecture_index.py backend/api/alpha_trace_agent_runtime_routes.py`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_backend_abstractions.ps1`: passed.

Notes:
- The readiness endpoint aggregates config, model provider, orchestrator, task spec, and artifact readiness.
- It returns action items for Qwen/Bocha/TradingAgents availability without raw keys.

Next:
- Continue with frontend API typing for runtime readiness or a backend endpoint smoke pack.

## 2026-05-05 - M182 Frontend Runtime Readiness API Contract

Goal:
- Expose backend runtime readiness summary to frontend API clients.

Changes:
- Updated `frontend/app/shared/api/endpoints.ts`.
- Updated `frontend/app/entities/runtime/api.ts`.

Validation:
- `pnpm --dir frontend build`: passed.

Notes:
- This is API typing only; no existing page UI was changed.
- Future Settings/Agent Lab views can consume one consolidated readiness response instead of stitching multiple diagnostics.

Next:
- Continue with endpoint smoke documentation or a minimal backend self-check endpoint that does not require restarting the stale Docker backend.

## 2026-05-05 - M183 Data API Provider Catalog

Goal:
- Make AlphaTrace data provider boundaries explicit before adding professional ETF/fund/index data sources.

Changes:
- Updated `backend/services/data_api/catalog.py`.
- Updated `backend/services/architecture_index.py`.
- Updated `scripts/alphatrace/smoke_backend_abstractions.ps1`.

Validation:
- `python -m py_compile backend/services/data_api/catalog.py backend/services/architecture_index.py`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_backend_abstractions.ps1`: passed.

Notes:
- Providers now include static seed, MySQL domain store, Bocha search, planned professional market data, and LangAlpha external workbench.
- Catalog policy explicitly keeps legacy BTC/Hyperliquid outside the AlphaTrace market data boundary.

Next:
- Continue with frontend typing for Data API provider catalog or professional data adapter planning.

## 2026-05-05 - M184 Frontend Data API Catalog Contract

Goal:
- Expose Data API resource/provider catalog to frontend API clients.

Changes:
- Updated `frontend/app/shared/api/endpoints.ts`.
- Updated `frontend/app/entities/data-source/api.ts`.

Validation:
- `pnpm --dir frontend build`: passed.

Notes:
- This milestone only adds typed API access.
- Future Data Sources UI can show static seed, MySQL, Bocha, planned professional market data, and LangAlpha boundaries.

Next:
- Continue with a professional market data adapter interface or consolidated endpoint smoke pack.

## 2026-05-05 - M185 Professional Market Data Adapter Boundary

Goal:
- Add a disabled-by-default adapter boundary for future professional ETF/fund/index/futures market data providers.

Changes:
- Updated `backend/services/integration_adapters/market_data_adapter.py`.
- Updated `backend/services/integration_adapters/registry.py`.
- Updated `backend/services/integration_adapters/__init__.py`.
- Updated `scripts/alphatrace/smoke_backend_abstractions.ps1`.

Validation:
- `python -m py_compile backend/services/integration_adapters/market_data_adapter.py backend/services/integration_adapters/registry.py backend/services/integration_adapters/__init__.py`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_backend_abstractions.ps1`: passed.

Notes:
- The adapter never calls external market data in this phase.
- Default health is `disabled`; if env flags are set it reports missing/degraded rather than ready because live calls are not implemented.
- This keeps future ETF/fund/index/futures data vendors separate from legacy BTC/Hyperliquid APIs.

Next:
- Continue with endpoint smoke pack updates or frontend diagnostics wiring after isolating dirty page changes.

## 2026-05-05 - M186 Abstraction Endpoint Smoke Pack Refresh

Goal:
- Keep the HTTP endpoint smoke script aligned with new runtime abstraction endpoints.

Changes:
- Updated `scripts/alphatrace/smoke_abstraction_endpoints.ps1`.

Validation:
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_abstraction_endpoints.ps1 -SkipHttp`: passed.

Notes:
- Full HTTP smoke requires a backend process restarted with the latest branch. The current Docker backend can be stale, so this milestone validates script syntax only.

Next:
- Continue with architecture documentation alignment or targeted UI wiring after isolating dirty page changes.

## 2026-05-05 - M187 Architecture Document Alignment for Runtime Read Models

Goal:
- Update the canonical architecture document with runtime read model, artifact, data provider, and frontend API contract boundaries.

Changes:
- Updated `docs/ARCHITECTURE.md`.

Validation:
- `Select-String -Path docs/ARCHITECTURE.md -Pattern "Runtime Observability and Artifact Contract Additions"`: passed.

Notes:
- Documentation-only milestone.
- No business code, backend code, frontend code, Docker, or package files changed.

Next:
- Continue with a batch review/status checkpoint, then continue backend/front-end abstraction work.

## 2026-05-05 - M188 Reusable Runtime Readiness Panel

Goal:
- Add a reusable frontend UI primitive for runtime readiness diagnostics.

Changes:
- Added `frontend/app/shared/ui/RuntimeReadinessPanel.tsx`.

Validation:
- `pnpm --dir frontend build`: passed.

Notes:
- The component supports loading, error, empty, compact mode, section statuses, and action items.
- No existing page wiring was changed.

Next:
- Continue with a reusable DataApiCatalog panel or backend module boundary map.

## 2026-05-05 - M189 Reusable Data API Catalog Panel

Goal:
- Add a reusable frontend UI primitive for displaying AlphaTrace data API resources and provider boundaries.

Changes:
- Added `frontend/app/shared/ui/DataApiCatalogPanel.tsx`.

Validation:
- `pnpm --dir frontend build`: passed.

Notes:
- This milestone does not wire existing pages because several page files already contain unrelated dirty work.
- Future Data Sources / Settings / diagnostics views can consume the typed Data API catalog without duplicating rendering logic.

Next:
- Validate build, commit, and continue backend/frontend abstraction milestones.

## 2026-05-05 - M190 Backend Module Boundary Catalog

Goal:
- Expose product-owned backend module boundaries for AlphaTrace refactor planning and future open-source component integration.

Changes:
- Added `backend/services/backend_module_boundaries.py`.
- Updated `backend/api/alpha_trace_agent_runtime_routes.py`.
- Updated `backend/services/architecture_index.py`.
- Updated `scripts/alphatrace/smoke_backend_abstractions.ps1`.
- Updated `scripts/alphatrace/smoke_abstraction_endpoints.ps1`.

Validation:
- `python -m py_compile backend/services/backend_module_boundaries.py backend/services/architecture_index.py backend/api/alpha_trace_agent_runtime_routes.py`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_backend_abstractions.ps1`: passed.
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_abstraction_endpoints.ps1 -SkipHttp`: passed.

Notes:
- The catalog explicitly separates AlphaTrace-owned API/runtime/domain/integration layers from legacy BTC/Hyperliquid modules.
- TradingAgents remains an optional external runner adapter; LangAlpha remains an external workbench/architecture reference boundary.

Next:
- Validate and commit this boundary read model.


## 2026-05-05 - M191 Frontend Module Boundary Contract

Goal:
- Add typed frontend access to the backend module boundary catalog.

Changes:
- Updated `frontend/app/shared/api/endpoints.ts`.
- Updated `frontend/app/entities/runtime/api.ts`.

Validation:
- `pnpm --dir frontend build`: passed.

Notes:
- This milestone only adds frontend API contracts. Existing pages are not wired yet because page files contain unrelated dirty work.
- Future architecture/diagnostics UI can render AlphaTrace-owned, legacy, TradingAgents, LangAlpha, and data provider boundaries from one endpoint.

Next:
- Validate build and commit.
