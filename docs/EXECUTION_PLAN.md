# AlphaTrace Execution Plan

Last updated: 2026-05-02

This is the canonical milestone plan. Execute milestones from top to bottom. Do not skip a milestone unless it is explicitly marked blocked with a reason in `docs/IMPLEMENTATION_LOG.md`.

## Execution Rules

1. Work on the first milestone whose status is not `Done`.
2. Every milestone must have a runnable, verifiable, and reversible result.
3. After each milestone:
   - Run the validation listed here and in `docs/VALIDATION.md`.
   - Fix failures if feasible.
   - Update `docs/IMPLEMENTATION_LOG.md`.
   - Mark this file with the resulting status.
4. Stop only if all milestones are complete or a real blocker prevents progress.
5. Do not modify old Hyper Alpha Arena business pages unless a milestone explicitly says so.
6. Do not write real trading, broker, or exchange execution logic.
7. Do not expose TradingAgents or LangAlpha internal state to the frontend.

## Status Legend

- `Done`: completed and validated.
- `Ready`: can be started next.
- `Pending`: waiting for earlier milestones.
- `Blocked`: cannot continue without external action or decision.

## M0 - Project Governance Files and MySQL Direction

Status: Done

Goal:

Create canonical project governance files and replace PostgreSQL as the future target with MySQL 8.0+.

Inputs:

1. Existing MVP docs under `docs/engineering/`.
2. Root `IMPLEMENTATION_LOG.md`.
3. Current Task 36-45, TG PoC, Bocha, Qwen, LangAlpha state.

Outputs:

1. `docs/PROJECT_SPEC.md`
2. `docs/EXECUTION_PLAN.md`
3. `docs/IMPLEMENTATION_LOG.md`
4. `docs/VALIDATION.md`

Acceptance:

1. All four files exist.
2. MySQL 8.0+ is the canonical target DB.
3. Old PostgreSQL references are explicitly treated as historical context.
4. Current completed work and next milestone are recorded.

Validation:

1. Verify file existence.
2. Verify milestone names in `EXECUTION_PLAN.md` and `VALIDATION.md` match.
3. Verify `PROJECT_SPEC.md` contains MySQL target statement.

Rollback:

Delete the four new docs or revert the commit. No business code is affected.

## M1 - TradingAgents / LangGraph Observability Cleanup

Status: Done

Goal:

Make TradingAgents PoC debugging usable without legacy BTC / Hyperliquid log noise dominating AgentRunDetail.

Dependencies:

1. M0 complete.
2. Existing TradingAgents PoC adapter remains opt-in.

Scope:

1. Separate current run observability from global backend log tail.
2. Add log filters or a dedicated AlphaTrace runtime log source.
3. Improve TradingAgents flow display so node order and status are clear.
4. Keep Backend Runtime Log as an advanced raw log panel if still useful.

Out of scope:

1. Do not modify TradingAgents source.
2. Do not change legacy market stream behavior unless guarded by an explicit local-development flag.
3. Do not add production logging infrastructure yet.

Acceptance:

1. AgentRunDetail can show current run events without BTC log noise.
2. Raw backend logs remain available but clearly labeled as global.
3. TradingAgents disabled/import failure/Qwen/Stub regressions still pass.

Validation:

1. `python -m py_compile` for changed backend files.
2. `cd frontend && pnpm build` if frontend changes.
3. Submit or inspect a TradingAgents PoC run and confirm current-run view is not dominated by BTC logs.

Rollback:

Revert UI/log endpoint changes. Agent runtime data remains in JSON store.

## M2 - AlphaTrace ETF / Fund / Index Market Data v1

Status: Done

Goal:

Create an AlphaTrace market data domain that is independent from legacy crypto / Hyperliquid runtime.

Dependencies:

1. M1 complete.

Scope:

1. Add static market data seed for ETF, fund, index, and futures sample assets.
2. Add read-only AlphaTrace market data API for quote, snapshot, klines, and indicators.
3. Make Asset Detail and Agent context able to consume AlphaTrace market data.
4. Keep provider abstraction ready for future real ETF data provider.

Out of scope:

1. No real-time ETF feed yet.
2. No trading.
3. No reuse of `/api/market/price/{symbol}` as the AlphaTrace primary market API.
4. No writes to `crypto_klines`.

Acceptance:

1. `asset_etf_510300` quote/snapshot/klines API works from static seed.
2. Agent prompts can include market snapshot context.
3. Legacy BTC market stream is not involved.

Validation:

1. Backend py_compile for new market data modules/routes.
2. curl/TestClient for quote, snapshot, klines.
3. `pnpm build` if frontend consumes the API.

Rollback:

Remove new AlphaTrace market data routes/services. Existing AlphaTrace MVP remains intact.

## M3 - AgentRunStore MySQL Migration

Status: Done

Goal:

Move AgentRun, RuntimeEvent, AgentReport, EvidenceReference, and AgentDecision from JSON store to MySQL-backed store while preserving JSON fallback.

Dependencies:

1. M2 complete or explicitly deferred.
2. MySQL service available for local validation.

Scope:

1. Define MySQL schema and store implementation.
2. Keep API response shape unchanged.
3. Add environment switch: `ALPHA_TRACE_AGENT_RUN_STORE=mysql|json|memory`.
4. Add migration or initialization path suitable for local development.

Out of scope:

1. No full domain store migration yet.
2. No multi-tenant permissions yet.
3. No production-grade queue yet.

Acceptance:

1. Qwen run persists to MySQL.
2. TradingAgents failed/completed PoC run persists to MySQL.
3. Service restart preserves run detail/events/reports/evidence/decision.
4. JSON fallback still works.

Validation:

1. MySQL schema initialization smoke.
2. Submit Qwen run, verify completed data in API after restart.
3. Submit Stub run, verify completed data.
4. SSE reads events from MySQL-backed store.

Rollback:

Switch `ALPHA_TRACE_AGENT_RUN_STORE=json`; do not drop MySQL data automatically.

## M4 - Domain Store MySQL Migration

Status: Done

Goal:

Move Asset, Evidence, Strategy, Portfolio, Decision, and DataSource from static seed / runtime extraction to MySQL-backed domain stores.

Dependencies:

1. M3 complete.

Scope:

1. MySQL tables for domain objects.
2. Seed import command or startup initializer.
3. Evidence search over MySQL fields.
4. Decision API reads from DecisionStore, with AgentRun-derived decisions imported or projected.

Out of scope:

1. No vector database.
2. No full external data ingestion pipeline.
3. No permission system.

Acceptance:

1. Asset Research reads from MySQL.
2. Evidence Center reads from MySQL.
3. Portfolio Workspace reads from MySQL.
4. QwenRunner evidence retrieval can use MySQL evidence.

Validation:

1. DB seed import smoke.
2. API smoke for assets/evidence/strategies/portfolios/decisions.
3. Frontend real mode smoke for affected pages.

Rollback:

Switch stores back to static seed where supported.

## M5 - Agent Runtime Worker and Status Machine

Status: Done

Goal:

Stabilize runtime execution beyond ad hoc background threads.

Dependencies:

1. M3 complete.

Scope:

1. Explicit status machine.
2. Run timeout and error category.
3. Cancel endpoint.
4. Retry endpoint.
5. SSE reconnect by sequence cursor.
6. Concurrency limiter.

Out of scope:

1. No Celery/Redis unless a local worker model is insufficient.
2. No billing.
3. No real trading.

Acceptance:

1. Running task can be cancelled.
2. Failed task has durable reason.
3. SSE reconnect resumes from last sequence.
4. Multiple runs cannot create unbounded threads.

Validation:

1. Unit/smoke tests for status transitions.
2. curl cancel/retry tests.
3. Qwen timeout/failure test.

Rollback:

Disable new worker path and route submit to previous background execution if needed.

## M6 - TradingAgents Adapter Deep PoC Stabilization

Status: Done

Goal:

Make TradingAgents PoC repeatable and useful as a controlled runner option.

Dependencies:

1. M1 complete.
2. M3 preferred, but JSON fallback acceptable for local PoC.

Scope:

1. Better assetId-to-ticker mapping.
2. More complete LangGraph event mapping.
3. Tool and report mapping cleanup.
4. Clear runtime cost/latency/failure behavior.
5. Optional offline data mode kept for rate-limit avoidance.

Out of scope:

1. No TradingAgents source modification.
2. No direct TradingAgents state in frontend.
3. No production deployment dependency on sibling repo.

Acceptance:

1. Disabled path clear.
2. Import failure path clear.
3. Enabled SPY PoC can complete or fail with durable reason.
4. Qwen/Stub unaffected.

Validation:

1. TradingAgents disabled smoke.
2. TradingAgents import failure smoke.
3. Enabled local SPY PoC smoke.
4. Qwen/Stub regression.

Rollback:

Set `ALPHATRACE_TRADINGAGENTS_ENABLED=false`.

## M7 - Evidence Governance

Status: Done

Goal:

Move from id-level evidence validation toward claim-level evidence quality.

Dependencies:

1. M4 preferred.
2. Qwen JSON structured output stable enough for claim extraction.

Scope:

1. Claim extraction v1.
2. Rule-based support scoring.
3. Unsupported evidence warnings.
4. Evidence support score in Decision Attribution and Leaderboard.

Out of scope:

1. No mandatory LLM judge in v1.
2. No vector DB in v1 unless later approved.

Acceptance:

1. Invalid evidence ids are filtered.
2. Unsupported or weakly supported claims are flagged.
3. Decision displays evidence support status.

Validation:

1. Synthetic unsupported claim test.
2. Qwen run with known evidence ids.
3. Decision Attribution display smoke.

Rollback:

Disable semantic scoring while preserving id-level validation.

## M8 - Commercial Backend Review and Freeze

Status: Done

Goal:

Freeze the next commercial backend increment and decide whether to move toward deployment hardening.

Dependencies:

1. M1-M7 complete or explicitly blocked/deferred.

Scope:

1. Update architecture docs.
2. Update startup and validation guide.
3. Summarize MySQL schema state.
4. Summarize runner state.
5. Summarize known limitations and next phase.

Acceptance:

1. Demo path runs.
2. Validation report is current.
3. Known limitations are explicit.
4. Next phase recommendation is documented.

Validation:

1. Full smoke path through Agent Lab, Asset, Evidence, Portfolio, Decision, Leaderboard.
2. Build and backend compile checks.

Rollback:

Documentation-only freeze; revert docs if needed.

## M9 - TradingAgents Runtime Environment Standardization

Status: Done

Goal:

Make the TradingAgents PoC operationally diagnosable and repeatable across local venv and Docker-adjacent real mode without turning TradingAgents into the AlphaTrace primary backend.

Dependencies:

1. M6 TradingAgents Adapter Deep PoC Stabilization.
2. Runtime credential settings for Qwen / DashScope.

Scope:

1. Runner status endpoint reports TradingAgents enablement, repo path, importability, and Qwen key source.
2. Agent Lab displays those status fields in Real API mode.
3. Document local venv and Docker-adjacent operating modes.
4. Confirm disabled, import-failure, missing-key, and ready diagnostics are explicit.

Out of scope:

1. No TradingAgents source changes.
2. No Docker image packaging of TradingAgents in this milestone.
3. No real trading.
4. No direct exposure of TradingAgents internal state to frontend.

Acceptance:

1. `/api/alpha-trace/agent-runs/runners/status` reports `disabled`, `import_error`, `missing_qwen_key`, or `ready` for TradingAgents.
2. Agent Lab shows repo/import/Qwen key diagnostics.
3. Qwen and Stub runners remain unaffected.
4. Frontend build and backend py_compile pass.

Validation:

1. py_compile changed backend route.
2. Test runner status endpoint in disabled mode.
3. Test runner status endpoint with enabled but missing/bad repo path.
4. `cd frontend && pnpm build`.

Rollback:

Revert runner status diagnostics and continue using submit-time TradingAgents errors only.

## M10 - TradingAgents Local PoC Operating Kit

Status: Done

Goal:

Provide a repeatable local operating kit for TradingAgents PoC while deferring Docker packaging until a later architecture decision.

Dependencies:

1. M9 runner status diagnostics.
2. Existing `.venv-alphatrace-tg` and sibling `TradingAgents` repo.

Scope:

1. Add local PowerShell helper scripts:
   - start local TradingAgents-enabled backend.
   - inspect runner status.
   - submit SPY offline PoC.
2. Document environment variables and exact commands.
3. Validate scripts in dry-run mode.
4. Keep Docker/package configuration unchanged.

Out of scope:

1. No Docker image/profile packaging.
2. No TradingAgents source changes.
3. No API key persistence in scripts.
4. No real trading or external market-data dependency.

Acceptance:

1. Scripts dry-run successfully.
2. Scripts do not print or store secret values.
3. Documentation explains local venv and Docker-adjacent limitations.
4. M10 validation is recorded.

Validation:

1. Run script dry-runs.
2. Run `python -m py_compile backend/api/alpha_trace_agent_runtime_routes.py`.
3. Run frontend build only if frontend files changed after M9.

Rollback:

Delete the `scripts/alphatrace` helper scripts and revert documentation updates.

## M11 - AlphaTrace Market Data Frontend Visibility

Status: Done

Goal:

Expose the existing AlphaTrace ETF / fund / index static market-data API in the AlphaTrace asset workflow without touching legacy BTC/Kline/Crypto pages.

Dependencies:

1. M2 AlphaTrace Market Data v1 API.
2. Asset Detail real mode.

Scope:

1. Add frontend market-data API client methods for quote, snapshot, klines, and indicators.
2. Show a compact Market Data panel on `AssetDetailPage` in real mode.
3. Keep static seed fallback and friendly empty/error states.
4. Document that this is AlphaTrace static market-data v1, not legacy BTC feed and not real-time行情.

Out of scope:

1. No external行情 API.
2. No legacy Kline page changes.
3. No DB writes.
4. No TradingAgents changes.

Acceptance:

1. Asset Detail can display quote/snapshot/indicator information for `asset_etf_510300`.
2. API failures do not crash the page.
3. Mock mode remains unchanged.
4. `pnpm build` passes.

Validation:

1. `pnpm build`.
2. API smoke for market-data endpoints if backend is available.

Rollback:

Remove the market-data panel and client methods.

## M12 - Active Backend Route Smoke Kit

Status: Done

Goal:

Make it easy to verify that the running backend process is serving the current AlphaTrace route set, avoiding stale-process confusion during Docker / local / Vite real-mode validation.

Dependencies:

1. M9 runner status diagnostics.
2. M11 market-data route visibility.

Scope:

1. Add a PowerShell smoke script that checks core AlphaTrace routes against a configurable backend base URL.
2. Include runner status, assets, evidence, market data, decisions, leaderboard, and portfolio routes.
3. Report HTTP status, success/failure, and a compact summary.
4. Keep it read-only and safe for local/Docker backends.

Out of scope:

1. No backend feature changes.
2. No Docker/package changes.
3. No destructive data cleanup.
4. No TradingAgents execution.

Acceptance:

1. Script detects missing/stale routes clearly.
2. Script works in dry-run mode.
3. Script can be pointed at `8802` or `8812`.
4. Documentation and implementation log are updated.

Validation:

1. Script dry-run passes.
2. Script runs against current `8812` and records route availability.
3. Existing frontend build remains valid if no frontend files changed after M11.

Rollback:

Delete the route smoke script and revert documentation updates.

## M13 - Local Vite Real Mode Startup Kit

Status: Done

Goal:

Provide a repeatable local Vite startup path that explicitly points the frontend to the current-code backend, reducing confusion between Docker `8802`, local TradingAgents backend `8812`, and current-code backend `8813`.

Dependencies:

1. M12 route smoke script.
2. Current-code backend available on a chosen port.

Scope:

1. Add a PowerShell helper to start Vite real mode with configurable API base URL and port.
2. Default API base URL to `http://127.0.0.1:8813/api`.
3. Default Vite port to `8804`.
4. Document the expected sequence: start backend, route smoke, start Vite.

Out of scope:

1. No frontend code changes.
2. No package changes.
3. No Docker changes.
4. No automatic browser automation.

Acceptance:

1. Script dry-run shows exact environment variables and command.
2. Script does not store secrets.
3. Documentation/log are updated.

Validation:

1. Script dry-run passes.
2. Frontend build remains valid if no frontend files changed after M11.

Rollback:

Delete the Vite helper script and revert documentation updates.









## M14 - AlphaTrace-only Backend Startup Profile

Status: Done

Goal:

Provide a local backend startup profile for AlphaTrace validation that does not start legacy BTC / Hyperliquid / Binance trading runtimes, market streams, bot webhooks, or frontend rebuild watcher.

Dependencies:

1. M12 active backend route smoke kit.
2. M13 local Vite real-mode startup kit.

Scope:

1. Add opt-in environment profile: `ALPHATRACE_BACKEND_PROFILE=alphatrace`.
2. Add explicit legacy runtime flag: `ALPHATRACE_LEGACY_RUNTIME_ENABLED=false`.
3. Add explicit frontend watcher flag: `ALPHATRACE_FRONTEND_WATCHER_ENABLED=false`.
4. Add a local PowerShell startup helper for AlphaTrace-only backend.
5. Preserve default legacy startup behavior when the profile is not enabled.

Out of scope:

1. No removal of legacy crypto / Hyperliquid / Binance code.
2. No Docker change.
3. No package change.
4. No old business page change.
5. No real trading changes.

Acceptance:

1. Default backend startup remains backward compatible.
2. AlphaTrace profile skips `initialize_services()`, BTC indicator warmup, frontend watcher, Telegram/Discord restore, and Hyper Insight wallet runtime.
3. The startup helper dry-run shows the intended env without printing secrets.
4. Backend compiles.

Validation:

1. `python -m py_compile backend/main.py`
2. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/start_alphatrace_backend.ps1 -DryRun`
3. Optional route smoke against the AlphaTrace-only backend after manual start.

Rollback:

Revert `backend/main.py` and delete `scripts/alphatrace/start_alphatrace_backend.ps1`.

## M15 - Runtime Port and Startup Governance

Status: Done

Goal:

Make the current local runtime model explicit so future validation does not confuse Docker, stale local backends, Vite ports, and AlphaTrace-only backend profile.

Dependencies:

1. M14 AlphaTrace-only backend startup profile.
2. Current manual startup workflow recorded in `docs/VALIDATION.md`.

Scope:

1. Document current recommended port ownership and validation chain.
2. Document which ports are historical, Docker-specific, or current local validation ports.
3. Record the manual startup workflow as the canonical operation path for now.
4. Record uncertainty and open decisions instead of adding more startup scripts.
5. Keep BTC / Hyperliquid legacy runtime out of scope unless it blocks AlphaTrace startup.

Out of scope:

1. No new one-click startup script.
2. No Docker/package changes.
3. No backend feature changes.
4. No frontend page changes.
5. No BTC / Hyperliquid / Binance legacy cleanup.

Current port map:

| Port | Role | Current recommendation |
|---:|---|---|
| `3306` | Docker MySQL | Required data dependency; keep running. |
| `5432` | Docker PostgreSQL | Required by current legacy/base backend; keep running. |
| `8802` | Docker app exposure | Do not use for latest local AlphaTrace validation unless app is rebuilt/recreated. |
| `8804` | Historical Vite port | Ignore unless intentionally started. |
| `8805` | Current Vite real-mode frontend | Recommended browser entry. |
| `8812` | Historical local backend / TradingAgents port | Ignore unless intentionally started for TG PoC. |
| `8813` | Current AlphaTrace-only backend | Recommended API backend. |
| `8814` | Temporary smoke-test backend | Not for regular use. |

Acceptance:

1. `docs/EXECUTION_PLAN.md` records M15 and marks it done.
2. `docs/VALIDATION.md` records current manual startup workflow and expected port map.
3. `docs/IMPLEMENTATION_LOG.md` records current active runtime state.
4. Current `8805 -> 8813` validation passes.

Validation:

1. `scripts/alphatrace/check_active_backend_routes.ps1 -BaseUrl http://127.0.0.1:8813/api` passes.
2. `http://127.0.0.1:8805/dashboard#dashboard` returns HTTP 200.
3. Active port list confirms `3306`, `5432`, `8805`, and `8813` are listening.

Rollback:

Revert M15 documentation updates only.

## M16 - Runtime Startup Chain Stabilization

Status: Done

Goal:

Make the currently reliable local browser validation chain explicit and runnable after the host PostgreSQL `5432` binding issue observed on 2026-05-04.

Dependencies:

1. M15 Runtime Port and Startup Governance.
2. Docker app backend available on `8802`.

Scope:

1. Treat `8805 -> 8802` as the default browser validation chain when local `8813` cannot start.
2. Keep `8813` as the optional TradingAgents local PoC backend only when host PostgreSQL is reachable.
3. Update the Vite real-mode helper so it defaults to same-origin `/api` and proxies to `http://127.0.0.1:8802/api`.
4. Record the startup deviation in the implementation log.
5. If host `5432` cannot be published, keep Docker app usable by running Postgres inside `hyper-arena-network` with `postgres` as a network alias.

Out of scope:

1. No BTC / Hyperliquid legacy cleanup.
2. No Docker compose architecture change.
3. No package changes.
4. No frontend page changes.
5. No TradingAgents subprocess runner yet.

Current recommended chain:

| Purpose | URL / Port | Notes |
|---|---|---|
| Browser entry | `http://127.0.0.1:8805/dashboard` | Vite real mode. |
| Browser API base | `/api` | Same-origin API calls avoid CORS/error masking. |
| Vite proxy target | `http://127.0.0.1:8802/api` | Docker backend fallback chain. |
| Docker backend | `http://127.0.0.1:8802/api` | Current stable backend in this environment. |
| Local TG backend | `http://127.0.0.1:8813/api` | Optional; requires host PostgreSQL reachability and TradingAgents deps. |

Acceptance:

1. `scripts/alphatrace/start_vite_real_mode.ps1 -DryRun` shows `/api`, `8802`, and `8805` defaults.
2. `http://127.0.0.1:8805/dashboard` returns HTTP 200.
3. `http://127.0.0.1:8805/api/health` returns backend health through the Vite proxy.
4. Runner status is reachable through `8805/api`.
5. Docker app can resolve `postgres` internally even if host `127.0.0.1:5432` is not published.

Validation:

1. Start Docker Desktop and ensure `hyper-arena-app` is healthy.
2. Run Vite real mode with the helper defaults.
3. Smoke:
   - `GET http://127.0.0.1:8802/api/health`
   - `GET http://127.0.0.1:8805/dashboard`
   - `GET http://127.0.0.1:8805/api/health`
   - `GET http://127.0.0.1:8805/api/alpha-trace/agent-runs/runners/status`

Rollback:

Restore the previous Vite helper defaults and revert this documentation section.

## M17 - AlphaTrace Orchestrator v1 and TradingAgents Subprocess Worker

Status: Done

Goal:

Move TradingAgents PoC execution behind an AlphaTrace-controlled subprocess boundary so a stuck LangGraph/LLM run cannot block the FastAPI process.

Dependencies:

1. M16 Runtime Startup Chain Stabilization.
2. Existing `runnerType=tradingagents` adapter.

Scope:

1. Add a minimal `SubprocessOrchestrator` that starts a worker process, tails `events.jsonl`, reads `result.json`, captures `stdout.log`/`stderr.log`, and enforces timeout.
2. Add a TradingAgents worker module that runs the existing TradingAgents adapter logic inside a subprocess.
3. Make `runnerType=tradingagents` use the subprocess worker by default, with an opt-out `extraParams.useSubprocessWorker=false` for debugging.
4. Preserve AlphaTrace schema: `AgentRun`, `AgentRuntimeEvent`, `AgentReport`, `EvidenceReference`, and `AgentDecision`.
5. Preserve QwenRunner and StubRunner behavior.

Out of scope:

1. No production queue or distributed worker.
2. No TradingAgents source changes.
3. No Docker/package changes.
4. No real trading.
5. No frontend redesign.

Acceptance:

1. TradingAgents disabled path still returns a clear HTTP 400.
2. Orchestrator and worker modules compile.
3. A local subprocess smoke can submit a TradingAgents run and receive a durable failed result when required provider credentials are absent.
4. Worker artifacts are written under ignored runtime data, not committed.
5. Qwen/Stub remain unaffected.

Validation:

1. `python -m py_compile` for:
   - `backend/services/agent_orchestrator/subprocess_orchestrator.py`
   - `backend/services/agent_runners/tradingagents_worker.py`
   - `backend/services/agent_runners/tradingagents_adapter.py`
   - `backend/services/alpha_trace_agent_runtime_service.py`
   - `backend/schemas/alpha_trace_agent_runtime.py`
2. Disabled submit smoke through active backend.
3. Local in-memory subprocess smoke with missing Qwen key returns failed run, failure report, context evidence, and fallback watch decision.

Rollback:

Set `extraParams.useSubprocessWorker=false` for TradingAgents debugging or revert the orchestrator/worker files and adapter branch.

## M18 - Orchestrator Worker Artifact Observability

Status: Done

Goal:

Expose AlphaTrace Orchestrator subprocess worker artifacts by `runId` so TradingAgents PoC execution can be inspected without relying on global backend logs.

Dependencies:

1. M17 AlphaTrace Orchestrator v1 and TradingAgents Subprocess Worker.
2. Existing AgentRunDetail real-mode page.

Scope:

1. Add a read-only backend endpoint for `backend/runtime_data/agent_workers/{runId}` artifacts.
2. Only expose fixed files: `input.json`, `events.jsonl`, `result.json`, `stdout.log`, and `stderr.log`.
3. Redact known secret patterns in log tails.
4. Add an AgentRunDetail Worker Runtime Artifacts panel with file status, stdout/stderr tail, JSONL event tail, and result summary.
5. Keep global Backend Runtime Log available as a separate advanced panel.

Out of scope:

1. No TradingAgents source changes.
2. No production log store.
3. No Docker/package changes.
4. No real trading.
5. No direct exposure of TradingAgents internal state beyond AlphaTrace worker artifacts.

Acceptance:

1. Qwen/Stub/older runs show a friendly “no worker artifacts” state.
2. TradingAgents subprocess runs can show worker stdout/stderr/events/result when artifacts exist.
3. Artifact lookup cannot escape the configured worker runtime directory.
4. Backend py_compile and frontend build pass.

Validation:

1. `python -m py_compile backend/api/alpha_trace_agent_runtime_routes.py`
2. `cd frontend && pnpm build`
3. API smoke:
   - `GET /api/alpha-trace/agent-runs/{runId}/worker-artifacts`
   - Existing/absent artifact states return HTTP 200 for existing runs.

Rollback:

Remove the worker artifact endpoint and AgentRunDetail panel. Runtime execution and persisted runs remain intact.

## M19 - Orchestrator Control Plane v1

Status: Done

Goal:

Make AlphaTrace cancellation propagate to registered subprocess workers so long-running TradingAgents PoC runs can be terminated without waiting for LangGraph/LLM calls to return.

Dependencies:

1. M17 subprocess worker.
2. Existing Agent Runtime cancel endpoint.

Scope:

1. Add an in-process subprocess registry keyed by `runId`.
2. Register worker processes when launched and unregister them when monitor exits.
3. `cancel_agent_run(runId)` sends a best-effort kill signal to a registered subprocess worker before marking the run cancelled.
4. Prevent late worker result/error callbacks from overwriting a run that is already cancelled.
5. Preserve existing cooperative cancellation behavior for Qwen/Stub/background-thread runners.

Out of scope:

1. No distributed worker control plane.
2. No durable queue.
3. No Windows service or Docker supervisor.
4. No TradingAgents source changes.
5. No frontend redesign.

Acceptance:

1. Cancelled TradingAgents subprocess runs do not get overwritten to failed by late monitor callbacks.
2. Cancel event payload records whether a worker process was found and whether kill signal was sent.
3. Qwen/Stub cancellation remains safe and cooperative.
4. Backend compile passes.

Validation:

1. `python -m py_compile` for changed orchestrator/adapter/service files.
2. Unit/smoke check for `cancel_subprocess_worker` no-worker state.
3. Existing disabled TradingAgents submit path remains unchanged.

Rollback:

Remove subprocess registry/cancel hook; cancellation returns to cooperative-only behavior.

## M20 - Orchestrator Worker Registry Status API

Status: Done

Goal:

Expose the current FastAPI process subprocess worker registry for diagnostics, so operators can see whether TradingAgents worker processes are still active.

Dependencies:

1. M19 Orchestrator Control Plane v1.

Scope:

1. Add a read-only `GET /api/alpha-trace/agent-runs/runtime/workers` endpoint.
2. Return current-process registered worker runId, pid, running state, and returnCode.
3. Keep this as process-local diagnostics only; do not treat it as durable product data.

Out of scope:

1. No distributed worker registry.
2. No worker history database.
3. No frontend dashboard requirement in this milestone.
4. No TradingAgents source changes.

Acceptance:

1. Endpoint returns activeCount, registeredCount, and workers list.
2. Empty registry returns HTTP 200 with zero counts.
3. Backend compile passes.

Validation:

1. `python -m py_compile backend/services/agent_orchestrator/subprocess_orchestrator.py backend/api/alpha_trace_agent_runtime_routes.py`
2. TestClient or curl smoke for `/runtime/workers`.

Rollback:

Remove the endpoint and registry snapshot helper. Runtime execution remains unchanged.

## M21 - TradingAgents Worker Status UI

Status: Done

Goal:

Show the M20 process-local worker registry in Agent Lab so users can see whether TradingAgents subprocess workers are active.

Dependencies:

1. M20 worker registry endpoint.
2. Existing Agent Lab runner status panel.

Scope:

1. Add frontend API client for `/api/alpha-trace/agent-runs/runtime/workers`.
2. Display active/registered worker counts in Agent Lab.
3. Link active worker run ids to AgentRunDetail.
4. Treat endpoint absence as a friendly diagnostics limitation, not a page failure.

Out of scope:

1. No worker management UI beyond read-only status.
2. No frontend cancel button in this milestone.
3. No Docker/package changes.

Acceptance:

1. Agent Lab still loads runner status if worker registry endpoint is unavailable.
2. When endpoint is available, Agent Lab shows active and registered worker counts.
3. Frontend build passes.

Validation:

1. `cd frontend && pnpm build`.
2. Agent Lab mock/real mode does not crash.

Rollback:

Remove the worker registry client and UI block.

## M22 - Worker-Aware Cancel UI

Status: Done

Goal:

Expose the existing Agent Runtime cancel endpoint on AgentRunDetail so users can cancel running tasks and, for TradingAgents subprocess runs, trigger the M19 worker termination path.

Dependencies:

1. M19 Orchestrator Control Plane v1.
2. Existing AgentRunDetail page.

Scope:

1. Add frontend API client for `POST /api/alpha-trace/agent-runs/{runId}/cancel`.
2. Add a Cancel Run button for `RUNNING`, `QUEUED`, and `PARTIALLY_COMPLETED` runs.
3. Refresh run detail/events/worker artifacts after cancellation.
4. Surface friendly cancel errors.

Out of scope:

1. No backend cancel contract changes.
2. No automatic retry UI.
3. No TradingAgents source changes.

Acceptance:

1. Running runs show Cancel Run.
2. Terminal runs do not show Cancel Run.
3. Frontend build passes.

Validation:

1. `cd frontend && pnpm build`.
2. Optional running-run smoke through AgentRunDetail.

Rollback:

Remove the cancel API client and AgentRunDetail button.

## M23 - Orchestrator Run Contract Documentation

Status: Done

Goal:

Document the AlphaTrace Orchestrator subprocess run contract before adding more worker features.

Dependencies:

1. M17-M22.

Scope:

1. Document worker lifecycle.
2. Document artifact directory and file semantics.
3. Document worker artifact and registry APIs.
4. Document cancellation behavior and current limits.
5. Document frontend display separation between product outputs, worker diagnostics, and global backend logs.

Out of scope:

1. No code changes.
2. No new runtime behavior.
3. No TradingAgents source changes.

Acceptance:

1. `docs/engineering/31_orchestrator_run_contract.md` exists.
2. The document states that AlphaTrace schemas remain the product contract.
3. The document states that worker artifacts are diagnostics, not product data.

Validation:

1. Documentation-only; no build required.

Rollback:

Delete or revert `docs/engineering/31_orchestrator_run_contract.md`.

## M24 - Runner Execution Boundary Decision

Status: Done

Goal:

Decide whether QwenRunner should also move behind an Orchestrator subprocess worker, or remain in-process while TradingAgents uses the subprocess boundary.

Dependencies:

1. M17-M23 Orchestrator subprocess, artifact, registry, cancel UI, and contract documentation.
2. Existing QwenRunner streaming and Live Output behavior.

Scope:

1. Document the execution boundary per runner type.
2. Preserve QwenRunner in-process for the current phase.
3. Preserve TradingAgents subprocess worker as the default.
4. Define triggers for a future Qwen subprocess migration.
5. Define LangAlpha as a future external service adapter boundary.

Out of scope:

1. No code changes.
2. No QwenRunner subprocess migration.
3. No LangAlpha real integration.
4. No Docker/package changes.

Acceptance:

1. `docs/engineering/32_runner_execution_boundary_decision.md` exists.
2. The document explicitly states `qwen -> in_process`.
3. The document explicitly states `tradingagents -> subprocess`.
4. The document defines migration triggers for moving Qwen to subprocess later.
5. The next milestone recommendation is recorded.

Validation:

1. Documentation path exists.
2. Required terms are present: `QwenRunner`, `TradingAgents`, `subprocess`, `in_process`, and `M25`.

Rollback:

Delete or revert `docs/engineering/32_runner_execution_boundary_decision.md` and this plan section.

## M25 - Orchestrator Policy Layer v1

Status: Done

Goal:

Make the M24 execution-boundary decision visible as a small policy layer without changing runner behavior.

Dependencies:

1. M24 Runner Execution Boundary Decision.
2. Existing runner status endpoint and Agent Lab diagnostics.

Scope:

1. Add a small backend execution policy helper.
2. Expose each runner's execution mode in `/api/alpha-trace/agent-runs/runners/status`.
3. Show execution mode and policy reason in Agent Lab.
4. Keep actual runner execution unchanged:
   - `stub -> in_process`
   - `qwen -> in_process`
   - `tradingagents -> subprocess`
   - `langalpha -> external_disabled`

Out of scope:

1. No Qwen subprocess migration.
2. No LangAlpha real integration.
3. No queue or distributed worker.
4. No Docker/package changes.

Acceptance:

1. Runner status response includes `executionMode`.
2. Agent Lab displays the mode.
3. Qwen/Stub/TradingAgents behavior remains unchanged.
4. Backend compile and frontend build pass.

Validation:

1. `python -m py_compile` for the execution policy helper and route.
2. TestClient runner status smoke confirms the expected modes.
3. `cd frontend && pnpm build`.

Rollback:

Remove the policy helper and UI display. Runner execution still follows existing code paths.

## M26 - Runner Capability Matrix and Orchestrator Intent Contract

Status: Done

Goal:

Define which runner can handle which AlphaTrace task intent before adding a true Orchestrator/intent worker.

Dependencies:

1. M25 Orchestrator Policy Layer v1.
2. Existing Agent Lab runner diagnostics.

Scope:

1. Add a backend runner capability matrix.
2. Add a read-only capabilities endpoint.
3. Include capabilities in runner status diagnostics.
4. Display supported tasks and capability flags in Agent Lab.
5. Document the Orchestrator intent contract.

Out of scope:

1. No automatic runner selection.
2. No silent fallback between runners.
3. No new worker process.
4. No Docker/package changes.

Acceptance:

1. `/api/alpha-trace/agent-runs/runners/capabilities` returns runner capabilities and an advisory recommendation.
2. `/runners/status` includes `capabilities`.
3. Agent Lab displays capabilities without changing submit behavior.
4. Backend compile and frontend build pass.

Validation:

1. `python -m py_compile` for capability matrix and route.
2. Route function smoke for recommendations.
3. `cd frontend && pnpm build`.

Rollback:

Remove the capability matrix, endpoint, and UI capability display.

## M27 - Orchestrator Intent Preview UI

Status: Done

Goal:

Show a non-binding runner recommendation preview in Agent Lab before submit, while keeping explicit submit behavior unchanged.

Dependencies:

1. M26 Runner Capability Matrix.
2. Existing Agent Lab runner status UI.

Scope:

1. Add frontend client support for `/api/alpha-trace/agent-runs/runners/capabilities`.
2. Fetch the single-asset-analysis recommendation in Agent Lab.
3. Display the recommended runner, support status, and reason.
4. Treat stale backend/missing endpoint as a friendly diagnostics limitation.

Out of scope:

1. No automatic runner switching.
2. No submit payload changes.
3. No backend behavior changes beyond the M26 endpoint.

Acceptance:

1. Agent Lab shows an Orchestrator Intent Preview.
2. Submit buttons still use explicit runner types.
3. Frontend build passes.

Validation:

1. `cd frontend && pnpm build`.

Rollback:

Remove the capabilities client call and intent preview panel.

## M28 - Agent Lab Runner Selection Draft

Status: Done

Goal:

Add an explicit draft task form in Agent Lab so users can choose runner, task, asset, and question before submit.

Dependencies:

1. M27 Orchestrator Intent Preview UI.

Scope:

1. Add a compact Draft Agent Task form.
2. Allow explicit runner selection: `qwen`, `tradingagents`, `stub`.
3. Allow basic task selection: `single_asset_analysis`, `portfolio_diagnosis`.
4. Use the M26/M27 capability preview as advisory context.
5. Submit through existing `/submit` and explicit `runnerConfig.runnerType`.

Out of scope:

1. No automatic Orchestrator dispatch.
2. No hidden fallback.
3. No backend behavior changes.
4. No old business page changes.

Acceptance:

1. Agent Lab can submit a draft task with explicit runner/task/asset/question.
2. TradingAgents still respects its ready/blocked status.
3. Frontend build passes.

Validation:

1. `cd frontend && pnpm build`.

Rollback:

Remove the Draft Agent Task card.

## M29 - Draft Submit Runtime Smoke

Status: Done

Goal:

Validate the new Draft Agent Task path against the current runtime constraints and record stale-backend behavior.

Dependencies:

1. M28 Agent Lab Runner Selection Draft.

Scope:

1. Smoke the source-level capabilities endpoint.
2. Smoke the active browser chain capabilities endpoint.
3. Smoke submit with `runnerType=stub` through the active browser chain.
4. Record whether the active backend needs rebuild to expose new routes.

Out of scope:

1. No Qwen paid run is required.
2. No Docker rebuild is performed in this milestone.
3. No TradingAgents execution.

Acceptance:

1. Source route function returns a valid recommendation.
2. Active backend stale route behavior is documented.
3. Stub submit through the active chain still succeeds.

Validation:

1. Route function smoke.
2. `GET /api/alpha-trace/agent-runs/runners/capabilities` through active chain.
3. Stub submit through active chain.

Rollback:

Documentation-only; no runtime changes.

## M30 - Active Backend Refresh Decision

Status: Done

Goal:

Decide whether M26-M28 backend route changes require a Docker rebuild or only an app container restart in the current `8805 -> 8802` browser chain.

Dependencies:

1. M29 Draft Submit Runtime Smoke.
2. Docker app mounted backend source directories.

Scope:

1. Inspect Docker compose backend mounts.
2. Restart the active app container.
3. Verify health and new capabilities/status routes through `8805/api`.
4. Record the operational conclusion.

Out of scope:

1. No Docker compose changes.
2. No rebuild unless restart is insufficient.
3. No old business page changes.

Acceptance:

1. `8802/api/health` returns HTTP 200 after restart.
2. `8805/api/alpha-trace/agent-runs/runners/capabilities` returns HTTP 200.
3. `8805/api/alpha-trace/agent-runs/runners/status` includes `executionMode`.
4. `8805/dashboard` returns HTTP 200.

Validation:

1. Docker restart smoke.
2. Health/status/capabilities/frontend HTTP checks.

Rollback:

Restart the previous app container image. No source changes are required.

## M31 - Agent Lab UI Runtime Smoke

Status: Done

Goal:

Verify the refreshed active browser chain can serve runner policy/capability diagnostics and submit a draft-style stub run.

Dependencies:

1. M30 Active Backend Refresh Decision.

Scope:

1. Check runner status through `8805/api`.
2. Check runner capabilities through `8805/api`.
3. Submit a stub run through `8805/api`.
4. Query run detail through `8805/api`.

Out of scope:

1. No Qwen paid run.
2. No TradingAgents execution.
3. No frontend automation.

Acceptance:

1. Runner status includes execution modes.
2. Capabilities recommend Qwen for single-asset Qwen intent.
3. Stub submit returns completed run.
4. Detail endpoint returns reports/events.

Validation:

1. HTTP smoke against active `8805/api` chain.

Rollback:

No source changes; runtime smoke only.

## M32 - TradingAgents Enablement Path Review

Status: Done

Goal:

Decide whether TradingAgents should be enabled in the default Docker/browser chain now, or remain local-PoC/opt-in.

Dependencies:

1. M31 Agent Lab UI Runtime Smoke.
2. Current TradingAgents subprocess worker boundary.

Scope:

1. Review Docker/default runtime implications.
2. Compare local PoC backend, dedicated worker container, and main-app packaging paths.
3. Record the current recommendation.

Out of scope:

1. No Docker changes.
2. No TradingAgents source changes.
3. No dependency packaging.
4. No real TradingAgents run.

Acceptance:

1. Decision document exists.
2. Recommendation is explicit.
3. Current user-facing behavior is documented.

Validation:

1. Documentation file exists and contains the decision.

Rollback:

Revert the decision document.

## M33 - Orchestrator Product UX Cleanup

Status: Done

Goal:

Reduce Agent Lab diagnostic density by separating product actions from engineering/runtime diagnostics.

Dependencies:

1. M27-M31 Agent Lab diagnostics and runtime smoke.

Scope:

1. Keep Create Demo / Submit / Draft Task actions visible.
2. Collapse Runner Runtime Status, Orchestrator Intent Preview, and Worker Registry into a diagnostics section.
3. Preserve all existing diagnostics when expanded.

Out of scope:

1. No backend changes.
2. No runner behavior changes.
3. No redesign.

Acceptance:

1. Agent Lab product actions are visible without diagnostic overload.
2. Diagnostics remain available on demand.
3. Frontend build passes.

Validation:

1. `cd frontend && pnpm build`.

Rollback:

Restore diagnostics to always-expanded display.

## M34 - Orchestrator Roadmap Freeze

Status: Done

Goal:

Freeze the current Orchestrator / TradingAgents slice and return future work to the AlphaTrace product backend/data track.

Dependencies:

1. M17-M33 Orchestrator and Agent Lab work.

Scope:

1. Summarize completed Orchestrator work.
2. Record what is intentionally not done.
3. Define the recommended next product-backend track.

Out of scope:

1. No code changes.
2. No new runner behavior.
3. No Docker/package changes.

Acceptance:

1. Freeze document exists.
2. Next work direction is explicit.
3. No build required.

Validation:

1. Documentation existence and required terms check.

Rollback:

Revert the freeze document.

## M35 - Active Docker Store Baseline Verification

Status: Done

Goal:

Verify which persistence stores the active Docker-backed demo chain is actually using before changing any DB defaults.

Dependencies:

1. M34 complete.
2. Active Docker chain available at `8802`.

Scope:

1. Inspect app environment variables for AgentRunStore and DomainStore.
2. Verify JSON AgentRun store path and file presence.
3. Verify MySQL service/table readiness.
4. Confirm frontend port availability for the active browser chain.
5. Record the operational baseline and next data-backend step.

Out of scope:

1. Do not switch default stores.
2. Do not migrate data.
3. Do not change Docker configuration.
4. Do not touch TradingAgents.

Acceptance:

1. Active AgentRunStore type is documented.
2. Active DomainStore type is documented.
3. MySQL readiness is documented separately from active default usage.
4. Browser/backend port mapping is documented.

Validation:

1. `docker exec hyper-arena-app printenv ALPHA_TRACE_AGENT_RUN_STORE ALPHA_TRACE_DOMAIN_STORE ALPHA_TRACE_AGENT_RUN_STORE_PATH ALPHA_TRACE_MYSQL_DATABASE_URL`
2. `docker exec hyper-arena-app sh -lc "ls -l /app/data/alpha_trace_agent_runs.json && wc -c /app/data/alpha_trace_agent_runs.json"`
3. `docker exec hyper-arena-mysql mysql -ualpha_user -palpha_pass alpha_trace -e "SHOW TABLES LIKE 'alpha_trace_%';"`
4. `GET http://127.0.0.1:8802/api/health`
5. `GET http://127.0.0.1:8802/api/alpha-trace/agent-runs/runners/status`

Rollback:

No runtime change was made. Revert documentation only.

## M36 - MySQL Store Activation Smoke

Status: Done

Goal:

Validate that the existing MySQL-backed AgentRunStore can write and read AlphaTrace runtime objects without changing the active default store.

Dependencies:

1. M35 complete.
2. Docker MySQL service available.
3. App image contains the backend dependency declared in `backend/pyproject.toml`.

Scope:

1. Rebuild the app image if existing declared dependencies are missing from the running container.
2. Verify `sqlalchemy` and `pymysql` are importable in the app container.
3. Run a controlled MySQL store write/read smoke for AgentRun, RuntimeEvent, AgentReport, EvidenceReference, and AgentDecision.
4. Confirm default Docker runtime remains JSON-backed after the smoke.

Out of scope:

1. Do not switch `ALPHA_TRACE_AGENT_RUN_STORE` default to MySQL.
2. Do not migrate existing JSON runs into MySQL.
3. Do not modify Docker configuration.
4. Do not change frontend behavior.

Acceptance:

1. MySQL store can persist and read a completed smoke run.
2. MySQL rows are visible in `alpha_trace_agent_runs` and related tables.
3. Existing Docker backend remains healthy.
4. Frontend remains available.

Validation:

1. `docker compose build app`
2. `docker compose up -d --force-recreate --no-deps app`
3. `python -m py_compile` inside app for MySQL/runtime store files.
4. MySQL store smoke script writes a `run_mysql_smoke_*` run and reads it back.
5. Runner status endpoint remains available.

Rollback:

Switch back to the previous app image if needed. No default store change was made.

## M37 - MySQL Default Store Switch Decision

Status: Done

Goal:

Decide whether the active Docker demo chain should switch `ALPHA_TRACE_AGENT_RUN_STORE` from `json` to `mysql`.

Decision:

Switch the active Docker default to MySQL after adding a JSON-to-MySQL import command.

Implemented:

1. `ALPHA_TRACE_AGENT_RUN_STORE` defaults to `mysql` in `docker-compose.yml`.
2. `ALPHA_TRACE_DOMAIN_STORE` defaults to `mysql` in `docker-compose.yml`.
3. `backend/scripts/import_agent_runs_json_to_mysql.py` imports JSON AgentRun history into MySQL.
4. `backend/scripts` is mounted into the app container for future operational scripts.

Validation required after decision:

1. Stub submit persists to the selected default store.
2. Qwen submit persists when credentials are available.
3. Restart preserves runs.
4. Existing demo path still has at least one visible AgentRun.

Validation result:

1. JSON import completed: 40 imported, 1 skipped existing, 41 total JSON runs.
2. Stub submit created `run_stub_20260504_043437_558467`.
3. After app recreate, the stub run remained queryable from MySQL with 10 events, 1 report, and final decision.
4. MySQL row counts after switch: 44 runs, 5691 events, 133 reports, 168 evidence refs, 44 decisions.
5. Asset/Evidence/Portfolio APIs remain readable from MySQL-backed domain store.

## M38 - System Configuration Store Plan

Status: Done

Goal:

Move AlphaTrace system configuration, especially model/search provider configuration, toward MySQL-backed product config storage.

Dependencies:

1. M37 complete.
2. A clear secret-handling rule for API keys.

Scope:

1. Inventory current Hyper AI/Qwen/Bocha configuration storage.
2. Design AlphaTrace MySQL tables for model provider config and external search provider config.
3. Preserve encrypted secret handling; do not expose API keys to the frontend.
4. Keep existing Settings UI behavior stable while changing backend persistence.

Out of scope:

1. Do not log or return raw API keys.
2. Do not remove legacy Hyper AI tables until compatibility is verified.
3. Do not couple TradingAgents enablement to config migration.

Acceptance:

1. Qwen settings save/test path persists through MySQL-backed config or an explicitly documented compatibility layer.
2. Bocha settings save/test path persists through MySQL-backed config or an explicitly documented compatibility layer.
3. Runner status correctly reports key availability.
4. Existing Settings UI does not regress.

Implemented:

1. Added `alpha_trace_system_configs` as the MySQL-backed system configuration table.
2. Added a MySQL system config store for default LLM config and external tool config.
3. Hyper AI LLM config reads MySQL first, then falls back to legacy `HyperAiProfile`.
4. Qwen save path dual-writes legacy profile and MySQL config.
5. Tool config reads MySQL first, then falls back to legacy tool config JSON.
6. Bocha save/delete path dual-writes legacy profile and MySQL config.
7. Legacy config import script can migrate decryptable legacy LLM/tool secrets to MySQL.

Validation result:

1. Backend py_compile passed for changed system config, Hyper AI, runner status, Qwen runner, and migration script files.
2. Frontend `pnpm --dir frontend build` passed with existing Vite/chunk/browserlist warnings.
3. Legacy Bocha key migrated to MySQL and remains configured/enabled through `/api/hyper-ai/tools`.
4. Legacy Qwen key could not be migrated because the existing encrypted key cannot be decrypted; runner status correctly reports `missing_qwen_key`.
5. `/api/hyper-ai/profile` reports `llm_config_source=legacy_hyper_ai_profile`, `llm_api_key_available=false`.
6. No raw secrets are returned by API smoke or MySQL validation queries.

Known limitation:

1. User must re-save Qwen API Key in Settings to populate the new MySQL LLM config because the old legacy encrypted key is not decryptable in the current environment.

Rollback:

1. Existing legacy Hyper AI profile remains intact.
2. If MySQL config read/write fails, service falls back to legacy profile/tool config paths where possible.

## M39 - Settings Credential Re-save and Runtime Status UX Smoke

Status: Blocked

Goal:

Verify and tighten the Settings credential workflow after M38 so users can clearly re-save Qwen and Bocha credentials into MySQL-backed config without confusing runner status.

Dependencies:

1. M38 complete.
2. Active Docker backend available at `8802`.

Scope:

1. Validate Settings APIs through active browser/backend chain.
2. Confirm Qwen missing-key state is clear before re-save.
3. Confirm Bocha configured state is read from MySQL config.
4. Confirm runner status reflects MySQL config source after a valid Qwen key is re-saved.
5. Keep secret values hidden in all responses and logs.

Out of scope:

1. Do not add new providers.
2. Do not enable TradingAgents by default.
3. Do not require storing a real API key in files or logs.
4. Do not change Docker/package configuration.

Acceptance:

1. Settings page can load runtime credential status without backend URL confusion.
2. Qwen missing-key state shows a clear remediation message.
3. Bocha configured/enabled state survives app restart through MySQL.
4. After user re-saves a valid Qwen key, runner status reports Qwen available and source `mysql_system_config`.
5. Frontend build remains green.

Validation result:

1. Vite real mode restarted on `8805`.
2. `/dashboard#settings` returns HTTP 200.
3. `/api/hyper-ai/profile` returns `llm_config_source=legacy_hyper_ai_profile`, `llm_api_key_available=false`.
4. `/api/hyper-ai/tools` returns Bocha configured/enabled.
5. Runner status returns Qwen `missing_qwen_key`.

Blocked reason:

1. Final Qwen re-save verification requires a valid DashScope/Qwen key entered through Settings. No raw key is available to the agent, and keys must not be written to files/logs.

Next non-dependent milestone:

1. Continue with `M40 - Data Source Page Recovery and Back Navigation`, which does not depend on Qwen credentials.

## M40 - Data Source Page Recovery and Back Navigation

Status: Done

Goal:

Fix the AlphaTrace Data Source page blank state and add a consistent way for AlphaTrace subpages to return to the dashboard or previous page.

Dependencies:

1. M37 MySQL defaults are active.
2. M39 Qwen credential blocker does not affect Data Source navigation.

Scope:

1. Inspect frontend routing for `#data-source` / `#datasource` / related routes.
2. Fix blank render with a minimal real-mode Data Source page or friendly placeholder if API is not ready.
3. Add a reusable small back-navigation control for AlphaTrace subpages where safe.
4. Keep old Hyper Alpha Arena business pages unchanged.

Out of scope:

1. No new external data provider integration.
2. No real-time行情.
3. No DB schema migration.
4. No Docker/package changes.

Acceptance:

1. `http://127.0.0.1:8805/dashboard#data-source` no longer renders a blank page.
2. The Data Source page clearly states current static/MySQL/Bocha data-source state.
3. AlphaTrace subpages have a visible back/dashboard navigation affordance.
4. `pnpm --dir frontend build` passes.

Implemented:

1. Added route aliases for `data-source` and `datasource`, mapping them to the canonical `data-sources` page.
2. Added the shared AlphaTrace workspace navigation to Asset Detail and Agent Run Detail loading/error/normal states.
3. Kept the canonical Data Sources route as `data-sources`.

Validation result:

1. `pnpm --dir frontend build` passed.
2. `GET http://127.0.0.1:8805/dashboard#data-source` returned HTTP 200.
3. `GET http://127.0.0.1:8805/dashboard#data-sources` returned HTTP 200.
4. `GET http://127.0.0.1:8805/dashboard#assets/asset_etf_510300` returned HTTP 200.
5. `GET http://127.0.0.1:8805/api/alpha-trace/evidence?limit=3` returned evidence data used by the Data Sources real-mode projection.

Rollback:

1. Revert the route alias additions and shared nav insertions in the frontend files.

## M41 - MySQL Configuration Re-save Awaiting User Key

Status: Done

Goal:

Complete the Qwen credential side of M39 after the user re-saves a valid DashScope/Qwen key through Settings.

Dependencies:

1. User provides/saves a valid Qwen key through the Settings UI.

Acceptance:

1. `/api/hyper-ai/profile` reports `llm_config_source=mysql_system_config`.
2. `/api/hyper-ai/profile/llm/test-current` succeeds.
3. Runner status reports Qwen `available=true`.
4. A Qwen Agent Task can be submitted and persisted to MySQL.

Validation result:

1. User re-saved a valid Qwen key through Settings.
2. `/api/hyper-ai/profile` reports `llm_config_source=mysql_system_config` and `llm_api_key_available=true`.
3. `/api/hyper-ai/profile/llm/test-current` succeeded.
4. Runner status reports Qwen `available=true`, `status=ready`, and `qwenConfigSource=mysql_system_config`.
5. Submitted Qwen run `run_qwen_20260504_063410_011597`.
6. Run completed with 254 events, 4 reports, 5 evidence references, and 1 decision.
7. MySQL query confirmed the run and all related runtime objects persisted.

Rollback:

1. Remove or disable `llm:default` in `alpha_trace_system_configs`, or re-save credentials in Settings.

## M42 - System Config Admin and Diagnostics Cleanup

Status: Done

Goal:

Improve operator visibility for Qwen, Bocha, and runner credential state now that MySQL-backed system config is active.

Dependencies:

1. M41 complete.

Scope:

1. Ensure Settings clearly shows `mysql_system_config`, `environment`, `legacy_hyper_ai_profile`, or `missing`.
2. Ensure failed validation messages are actionable without exposing secrets.
3. Ensure Agent Lab runner diagnostics display the same config source consistently.
4. Document the operational procedure for rotating Qwen and Bocha keys.

Out of scope:

1. No new secret provider.
2. No TradingAgents enablement.
3. No Docker/package changes.

Acceptance:

1. Settings and Agent Lab agree on Qwen config source and availability.
2. Bocha config status remains visible and does not expose raw key.
3. Key rotation procedure is documented in `docs/VALIDATION.md` and `docs/IMPLEMENTATION_LOG.md`.
4. Frontend build passes if UI changes are made.

Validation result:

1. `/api/hyper-ai/profile` reports `llm_config_source=mysql_system_config` and `llm_api_key_available=true`.
2. `/api/hyper-ai/tools` reports Bocha `config_source=mysql_system_config` and `api_key_available=true` without exposing the raw key.
3. `/api/alpha-trace/agent-runs/runners/status` reports Qwen `available=true`, `qwenConfigSource=mysql_system_config`, and TradingAgents disabled with the same Qwen config source available.
4. Settings page now displays Qwen/Bocha config source and backend key availability.
5. `python -m py_compile backend/api/hyper_ai_routes.py` passed in the app container.
6. `pnpm --dir frontend build` passed with existing Vite chunk/browserslist warnings.

Rollback:

1. Revert the Settings diagnostics UI additions and the non-sensitive `/hyper-ai/tools` response fields.

## M43 - Long-Run Milestone Plan Extension

Status: Done

Goal:

Extend the canonical execution plan beyond M42 so the next non-interactive batch can continue without relying on chat history.

Dependencies:

1. M42 complete.

Scope:

1. Add M43-M48 to `docs/EXECUTION_PLAN.md`.
2. Add validation rules for M43-M48 to `docs/VALIDATION.md`.
3. Record the batch entry in `docs/IMPLEMENTATION_LOG.md`.

Out of scope:

1. No business code changes.
2. No Docker/package changes.
3. No runner behavior changes.

Acceptance:

1. M43-M48 exist in this file with status, goal, scope, acceptance, validation, and rollback.
2. `docs/VALIDATION.md` contains matching M43-M48 sections.
3. `docs/IMPLEMENTATION_LOG.md` records the M43 entry.

Validation result:

1. Governance docs now contain M43-M48.
2. No business code was changed for this milestone.

Rollback:

1. Revert the M43-M48 documentation additions.

## M44 - Agent Lab and Settings Runtime Diagnostics Closure

Status: Done

Goal:

Make Qwen, Bocha, TradingAgents, and LangAlpha runtime status clear and consistent between Settings and Agent Lab.

Dependencies:

1. M43 complete.

Scope:

1. Agent Lab runner diagnostics show availability, status, source, and actionable reason.
2. TradingAgents disabled/import-failure states explain why the button is disabled.
3. Settings remains the credential rotation entrypoint and does not expose raw secrets.
4. Error messages surface backend details instead of only HTTP status codes.

Out of scope:

1. No runner behavior changes.
2. No TradingAgents enablement.
3. No secret provider changes.

Acceptance:

1. Settings and Agent Lab agree on Qwen source and availability.
2. Bocha config source and key availability remain visible.
3. TradingAgents disabled state is explainable from the UI.
4. Frontend build passes.

Validation:

1. `pnpm --dir frontend build`
2. `GET /api/hyper-ai/profile`
3. `GET /api/hyper-ai/tools`
4. `GET /api/alpha-trace/agent-runs/runners/status`
5. Page smoke for `/dashboard#settings` and `/dashboard#agent-lab`.

Validation result:

1. Agent Lab now shows a visible Runtime Credential Snapshot for Qwen, Bocha, and TradingAgents.
2. Qwen source/key and Bocha source/key match Settings and backend API state.
3. Agent submit errors now use backend detail messages for non-`Error` API error objects.
4. `pnpm --dir frontend build` passed with existing Vite chunk/browserslist warnings.
5. API smoke returned Qwen `mysql_system_config`, Bocha `mysql_system_config`, Qwen runner `ready`, and TradingAgents `disabled`.
6. `/dashboard#settings` and `/dashboard#agent-lab` returned HTTP 200.

Rollback:

1. Revert the Agent Lab diagnostics UI changes.

## M45 - TradingAgents PoC Observability Closure

Status: Done

Goal:

Make TradingAgents PoC runs explainable even when the underlying TradingAgents execution is not fully streamable.

Dependencies:

1. M44 complete.

Scope:

1. Keep TradingAgents opt-in and disabled by default.
2. Improve AgentRunDetail display for TradingAgents-style flow, current run events, backend runtime log, and failed reason.
3. Map existing TradingAgents events by `stepId`, `agentName`, and event type where available.
4. Preserve QwenRunner and StubRunner behavior.

Out of scope:

1. No TradingAgents source modification.
2. No TradingAgents code copy.
3. No deep production integration.
4. No real trading.

Acceptance:

1. Disabled TradingAgents submit returns a clear not-enabled response.
2. Import/dependency failure returns a clear failed reason.
3. Stub and Qwen runner regressions pass.
4. AgentRunDetail can display TradingAgents failed/completed PoC runs coherently.

Validation:

1. Backend py_compile for changed files.
2. `pnpm --dir frontend build`
3. Disabled TradingAgents submit smoke.
4. Stub submit regression.
5. Qwen submit regression if Qwen key is available.

Validation result:

1. Existing AgentRunDetail already includes TradingAgents flow, worker artifacts, backend runtime log filtering, failed report/decision handling, and runtime event stream.
2. Backend py_compile passed for TradingAgents adapter/runtime route/service files.
3. `pnpm --dir frontend build` passed with existing Vite chunk/browserslist warnings.
4. Disabled TradingAgents submit returned HTTP 400 with `TradingAgents runner is not enabled.`
5. Stub regression completed as `run_stub_20260504_065219_025421`.
6. Qwen regression completed as `run_qwen_20260504_065233_551838` with 284 events, 4 reports, and final decision `overweight` confidence `0.72`.

Rollback:

1. Revert TradingAgents-specific observability UI/backend changes.

## M46 - AlphaTrace Market Data v1 Demo Reinforcement

Status: Done

Goal:

Reinforce the ETF/fund/index market data demo path without relying on legacy BTC/Hyperliquid runtime.

Dependencies:

1. M45 complete or blocked without affecting market data work.

Scope:

1. Confirm AlphaTrace static market data covers `asset_etf_510300` quote, snapshot, klines, and indicators.
2. Confirm Asset Detail can display static market data without blank states.
3. Confirm Qwen prompt context can include market snapshot context.
4. Patch only missing minimal demo fields if needed.

Out of scope:

1. No realtime ETF feed.
2. No legacy BTC endpoint reuse as AlphaTrace primary API.
3. No trading.

Acceptance:

1. ETF market data APIs are queryable.
2. Asset Detail can display 510300 market context.
3. Qwen analysis remains evidence/market-context replayable.

Validation:

1. Backend py_compile for changed files.
2. Market data API smoke.
3. `pnpm --dir frontend build` if frontend changes.
4. Page smoke for `/dashboard#assets/asset_etf_510300`.

Rollback:

1. Revert any market data demo additions.

Validation result:

1. API smoke passed for 510300 quote, snapshot, klines, and indicators through `http://127.0.0.1:8805/api/alpha-trace/market-data/assets/asset_etf_510300/...`.
2. Market data source is `alphatrace_static_market_seed` and does not use the legacy BTC/Hyperliquid endpoint as AlphaTrace primary data.
3. Asset Detail page smoke passed for `http://127.0.0.1:8805/dashboard#assets/asset_etf_510300`.
4. Container py_compile passed for market data route/schema/store/seed files.
5. No business code changes were required for M46.

## M47 - AlphaTrace Demo Path Stabilization

Status: Done

Goal:

Make the 10-minute AlphaTrace demo path stable in real mode.

Dependencies:

1. M46 complete or documented blocker.

Scope:

1. Smoke the demo path: Dashboard, Asset Research, Asset Detail, Evidence Center, Qwen AgentRunDetail, Decision Attribution, Portfolio Workspace, Portfolio Diagnosis, Leaderboard, Settings.
2. Fix broken route aliases, empty states, and actionable error messaging only.
3. Update demo checklist if needed.

Out of scope:

1. No new backend capability.
2. No new external provider.
3. No old business page edits.

Acceptance:

1. Key demo pages return HTTP 200.
2. Qwen single asset run can complete if Qwen key is configured.
3. Decision and Leaderboard show runtime/domain data.
4. Portfolio diagnosis either submits successfully or returns an actionable backend reason.

Validation:

1. `pnpm --dir frontend build`
2. Critical API smoke.
3. Critical page smoke.
4. Record any submitted runId.

Rollback:

1. Revert demo-only route/empty-state/error-message changes.

Validation result:

1. Page smoke passed for Dashboard, Asset Research, Asset Detail 510300, Evidence Center, Agent Lab, Decision Attribution, Portfolio Workspace, Leaderboard, and Settings through `http://127.0.0.1:8805/dashboard#...`.
2. API smoke passed for health, assets, asset detail, evidence, decisions, portfolios, leaderboard, Hyper AI profile, and runner status.
3. `pnpm --dir frontend build` passed with existing Vite chunk and Browserslist warnings.
4. Portfolio diagnosis submitted and completed as `run_qwen_20260504_065828_198259`.
5. The completed portfolio diagnosis run returned 275 events, 4 reports, 5 evidence references, and final decision `overweight` with confidence `0.72`.
6. AgentRunDetail page smoke passed for `http://127.0.0.1:8805/dashboard#agent-lab/runs/run_qwen_20260504_065828_198259`.

## M48 - Four-Hour Batch Closure and Freeze Point

Status: Done

Goal:

Close the current non-interactive batch with a verifiable state report and next-stage recommendation.

Dependencies:

1. M47 complete or documented blocker.

Scope:

1. Update `docs/IMPLEMENTATION_LOG.md`, `docs/EXECUTION_PLAN.md`, and `docs/VALIDATION.md`.
2. Record completed work, skipped work, blockers, validation results, and next recommended milestone.
3. Run final API smoke and `git status --short`.

Out of scope:

1. No new product feature.
2. No new integration.

Acceptance:

1. Current state is auditable from docs.
2. There are no hidden failures.
3. Next-stage recommendation is explicit.

Validation:

1. `git status --short`
2. `GET /api/health`
3. `GET /api/hyper-ai/profile`
4. `GET /api/alpha-trace/agent-runs/runners/status`
5. `GET /api/alpha-trace/assets`
6. `GET /api/alpha-trace/evidence`
7. `GET /api/alpha-trace/leaderboard`

Rollback:

1. Revert final documentation-only closure edits if needed.

Validation result:

1. Final API smoke passed for `/api/health`, `/api/hyper-ai/profile`, `/api/alpha-trace/agent-runs/runners/status`, `/api/alpha-trace/assets`, `/api/alpha-trace/evidence`, and `/api/alpha-trace/leaderboard` through `http://127.0.0.1:8805`.
2. `git status --short` was captured and shows a broad dirty worktree from current and earlier AlphaTrace milestones; no unrelated changes were reverted.
3. M43-M48 are now marked complete in the canonical execution plan.
4. Next recommended milestone should be added explicitly before further implementation.

## M49 - Commit/Change-Set Review and Runtime Regression Pack

Status: Done

Goal:

Make the current broad dirty worktree auditable before the next feature batch.

Dependencies:

1. M48 complete.

Scope:

1. Summarize modified/untracked files by domain: backend runtime, stores, integrations, frontend pages, docs, scripts.
2. Identify files changed in the current M43+ batch versus earlier AlphaTrace work where possible.
3. Run a compact runtime regression pack: health, runner status, stub submit, Qwen readiness, market data, decisions, leaderboard.
4. Record whether the worktree is safe to commit as one batch or should be split.

Out of scope:

1. No git commit unless explicitly requested.
2. No revert of unrelated changes.
3. No new feature implementation.

Acceptance:

1. A change-set review section is recorded in `docs/IMPLEMENTATION_LOG.md`.
2. Runtime regression pack passes or blocker is recorded.
3. Next recommended commit grouping is explicit.

Validation:

1. `git status --short`
2. `git diff --stat`
3. API smoke for health, runner status, assets, evidence, decisions, leaderboard.
4. Stub submit regression.

Rollback:

1. Documentation-only changes can be reverted if needed.

Validation result:

1. `git status --short` and `git diff --stat` were captured.
2. Dirty worktree spans backend runtime/store/integration files, frontend AlphaTrace pages/entities, Docker/config docs, and many new engineering docs; this should be split before commit.
3. Initial M49 smoke found `8805` Vite was down, then after restart it returned API 500 because the proxy target env was missing.
4. Restarted Vite 8805 with `VITE_ALPHA_TRACE_API_PROXY_TARGET=http://127.0.0.1:8802/api`; page and `/api/health` then returned HTTP 200.
5. API smoke passed for health, runner status, assets, evidence, decisions, and leaderboard.
6. Stub submit regression completed as `run_stub_20260504_130155_819376`.
7. Runner status returned stub ready, qwen ready from `mysql_system_config`, TradingAgents disabled, and LangAlpha disabled.

## M50 - Startup and Runtime Operations Runbook

Status: Done

Goal:

Document the consistent startup and troubleshooting procedure without adding a startup script yet.

Dependencies:

1. M49 complete or documented blocker.

Scope:

1. Update operations documentation for current ports: Docker backend 8802, Vite frontend 8805, same-origin `/api` proxy, MySQL 3307.
2. Record what 8804/8805/8802 mean historically and currently.
3. Document key checks for Qwen, Bocha, TradingAgents disabled state, MySQL config, and legacy BTC logs out of scope.
4. Add a concise restart/check sequence to `docs/IMPLEMENTATION_LOG.md` and startup docs.

Out of scope:

1. No startup script.
2. No Docker rewrite.
3. No legacy BTC log fix.

Acceptance:

1. A runbook exists and points to the current working ports.
2. The user can restart/check services consistently from docs.

Validation:

1. Confirm Docker app and Vite page are reachable.
2. Confirm `/api/health` and `/api/hyper-ai/profile` are reachable through 8805.

Rollback:

1. Revert documentation edits.

Validation result:

1. Updated `docs/engineering/20_alphatrace_startup_guide.md` with the current 8802/8805/8804 port map.
2. Documented the required Vite real-mode proxy env: `VITE_ALPHA_TRACE_API_BASE_URL=/api` and `VITE_ALPHA_TRACE_API_PROXY_TARGET=http://127.0.0.1:8802/api`.
3. Docker app, MySQL, and backend health were confirmed through `docker ps`.
4. `http://127.0.0.1:8805/dashboard#settings`, `/api/health`, and `/api/hyper-ai/profile` returned HTTP 200.

## M51 - MySQL Persistence Verification Pack

Status: Done

Goal:

Verify MySQL-backed runtime/config/domain persistence without implementing new schema work.

Dependencies:

1. M50 complete or documented blocker.

Scope:

1. Verify Qwen/Bocha config source is `mysql_system_config` without printing secrets.
2. Verify latest Qwen/portfolio run exists in MySQL runtime tables if tables are present.
3. Verify JSON fallback status is documented.
4. Record current DB connection and table smoke outcomes.

Out of scope:

1. No schema migration.
2. No data deletion.
3. No raw secret reads.

Acceptance:

1. MySQL persistence status is recorded with query results that do not expose secrets.
2. Any missing table or fallback behavior is documented as a blocker or limitation.

Validation:

1. Docker MySQL container health.
2. Safe count queries for runtime/config tables.
3. API smoke through backend.

Rollback:

1. No data changes expected.

Validation result:

1. MySQL container `hyper-arena-mysql` is healthy and database `alpha_trace` exists.
2. Runtime store env is `ALPHA_TRACE_AGENT_RUN_STORE=mysql`; JSON path remains configured as fallback/legacy path.
3. MySQL AlphaTrace tables exist for agent runs, runtime events, reports, evidence refs, decisions, assets, evidence items, portfolios, strategies, data sources, and system configs.
4. Safe count queries returned 50 agent runs, 6801 runtime events, 151 reports, 188 evidence refs, and 50 decisions.
5. System config safe query confirmed Qwen `llm:default` and Bocha `tool:bocha` are enabled with API key availability true; raw secrets were not recorded in docs.
6. Latest portfolio diagnosis run `run_qwen_20260504_065828_198259` is present in MySQL and readable through the runtime API.

## M52 - Agent Runtime Failure Regression Pack

Status: Done

Goal:

Verify failure paths remain explainable and persistent.

Dependencies:

1. M51 complete or documented blocker.

Scope:

1. TradingAgents disabled submit returns clear error.
2. Unsupported runner submit returns clear error.
3. Stub runner still completes.
4. Existing failed runs, if present, can be queried without page/API crash.
5. AgentRunDetail page smoke for a completed and a failed/not-enabled path where available.

Out of scope:

1. No forced Qwen key invalidation.
2. No destructive config changes.

Acceptance:

1. Failure behavior is documented and API does not crash.
2. Stub/Qwen readiness remains unaffected.

Validation:

1. TradingAgents disabled smoke.
2. Unsupported runner smoke.
3. Stub submit regression.
4. Runner status smoke.

Rollback:

1. No code changes expected unless a small bug is found.

Validation result:

1. TradingAgents disabled submit returned HTTP 400 with `TradingAgents runner is not enabled.`.
2. Unsupported runner submit returned HTTP 422 schema validation with the allowed runner types.
3. Stub regression completed as `run_stub_20260504_130628_404756`.
4. Runner status returned stub ready, qwen ready from `mysql_system_config`, TradingAgents disabled, and LangAlpha disabled.
5. Querying recent AgentRun list found no failed runs currently present, so failed-detail page smoke was not applicable.
6. No code changes were required.

## M53 - Demo UX Smoke and Minimal Fixes

Status: Done

Goal:

Run one more demo UX pass and fix only small route/error/empty-state issues that block demonstration.

Dependencies:

1. M52 complete or documented blocker.

Scope:

1. Check Dashboard, Asset Detail, Agent Lab, AgentRunDetail, Decision Attribution, Portfolio, Leaderboard, Settings.
2. Verify back/dashboard navigation remains present on detail pages.
3. Fix only minimal frontend display issues if discovered.

Out of scope:

1. No new backend capability.
2. No new design overhaul.
3. No old business page changes.

Acceptance:

1. Demo pages remain openable.
2. Any discovered blocking UX issue is fixed or logged.
3. Frontend build passes if frontend changed.

Validation:

1. Page smoke.
2. `pnpm --dir frontend build` if frontend changed.

Rollback:

1. Revert minimal frontend fixes if needed.

Validation result:

1. Page smoke returned HTTP 200 for Dashboard, Assets, Asset Detail 510300, Agent Lab, AgentRunDetail for `run_qwen_20260504_065828_198259`, Decisions, Portfolio, Leaderboard, Settings, Data Sources, and the `data-source` alias.
2. Asset Detail and AgentRunDetail include `ResearchWorkspaceNav` references for back/dashboard navigation.
3. `pnpm --dir frontend build` passed with existing chunk-size, dynamic import, Browserslist, and baseline-browser-mapping warnings.
4. No blocking UX issue was found and no code changes were required in M53.

## M54 - Extended Batch Closure

Status: Done

Goal:

Close the continued long-run batch with a clear state report.

Dependencies:

1. M53 complete or documented blocker.

Scope:

1. Mark M49-M54 statuses.
2. Record validation, blockers, risks, and next milestone recommendation.
3. Capture final `git status --short`.

Out of scope:

1. No new feature implementation.

Acceptance:

1. Current state is auditable from canonical docs.
2. No hidden failures.

Validation:

1. `git status --short`
2. Final API smoke: health, profile, runner status, assets, evidence, leaderboard.

Rollback:

1. Revert documentation-only closure edits.

Validation result:

1. Final API smoke passed for health, Hyper AI profile, runner status, assets, evidence, and leaderboard through `http://127.0.0.1:8805`.
2. `git status --short` was captured again; worktree remains broadly dirty from previous and current AlphaTrace milestones.
3. M49-M54 are now marked complete.
4. Next recommended work is change-set grouping and commit preparation before another implementation batch.

## M55 - Change-Set Grouping and Commit Preparation

Status: Done

Goal:

Turn the broad dirty worktree into reviewable commit groups without actually committing.

Scope:

1. Generate a file grouping plan by domain.
2. Identify files that should not be committed yet, including transient run-id marker files if any.
3. Record recommended commit order.
4. Run lightweight final smoke after grouping analysis.

Out of scope:

1. No commit without explicit user confirmation.
2. No revert of user or previous milestone changes.

Acceptance:

1. `docs/IMPLEMENTATION_LOG.md` records commit grouping recommendations.
2. Transient files needing cleanup/manual decision are listed.
3. No hidden test failure.

Validation:

1. `git status --short`
2. `git diff --stat`
3. Final API smoke for health and runner status.

Rollback:

1. Documentation-only changes can be reverted.

Validation result:

1. Worktree grouping count: backend 38, frontend 24, docs 44, root/config 11, scripts 1.
2. Transient/manual-decision candidates include root `IMPLEMENTATION_LOG.md`, `last_*.txt` run markers, and `scripts/`.
3. API smoke passed for health and runner status.
4. Recommended commit split: governance/docs, backend runtime/store/integrations, frontend AlphaTrace UX, config/ops, and optional scripts/run markers after review.

## M56 - Backend PyCompile Regression Sweep

Status: Done

Goal:

Run py_compile over changed/new AlphaTrace backend files that are likely to be imported by runtime paths.

Scope:

1. Compile new API files, schemas, stores, runner adapters, integrations, and orchestrator modules.
2. Fix syntax/import errors only if small and local.

Out of scope:

1. No behavior refactor.
2. No dependency expansion.

Acceptance:

1. py_compile passes or blocker is recorded with exact file/error.

Validation:

1. Docker/container py_compile for backend AlphaTrace files.

Rollback:

1. Revert small syntax/import fix if needed.

Validation result:

1. Container backend compile sweep passed: `python -m compileall -q backend/api backend/schemas backend/services`.
2. No syntax/import compile error was found.
3. No code changes were required.

## M57 - Frontend Build and Route Regression Sweep

Status: Done

Goal:

Run frontend build and route smoke after backend compile sweep.

Scope:

1. `pnpm --dir frontend build`.
2. Smoke critical AlphaTrace pages.
3. Fix only small blocking build/route issues.

Out of scope:

1. No UI redesign.
2. No old business page changes.

Acceptance:

1. Build passes.
2. Critical pages return HTTP 200.

Validation:

1. Frontend build.
2. Page smoke.

Rollback:

1. Revert small frontend fix if needed.

Validation result:

1. `pnpm --dir frontend build` passed.
2. Existing warnings remain: chunk size, dynamic import/static import overlap, Browserslist age, and baseline-browser-mapping age.
3. Page smoke returned HTTP 200 for Dashboard, Assets, Asset Detail 510300, Agent Lab, AgentRunDetail, Decisions, Portfolio, Leaderboard, Settings, and Data Source alias.
4. No frontend code changes were required.

## M58 - Next Execution Plan Extension

Status: Done

Goal:

Add the next implementation milestones only after compile/build/regression state is known.

Scope:

1. Define next concrete milestones for MySQL schema hardening, ETF data domain, TradingAgents enablement, and commit workflow.
2. Record blockers and required user decisions.

Out of scope:

1. No new feature code.

Acceptance:

1. Execution plan has clear next milestones.
2. Implementation log states what is safe to do next.

Validation:

1. Documentation consistency check.

Validation result:

1. Added M59-M64 to the canonical execution plan.
2. The next milestones prioritize commit hygiene, MySQL schema snapshot, repeatable runtime smoke, TradingAgents enablement preflight, and legacy-noise design only.

## M59 - Transient Artifact Policy and Commit Hygiene

Status: Done

Goal:

Decide how to handle untracked run marker files, root logs, and scripts before commit.

Scope:

1. List transient artifacts.
2. Recommend keep/move/ignore/delete actions.
3. Update `.gitignore` only if the rule is safe and narrow.

Out of scope:

1. No deletion without clear safety.
2. No commit.

Acceptance:

1. Transient artifact policy is documented.
2. No accidental loss of run evidence.

Validation:

1. `git status --short`
2. `.gitignore` check if modified.

Validation result:

1. Added narrow `.gitignore` rules for root `/IMPLEMENTATION_LOG.md` and `/last_*.txt`.
2. Verified these local run artifacts now show as ignored with `git status --ignored --short`.
3. `scripts/` remains unignored and requires manual review before commit.
4. No run evidence was deleted.

## M60 - MySQL Schema Snapshot and Store Boundary Review

Status: Done

Goal:

Record current MySQL AlphaTrace schema and store boundaries before further DB work.

Scope:

1. Capture table list and non-sensitive column schema.
2. Map tables to runtime/domain/system config stores.
3. Identify migration hardening needs.

Out of scope:

1. No schema migration.
2. No data mutation.

Acceptance:

1. Schema snapshot is documented.
2. Migration risks are explicit.

Validation:

1. Safe `DESCRIBE`/count queries only.

Validation result:

1. Added `docs/engineering/36_mysql_schema_snapshot.md`.
2. Snapshot covers 11 `alpha_trace%` tables in database `alpha_trace`.
3. Snapshot records structure only and does not include raw or encrypted secret values.
4. Store boundary map covers AgentRunStore, domain stores, and system config.

## M61 - Runtime API Smoke Collection

Status: Done

Goal:

Create a repeatable smoke checklist for the runtime/domain APIs without adding a startup script.

Scope:

1. Document curl/PowerShell checks for runner status, submit stub, market data, decisions, leaderboard, settings profile.
2. Record expected outputs.

Out of scope:

1. No new test framework.
2. No package changes.

Acceptance:

1. Smoke collection is copy-paste runnable from docs.

Validation:

1. Execute the listed smoke commands once.

Validation result:

1. Added `docs/engineering/37_runtime_api_smoke_collection.md`.
2. Executed the health/config/runner/domain/market-data smoke commands through `http://127.0.0.1:8805/api`; all returned HTTP 200.
3. Stub submit smoke completed as `run_stub_20260504_131914_531650`.

## M62 - TradingAgents Enablement Preflight

Status: Done

Goal:

Document and validate only the disabled/import/config preflight path for TradingAgents, not full production enablement.

Scope:

1. Confirm disabled state is clear.
2. Confirm Qwen key source visibility for TradingAgents status.
3. Document required env vars for enabling.

Out of scope:

1. No real TradingAgents run unless explicitly configured.
2. No dependency installation.

Acceptance:

1. User can tell why TradingAgents button is disabled.
2. Enabling path is documented.

Validation:

1. Runner status smoke.
2. Disabled submit smoke.

Validation result:

1. Added `docs/engineering/38_tradingagents_enablement_preflight.md`.
2. Runner status confirmed TradingAgents is disabled, subprocess-mode, not available, and has Qwen config visibility from `mysql_system_config`.
3. Disabled TradingAgents submit returned HTTP 400 with `TradingAgents runner is not enabled.`.
4. Hyper AI profile confirmed Qwen provider/model/key availability from `mysql_system_config`.

## M63 - Legacy Runtime Noise Isolation Design

Status: Done

Goal:

Design, not implement, how to isolate legacy BTC/Hyperliquid startup noise from AlphaTrace-only development.

Scope:

1. Identify likely startup services producing BTC logs.
2. Propose AlphaTrace-only startup profile design.
3. Record risks and non-goals.

Out of scope:

1. No code change.
2. No Docker rewrite.
3. No disabling legacy services yet.

Acceptance:

1. Design note exists and future implementation is bounded.

Validation:

1. Documentation only.

Validation result:

1. Added `docs/engineering/39_legacy_runtime_noise_isolation_design.md`.
2. Code inspection found existing profile gates in `backend/main.py`: `ALPHATRACE_BACKEND_PROFILE`, `ALPHATRACE_LEGACY_RUNTIME_ENABLED`, and `ALPHATRACE_FRONTEND_WATCHER_ENABLED`.
3. Current Docker container does not set those profile env vars, so legacy runtime remains enabled by default.
4. No code or Docker changes were made.

## M64 - Long-Run Continuation Closure

Status: Done

Goal:

Close the continuation batch and define the next implementation decision point.

Scope:

1. Mark M59-M64 statuses.
2. Record validations and blockers.
3. State next decision: commit grouping versus more implementation.

Out of scope:

1. No feature work.

Acceptance:

1. Current state is auditable.
2. No hidden validation failure.

Validation:

1. Final API smoke.
2. `git status --short`.

Validation result:

1. Final API smoke passed for health, Hyper AI profile, runner status, assets, evidence, and leaderboard through `http://127.0.0.1:8805`.
2. `git status --short` shows 115 dirty entries after ignoring local run artifacts.
3. M55-M64 are now marked complete.
4. Next recommended decision point is commit grouping/review before further implementation.

## M65 - Run-Scoped Evidence Resolver Fix

Status: Done

Goal:

Make Bocha/run-scoped evidence ids resolvable from Evidence Center and AgentRunDetail.

Scope:

1. Resolve `ev_bocha_*` / run-scoped evidence from AgentRunStore when not found in domain EvidenceStore.
2. Preserve source URL, summary, extracted fields, related run, and decision usage.
3. Keep static EvidenceStore behavior unchanged.

Acceptance:

1. `GET /api/alpha-trace/evidence/{ev_bocha_id}` returns full detail for persisted AgentRun evidence.
2. Evidence Center can open run-scoped evidence from AgentRunDetail links.

Validation result:

1. Backend py_compile passed for `backend/api/alpha_trace_evidence_routes.py`.
2. Frontend build passed.
3. `GET http://127.0.0.1:8805/api/alpha-trace/evidence/ev_bocha_94b8587c2fbc49` returned full Bocha evidence detail.

## M66 - Tool Call Timeline Normalization

Status: Done

Goal:

Show persisted tool calls and runtime-derived `tool.called` / `tool.result` events together in AgentRunDetail.

Scope:

1. Merge persisted `run.toolCalls` with runtime event tool activity.
2. Preserve evidence link context with `runId`.

Acceptance:

1. Tool Calls Timeline no longer hides runtime tool activity when persisted calls exist.

Validation result:

1. Frontend build passed.
2. Existing Qwen run showed 16 runtime tool events through `/events`.

## M67 - Bocha Evidence Source URL Visibility

Status: Done

Goal:

Expose Bocha source URLs clearly in Evidence Center and AgentRunDetail.

Scope:

1. Evidence detail renders clickable source URL.
2. Evidence detail offers best-effort iframe preview.
3. AgentRunDetail Evidence Used cards show source URL / open-source action.

Acceptance:

1. External evidence can be verified through its original URL.
2. Sites that block iframe still have a direct source link.

Validation result:

1. Frontend build passed.

## M68 - AlphaTrace Native Multi-Agent Runner v1

Status: Done

Goal:

Expose AlphaTrace-owned native multi-agent workflow as `runnerType=alphatrace_native`.

Scope:

1. Register `AlphaTraceNativeRunnerAdapter` without connecting TradingAgents.
2. Reuse the proven Qwen/Bocha/native DAG path for v1.
3. Add runner status, capability, execution policy, Agent Lab submit button, and retry compatibility.

Out of scope:

1. No new independent orchestration implementation.
2. No TradingAgents dependency.
3. No frontend layout rewrite.

Acceptance:

1. `/runners/status` includes `alphatrace_native`.
2. Agent Lab can submit a native run.
3. Native run persists events/reports/evidence/decision.
4. Qwen/stub regressions remain valid.

Validation result:

1. Backend py_compile passed for changed runtime/schema/router files.
2. Frontend build passed.
3. `GET /api/alpha-trace/agent-runs/runners/status` returned native runner `ready` with Qwen config from `mysql_system_config`.
4. Submitted `run_native_20260504_142346_793914`; it completed with 269 events, 4 reports, 5 evidence refs, and decision `hold`.
5. Stub regression `run_stub_20260504_142615_120013` completed.

## M69 - Native Runner UI/DAG Copy Polish and Trace Review

Status: Done

Goal:

Make the Native runner distinction clear in UI copy and runtime traces without changing core execution.

Scope:

1. Audit Agent Lab and AgentRunDetail labels for `qwen` versus `alphatrace_native` wording.
2. Ensure new native runs show `source=alphatrace_native` in initial runtime event payload.
3. Confirm Evidence/Tool trace links still work for native runs.

Out of scope:

1. No TradingAgents integration.
2. No new model calls beyond smoke validation.
3. No large UI refactor.

Acceptance:

1. User can tell `alphatrace_native` is AlphaTrace's product DAG and `tradingagents` is an optional PoC/reference runner.
2. Runtime event source and submit messages are not misleading.

Validation:

1. Backend py_compile if runtime code changes.
2. Frontend build if UI copy changes.
3. Native run detail smoke with events/reports/evidence/decision.

Validation result:

1. Backend py_compile passed for `backend/services/agent_runners/qwen_runner.py` and `backend/services/agent_runners/native_multi_agent_runner.py`.
2. Restarted Docker app and confirmed native runner status is `ready`.
3. Submitted `run_native_20260504_142907_684988`; immediate response showed `name=AlphaTrace Native Multi-Agent Task`, `triggeredBy=alphatrace_native`, `source=alphatrace_native`, and `initialAgent=AlphaTrace Native Orchestrator`.
4. The run completed with 4 reports, 5 evidence refs, and decision `hold`.



## M70 - Full-Stack Architecture Baseline

Status: Done

Goal:

Create a single canonical frontend/backend architecture map for AlphaTrace so future work does not rely on oral context.

Scope:

1. Document backend API/domain/runtime/store/integration layers.
2. Document frontend pages/entities/shared API boundaries.
3. Document runner boundaries for stub/qwen/alphatrace_native/tradingagents/langalpha.
4. Document MySQL/JSON/static seed persistence strategy.
5. Document evidence, settings, legacy runtime, and port topology boundaries.

Out of scope:

1. No business code changes.
2. No Docker/package changes.
3. No legacy BTC runtime changes.

Acceptance:

1. `docs/ARCHITECTURE.md` exists and covers full-stack architecture.
2. `docs/PROJECT_SPEC.md` points to the architecture doc as a source of truth.
3. Future milestones can reference a stable architecture map.

Validation result:

1. Created `docs/ARCHITECTURE.md`.
2. Updated `docs/PROJECT_SPEC.md` source-of-truth section.
3. Documentation-only change; no py_compile or frontend build required.

## M71 - Long-Run Plan Extension for Runtime Hardening

Status: Done

Goal:

Extend the canonical plan from M71 to M78 so the next long-run execution batch has explicit milestones, validation, and rollback criteria.

Scope:

1. Add M71-M78 to `docs/EXECUTION_PLAN.md`.
2. Add matching validation rules to `docs/VALIDATION.md`.
3. Record the transition from M70 into runtime/config hardening.

Out of scope:

1. No business code changes.
2. No Docker/package changes.

Acceptance:

1. M71-M78 are present in execution and validation docs.
2. Every milestone has clear acceptance and validation guidance.

Validation result:

1. Documentation-only change; no py_compile or frontend build required.

## M72 - Runtime Config Consistency Hardening

Status: Done

Goal:

Make Qwen, DASHSCOPE, Bocha, TradingAgents, and AlphaTrace Native credential/config status consistent across Settings, Hyper AI profile/tools, and Agent Runtime runner status.

Scope:

1. Compare `/api/hyper-ai/profile`, `/api/hyper-ai/tools`, and `/api/alpha-trace/agent-runs/runners/status`.
2. Fix mismatched config source, key availability, disabled reason, or user-facing message if found.
3. Preserve backend-only key handling; never expose raw API keys.

Out of scope:

1. No new provider integration.
2. No frontend key plaintext display.
3. No TradingAgents production enablement.

Acceptance:

1. Qwen/native runner ready state agrees with Hyper AI profile key availability.
2. Bocha tool status agrees with Settings diagnostics.
3. TradingAgents disabled/import/missing-key reason is explicit.
4. Settings and Agent Lab show consistent source labels.

Validation:

1. API smoke for profile/tools/runner status.
2. `pnpm --dir frontend build` if frontend changes.
3. Backend py_compile if backend code changes.

Rollback:

Revert only the diagnostic/status-message changes; runner execution paths should remain unchanged.

Validation result:

1. `/api/hyper-ai/profile` returned Qwen provider/model/baseUrl/key availability from `mysql_system_config`.
2. `/api/hyper-ai/tools` returned Bocha configured/key availability from `mysql_system_config`.
3. `/api/alpha-trace/agent-runs/runners/status` returned qwen and alphatrace_native `ready`, TradingAgents `disabled` with explicit enablement message, and qwen config source `mysql_system_config`.
4. `/dashboard#settings` and `/dashboard#agent-lab` returned HTTP 200.
5. No code change required.

## M73 - Frontend Route and Navigation Stability

Status: Done

Goal:

Ensure every AlphaTrace real-mode page opens without blank screen and has a consistent way to return to Dashboard or previous page.

Scope:

1. Smoke Dashboard, Assets, Asset Detail, Evidence, Agent Lab, Run Detail, Decision, Portfolio, Leaderboard, Data Sources, Settings.
2. Fix page-level blank states, API error rendering, and navigation gaps only where they block demo flow.
3. Preserve mock mode.

Acceptance:

1. All listed pages return HTTP 200 through `8805`.
2. Data Sources page does not blank.
3. AlphaTrace subpages expose consistent back navigation.

Validation:

1. `pnpm --dir frontend build` after UI changes.
2. Page smoke with `Invoke-WebRequest` for each route.

Rollback:

Revert page-level UI changes only.

## M74 - Evidence Traceability End-to-End

Status: Pending

Goal:

Ensure run-scoped and Bocha evidence can be traced from reports/decision/tool calls to Evidence Center and source URL.

Scope:

1. Verify `ev_bocha_*` detail resolution.
2. Verify AgentRunDetail Evidence Used / Tool Calls / Reports / Decision links carry evidence id and run context.
3. Keep iframe preview best-effort and direct URL as canonical.

Acceptance:

1. Bocha evidence detail includes title, sourceName, summary, URL, usage run ids, and decision ids where available.
2. AgentRunDetail links open Evidence Center details instead of empty page.

Validation:

1. Backend evidence API smoke.
2. Frontend build if UI changes.
3. Existing native/qwen run evidence link smoke.

Rollback:

Revert evidence detail/linking changes; persisted runs remain intact.

## M75 - AlphaTrace Native Runner Product Path

Status: Pending

Goal:

Polish and validate `alphatrace_native` as the preferred product runner while keeping TradingAgents as opt-in PoC.

Scope:

1. Confirm Agent Lab copy and diagnostics distinguish native from TradingAgents.
2. Submit native smoke run and verify events/reports/evidence/decision.
3. Verify native run persists in MySQL-backed runtime store.

Acceptance:

1. Native submit returns immediately.
2. Native run completes or records clear failed reason.
3. Run detail shows native source/copy and complete trace.

Validation:

1. Backend py_compile if runtime code changes.
2. Frontend build if UI changes.
3. Native submit/run-detail smoke.

Rollback:

Revert native-specific UI/copy changes; `qwen` and `stub` must remain available.

## M76 - MySQL Persistence Integrity Pass

Status: Pending

Goal:

Verify AgentRunStore, domain stores, and system config stores persist critical AlphaTrace data through backend restart.

Scope:

1. Verify MySQL store type/config safely without printing secrets.
2. Verify a recent AgentRun detail/events/reports/evidence/decision after restart.
3. Verify domain APIs and system config APIs still read from MySQL-backed sources.
4. Keep JSON fallback available.

Acceptance:

1. Recent run remains queryable after restart.
2. Qwen/Bocha config source remains stable.
3. Domain APIs return data after restart.

Validation:

1. Safe MySQL metadata/count smoke.
2. Backend restart plus API smoke.
3. No destructive migration.

Rollback:

Switch store env back to JSON fallback if MySQL integrity fails.

## M77 - Runtime Validation Pack

Status: Pending

Goal:

Run and record a standardized regression pack for AlphaTrace runtime and domain APIs.

Scope:

1. Health/profile/tools/runner/domain API smoke.
2. Stub submit.
3. Native submit.
4. Qwen submit if key ready.
5. TradingAgents disabled smoke.

Acceptance:

1. All non-key-dependent smoke tests pass.
2. Key-dependent failures are clear and persisted, not crashes.

Validation:

1. Execute fixed smoke commands from `docs/VALIDATION.md`.
2. Record run ids and outcomes in `docs/IMPLEMENTATION_LOG.md`.

Rollback:

No code change expected unless smoke exposes a small fix.

## M78 - Batch Closure and Review Point

Status: Pending

Goal:

Close the M71-M78 batch with current state, validation summary, dirty worktree grouping, and next recommended milestone.

Scope:

1. Update canonical docs and implementation log.
2. Capture `git status --short` and high-level dirty worktree groups.
3. Recommend next path: commit grouping, AlphaTrace-only startup profile, or deeper MySQL schema hardening.

Acceptance:

1. Batch result is auditable.
2. No hidden validation failures.
3. Next recommended step is explicit.

Validation:

1. Final API smoke.
2. `git status --short`.

Rollback:

Documentation-only unless prior milestones required fixes.

## M79 - Backend Layering and Dependency Boundary Audit

Status: Done

Goal:

Audit and tighten AlphaTrace backend layering so API routes, domain services, stores, runtime, runner adapters, and integrations have clear dependencies and no accidental legacy coupling.

Scope:

1. Map imports and call flow for AlphaTrace API routes and services.
2. Identify direct static-seed access that should go through stores.
3. Identify legacy crypto/trading imports in AlphaTrace paths.
4. Produce small fixes only where coupling causes runtime or test risk.

Acceptance:

1. AlphaTrace route/service/store boundaries are documented and consistent with `docs/ARCHITECTURE.md`.
2. No AlphaTrace core path depends on legacy BTC/Hyperliquid runtime for ETF/fund/index workflows.

Validation:

1. Backend py_compile for changed files.
2. API smoke for affected routes.

## M80 - Calculation and Scoring Logic Review

Status: Done

Goal:

Review and stabilize AlphaTrace calculation logic: runtime quality score, evidence score, risk score, confidence handling, leaderboard metrics, decision attribution placeholders, and market indicators.

Scope:

1. Document formulas and default values.
2. Remove misleading real-performance semantics from runtime-quality metrics.
3. Ensure missing evidence/reports/events degrade gracefully.
4. Add unit-like smoke scripts only if low risk.

Acceptance:

1. Scores are explainable, deterministic, and not confused with realized investment return.
2. Leaderboard and Decision Attribution calculations handle empty/failed runs safely.

Validation:

1. Backend py_compile for changed files.
2. API smoke for leaderboard and decisions.
3. Compare sample completed/failed/stub runs.

## M81 - Agent Runtime State Machine and Error Semantics Review

Status: Done

Goal:

Make run lifecycle, cancellation, retry, timeout, failed reasons, and SSE reconnect semantics consistent across stub, qwen, alphatrace_native, and tradingagents.

Scope:

1. Audit status transitions.
2. Verify failed run replayability.
3. Verify cancel/retry behavior.
4. Normalize error messages where they leak implementation details or omit actionability.

Acceptance:

1. All terminal states are durable.
2. UI can display failed/cancelled/retried run state without crashing.

Validation:

1. Backend py_compile.
2. Stub/native failure/cancel/retry smoke where feasible.
3. Frontend build if UI error rendering changes.

## M82 - Evidence Governance v2

Status: Done

Goal:

Move evidence from linkability to stronger governance: citation quality, source visibility, support scoring readiness, and external-source reliability labels.

Scope:

1. Confirm every evidence item has source, type, reliability, quality, summary, and URL when available.
2. Surface unsupported/invalid citations without failing a run.
3. Prepare support-score fields and UI badges without requiring LLM judge implementation.

Acceptance:

1. Evidence Center and AgentRunDetail both make evidence provenance clear.
2. Bocha/static/run-scoped evidence behave consistently.

Validation:

1. Evidence API smoke.
2. Run detail evidence link smoke.
3. Frontend build if UI changes.

## M83 - Data Source Domain v1 Completion

Status: Done

Goal:

Turn Data Sources from a mostly placeholder page into a coherent AlphaTrace domain for static seed, Bocha, market data seed, and future professional providers.

Scope:

1. Ensure API/page no longer white-screens.
2. Show provider status, last update, supported asset types, and configured state.
3. Do not add real-time market provider yet.

Acceptance:

1. Data Sources page is demo-safe and explains current sources.
2. Bocha and static seed are visible as governed data sources.

Validation:

1. Frontend build.
2. Data source API/page smoke.

## M84 - Frontend Information Architecture and Layout Pass

Status: Done

Goal:

Optimize AlphaTrace frontend presentation, not just correctness: navigation, page hierarchy, cards, diagnostics density, mobile/narrow width behavior, and run-detail readability.

Scope:

1. Review all AlphaTrace pages for hierarchy and empty states.
2. Keep product actions separated from engineering diagnostics.
3. Improve AgentRunDetail layout where tool/evidence/debate/report panels compete for space.
4. Preserve current visual language unless a page is clearly broken.

Acceptance:

1. Demo path is readable on desktop and acceptable on narrow screens.
2. AgentRunDetail makes current state, report, evidence, and tools easy to scan.

Validation:

1. `pnpm --dir frontend build`.
2. Page smoke for main routes.

## M85 - Frontend API Contract and Type Safety Pass

Status: Done

Goal:

Reduce frontend/backend contract drift by reviewing entity API adapters, endpoint constants, model mapping, mock/real mode parity, and error handling.

Scope:

1. Audit `frontend/app/entities/*` APIs against backend AlphaTrace endpoints.
2. Normalize status casing and optional fields.
3. Ensure mock mode still exercises compatible shapes.

Acceptance:

1. Real mode and mock mode use compatible frontend models.
2. API errors display actionable details.

Validation:

1. Frontend build.
2. Representative API smoke.

## M86 - Performance and Resource Boundaries

Status: Done

Goal:

Prevent runtime and frontend observability features from becoming too expensive or noisy as events/chunks grow.

Scope:

1. Review SSE polling/stream closure behavior.
2. Review live-output chunk accumulation and auto-scroll.
3. Review Tool Timeline/Event Stream rendering with large event counts.
4. Review backend runner concurrency/timeout knobs.

Acceptance:

1. Large runs remain usable and do not freeze the page.
2. Backend avoids unbounded event/chunk growth where simple limits are enough.

Validation:

1. Frontend build if UI changes.
2. Native run with high event count remains viewable.

## M87 - Test Harness and Regression Scripts

Status: Done

Goal:

Move repeated manual smoke commands into safe, reviewable scripts or documented command packs without hiding failures.

Scope:

1. Add non-destructive smoke helpers only if they do not require secrets.
2. Keep commands readable and PowerShell-friendly.
3. Do not create a full startup automation unless explicitly chosen later.

Acceptance:

1. A new engineer can run health/config/runtime/domain smoke without reconstructing commands from chat history.

Validation:

1. Dry-run or execute smoke helpers.
2. No secret output.

## M88 - MySQL Schema and Migration Hardening

Status: Done

Goal:

Prepare MySQL schema/migration handling for longer-term use without destructive changes.

Scope:

1. Snapshot current AlphaTrace tables and indexes.
2. Identify missing indexes for run/events/evidence/decision queries.
3. Document migration plan before modifying tables.

Acceptance:

1. Schema risks and needed indexes are known.
2. No destructive migration is run without explicit milestone.

Validation:

1. Safe schema-only MySQL queries.
2. API smoke after any non-destructive schema initializer change.

## M89 - Security and Secrets Handling Review

Status: Done

Goal:

Review API key handling, logs, frontend payloads, Settings behavior, and documentation for accidental secret exposure.

Scope:

1. Confirm keys are never returned in plaintext.
2. Confirm logs and validation reports do not print keys.
3. Confirm Bocha/Qwen/DashScope save/validate flow is backend-only.

Acceptance:

1. No raw API key appears in frontend responses, docs, or logs generated by validation.

Validation:

1. Safe profile/tools/status smoke.
2. Search recent docs/logs for obvious secret labels without printing secret values.

## M90 - Legacy Boundary and AlphaTrace-only Startup Implementation Decision

Status: Done

Goal:

Decide whether to implement the AlphaTrace-only backend startup profile now, based on demo/validation pain caused by legacy BTC/Hyperliquid noise.

Scope:

1. Re-evaluate existing env gates.
2. If implementation is chosen, keep it env-guarded and reversible.
3. Do not delete legacy services.

Acceptance:

1. Clear decision: implement now, defer, or document as operator runbook only.

Validation:

1. If implemented: backend py_compile, startup smoke with legacy disabled, startup smoke with default unchanged.
2. If deferred: documentation-only.

## M91 - Release Readiness and Commit Grouping

Status: Done

Goal:

Make the broad worktree reviewable and prepare safe commit groups.

Scope:

1. Group changes by backend runtime, stores, frontend UX, docs, integrations, config.
2. Identify generated/transient artifacts.
3. Do not commit unless explicitly requested.

Acceptance:

1. Reviewer can understand and stage changes by logical group.

Validation:

1. `git status --short`.
2. `git diff --stat`.

## M92 - Full-Stack Optimization Closure

Status: Done

Goal:

Close the full-stack optimization cycle with validation results, known limits, and next recommended strategic track.

Scope:

1. Summarize M79-M91 results.
2. Record blockers and non-goals.
3. Recommend next track: production DB migrations, professional data source integration, Native Agent deepening, or frontend product polish.

Acceptance:

1. No hidden failed checks.
2. Next track is explicit and grounded in validation results.

Validation:

1. Final API smoke.
2. Frontend build if any UI changed in this cycle.
3. `git status --short`.


## M93 - Evidence Detail and Source Preview Hardening

Status: Done

Goal:

Make every evidence ID referenced in reports/decision/debate resolvable to useful details, including title, source, summary, URL, provenance, and run usage.

Scope:

1. Check Evidence Center detail resolution for `ev_bocha_*`, static seed, and run-scoped evidence.
2. Improve source URL display and preview fallback where safe.
3. Do not proxy or scrape arbitrary external pages in this milestone.

Acceptance:

1. Clicking a Bocha evidence ID shows non-empty detail and a canonical source URL.
2. If iframe preview cannot load, UI still shows the direct URL and metadata.

Validation:

1. Frontend build if UI changes.
2. Evidence API smoke for representative evidence IDs.
3. Page smoke for `/dashboard#evidence?evidenceId=<id>`.

## M94 - Tool Invocation Contract and UX Hardening

Status: Done

Goal:

Clarify what counts as a tool call in AlphaTrace, how tool inputs/results are stored, and how Tool Calls Timeline should display Native/Qwen/Bocha evidence retrieval.

Scope:

1. Audit runtime event payloads for `tool.called` and `tool.result`.
2. Normalize missing toolName/result summary fields where low-risk.
3. Improve frontend display only if needed.

Acceptance:

1. Tool Calls Timeline explains evidence retrieval, Bocha search, market data/static seed, and model calls clearly.

Validation:

1. Backend py_compile if event mapper changes.
2. Frontend build if UI changes.
3. Run detail smoke for recent Qwen/Native runs.

## M95 - Native Multi-Agent Runner Contract Deepening

Status: Done

Goal:

Harden `alphatrace_native` as the preferred product runner with explicit DAG nodes, dependencies, tool boundaries, and report/decision contracts.

Scope:

1. Review Native runner flow and outputs.
2. Define stable node IDs and event payload requirements.
3. Keep Qwen/TradingAgents behavior unchanged.

Acceptance:

1. Native run emits coherent DAG events and maps cleanly to AgentRunDetail.

Validation:

1. Backend py_compile for changed runner/runtime files.
2. Native submit smoke.
3. Frontend build if types/UI change.

## M96 - TradingAgents Component Reuse Analysis

Status: Done

Goal:

Decide which TradingAgents concepts/components are worth reusing or reimplementing inside AlphaTrace Native Agent, instead of blindly running the whole TradingAgents backend.

Scope:

1. Analyze TradingAgents nodes, prompts, debate flow, risk manager, portfolio manager, and data tools.
2. Map useful ideas into AlphaTrace Native contracts.
3. No source copy and no TradingAgents code modification.

Acceptance:

1. A concrete reuse/rewrite decision matrix exists.

Validation:

1. Documentation-only unless adapter code changes.

## M97 - LangAlpha Useful Module Analysis

Status: Done

Goal:

Identify useful LangAlpha backend/workbench modules or patterns for AlphaTrace without importing LangAlpha as the main backend.

Scope:

1. Review LangAlpha workspace, event buffer, background task, MCP/tool, BYOK, and sandbox architecture.
2. Decide which patterns to borrow for AlphaTrace architecture.
3. Do not copy LangAlpha code.

Acceptance:

1. A concrete pattern adoption matrix exists.

Validation:

1. Documentation-only unless adapter code changes.

## M98 - Frontend Architecture Boundary Cleanup

Status: Done

Goal:

Reduce frontend route/entity/api drift and clarify AlphaTrace-only modules versus legacy Hyper Alpha Arena modules.

Scope:

1. Audit active AlphaTrace pages and entity APIs.
2. Identify unused sync real-mode helpers and duplicated mapping logic.
3. Implement only small safe cleanups.

Acceptance:

1. Active AlphaTrace pages remain stable and less contract drift is documented or fixed.

Validation:

1. `pnpm --dir frontend build`.
2. Page smoke for key routes.

## M99 - Backend Architecture Boundary Cleanup

Status: Done

Goal:

Clarify backend AlphaTrace domains/runtime/integrations boundary and identify low-risk cleanup points.

Scope:

1. Audit routers/services/stores/integrations.
2. Identify duplicated seed/store access patterns.
3. Implement only small safe cleanup if clear.

Acceptance:

1. Backend module ownership is clearer and no legacy runtime dependency leaks into AlphaTrace domains.

Validation:

1. Backend py_compile for changed Python files.
2. Runtime smoke helper.

## M100 - Long-Run Closure and Next Strategic Batch

Status: Done

Goal:

Close M93-M99 with validation, known limits, and a next-batch recommendation.

Scope:

1. Summarize changes and validation.
2. Record blockers.
3. Recommend next 8-hour batch.

Acceptance:

1. No hidden failed checks.
2. Next strategic track is explicit.

Validation:

1. Runtime smoke helper.
2. Frontend build if UI changed in M93-M99.
3. `git status --short`.

## M101 - Tool Registry Service Contract

Status: Done

Goal:

Define and begin centralizing AlphaTrace tool metadata so model/tool calls are auditable and not just ad-hoc event payloads.

Scope:

1. Document canonical tool IDs, sources, auth mode, timeout, and output class.
2. Add a small backend registry if low-risk.
3. Keep existing Bocha/Qwen/market/evidence behavior compatible.

Acceptance:

1. Tool calls can be mapped to a known contract without exposing provider raw payloads.

Validation:

1. Backend py_compile if Python registry is added.
2. Runtime smoke helper.

## M102 - Agent Artifact Model Design

Status: Done

Goal:

Define how future generated files, charts, tables, webpages, and tool artifacts should attach to AgentRun without overloading Evidence or Reports.

Scope:

1. Document `AgentArtifact` candidate schema.
2. Decide relationship to Tool Calls, Reports, Evidence, and MySQL.
3. Do not implement storage unless a very small placeholder is safe.

Acceptance:

1. Artifact boundaries are clear before adding richer tool outputs.

Validation:

1. Documentation-only unless code changes.

## M103 - Native Research Manager Node

Status: Done

Goal:

Deepen AlphaTrace Native DAG with a bounded Research Manager aggregation step between Bull/Bear and Risk Review.

Scope:

1. Add or design `research_manager` node after Bull/Bear.
2. Keep existing frontend compatible.
3. Keep Qwen/TradingAgents behavior stable.

Acceptance:

1. New Native runs can emit a coherent research manager event/report or documented design if implementation risk is too high.

Validation:

1. Backend py_compile if runner changes.
2. Native submit smoke if implemented.
3. Runtime smoke helper.

## M104 - Native Risk Sub-Perspective Design

Status: Done

Goal:

Design how aggressive/neutral/conservative risk perspectives inspired by TradingAgents should fit AlphaTrace Native without copying TradingAgents code.

Scope:

1. Define sub-perspective report sections and event mapping.
2. Keep top-level UI stable.
3. Do not add costly extra model calls unless explicitly bounded.

Acceptance:

1. Risk sub-perspective path is documented and ready for implementation.

Validation:

1. Documentation-only unless code changes.

## M105 - Runtime Event Contract Validator

Status: Done

Goal:

Add lightweight validation for AlphaTrace runtime event payloads so missing `stepId/progress/toolName` can be detected early.

Scope:

1. Validate Native/Qwen emitted events in backend helper or smoke script.
2. Emit warnings or test failures, not production crashes.
3. Keep existing runs readable.

Acceptance:

1. New runtime smoke can detect incomplete event payloads for critical event types.

Validation:

1. Backend py_compile or script smoke as applicable.
2. Runtime smoke helper.

## M106 - Route/API Smoke Script Expansion

Status: Done

Goal:

Make page/API smoke repeatable from scripts instead of ad-hoc PowerShell snippets.

Scope:

1. Extend or add script for hash route smoke.
2. Include canonical AlphaTrace routes and aliases.
3. Keep script non-destructive by default.

Acceptance:

1. A single command verifies key page routes return HTTP 200.

Validation:

1. Run the new/updated script.

## M107 - MySQL Config and Store Health Endpoint

Status: Done

Goal:

Expose safe AlphaTrace store/config health without leaking secrets.

Scope:

1. Add/read a safe endpoint or documented smoke query for MySQL store status.
2. Include AgentRunStore and system config health.
3. Never return raw secrets.

Acceptance:

1. Operators can tell if MySQL-backed AlphaTrace stores are available.

Validation:

1. Backend py_compile if endpoint changes.
2. API smoke.
3. Runtime smoke helper.

## M108 - Next-Batch Closure

Status: Done

Goal:

Close M101-M107 with validation, dirty worktree grouping, and the next grounded execution track.

Scope:

1. Summarize changes and validation.
2. Record blockers and risks.
3. Recommend next batch.

Acceptance:

1. No hidden failed checks; next work is explicit.

Validation:

1. Runtime smoke helper.
2. Frontend build if frontend changed.
3. `git status --short`.

## M109 - Final Mapper Event Contract Cleanup

Status: Done

Goal:

Reduce runtime event contract warnings by making final mapper events carry stable `stepId`, `progress`, and contract metadata where applicable.

Scope:

1. Update Qwen/Native final mapping helper events to use `_step_payload(...)`.
2. Preserve existing event types and frontend compatibility.
3. Keep historical runs readable.

Acceptance:

1. New Native run validator returns 0 violations and materially fewer legacy mapper warnings.

Validation:

1. Backend py_compile for runner files.
2. Native submit smoke.
3. Runtime event contract validator.
4. Runtime smoke helper.

## M110 - AgentRunDetail Research Manager UI Compatibility

Status: Done

Goal:

Make AgentRunDetail display the `research_manager` node/report coherently without a major layout rewrite.

Scope:

1. Ensure progress mapper recognizes `research_manager`.
2. Show Research Manager report section if present.
3. Keep Bull/Bear debate readability.
4. Aggregate streaming chunks in Agent Timeline so users see phase-level decision events rather than one row per chunk.

Acceptance:

1. Completed Native runs with Research Manager can be inspected in AgentRunDetail without orphaned report/step labels.
2. Agent Timeline uses aggregated timeline items while raw chunk events remain available in Runtime Event Stream.

Validation:

1. Frontend build.
2. Route smoke for latest Native run page.
3. Runtime smoke.

## M111 - Evidence Detail Traceability for Bocha and Run Evidence

Status: Completed

Goal:

Ensure `ev_bocha_*` and run-scoped evidence IDs open to useful evidence details including title, source, summary, URL, and run usage.

Scope:

1. Backend/frontend traceability checks for Bocha evidence.
2. Preserve static evidence and mock mode.
3. URL is canonical; iframe preview remains best-effort.

Acceptance:

1. Evidence IDs cited in reports/decision can be resolved to meaningful detail data.

Validation:

1. Backend py_compile if routes/stores change.
2. Frontend build if UI changes.
3. Evidence detail API/page smoke.

## M112 - Tool Invocation Detail UX

Status: Completed

Goal:

Make tool calls auditable from AgentRunDetail by exposing tool contract, source, query, args, result summary, and related evidence/artifacts.

Scope:

1. Improve display only if backend payload already contains data.
2. Do not expose secrets.
3. Keep Tool Calls Timeline compact.

Acceptance:

1. User can tell what tool was called, why, with what query/source, and what evidence/report it produced.

Validation:

1. Frontend build.
2. Route smoke for latest Native run page.

## M113 - Native Risk Sub-Perspective Implementation

Status: In Progress - implemented; runtime validation pending safe restart/no active run

Goal:

Implement the M104 Conservative/Neutral/Aggressive risk perspective design inside one bounded Risk Review call.

Scope:

1. Update risk prompt and parser.
2. Emit additive `riskPerspective` events when available.
3. Do not add three extra model calls.

Acceptance:

1. New Native run Risk Review report includes the three perspectives or a clear fallback.

Validation:

1. Backend py_compile.
2. Native submit smoke.
3. Runtime validator and runtime smoke.

## M114 - Native Tool Execution Boundary Pass

Status: Pending

Goal:

Clarify and harden the difference between real backend tools, model-only reasoning, and future tool adapters.

Scope:

1. Review Evidence/Bocha/market/portfolio tool events.
2. Ensure tool calls only describe actual backend actions.
3. Document model-only sections separately from tools.

Acceptance:

1. Tool timeline no longer implies a model-internal claim was an external tool call.

Validation:

1. Backend py_compile if payload code changes.
2. Runtime validator and runtime smoke.

## M115 - MySQL Persistence Roundtrip Smoke

Status: Pending

Goal:

Add a non-destructive smoke for MySQL runtime/config persistence integrity.

Scope:

1. Verify read path for latest run/events/reports/evidence/decision.
2. Verify system config availability flags.
3. Do not mutate secrets.

Acceptance:

1. One script can confirm MySQL-backed runtime/config health after restart.

Validation:

1. Run new smoke script against `http://127.0.0.1:8805/api`.
2. Runtime smoke helper.

## M116 - Full-Stack Closure and Build

Status: Pending

Goal:

Close M109-M115 with build/smoke/status documentation.

Scope:

1. Run frontend build if any frontend changed.
2. Run route/runtime smokes.
3. Update implementation log and next recommendations.

Acceptance:

1. Current state is reviewable and next stage is explicit.

Validation:

1. `git status --short`.
2. Runtime smoke helper.
3. Route smoke helper.

## M117 - Backend Architecture Boundary Audit

Status: Completed

Goal:

Make AlphaTrace Core / Integration / PoC Runner / Legacy / Shared Infrastructure boundaries explicit before larger backend refactors.

Scope:

1. Classify current API, service, runtime, store, integration, and legacy modules.
2. Identify refactor pain points and non-goals.
3. Do not move runtime code in this milestone.

Acceptance:

1. Boundary document exists and can guide future implementation.
2. Legacy BTC/Hyperliquid/Binance modules are clearly not AlphaTrace core.
3. TradingAgents/LangAlpha remain adapter/reference paths.

Validation:

1. Documentation review.
2. No business runtime code changed.

## M118 - Integration Abstraction Layer Design

Status: Completed

Goal:

Define common contracts for data providers, model providers, tool adapters, external workbenches, and async task execution.

Scope:

1. Add design documentation.
2. Add additive interface skeletons only.
3. Do not rewire Bocha/Qwen/TradingAgents yet.

Acceptance:

1. Future components know which interface to implement.
2. Provider-specific details remain behind AlphaTrace contracts.
3. Code skeleton py_compile passes.

Validation:

1. `python -m py_compile backend/services/integration_adapters/base.py backend/services/async_tasks/base.py backend/services/agent_orchestrator/base.py`.

## M119 - Orchestration / LangGraph / TradingAgents / LangAlpha Boundary Model

Status: Completed

Goal:

Define how AlphaTrace Native, TradingAgents LangGraph, and LangAlpha external workbench orchestration compare and map into AgentRun events.

Scope:

1. Use `OrchestrationPlan` / `OrchestrationStep` as AlphaTrace-native logical DAG contract.
2. Do not expose TradingAgents or LangAlpha internal state to the frontend.
3. Identify future mapper work.

Acceptance:

1. Native DAG, TradingAgents graph, and LangAlpha subagent/workspace flows can be compared through one vocabulary.

Validation:

1. Documentation review.
2. py_compile if any orchestration code changes.

## M120 - Async Task Manager and Scheduler Design Pass

Status: Completed

Goal:

Move from ad hoc background threads/subprocesses toward a single task status vocabulary and future durable worker boundary.

Scope:

1. Define task status machine, cancellation, timeout, retry, and error reason model.
2. Keep current in-process/subprocess implementation unchanged unless small diagnostics are needed.
3. MySQL durable task table remains design unless explicitly implemented later.

Acceptance:

1. Future worker implementation has a concrete contract and migration path.

Validation:

1. Documentation review.
2. py_compile if code changes.

## M121 - Data API Management Layer Design

Status: Completed

Goal:

Define how AlphaTrace will manage Bocha, static seeds, future professional data APIs, market data, file/doc corpus, and MCP-like tools.

Scope:

1. Align DataSource catalog, EvidenceRetriever, MarketDataStore, and Bocha integration.
2. Define provider health, auth mode, timeout, retry, evidence/artifact mapping.
3. Do not connect new external providers.

Acceptance:

1. Future ETF/fund/index/professional data providers have a clear adapter contract.

Validation:

1. Documentation review.
2. API smoke if data source endpoints change.

## M122 - LangAlpha Reusable Module Inventory Refresh

Status: Completed

Goal:

Capture which LangAlpha modules/patterns should be referenced, reimplemented, adapted externally, or ignored.

Scope:

1. Use local git objects / GitHub README because local LangAlpha worktree is not clean.
2. Do not copy LangAlpha code.
3. Do not run LangAlpha service.

Acceptance:

1. LangAlpha useful modules are represented in the component strategy document.
2. Adapter boundary remains external-service-first.

Validation:

1. Documentation review.

## M123 - LangAlpha External Adapter Design

Status: Completed

Goal:

Turn LangAlpha from architecture reference into a future external service adapter plan.

Scope:

1. Define AlphaTrace submit -> LangAlpha workspace/thread/task -> LangAlpha events/artifacts -> AlphaTrace schema mapping.
2. Keep runnerType=langalpha disabled.
3. Do not import or execute LangAlpha.

Acceptance:

1. Future implementation can be scoped without destabilizing AlphaTrace backend.

Validation:

1. Documentation review.
2. py_compile if `langalpha_adapter.py` changes.

## M124 - TradingAgents Component Selection Plan

Status: Completed

Goal:

Decide which TradingAgents pieces to learn from or map, instead of treating the whole project as the product backend.

Scope:

1. Identify DAG/debate/risk/portfolio manager/checkpoint/tool boundaries.
2. Keep TradingAgents PoC opt-in.
3. Do not copy TradingAgents source.

Acceptance:

1. Component selection strategy document exists.

Validation:

1. Documentation review.

## M125 - Initial Abstraction Skeleton

Status: Completed

Goal:

Add minimal additive Python protocol/dataclass skeletons for integration adapters, async tasks, and orchestrator plans.

Scope:

1. Add `integration_adapters` protocols.
2. Add `async_tasks` protocols.
3. Add `agent_orchestrator.base` plan/step protocols.
4. Do not change runtime wiring.

Acceptance:

1. Skeleton compiles and does not affect current runtime behavior.

Validation:

1. `python -m py_compile backend/services/integration_adapters/base.py backend/services/integration_adapters/__init__.py backend/services/async_tasks/base.py backend/services/async_tasks/__init__.py backend/services/agent_orchestrator/base.py`.

## M126 - Architecture Review and Next Refactor Queue

Status: Completed

Goal:

Close the first architecture-refactor batch and choose the next implementation slice without relying on chat memory.

Scope:

1. Update architecture docs/logs.
2. Run compile validation for new abstraction files.
3. Capture next steps for Qwen extraction, Bocha adapter conversion, Native orchestrator extraction, and async task persistence.

Acceptance:

1. Current abstraction layer is reviewable and next refactor queue is explicit.

Validation:

1. py_compile for new backend abstraction files.
2. `git status --short`.




## M127 - Runtime Tool Catalog Endpoint

Status: Completed

Goal:

Expose backend tool contracts through AlphaTrace API so UI/diagnostics can identify actual backend tools without hardcoding every contract in frontend code.

Scope:

1. Reuse existing `agent_tool_registry.py`.
2. Add read-only `/api/alpha-trace/agent-runs/runtime/tools` endpoint.
3. Do not change runner execution or tool invocation behavior.

Acceptance:

1. Tool contracts list includes evidence, Bocha, market context, portfolio context, and Qwen model-call boundaries.
2. Endpoint does not expose secrets.

Validation:

1. `python -m py_compile backend/api/alpha_trace_agent_runtime_routes.py backend/services/agent_tool_registry.py`.
2. Runtime API smoke after backend reload/restart window.

## M128 - Bocha DataProviderAdapter Wrapper

Status: Completed

Goal:

Represent Bocha Web Search behind the new `DataProviderAdapter` abstraction while preserving existing EvidenceRetriever behavior.

Scope:

1. Add adapter wrapper around existing `ExternalEvidenceSearch`.
2. Provide capability, health, and query methods.
3. Do not rewire Qwen/Native runner yet.

Acceptance:

1. Adapter compiles and can be imported.
2. Existing Bocha/EvidenceRetriever behavior remains unchanged.

Validation:

1. `python -m py_compile backend/services/integration_adapters/bocha_adapter.py backend/services/integration_adapters/__init__.py`.

## M129 - Static Market Data ProviderAdapter Wrapper

Status: Completed

Goal:

Represent AlphaTrace static ETF/fund/index/future market data behind the new `DataProviderAdapter` abstraction.

Scope:

1. Add adapter wrapper around existing `StaticAlphaTraceMarketDataStore`.
2. Support market context, quote, snapshot, indicators, and klines query shapes.
3. Do not rewire existing market data APIs or runner context loading yet.

Acceptance:

1. Adapter compiles and can be imported.
2. Existing market data behavior remains unchanged.

Validation:

1. `python -m py_compile backend/services/integration_adapters/market_data_adapter.py backend/services/integration_adapters/__init__.py`.

## M130 - Qwen ModelProviderAdapter Boundary

Status: Completed

Goal:

Add a Qwen/DashScope model provider adapter boundary so model invocation can later be extracted from runner orchestration.

Scope:

1. Add additive `QwenModelProviderAdapter`.
2. Support health and non-streaming invoke shape.
3. Keep current QwenRunner streaming path unchanged.

Acceptance:

1. Adapter compiles and can be imported.
2. Existing QwenRunner behavior remains unchanged.

Validation:

1. `python -m py_compile backend/services/integration_adapters/qwen_model_adapter.py backend/services/integration_adapters/__init__.py`.

## M131 - AlphaTrace Native OrchestrationPlan Builder

Status: Completed

Goal:

Make the Native DAG explicit through an `OrchestrationPlan` builder before extracting execution from QwenRunner.

Scope:

1. Add plan builder for single asset and portfolio diagnosis logical flows.
2. Do not change runtime execution.
3. Keep frontend schema unchanged.

Acceptance:

1. Plan builder compiles and describes Evidence Retrieval -> Market/Portfolio Overview -> Bull/Bear -> Research Manager -> Risk Review -> Final Decision.

Validation:

1. `python -m py_compile backend/services/agent_orchestrator/native_plan.py backend/services/agent_orchestrator/base.py`.

## M132 - Native OrchestrationPlan Diagnostics Endpoint

Status: Completed

Goal:

Expose the AlphaTrace Native logical DAG through a read-only API endpoint for future Agent Flow UI and validation tooling.

Scope:

1. Add `GET /api/alpha-trace/agent-runs/runners/plans/alphatrace-native`.
2. Return `OrchestrationPlan` as dataclass payload.
3. Do not change live runner execution.

Acceptance:

1. Endpoint can describe single asset and portfolio diagnosis native plans.
2. The response clearly states it is a logical plan, not a live snapshot.

Validation:

1. `python -m py_compile backend/api/alpha_trace_agent_runtime_routes.py backend/services/agent_orchestrator/native_plan.py`.
2. Runtime API smoke after backend reload/restart window.

## M133 - AgentArtifact Contract Skeleton

Status: Completed

Goal:

Define the product-facing artifact object needed for future LangAlpha, PTC, chart/table/file, and web-preview integrations.

Scope:

1. Add additive dataclass/protocol skeleton.
2. Add design documentation.
3. Do not add store/API yet.

Acceptance:

1. Artifact contract compiles and explains how future tool outputs are separated from reports.

Validation:

1. `python -m py_compile backend/services/agent_artifacts/base.py backend/services/agent_artifacts/__init__.py`.

## M134 - Architecture Refactor Batch Validation and Save Point

Status: Completed

Goal:

Validate M117-M133 and create a scoped save point before deeper runtime refactors.

Scope:

1. Run backend py_compile for changed architecture files.
2. Run diff hygiene checks.
3. Do not include unrelated frontend/settings work.

Acceptance:

1. M117-M133 files compile.
2. Next refactor queue is explicit.

Validation:

1. py_compile passed for scoped backend files.
2. `git diff --check` passed with only CRLF normalization warnings.

## M135 - Runtime Integration Diagnostics Endpoint

Status: Completed

Goal:

Expose current integration adapter capability and health metadata for Bocha, static market data, and Qwen provider boundaries.

Scope:

1. Add `GET /api/alpha-trace/agent-runs/runtime/integrations`.
2. Improve Qwen provider adapter health to read MySQL system config as well as environment variables.
3. Do not expose raw secrets.
4. Do not change runner execution.

Acceptance:

1. Endpoint reports provider capability and readiness metadata.
2. Qwen health source can reflect `mysql_system_config` when configured there.

Validation:

1. `python -m py_compile backend/api/alpha_trace_agent_runtime_routes.py backend/services/integration_adapters/qwen_model_adapter.py`.
2. Runtime API smoke after backend reload/restart window.

## M136 - Tool Contract Enrichment for TradingAgents Events

Status: Completed

Goal:

Ensure TradingAgents PoC tool events carry the same backend tool contract metadata used by Qwen/Native events.

Scope:

1. Add TradingAgents worker/graph tool contracts to `agent_tool_registry.py`.
2. Enrich TradingAgents adapter events with `toolContract` when `toolName` is known.
3. Do not change TradingAgents execution behavior.

Acceptance:

1. TradingAgents `tool.called` / `tool.result` payloads can be interpreted by the same Tool Calls Timeline contract display.

Validation:

1. `python -m py_compile backend/services/agent_tool_registry.py backend/services/agent_runners/tradingagents_adapter.py`.

## M137 - IntegrationAdapterRegistry

Status: Completed

Goal:

Move integration diagnostics from API-local adapter construction into a reusable registry boundary.

Scope:

1. Add `IntegrationAdapterRegistry` and default registry builder.
2. Update runtime integrations endpoint to use the registry.
3. Do not change provider invocation behavior.

Acceptance:

1. API layer no longer needs to know every adapter class directly.
2. Registry diagnostics fail per-adapter instead of failing the whole endpoint.

Validation:

1. `python -m py_compile backend/services/integration_adapters/registry.py backend/services/integration_adapters/__init__.py backend/api/alpha_trace_agent_runtime_routes.py`.

## M138 - Integration Registry Local Smoke

Status: Completed

Goal:

Validate the default integration registry without requiring a running FastAPI server.

Scope:

1. Instantiate default registry through local Python with `PYTHONPATH=backend`.
2. Confirm Bocha, static market data, and Qwen adapters are listed.
3. Confirm diagnostics do not include obvious secret markers.

Acceptance:

1. Smoke prints three integrations and exits successfully.

Validation:

1. Local Python smoke passed.

## M139 - MySQL AsyncTaskStore Skeleton

Status: Completed

Goal:

Add a durable MySQL task snapshot store skeleton for future AgentRun scheduler, cancellation, retry, and timeout management.

Scope:

1. Add `alpha_trace_async_tasks` table definition in a store class.
2. Add save/get/list/update/cancellation-request helpers.
3. Do not wire submit flow through this store yet.

Acceptance:

1. Store compiles and can be instantiated in a future runtime smoke.
2. No existing AgentRun behavior changes.

Validation:

1. `python -m py_compile backend/services/async_tasks/mysql_store.py backend/services/async_tasks/__init__.py`.

## M140 - AsyncTask Diagnostics Endpoint

Status: Completed

Goal:

Expose a read-only diagnostics endpoint for future async task snapshots.

Scope:

1. Add `GET /api/alpha-trace/agent-runs/runtime/tasks`.
2. Query MySQL async task store if available.
3. Return safe empty/error diagnostics if store is unavailable.
4. Do not wire submit flow to async task store yet.

Acceptance:

1. Endpoint is safe even before task snapshots are written.

Validation:

1. `python -m py_compile backend/api/alpha_trace_agent_runtime_routes.py backend/services/async_tasks/mysql_store.py`.
2. Runtime API smoke after backend reload/restart window.

## M141 - Evidence Retrieve ToolAdapter

Status: Completed

Goal:

Wrap `evidence.retrieve` behind `ToolAdapter` so future orchestrators can invoke evidence retrieval through a governed tool boundary.

Scope:

1. Add `EvidenceRetrieveToolAdapter`.
2. Register it in default integration registry.
3. Do not replace current runner calls yet.

Acceptance:

1. Adapter can retrieve static evidence when invoked directly.

Validation:

1. `python -m py_compile backend/services/integration_adapters/tool_adapters.py backend/services/integration_adapters/registry.py`.

## M142 - Market Context ToolAdapter

Status: Completed

Goal:

Wrap `market.context.load` behind `ToolAdapter` so future orchestrators can invoke market context through a governed tool boundary.

Scope:

1. Add `MarketContextToolAdapter`.
2. Register it in default integration registry.
3. Do not replace current runner calls yet.

Acceptance:

1. Adapter can load static market context when invoked directly.

Validation:

1. `python -m py_compile backend/services/integration_adapters/tool_adapters.py backend/services/integration_adapters/registry.py`.

## M143 - ToolExecutor Event Payload Helper

Status: Completed

Goal:

Centralize `tool.called` / `tool.result` payload construction so future runner refactors do not hand-code divergent tool event shapes.

Scope:

1. Add `ToolExecutor` and `ToolExecutionRecord`.
2. Generate called/result payloads with `toolContract`, timing, evidence IDs, artifact IDs, and result payload.
3. Do not wire current runners yet.

Acceptance:

1. ToolExecutor compiles and can execute ToolAdapters in local smoke.

Validation:

1. `python -m py_compile backend/services/agent_orchestrator/tool_executor.py`.

## M144 - Feature-Flagged Market Context ToolAdapter Path

Status: Completed

Goal:

Add a safe migration point for Qwen/Native market context loading through `ToolAdapter` and `ToolExecutor`.

Scope:

1. Add `ALPHATRACE_USE_TOOL_ADAPTERS=true` gated path for `market.context.load`.
2. Default behavior remains unchanged when the flag is absent/false.
3. Do not migrate evidence retrieval yet.

Acceptance:

1. `qwen_runner.py` compiles.
2. Default runtime behavior is unchanged.

Validation:

1. `python -m py_compile backend/services/agent_runners/qwen_runner.py backend/services/agent_orchestrator/tool_executor.py backend/services/integration_adapters/tool_adapters.py`.

## M145 - Feature-Flagged Evidence Retrieve ToolAdapter Path

Status: Completed

Goal:

Add a safe migration point for Qwen/Native evidence retrieval through `ToolAdapter` and `ToolExecutor`.

Scope:

1. Add `ALPHATRACE_USE_TOOL_ADAPTERS=true` gated path for `evidence.retrieve`.
2. Default behavior remains unchanged when the flag is absent/false.
3. Preserve fallback behavior if adapter invocation fails.

Acceptance:

1. `qwen_runner.py` compiles.
2. Default runtime behavior is unchanged.

Validation:

1. `python -m py_compile backend/services/agent_runners/qwen_runner.py backend/services/integration_adapters/tool_adapters.py backend/services/agent_orchestrator/tool_executor.py`.

## M146 - Backend Abstraction Smoke Script

Status: Completed

Goal:

Create a repeatable validation script for the new integration/orchestration/task/artifact abstraction layer.

Scope:

1. Add `scripts/alphatrace/smoke_backend_abstractions.ps1`.
2. Script runs py_compile and local registry/tool adapter smoke.
3. Script does not start services or mutate runtime data.

Acceptance:

1. Script passes locally.

Validation:

1. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_backend_abstractions.ps1`.

## M147 - Frontend Boundary Audit

Status: Completed

Goal:

Define AlphaTrace frontend boundaries so backend adapters and external runtimes do not leak internal state into page components.

Scope:

1. Audit frontend directory roles.
2. Identify page/entity/shared boundaries.
3. Define future AgentRunDetail decomposition targets.

Acceptance:

1. `docs/engineering/68_frontend_boundary_audit.md` exists.

Validation:

1. Documentation review.

## M148 - Frontend API Client Abstraction Plan

Status: Completed

Goal:

Plan frontend API methods for runtime tools, integrations, tasks, and Native orchestration plans.

Scope:

1. Define future `agent/api.ts` surface.
2. Preserve mock mode and error-detail rules.
3. Do not modify frontend code in this milestone.

Acceptance:

1. `docs/engineering/69_frontend_api_client_abstraction_plan.md` exists.

Validation:

1. Documentation review.

## M149 - Runtime Config Facade

Status: Completed

Goal:

Centralize sanitized runtime configuration diagnostics for Qwen, Bocha, TradingAgents, and LangAlpha.

Scope:

1. Add backend `RuntimeConfigFacade` as the single read-only status resolver.
2. Add `/api/alpha-trace/agent-runs/runtime/config`.
3. Make `/runners/status` use the facade without changing runner behavior.
4. Do not expose raw or encrypted secrets.

Acceptance:

1. Backend py_compile passes.
2. Local smoke returns qwen/bocha/tradingagents/langalpha statuses without secret markers.
3. Existing runner status response remains backward compatible with additive `runtimeConfig` field.

Validation:

1. `python -m py_compile backend/services/runtime_config/facade.py backend/services/runtime_config/__init__.py backend/api/alpha_trace_agent_runtime_routes.py`.
2. Local Python smoke for `get_runtime_config_facade().snapshot()`.

Rollback:

Remove the facade and route additions; restore `/runners/status` local config checks.

## M150 - In-Process Async Task Scheduler Boundary

Status: Completed

Goal:

Add a minimal scheduler abstraction for future AgentRun worker migration without changing current submit behavior.

Scope:

1. Add `MemoryAsyncTaskStore` for local smoke/fallback.
2. Add `InProcessAsyncTaskScheduler` with `submit`, `submit_callable`, `get`, and `cancel`.
3. Persist completed/failed/timed_out/cancelled snapshots through the store boundary.
4. Do not wire this into `/submit` yet.

Acceptance:

1. Backend py_compile passes.
2. Local smoke completes one callable and records one failed callable.
3. Existing AgentRun runtime behavior remains unchanged.

Validation:

1. `python -m py_compile backend/services/async_tasks/base.py backend/services/async_tasks/memory_store.py backend/services/async_tasks/in_process_scheduler.py backend/services/async_tasks/__init__.py`.
2. Local Python smoke for completed and failed in-process tasks.

Rollback:

Remove the scheduler/memory store files and exports. Current AgentRun submit remains unaffected.

## M151 - AgentRun TaskSpec Factory

Status: Completed

Goal:

Map AlphaTrace submit requests into scheduler-neutral `AsyncTaskSpec` records for future worker migration.

Scope:

1. Add `build_agent_run_task_spec`.
2. Preserve AlphaTrace request metadata without storing provider secrets.
3. Derive runner/task tags, timeout, and max attempts.
4. Do not wire the factory into `/submit` yet.

Acceptance:

1. Backend py_compile passes.
2. Local smoke builds a TradingAgents task spec and redacts accidental key-like extra params.
3. Current AgentRun submit behavior remains unchanged.

Validation:

1. `python -m py_compile backend/services/agent_orchestrator/task_spec_factory.py`.
2. Local Python smoke for `build_agent_run_task_spec`.

Rollback:

Remove `task_spec_factory.py`. Current runtime behavior remains unaffected.

## M152 - Optional AgentRun Submit Task Snapshot Recording

Status: Completed

Goal:

Add a default-off bridge from current AgentRun submit flow to `AsyncTaskStore` diagnostics.

Scope:

1. Build `AsyncTaskSpec` after runner submit returns a `runId`.
2. When `ALPHATRACE_RECORD_ASYNC_TASKS=true` and async task store is MySQL, persist a task snapshot.
3. Never fail submit if task diagnostics are unavailable.
4. Keep default runtime behavior unchanged.

Acceptance:

1. Backend py_compile passes.
2. Default behavior is unchanged when `ALPHATRACE_RECORD_ASYNC_TASKS` is unset.
3. Diagnostic write failures are swallowed so runner submit remains authoritative.

Validation:

1. `python -m py_compile backend/services/alpha_trace_agent_runtime_service.py backend/services/agent_orchestrator/task_spec_factory.py backend/services/async_tasks/mysql_store.py`.

Rollback:

Remove `_record_async_task_snapshot_if_enabled` and the call after runner submit.

## M153 - AlphaTrace Data API Catalog

Status: Completed

Goal:

Create a product-owned catalog for AlphaTrace data API boundaries before adding more external data providers.

Scope:

1. Add `AlphaTraceDataApiCatalog`.
2. Add `GET /api/alpha-trace/data-sources/api-catalog`.
3. Document canonical domains, paths, operations, provider IDs, and store types.
4. Keep legacy BTC/Hyperliquid routes outside the AlphaTrace market-data boundary.

Acceptance:

1. Backend py_compile passes.
2. Local smoke verifies catalog resources include market data and agent runtime.
3. Catalog response contains no key/credential values.

Validation:

1. `python -m py_compile backend/services/data_api/catalog.py backend/services/data_api/__init__.py backend/api/alpha_trace_data_source_routes.py`.
2. Local Python smoke for `get_data_api_catalog().to_response()`.

Rollback:

Remove the catalog module and `/api-catalog` route. Existing data source APIs remain unaffected.

## M154 - Runner Adapter Composition Matrix

Status: Completed

Goal:

Expose a product-facing matrix that explains how Stub, Qwen, AlphaTrace Native, TradingAgents, and LangAlpha compose orchestration, model, data, tool, persistence, streaming, and artifact boundaries.

Scope:

1. Add `AdapterCompositionMatrix` service.
2. Add `GET /api/alpha-trace/agent-runs/runners/adapter-matrix`.
3. Mark TradingAgents as opt-in PoC and LangAlpha as design-only external-service candidate.
4. Do not run or import external projects.

Acceptance:

1. Backend py_compile passes.
2. Local smoke verifies matrix includes qwen, alphatrace_native, tradingagents, and langalpha.
3. Matrix states are descriptive and do not expose external internal state.

Validation:

1. `python -m py_compile backend/services/agent_orchestrator/adapter_matrix.py backend/api/alpha_trace_agent_runtime_routes.py`.
2. Local Python smoke for `get_adapter_composition_matrix().to_response()`.

Rollback:

Remove the matrix service and endpoint. Runner behavior remains unaffected.

## M155 - Runner Flow Catalog

Status: Completed

Goal:

Expose runner flow descriptors for UI/diagnostics without hardcoding flow order in pages or exposing external framework internals.

Scope:

1. Add `AgentFlowCatalog`.
2. Add `GET /api/alpha-trace/agent-runs/runners/flows`.
3. Add `GET /api/alpha-trace/agent-runs/runners/flows/{runner_type}`.
4. Cover stub, qwen, alphatrace_native, tradingagents, and langalpha.

Acceptance:

1. Backend py_compile passes.
2. Local smoke verifies Native/Qwen/TradingAgents/LangAlpha flow descriptors.
3. TradingAgents and LangAlpha flows are descriptive only and do not expose internal runtime state.

Validation:

1. `python -m py_compile backend/services/agent_orchestrator/flow_catalog.py backend/api/alpha_trace_agent_runtime_routes.py`.
2. Local Python smoke for `get_agent_flow_catalog().list_flows()`.

Rollback:

Remove flow catalog service and endpoints. Existing runner behavior remains unaffected.

## M156 - Abstraction Endpoint Smoke Script

Status: Completed with runtime reload pending

Goal:

Add a repeatable HTTP smoke script for the new abstraction diagnostics endpoints.

Scope:

1. Add `scripts/alphatrace/smoke_abstraction_endpoints.ps1`.
2. Cover runtime config/tools/integrations/tasks, runner status/capabilities/adapter-matrix/flows, and data API catalog.
3. Support `-SkipHttp` for syntax validation when backend reload is not safe.

Acceptance:

1. Script exists and validates endpoint list with `-SkipHttp`.
2. Full HTTP smoke is available for use after backend reload/restart.
3. Current running service failure is recorded if it has not loaded new routes.

Validation:

1. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_abstraction_endpoints.ps1 -SkipHttp`.
2. Optional full HTTP smoke after backend reload.

Rollback:

Remove the script. Runtime behavior remains unaffected.

## M157 - AgentArtifact Store Boundary

Status: Completed

Goal:

Add a product-owned artifact persistence boundary for future LangAlpha/workbench files, tables, charts, web previews, and tool outputs.

Scope:

1. Add memory and MySQL AgentArtifact stores.
2. Add registry with `ALPHA_TRACE_AGENT_ARTIFACT_STORE=memory|mysql`.
3. Add `GET /api/alpha-trace/agent-runs/{run_id}/artifacts`.
4. Do not wire artifact-producing tools yet.

Acceptance:

1. Backend py_compile passes.
2. Local memory store smoke can save/get/list an artifact.
3. Existing runs can return an empty artifact list safely.

Validation:

1. `python -m py_compile backend/services/agent_artifacts/base.py backend/services/agent_artifacts/memory_store.py backend/services/agent_artifacts/mysql_store.py backend/services/agent_artifacts/registry.py backend/services/agent_artifacts/__init__.py backend/api/alpha_trace_agent_runtime_routes.py`.
2. Local Python smoke for `MemoryAgentArtifactStore`.

Rollback:

Remove artifact store files and endpoint. Current reports/evidence/decision behavior remains unaffected.

## M158 - Evidence URL to AgentArtifact Mapper

Status: Completed

Goal:

Map evidence items with canonical source URLs into product-owned `web_url` AgentArtifacts for future preview/detail UI.

Scope:

1. Add `evidence_to_web_artifact`.
2. Add `evidence_list_to_web_artifacts` with de-duplication.
3. Do not fetch or embed external pages in backend.
4. Treat source URL as canonical; iframe/web preview remains best-effort frontend behavior.

Acceptance:

1. Backend py_compile passes.
2. Local smoke maps an `EvidenceReference` with https URL into a `web_url` artifact.
3. Missing or placeholder URLs do not create artifacts.

Validation:

1. `python -m py_compile backend/services/agent_artifacts/evidence_mapper.py backend/services/agent_artifacts/__init__.py`.
2. Local Python smoke for evidence URL artifact mapping.

Rollback:

Remove evidence mapper exports. Artifact store remains unaffected.

## M159 - Optional Evidence URL Artifact Creation

Status: Completed

Goal:

Optionally create `web_url` AgentArtifacts from run evidence with canonical URLs after run outputs are persisted.

Scope:

1. Add default-off `ALPHATRACE_CREATE_EVIDENCE_URL_ARTIFACTS=true` path.
2. Create artifacts after `_STORE.save_evidence` and before decision persistence.
3. Never fail report/evidence/decision persistence if artifact creation fails.
4. Do not fetch external pages.

Acceptance:

1. Backend py_compile passes.
2. Default behavior remains unchanged when the feature flag is unset.
3. Artifact creation failures are isolated.

Validation:

1. `python -m py_compile backend/services/alpha_trace_agent_runtime_service.py backend/services/agent_artifacts/evidence_mapper.py backend/services/agent_artifacts/registry.py`.

Rollback:

Remove `_create_evidence_url_artifacts_if_enabled` and its call from `_update_agent_run_outputs`.

## M160 - Backend Abstraction Smoke Coverage Expansion

Status: Completed

Goal:

Expand the repeatable backend abstraction smoke script to cover newly added runtime config, scheduler, data API, flow, matrix, and artifact boundaries.

Scope:

1. Update `scripts/alphatrace/smoke_backend_abstractions.ps1` compile list.
2. Add local smoke assertions for runtime config, adapter matrix, flow catalog, data API catalog, in-process scheduler, artifact store, and evidence URL mapper.

Acceptance:

1. Script passes locally.
2. New abstraction files are included in py_compile list.
3. Smoke remains network-free and does not require provider keys.

Validation:

1. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_backend_abstractions.ps1`.

Rollback:

Revert script changes. Code modules remain unaffected.

## M161 - Architecture Documentation Sync for New Abstractions

Status: Completed

Goal:

Update canonical architecture documentation to include the new runtime config, async task, data API, adapter matrix, flow catalog, and artifact boundaries.

Scope:

1. Update backend directory roles.
2. Update abstraction layer baseline table.
3. Add architectural rules for external flow descriptors and evidence URL artifacts.

Acceptance:

1. `docs/ARCHITECTURE.md` names the new abstraction modules.
2. No business code changes are required.

Validation:

1. Documentation review.

Rollback:

Revert the architecture doc update.

## M162 - Stale AgentRun Diagnostics

Status: Completed

Goal:

Add read-only diagnostics for AgentRuns that remain running/submitted beyond a threshold.

Scope:

1. Add `find_stale_agent_runs` helper.
2. Add `GET /api/alpha-trace/agent-runs/runtime/stale-runs`.
3. Do not cancel, retry, or mutate runs automatically.

Acceptance:

1. Backend py_compile passes.
2. Local smoke detects an old running run and ignores completed runs.
3. Endpoint is read-only.

Validation:

1. `python -m py_compile backend/services/agent_runtime_health.py backend/api/alpha_trace_agent_runtime_routes.py`.
2. Local Python smoke for `find_stale_agent_runs`.

Rollback:

Remove helper and endpoint. Existing runtime behavior remains unaffected.

## M163 - Qwen Adapter Health Configuration Alignment

Status: Completed

Goal:

Make the Qwen model provider adapter health check use the same runtime configuration facade as Agent Lab runner status and Settings diagnostics.

Scope:

1. Reuse `RuntimeConfigFacade.qwen()` in `QwenModelProviderAdapter.health()`.
2. Do not change the adapter invocation path.
3. Do not expose raw API keys.
4. Do not change QwenRunner behavior.

Acceptance:

1. Backend py_compile passes.
2. Local smoke can call `QwenModelProviderAdapter().health()`.
3. Health status is either `ready` or `missing_config` with a clear source and no raw credential value.

Validation:

1. `python -m py_compile backend/services/integration_adapters/qwen_model_adapter.py backend/services/runtime_config/facade.py`.
2. Local Python smoke for adapter health and credential redaction.

Rollback:

Restore `QwenModelProviderAdapter.health()` to its previous `_resolve_config()`-based implementation. Model invocation remains unaffected either way.

## M164 - Model Provider Catalog Boundary

Status: Completed

Goal:

Create a product-owned catalog for backend model provider boundaries so future Qwen/OpenAI-compatible/TradingAgents/LangAlpha model integration does not remain scattered across runner UI copy.

Scope:

1. Add sanitized model provider descriptors.
2. Include direct providers, runner-owned bridges, external workbench bridges, and planned local providers.
3. Add `GET /api/alpha-trace/agent-runs/runtime/model-providers`.
4. Do not invoke providers and do not expose raw credentials.

Acceptance:

1. Backend py_compile passes.
2. Local smoke verifies Qwen, TradingAgents bridge, and LangAlpha bridge descriptors exist.
3. Backend abstraction smoke script includes the catalog.
4. HTTP endpoint smoke list includes the new endpoint.

Validation:

1. `python -m py_compile backend/services/model_providers/catalog.py backend/services/model_providers/__init__.py backend/api/alpha_trace_agent_runtime_routes.py`.
2. Local Python smoke for `list_model_provider_descriptors()`.
3. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_backend_abstractions.ps1`.
4. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_abstraction_endpoints.ps1 -SkipHttp`.

Rollback:

Remove the catalog package and endpoint. Runner behavior remains unchanged.

## M165 - AgentRun Metrics Snapshot Endpoint

Status: Completed

Goal:

Expose a single-run metrics snapshot so UI and diagnostics do not need to infer token/task statistics from fragmented `metric.updated` timeline events.

Scope:

1. Add a read-only metrics aggregation helper.
2. Add `GET /api/alpha-trace/agent-runs/{run_id}/metrics`.
3. Include run metrics, event counts, agent event counts, latest metric event, and persistence metadata.
4. Do not change Qwen/Native metric update behavior in this milestone.

Acceptance:

1. Backend py_compile passes.
2. Missing run returns `None` at service level and HTTP 404 at route level.
3. Response describes `alpha_trace_agent_run_metrics` as the MySQL mirror when MySQL store is active.

Validation:

1. `python -m py_compile backend/services/agent_runtime_metrics.py backend/api/alpha_trace_agent_runtime_routes.py`.
2. Local smoke for missing-run behavior.

Rollback:

Remove the helper and endpoint. Existing AgentRun metrics and `metric.updated` events remain unchanged.

## M166 - Orchestrator Catalog Boundary

Status: Completed

Goal:

Expose a product-owned orchestrator catalog that distinguishes current inline runner execution, future scheduler execution, subprocess workers, TradingAgents LangGraph PoC, and LangAlpha external service boundaries.

Scope:

1. Add orchestrator descriptors with execution boundary, durable state, supported runners, cancel/retry/event capabilities, and production readiness.
2. Add `GET /api/alpha-trace/agent-runs/runtime/orchestrators`.
3. Include the orchestrator catalog in backend abstraction smoke scripts.
4. Do not replace current submit behavior.

Acceptance:

1. Backend py_compile passes.
2. Local smoke verifies inline, subprocess, TradingAgents, and LangAlpha orchestrator descriptors exist.
3. Backend abstraction smoke script passes.

Validation:

1. `python -m py_compile backend/services/agent_orchestrator/orchestrator_catalog.py backend/api/alpha_trace_agent_runtime_routes.py`.
2. Local Python smoke for `list_orchestrator_descriptors()`.
3. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_backend_abstractions.ps1`.

Rollback:

Remove the catalog package import/endpoint and smoke additions. Runtime behavior remains unchanged.

## M167 - AlphaTrace Runtime Architecture Index

Status: Completed

Goal:

Provide a single backend index of AlphaTrace-owned architecture boundaries for frontend diagnostics and future external component integration.

Scope:

1. Add `get_alphatrace_architecture_index`.
2. Add `GET /api/alpha-trace/agent-runs/runtime/architecture`.
3. Summarize API layer, runtime config, data API catalog, model providers, orchestrators, runner adapters/flows, tools and artifacts.
4. Do not expose TradingAgents or LangAlpha internal state.

Acceptance:

1. Backend py_compile passes.
2. Local smoke verifies key architecture layers exist.
3. Backend abstraction smoke script passes.

Validation:

1. `python -m py_compile backend/services/architecture_index.py backend/api/alpha_trace_agent_runtime_routes.py`.
2. Local Python smoke for `get_alphatrace_architecture_index()`.
3. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_backend_abstractions.ps1`.

Rollback:

Remove architecture index helper and endpoint. Other catalogs remain available.

## M168 - Frontend Runtime Diagnostics API Client Boundary

Status: Completed

Goal:

Add a frontend entity-layer client for AlphaTrace runtime diagnostics endpoints without modifying existing dirty pages.

Scope:

1. Add endpoint constants for runtime architecture, config, model providers, orchestrators, run artifacts and run metrics.
2. Add `frontend/app/entities/runtime/api.ts` with typed fetch helpers.
3. Do not wire page UI in this milestone.
4. Preserve mock mode and existing pages.

Acceptance:

1. Frontend build passes.
2. Runtime API helpers compile.
3. No old business pages are modified by this milestone.

Validation:

1. `pnpm --dir frontend build`.

Rollback:

Remove `frontend/app/entities/runtime/api.ts` and endpoint additions.

## M169 - LangAlpha Reuse Backlog

Status: Completed

Goal:

Document which LangAlpha modules are useful for AlphaTrace and how they should be integrated without embedding LangAlpha as the main backend.

Scope:

1. Inspect sibling `../LangAlpha` via git HEAD because its worktree is currently deleted/empty except `.git`.
2. Identify reusable concepts and non-reusable modules.
3. Produce a concrete backlog for external adapter, PTC mapping, data provider comparison, SSE replay, and workspace/artifact strategy.
4. Do not modify LangAlpha.

Acceptance:

1. Document exists.
2. Document separates design reference, clean-room implementation, and external service adapter paths.
3. TradingAgents and LangAlpha roles are clearly distinguished.

Validation:

1. Read LangAlpha `README.md`, `pyproject.toml`, and tree from `HEAD`.
2. Documentation review.

Rollback:

Remove `docs/engineering/70_langalpha_reuse_backlog.md`.

## M170 - LangAlpha External Workbench Adapter Boundary

Status: Completed

Goal:

Add a design-only LangAlpha external workbench adapter to integration diagnostics without importing or executing LangAlpha.

Scope:

1. Add `LangAlphaExternalWorkbenchAdapter`.
2. Register it in the integration adapter registry.
3. Return disabled/missing/degraded health states.
4. `submit_task` and `fetch_task` return skipped design-only results.

Acceptance:

1. Backend py_compile passes.
2. Integration registry diagnostics include `langalpha_external_workbench`.
3. Backend abstraction smoke passes.

Validation:

1. `python -m py_compile backend/services/integration_adapters/langalpha_workbench_adapter.py backend/services/integration_adapters/registry.py backend/services/integration_adapters/__init__.py`.
2. Local smoke for adapter health and registry diagnostics.
3. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_backend_abstractions.ps1`.

Rollback:

Remove the adapter and registry export. LangAlpha runner stub remains unaffected.

## M171 - ToolResult to AgentArtifact Mapper

Status: Completed

Goal:

Define a pure mapping boundary from backend tool results to product-owned AgentArtifacts.

Scope:

1. Map web result payloads to `web_url` artifacts.
2. Map structured payloads to `json` artifacts.
3. Map long text outputs to `text` artifacts.
4. Do not write artifacts to store in this milestone.

Acceptance:

1. Backend py_compile passes.
2. Local smoke maps Bocha-like tool output to web/json/text artifacts.
3. Backend abstraction smoke script includes the mapper.

Validation:

1. `python -m py_compile backend/services/agent_artifacts/tool_result_mapper.py backend/services/agent_artifacts/__init__.py`.
2. Local smoke for `tool_result_to_artifacts`.
3. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_backend_abstractions.ps1`.

Rollback:

Remove the mapper and exports. Artifact store and evidence mapper remain unaffected.

## M172 - ToolExecutor Artifact Mapping Hook

Status: Completed

Goal:

Let `ToolExecutor` expose mapped AgentArtifacts in execution records and result payloads, with optional default-off persistence.

Scope:

1. Map tool results to artifacts during `ToolExecutor.execute`.
2. Add artifact ids to `tool.result` payload metadata.
3. Persist artifacts only when `ALPHATRACE_PERSIST_TOOL_RESULT_ARTIFACTS=true`.
4. Do not change runner execution paths.

Acceptance:

1. Backend py_compile passes.
2. Local smoke verifies Bocha-like tool output produces artifact ids in result payload.
3. Backend abstraction smoke script passes.

Validation:

1. `python -m py_compile backend/services/agent_orchestrator/tool_executor.py backend/services/agent_artifacts/tool_result_mapper.py`.
2. Local ToolExecutor artifact mapping smoke.
3. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_backend_abstractions.ps1`.

Rollback:

Remove artifact mapping from `ToolExecutor.execute`. The standalone mapper remains usable.

## M173 - Frontend AgentArtifact API Contract

Status: Completed

Goal:

Add frontend runtime API types and helper for AgentArtifact list retrieval.

Scope:

1. Extend `frontend/app/entities/runtime/api.ts` with AgentArtifact types.
2. Add `listAgentRunArtifactsAsync(runId)`.
3. Do not wire pages in this milestone.

Acceptance:

1. Frontend build passes.
2. Artifact types compile and use existing AlphaTrace endpoint constants.

Validation:

1. `pnpm --dir frontend build`.

Rollback:

Remove the added AgentArtifact types and helper.

## M174 - Reusable AgentArtifact Preview Card

Status: Completed

Goal:

Add a reusable frontend UI primitive for rendering AgentArtifact items.

Scope:

1. Add `AgentArtifactPreviewCard`.
2. Support web URL, JSON, text, file/storage URI and generic artifact metadata.
3. Do not wire pages in this milestone.

Acceptance:

1. Frontend build passes.
2. Component compiles without new dependencies.

Validation:

1. `pnpm --dir frontend build`.

Rollback:

Remove `frontend/app/shared/ui/AgentArtifactPreviewCard.tsx`.

## M175 - AgentRun Timeline Compaction Read Model

Status: Completed

Goal:

Add a backend read model that groups noisy runtime events into a readable timeline summary.

Scope:

1. Add `agent_runtime_timeline` service.
2. Compact adjacent `reasoning.chunk` and `metric.updated` events by agent and step.
3. Add `GET /api/alpha-trace/agent-runs/{runId}/timeline-summary`.
4. Do not change raw events, SSE, runner execution, or persistence.

Acceptance:

1. Backend py_compile passes.
2. Local smoke proves adjacent chunk and metric events are grouped.
3. Existing backend abstraction smoke passes.

Validation:

1. `python -m py_compile backend/services/agent_runtime_timeline.py backend/api/alpha_trace_agent_runtime_routes.py`.
2. Local pure-function timeline summary smoke.
3. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_backend_abstractions.ps1`.

Rollback:

Remove `backend/services/agent_runtime_timeline.py` and the timeline-summary route.

## M176 - Frontend Timeline Summary API Contract

Status: Completed

Goal:

Expose the AgentRun timeline summary endpoint through frontend API contracts.

Scope:

1. Add `alphaTraceAgentRunTimelineSummary` endpoint constant.
2. Add `AgentRunTimelineSummary` and `AgentRunTimelineItem` types.
3. Add `getAgentRunTimelineSummaryAsync(runId)`.
4. Do not wire existing pages in this milestone.

Acceptance:

1. Frontend build passes.
2. Timeline summary helper compiles without new dependencies.

Validation:

1. `pnpm --dir frontend build`.

Rollback:

Remove the endpoint constant, types, and helper.

## M177 - AgentArtifact Catalog Contract

Status: Completed

Goal:

Expose a backend catalog that defines artifact renderability, source policy, and safety rules for tool/model/external workbench outputs.

Scope:

1. Add `agent_artifacts.catalog`.
2. Add `GET /api/alpha-trace/agent-runs/runtime/artifacts/catalog`.
3. Include artifact catalog in the runtime architecture index.
4. Update backend abstraction smoke.

Acceptance:

1. Backend py_compile passes.
2. Backend abstraction smoke verifies artifact catalog descriptors and safety policy.
3. No runner execution path changes.

Validation:

1. `python -m py_compile backend/services/agent_artifacts/catalog.py backend/services/agent_artifacts/__init__.py backend/services/architecture_index.py backend/api/alpha_trace_agent_runtime_routes.py`.
2. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_backend_abstractions.ps1`.

Rollback:

Remove the catalog service, route, architecture index entry, and smoke additions.
