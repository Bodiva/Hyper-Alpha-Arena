# AlphaTrace Validation Guide

Last updated: 2026-05-02

This file defines required validation for each milestone in `docs/EXECUTION_PLAN.md`.

## Global Rules

1. Run backend `python -m py_compile` for every changed Python file.
2. Run `cd frontend && pnpm build` for every frontend or shared TypeScript change.
3. Run curl or TestClient smoke tests for every changed API endpoint.
4. Record validation results in `docs/IMPLEMENTATION_LOG.md`.
5. Do not mark a milestone `Done` unless its validation passes or an accepted blocker is recorded.
6. Existing Vite chunk/dynamic import/browserslist warnings are acceptable unless a milestone changes bundling behavior.

## Fixed Regression Checks

Run these when touching Agent Runtime, runner registry, runner adapters, or runtime UI:

1. Stub submit:
   ```bash
   curl -X POST http://127.0.0.1:8802/api/alpha-trace/agent-runs/submit \
     -H "Content-Type: application/json" \
     -d "{\"assetId\":\"asset_etf_510300\",\"taskType\":\"single_asset_analysis\",\"question\":\"stub smoke\",\"runnerConfig\":{\"runnerType\":\"stub\"}}"
   ```
2. TradingAgents disabled submit:
   ```bash
   curl -X POST http://127.0.0.1:8802/api/alpha-trace/agent-runs/submit \
     -H "Content-Type: application/json" \
     -d "{\"assetId\":\"asset_etf_510300\",\"taskType\":\"single_asset_analysis\",\"question\":\"TradingAgents disabled smoke\",\"runnerConfig\":{\"runnerType\":\"tradingagents\"}}"
   ```
   Expected if disabled: HTTP 400 with `TradingAgents runner is not enabled.`
3. Qwen submit when credentials are configured:
   ```bash
   curl -X POST http://127.0.0.1:8802/api/alpha-trace/agent-runs/submit \
     -H "Content-Type: application/json" \
     -d "{\"assetId\":\"asset_etf_510300\",\"taskType\":\"single_asset_analysis\",\"question\":\"请做一次最小投研分析\",\"horizon\":\"medium_term\",\"riskPreference\":\"balanced\",\"runnerConfig\":{\"runnerType\":\"qwen\",\"modelProvider\":\"qwen\",\"modelName\":\"qwen-plus\",\"enableStreaming\":true}}"
   ```
   Expected: immediate `runId`, then completed or clear failed reason.

## M0 - Governance Files

Commands:

`````powershell
Test-Path docs\PROJECT_SPEC.md
Test-Path docs\EXECUTION_PLAN.md
Test-Path docs\IMPLEMENTATION_LOG.md
Test-Path docs\VALIDATION.md
Select-String -Path docs\PROJECT_SPEC.md -Pattern "MySQL 8.0"
Select-String -Path docs\EXECUTION_PLAN.md,docs\VALIDATION.md -Pattern "M0|M1|M2|M3|M4|M5|M6|M7|M8"
```

Acceptance:

1. All paths return true.
2. MySQL target is explicit.
3. Milestone ids M0-M8 exist in both plan and validation docs.

No py_compile or pnpm build is required for M0 because it is documentation-only.

## M1 - TradingAgents / LangGraph Observability Cleanup

Required checks:

1. `python -m py_compile` for changed backend files.
2. `cd frontend && pnpm build` if UI changes.
3. Open a TradingAgents or historical run detail page.
4. Confirm current-run observability is visible without relying on global BTC log lines.
5. Confirm raw backend log is labeled as global if still shown.

Smoke tests:

1. TradingAgents disabled path.
2. Stub runner.
3. Qwen runner if credentials are available.

## M2 - AlphaTrace ETF / Fund / Index Market Data v1

Required checks:

1. Backend py_compile for new market data modules/routes.
2. curl/TestClient:
   - `GET /api/alpha-trace/market-data/assets/asset_etf_510300/quote`
   - `GET /api/alpha-trace/market-data/assets/asset_etf_510300/snapshot`
   - `GET /api/alpha-trace/market-data/assets/asset_etf_510300/klines`
3. If frontend consumes the API, run `cd frontend && pnpm build`.
4. Confirm data source is AlphaTrace static market seed, not legacy Hyperliquid stream.

Acceptance:

1. Responses use AlphaTrace asset ids.
2. No writes to `crypto_klines`.
3. No legacy strategy manager trigger.

## M3 - AgentRunStore MySQL Migration

Required MySQL checks:

1. MySQL 8.0+ is reachable from backend configuration.
2. Schema initialization or migration succeeds.
3. Tables exist for:
   - `alpha_trace_agent_runs`
   - `alpha_trace_runtime_events`
   - `alpha_trace_agent_reports`
   - `alpha_trace_evidence_refs`
   - `alpha_trace_decisions`
4. JSON fallback still works when `ALPHA_TRACE_AGENT_RUN_STORE=json`.

Smoke tests:

1. Submit Stub run with MySQL store.
2. Submit Qwen run with MySQL store when credentials are available.
3. Restart backend and verify run detail/events/reports/evidence/decision still queryable.
4. Verify SSE reads events from MySQL-backed store.

Required commands:

`````powershell
python -m py_compile backend/services/alpha_trace_agent_runtime_service.py
python -m py_compile backend/services/agent_runtime_store/*.py
cd frontend
pnpm build
```

Adjust file paths to actual changed files.

## M4 - Domain Store MySQL Migration

Required checks:

1. MySQL tables exist for assets, evidence, strategies, portfolios, decisions, and data sources.
2. Seed import completes.
3. API smoke:
   - `GET /api/alpha-trace/assets`
   - `GET /api/alpha-trace/evidence`
   - `GET /api/alpha-trace/strategies`
   - `GET /api/alpha-trace/portfolios`
   - `GET /api/alpha-trace/decisions`
4. Frontend real mode pages do not crash.

Required commands:

1. py_compile changed backend files.
2. `cd frontend && pnpm build` if frontend changes.

## M5 - Agent Runtime Worker and Status Machine

Required checks:

1. Submit run returns immediately.
2. Status transition is valid.
3. Cancel endpoint changes running run to cancelled.
4. Retry endpoint creates or restarts a run according to implementation contract.
5. Timeout writes durable failed/cancelled reason.
6. SSE reconnect can resume from a sequence cursor.

Regression:

1. Qwen run still completes.
2. Stub run still completes.
3. Failed run remains replayable.

## M6 - TradingAgents Adapter Deep PoC Stabilization

Required checks:

1. Disabled path returns HTTP 400 and does not crash.
2. Import failure path returns HTTP 400 and does not crash.
3. Enabled local SPY PoC can be submitted.
4. Completed or failed result is persisted in AlphaTrace schema.
5. No TradingAgents internal state is exposed to frontend.

Local venv check:

`````powershell
..\.venv-alphatrace-tg\Scripts\python.exe -c "import tradingagents; from tradingagents.graph.trading_graph import TradingAgentsGraph; print('ok')"
```

Use the actual venv path from `docs/IMPLEMENTATION_LOG.md`; do not commit the venv.

## M7 - Evidence Governance

Required checks:

1. Synthetic invalid evidence id is filtered.
2. Unsupported claim can be flagged without failing the run.
3. Evidence support score appears in API or UI if implemented.
4. Decision Attribution remains stable.

Regression:

1. Qwen output fallback still works.
2. Bocha disabled/failure path still falls back to static evidence.

## M8 - Commercial Backend Review and Freeze

Required checks:

1. Docker or local real mode startup path documented and verified.
2. Demo path opens:
   - Dashboard
   - Asset Research
   - Evidence Center
   - Agent Lab
   - AgentRunDetail
   - Portfolio Workspace
   - Decision Attribution
   - Leaderboard
3. Final limitations and roadmap are current.
4. `docs/IMPLEMENTATION_LOG.md` has the final validation summary.

## M9 - TradingAgents Runtime Environment Standardization

Required checks:

1. TradingAgents disabled status:
   - `ALPHATRACE_TRADINGAGENTS_ENABLED` unset or false.
   - `GET /api/alpha-trace/agent-runs/runners/status` returns TradingAgents `status=disabled`.
2. TradingAgents import diagnostics:
   - `ALPHATRACE_TRADINGAGENTS_ENABLED=true`.
   - Bad or missing `TRADINGAGENTS_REPO_PATH` returns `status=import_error` and a clear message.
3. TradingAgents key diagnostics:
   - When importable but Qwen key is unavailable, status returns `missing_qwen_key`.
   - When Hyper AI Qwen profile or `DASHSCOPE_API_KEY` exists, status reports `qwenKeyConfigured=true` and the key source.
4. Agent Lab real mode displays repo/import/Qwen key diagnostics without exposing secret values.
5. Qwen/Stub runner status remains available.

Required commands:

`````powershell
python -m py_compile backend/api/alpha_trace_agent_runtime_routes.py
cd frontend
pnpm build
```

API smoke can use TestClient or curl against the active backend.

## M10 - TradingAgents Local PoC Operating Kit

Required checks:

1. Start script dry-run:

`````powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/start_tradingagents_backend.ps1 -DryRun
```

2. Status script dry-run:

`````powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/check_tradingagents_status.ps1 -DryRun
```

3. Submit script dry-run:

`````powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/submit_tradingagents_spy_poc.ps1 -DryRun
```

4. Backend route compile:

`````powershell
python -m py_compile backend/api/alpha_trace_agent_runtime_routes.py
```

5. If frontend files changed in the same milestone, run:

`````powershell
cd frontend
pnpm build
```

Manual run checks:

1. Start local backend on `8812`.
2. Confirm `runners/status` reports TradingAgents `ready`.
3. Submit SPY PoC.
4. Verify returned runId is queryable through detail/events/reports/evidence/decision.

## M11 - AlphaTrace Market Data Frontend Visibility

Required checks:

1. Frontend build:

`````powershell
cd frontend
pnpm build
```

2. Backend API smoke if backend is running:

`````powershell
curl http://127.0.0.1:8802/api/alpha-trace/market-data/assets/asset_etf_510300/quote
curl http://127.0.0.1:8802/api/alpha-trace/market-data/assets/asset_etf_510300/snapshot
curl http://127.0.0.1:8802/api/alpha-trace/market-data/assets/asset_etf_510300/indicators
```

3. Page smoke:

Open `/dashboard#assets/asset_etf_510300` in real mode and confirm the Market Data panel renders quote/snapshot/indicators or a friendly error.

Regression:

1. Do not change legacy Kline/Crypto pages.
2. Mock mode Asset Detail remains usable.

## M12 - Active Backend Route Smoke Kit

Required checks:

1. Dry-run:

`````powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/check_active_backend_routes.ps1 -DryRun
```

2. Check local backend:

`````powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/check_active_backend_routes.ps1 -BaseUrl http://127.0.0.1:8812/api
```

3. Check Docker backend if running:

`````powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/check_active_backend_routes.ps1 -BaseUrl http://127.0.0.1:8802/api
```

Expected result:

1. Existing routes return HTTP 200.
2. Missing routes are listed explicitly with URL and HTTP status.
3. The script does not mutate backend state.

## M13 - Local Vite Real Mode Startup Kit

Required checks:

1. Dry-run:

`````powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/start_vite_real_mode.ps1 -DryRun
```

2. Optional actual run:

`````powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/start_vite_real_mode.ps1 -ApiBaseUrl http://127.0.0.1:8813/api -Port 8804
```

Expected result:

1. Vite starts with `VITE_ALPHA_TRACE_API_MODE=real`.
2. Vite uses the configured `VITE_ALPHA_TRACE_API_BASE_URL`.
3. No API keys are printed or written.

## M14 - AlphaTrace-only Backend Startup Profile

Required checks:

1. Backend compile:

`````powershell
python -m py_compile backend/main.py
```

2. Startup helper dry-run:

`````powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/start_alphatrace_backend.ps1 -DryRun
```

3. Optional manual startup:

`````powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/start_alphatrace_backend.ps1 -Port 8813
```

Expected startup behavior:

1. `ALPHATRACE_BACKEND_PROFILE=alphatrace`.
2. `ALPHATRACE_LEGACY_RUNTIME_ENABLED=false`.
3. `ALPHATRACE_FRONTEND_WATCHER_ENABLED=false`.
4. Logs should show skipped legacy runtime messages and should not continuously print `Fetching price for BTC...`.

Optional route smoke after startup:

`````powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/check_active_backend_routes.ps1 -BaseUrl http://127.0.0.1:8813/api
```

Regression:

1. Without the AlphaTrace profile, legacy startup behavior remains unchanged.
2. No Docker/package changes are required.

## Current Manual Startup Workflow

This project currently uses the following manual startup workflow instead of a new one-click script.

### Default Browser Validation Chain

Use this chain when validating AlphaTrace pages and Qwen/Stub/Docker-backed runtime features:

```text
Browser 8805 -> Vite same-origin /api -> Docker backend 8802
```

Commands:

`````powershell
docker compose up -d app
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/start_vite_real_mode.ps1
```

Expected helper defaults:

1. `VITE_ALPHA_TRACE_API_BASE_URL=/api`
2. `VITE_ALPHA_TRACE_API_PROXY_TARGET=http://127.0.0.1:8802/api`
3. Vite port `8805`

Smoke:

`````powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8802/api/health
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/api/health
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/api/alpha-trace/agent-runs/runners/status
```

### Optional TradingAgents Local PoC Chain

Use this chain only when host PostgreSQL is reachable and the local TradingAgents venv/dependencies are available:

1. Start Docker Desktop.
2. Start database services:

`````powershell
docker compose up -d postgres mysql
```

3. Start AlphaTrace-only backend on `8813` with:

`````powershell
$env:ALPHATRACE_BACKEND_PROFILE="alphatrace"
$env:ALPHATRACE_LEGACY_RUNTIME_ENABLED="false"
$env:ALPHATRACE_FRONTEND_WATCHER_ENABLED="false"
$env:DATABASE_URL="postgresql://alpha_user:alpha_pass@127.0.0.1:5432/alpha_arena"
$env:SNAPSHOT_DATABASE_URL="postgresql://alpha_user:alpha_pass@127.0.0.1:5432/alpha_snapshots"
H:\git0412\hyperalphaarena_codex\ai-investment-workbench\.venv-alphatrace-tg\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8813 --app-dir H:\git0412\hyperalphaarena_codex\ai-investment-workbench\Hyper-Alpha-Arena\backend
```

4. Validate routes:

`````powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/check_active_backend_routes.ps1 -BaseUrl http://127.0.0.1:8813/api
```

5. Start Vite real mode:

`````powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/start_vite_real_mode.ps1 -ApiBaseUrl http://127.0.0.1:8813/api -Port 8805
```

6. Open:

```text
http://127.0.0.1:8805/dashboard#dashboard
```

Expected result:

1. Backend route smoke reports `12/12 routes ok`.
2. Frontend returns HTTP 200.
3. AlphaTrace-only backend logs do not continuously print `Fetching price for BTC`.

Known host-port caveat:

If Windows refuses to bind or connect to `127.0.0.1:5432`, local `8813` backend startup will fail during snapshot database initialization. In that case, use the default browser validation chain `8805 -> 8802` and treat TradingAgents local PoC as temporarily unavailable until the PostgreSQL host-port issue is resolved.

If Docker compose cannot publish Postgres on host `5432` but the Docker app still needs `postgres:5432`, use a local operational workaround without changing compose files:

`````powershell
docker rm -f hyper-arena-postgres
docker run -d --name hyper-arena-postgres --network hyper-arena-network `
  -e POSTGRES_USER=alpha_user `
  -e POSTGRES_PASSWORD=alpha_pass `
  -e POSTGRES_DB=alpha_arena `
  -v hyper-alpha-arena_postgres_data:/var/lib/postgresql/data `
  postgres:14
docker network disconnect hyper-arena-network hyper-arena-postgres
docker network connect --alias postgres --alias hyper-arena-postgres hyper-arena-network hyper-arena-postgres
docker restart hyper-arena-app
```

Expected result:

1. `hyper-arena-postgres` does not publish host `5432`.
2. `hyper-arena-app` can resolve `postgres` inside `hyper-arena-network`.
3. `http://127.0.0.1:8802/api/health` returns backend health.

## M15 - Runtime Port and Startup Governance

Required checks:

1. Confirm active ports:

`````powershell
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 3306,5432,8802,8804,8805,8812,8813,8814 }
```

Expected current recommendation:

1. `3306`: MySQL dependency.
2. `5432`: PostgreSQL dependency.
3. `8805`: Vite real-mode frontend.
4. `8813`: AlphaTrace-only backend.

2. Confirm backend routes:

`````powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/check_active_backend_routes.ps1 -BaseUrl http://127.0.0.1:8813/api
```

Expected result: `12/12 routes ok`.

3. Confirm frontend entry:

`````powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard#dashboard
```

Expected result: HTTP 200.

No build is required for M15 because it is documentation and operating-governance only.

## M16 - Runtime Startup Chain Stabilization

Required checks:

1. Vite helper dry-run:

`````powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/start_vite_real_mode.ps1 -DryRun
```

Expected:

1. `VITE_ALPHA_TRACE_API_BASE_URL=/api`
2. `VITE_ALPHA_TRACE_API_PROXY_TARGET=http://127.0.0.1:8802/api`
3. `Command: pnpm exec vite --host 127.0.0.1 --port 8805`

2. Runtime smoke:

`````powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8802/api/health
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/api/health
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/api/alpha-trace/agent-runs/runners/status
```

No frontend build is required for M16 unless frontend source files changed.

## M17 - AlphaTrace Orchestrator v1 and TradingAgents Subprocess Worker

Required checks:

1. Backend compile:

`````powershell
backend\.venv\Scripts\python.exe -m py_compile `
  backend\services\agent_orchestrator\subprocess_orchestrator.py `
  backend\services\agent_runners\tradingagents_worker.py `
  backend\services\agent_runners\tradingagents_adapter.py `
  backend\services\alpha_trace_agent_runtime_service.py `
  backend\schemas\alpha_trace_agent_runtime.py
```

2. TradingAgents disabled path through the active backend:

`````powershell
curl -X POST http://127.0.0.1:8805/api/alpha-trace/agent-runs/submit `
  -H "Content-Type: application/json" `
  -d "{\"assetId\":\"asset_etf_510300\",\"taskType\":\"single_asset_analysis\",\"question\":\"TradingAgents subprocess disabled smoke\",\"runnerConfig\":{\"runnerType\":\"tradingagents\",\"enableStreaming\":true,\"extraParams\":{\"ticker\":\"SPY\",\"useSubprocessWorker\":true,\"workerTimeoutSeconds\":60}}}"
```

Expected: HTTP 400 with `TradingAgents runner is not enabled.` when the active backend is Docker/default-disabled.

3. Local subprocess smoke:

Run a local in-memory adapter smoke with `ALPHATRACE_TRADINGAGENTS_ENABLED=true`, `TRADINGAGENTS_REPO_PATH` pointing to the sibling repo, and no `DASHSCOPE_API_KEY`.

Expected:

1. Submit returns a `run_tradingagents_*` id immediately.
2. Worker exits with durable `failed` status.
3. Result includes one failure report, one context evidence item, and fallback `watch` decision.
4. Worker artifacts are written under `backend/runtime_data/agent_workers/`, which is ignored by git.

No frontend build is required for M17 unless frontend files changed.

## M18 - Orchestrator Worker Artifact Observability

Required checks:

1. Backend compile:

`````powershell
backend\.venv\Scripts\python.exe -m py_compile backend\api\alpha_trace_agent_runtime_routes.py
```

2. Frontend build:

`````powershell
cd frontend
pnpm build
```

3. API smoke for an existing run:

`````powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/api/alpha-trace/agent-runs/<runId>/worker-artifacts
```

Expected:

1. Existing TradingAgents subprocess worker runs return file status plus stdout/stderr/events/result tails.
2. Qwen/Stub/older runs return HTTP 200 with `exists=false` and a friendly message.
3. Invalid run ids or unknown runs do not expose arbitrary filesystem paths.

Regression:

1. `GET /api/alpha-trace/agent-runs/runtime/logs` remains available as the global backend log tail.
2. Docker app should set `ALPHATRACE_BACKEND_LOG_PATH=/app/logs/backend-runtime.log` and tee backend stdout/stderr into the mounted `./logs` directory.
3. Runtime Event Stream remains the canonical structured event source.

## M19 - Orchestrator Control Plane v1

Required checks:

1. Backend compile:

`````powershell
backend\.venv\Scripts\python.exe -m py_compile `
  backend\services\agent_orchestrator\subprocess_orchestrator.py `
  backend\services\agent_runners\tradingagents_adapter.py `
  backend\services\alpha_trace_agent_runtime_service.py `
  backend\api\alpha_trace_agent_runtime_routes.py
```

2. No-worker cancel function smoke:

`````powershell
backend\.venv\Scripts\python.exe -c "from services.agent_orchestrator.subprocess_orchestrator import cancel_subprocess_worker; print(cancel_subprocess_worker('missing_run'))"
```

Expected:

1. Missing worker returns `found=false` without raising.
2. Cancelled runs include `workerCancellation` in the `agent.run.cancelled` event payload.
3. Late subprocess monitor callbacks do not overwrite `cancelled` status with `failed`.

Regression:

1. TradingAgents disabled submit still returns clear HTTP 400 when disabled.
2. Qwen/Stub runners are unaffected.

## M20 - Orchestrator Worker Registry Status API

Required checks:

1. Backend compile:

`````powershell
backend\.venv\Scripts\python.exe -m py_compile `
  backend\services\agent_orchestrator\subprocess_orchestrator.py `
  backend\api\alpha_trace_agent_runtime_routes.py
```

2. Worker registry smoke:

`````powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/api/alpha-trace/agent-runs/runtime/workers
```

Expected:

1. HTTP 200.
2. Response includes `workerType=subprocess`, `activeCount`, `registeredCount`, and `workers`.
3. Empty registry is valid and should not be treated as an error.

## M21 - TradingAgents Worker Status UI

Required checks:

1. Frontend build:

`````powershell
cd frontend
pnpm build
```

2. Agent Lab smoke:

Open `/dashboard#agent-lab` and confirm:

1. Runner Runtime Status still renders.
2. Orchestrator Worker Registry renders active/registered counts when the backend endpoint exists.
3. If the endpoint is missing on a stale backend, the page shows a friendly diagnostics limitation instead of crashing.

## M22 - Worker-Aware Cancel UI

Required checks:

1. Frontend build:

`````powershell
cd frontend
pnpm build
```

2. Page behavior:

1. `RUNNING`, `QUEUED`, or `PARTIALLY_COMPLETED` runs show `Cancel Run`.
2. `COMPLETED`, `FAILED`, and `CANCELLED` runs do not show `Cancel Run`.
3. After cancellation, the page refreshes run status, runtime events, and worker artifacts.

## M23 - Orchestrator Run Contract Documentation

Required checks:

`````powershell
Test-Path docs\engineering\31_orchestrator_run_contract.md
Select-String -Path docs\engineering\31_orchestrator_run_contract.md -Pattern "AgentRunStore|worker artifacts|Cancellation Contract"
```

No build or py_compile is required for documentation-only changes.

## M24 - Runner Execution Boundary Decision

Required checks:

`````powershell
Test-Path docs\engineering\32_runner_execution_boundary_decision.md
Select-String -Path docs\engineering\32_runner_execution_boundary_decision.md -Pattern "QwenRunner|TradingAgents|subprocess|in_process|M25"
```

Expected:

1. The document exists.
2. The document records QwenRunner as in-process for now.
3. The document records TradingAgents as subprocess-backed.
4. The document records M25 as the next policy-layer milestone.

No build or py_compile is required for documentation-only changes.

## M25 - Orchestrator Policy Layer v1

Required checks:

`````powershell
backend\.venv\Scripts\python.exe -m py_compile `
  backend\services\agent_orchestrator\execution_policy.py `
  backend\api\alpha_trace_agent_runtime_routes.py

cd frontend
pnpm build
```

Runner status smoke:

`````powershell
backend\.venv\Scripts\python.exe -c "from services.agent_orchestrator.execution_policy import get_runner_execution_policy; print(get_runner_execution_policy('qwen').execution_mode, get_runner_execution_policy('tradingagents').execution_mode)"
```

Expected:

1. `qwen` reports `in_process`.
2. `tradingagents` reports `subprocess`.
3. Agent Lab can render `executionMode` from runner status.

## M26 - Runner Capability Matrix and Orchestrator Intent Contract

Required checks:

`````powershell
backend\.venv\Scripts\python.exe -m py_compile `
  backend\services\agent_orchestrator\capability_matrix.py `
  backend\api\alpha_trace_agent_runtime_routes.py

backend\.venv\Scripts\python.exe -c "from services.agent_orchestrator.capability_matrix import resolve_recommended_runner; print(resolve_recommended_runner('portfolio_diagnosis')['recommendedRunnerType'])"

cd frontend
pnpm build
```

Expected:

1. `portfolio_diagnosis` recommends `qwen`.
2. Explicit `tradingagents` request does not fallback to Qwen.
3. Agent Lab displays supported task types and capability flags.

## M27 - Orchestrator Intent Preview UI

Required checks:

`````powershell
cd frontend
pnpm build
```

Expected:

1. Agent Lab can render `Orchestrator Intent Preview`.
2. Missing capabilities endpoint is shown as a friendly diagnostics limitation.
3. Submit behavior remains explicit and unchanged.

## M28 - Agent Lab Runner Selection Draft

Required checks:

`````powershell
cd frontend
pnpm build
```

Expected:

1. Agent Lab renders a Draft Agent Task card.
2. Draft submit uses explicit `runnerConfig.runnerType`.
3. TradingAgents draft submit remains blocked when runner diagnostics are not ready.

## M29 - Draft Submit Runtime Smoke

Required checks:

`````powershell
backend\.venv\Scripts\python.exe -c "from api.alpha_trace_agent_runtime_routes import get_agent_runner_capabilities_endpoint; print(get_agent_runner_capabilities_endpoint(taskType='single_asset_analysis', requestedRunnerType='qwen')['recommendation'])"

Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/api/alpha-trace/agent-runs/runners/capabilities

Invoke-WebRequest -UseBasicParsing -Method POST `
  -Uri http://127.0.0.1:8805/api/alpha-trace/agent-runs/submit `
  -ContentType "application/json" `
  -Body '{"assetId":"asset_etf_510300","taskType":"single_asset_analysis","question":"stub draft smoke","runnerConfig":{"runnerType":"stub","enableStreaming":true}}'
```

Expected:

1. Source-level route returns `qwen` for explicit qwen single-asset intent.
2. Active Docker backend may return 404 for the new capabilities endpoint until rebuilt; frontend handles this as a friendly diagnostics limitation.
3. Stub submit returns HTTP 200.

## M30 - Active Backend Refresh Decision

Required checks:

`````powershell
docker restart hyper-arena-app
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8802/api/health
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/api/alpha-trace/agent-runs/runners/capabilities
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/api/alpha-trace/agent-runs/runners/status
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard#agent-lab
```

Expected:

1. Restart is enough for mounted backend `api/` and `services/` source changes.
2. Rebuild is not required for M26-M28 route/source updates.
3. Frontend remains available at `8805`.

## M31 - Agent Lab UI Runtime Smoke

Required checks:

`````powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/api/alpha-trace/agent-runs/runners/status
Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:8805/api/alpha-trace/agent-runs/runners/capabilities?taskType=single_asset_analysis&requestedRunnerType=qwen"
Invoke-WebRequest -UseBasicParsing -Method POST `
  -Uri http://127.0.0.1:8805/api/alpha-trace/agent-runs/submit `
  -ContentType "application/json" `
  -Body '{"assetId":"asset_etf_510300","taskType":"single_asset_analysis","question":"Agent Lab draft stub smoke","runnerConfig":{"runnerType":"stub","enableStreaming":true}}'
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/api/alpha-trace/agent-runs/<runId>
```

Expected:

1. Runner status shows execution modes.
2. Capabilities response includes 4 runner entries.
3. Stub submit returns a completed run.
4. Detail endpoint returns reports and events.

## M32 - TradingAgents Enablement Path Review

Required checks:

`````powershell
Test-Path docs\engineering\34_tradingagents_enablement_path_review.md
Select-String -Path docs\engineering\34_tradingagents_enablement_path_review.md -Pattern "remain local-PoC|Dedicated TradingAgents Worker Container|not enable"
```

Expected:

1. Document exists.
2. Recommendation is explicit.
3. No code/build validation is required because this milestone is documentation-only.

## M33 - Orchestrator Product UX Cleanup

Required checks:

`````powershell
cd frontend
pnpm build
```

Expected:

1. Agent Lab diagnostics are collapsible.
2. Submit and Draft Agent Task actions remain visible.

## M34 - Orchestrator Roadmap Freeze

Required checks:

`````powershell
Test-Path docs\engineering\35_orchestrator_track_freeze.md
Select-String -Path docs\engineering\35_orchestrator_track_freeze.md -Pattern "TradingAgents|QwenRunner|Recommended Next Track|freeze"
```

Expected:

1. Freeze document exists.
2. The document states TradingAgents remains opt-in PoC.
3. The document recommends returning to core AlphaTrace backend/data work.

## M35 - Active Docker Store Baseline Verification

Required checks:

`````powershell
docker exec hyper-arena-app printenv ALPHA_TRACE_AGENT_RUN_STORE ALPHA_TRACE_DOMAIN_STORE ALPHA_TRACE_AGENT_RUN_STORE_PATH ALPHA_TRACE_MYSQL_DATABASE_URL
docker exec hyper-arena-app sh -lc "ls -l /app/data/alpha_trace_agent_runs.json && wc -c /app/data/alpha_trace_agent_runs.json"
docker exec hyper-arena-mysql mysql -ualpha_user -palpha_pass alpha_trace -e "SHOW TABLES LIKE 'alpha_trace_%';"
Invoke-RestMethod http://127.0.0.1:8802/api/health
Invoke-RestMethod http://127.0.0.1:8802/api/alpha-trace/agent-runs/runners/status
```

Expected:

1. Active Docker AgentRunStore is explicit.
2. JSON store file exists if `ALPHA_TRACE_AGENT_RUN_STORE=json`.
3. MySQL tables can exist without being the active default store.
4. Runner status remains available.
5. This milestone does not switch stores or migrate data.

## M36 - MySQL Store Activation Smoke

Required checks:

`````powershell
docker compose build app
docker compose up -d --force-recreate --no-deps app
docker exec hyper-arena-app sh -lc "python -c 'import sqlalchemy, pymysql; print(\"mysql deps ok\")'"
docker exec hyper-arena-app sh -lc "cd /app && python -m py_compile backend/services/agent_runtime_store/mysql_store.py backend/services/agent_runtime_store/registry.py backend/services/alpha_trace_agent_runtime_service.py"
```

Controlled store smoke:

1. Run a one-off script inside `hyper-arena-app` with `ALPHA_TRACE_AGENT_RUN_STORE=mysql`.
2. Create a `run_mysql_smoke_*` AgentRun.
3. Save one event, one report, one evidence reference, and one decision.
4. Mark the run completed.
5. Read all objects back through `MysqlAgentRunStore`.

Expected:

1. Smoke output has `status=completed`.
2. Read counts are `events>=1`, `reports>=1`, `evidence>=1`, `decision=True`.
3. `GET /api/alpha-trace/agent-runs/runners/status` still works.
4. `ALPHA_TRACE_AGENT_RUN_STORE` remains `json` unless explicitly changed for a future milestone.

## M37 - MySQL Default Store Switch

Required checks:

`````powershell
docker compose up -d --force-recreate --no-deps app
docker exec hyper-arena-app printenv ALPHA_TRACE_AGENT_RUN_STORE ALPHA_TRACE_DOMAIN_STORE
docker exec hyper-arena-app sh -lc "cd /app && python backend/scripts/import_agent_runs_json_to_mysql.py --json-path /app/data/alpha_trace_agent_runs.json"
```

API checks:

`````powershell
Invoke-RestMethod http://127.0.0.1:8802/api/alpha-trace/agent-runs?limit=5
Invoke-RestMethod http://127.0.0.1:8802/api/alpha-trace/assets?limit=3
Invoke-RestMethod http://127.0.0.1:8802/api/alpha-trace/evidence?limit=3
Invoke-RestMethod http://127.0.0.1:8802/api/alpha-trace/portfolios?limit=3
```

Persistence checks:

1. Submit a stub run.
2. Recreate app container.
3. Query the stub run detail/events again.
4. Query MySQL row counts for runtime tables.

Expected:

1. `ALPHA_TRACE_AGENT_RUN_STORE=mysql`.
2. `ALPHA_TRACE_DOMAIN_STORE=mysql`.
3. Imported JSON runs remain visible through the API.
4. Newly submitted stub run remains queryable after app recreate.
5. Qwen may still be unavailable if the backend Qwen key is missing; this is a credential state, not a MySQL failure.

## M38 - System Configuration Store Plan

Required checks:

`````powershell
docker exec hyper-arena-app sh -lc "cd /app && python -m py_compile backend/services/system_config_store/mysql_config_store.py backend/services/hyper_ai_service.py backend/services/hyper_ai_tool_registry.py backend/api/hyper_ai_routes.py backend/api/alpha_trace_agent_runtime_routes.py backend/services/agent_runners/qwen_runner.py backend/scripts/import_legacy_hyper_ai_config_to_mysql.py"
pnpm --dir frontend build
```

Migration smoke:

`````powershell
docker exec hyper-arena-app sh -lc "cd /app && python backend/scripts/import_legacy_hyper_ai_config_to_mysql.py"
docker exec hyper-arena-mysql mysql -ualpha_user -palpha_pass alpha_trace -e "SELECT config_key, config_type, provider, enabled, secret_encrypted IS NOT NULL AS has_secret FROM alpha_trace_system_configs;"
```

API smoke:

`````powershell
Invoke-RestMethod http://127.0.0.1:8802/api/hyper-ai/profile
Invoke-RestMethod http://127.0.0.1:8802/api/hyper-ai/tools
Invoke-RestMethod http://127.0.0.1:8802/api/alpha-trace/agent-runs/runners/status
```

Expected:

1. System config table exists and can store tool/LLM config without returning raw secrets.
2. Bocha config remains configured/enabled when migrated to MySQL.
3. Qwen config reports `missing_qwen_key` if the legacy encrypted key cannot be decrypted.
4. A valid user re-save of Qwen credentials should make runner status report `qwenKeyConfigured=true` and `qwenConfigSource=mysql_system_config`.
5. Frontend Settings types compile.

## M39 - Settings Credential Re-save and Runtime Status UX Smoke

Required checks before user re-saves Qwen:

`````powershell
Invoke-RestMethod http://127.0.0.1:8802/api/hyper-ai/profile
Invoke-RestMethod http://127.0.0.1:8802/api/hyper-ai/tools
Invoke-RestMethod http://127.0.0.1:8802/api/alpha-trace/agent-runs/runners/status
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard#settings
```

Expected before re-save:

1. Qwen may report `llm_api_key_available=false` if the legacy key cannot be decrypted.
2. Bocha reports configured/enabled if `tool:bocha` exists in MySQL.
3. Settings page loads and can show the remediation path.

Required checks after user re-saves a valid Qwen key:

`````powershell
Invoke-RestMethod http://127.0.0.1:8802/api/hyper-ai/profile
Invoke-RestMethod http://127.0.0.1:8802/api/hyper-ai/profile/llm/test-current -Method POST
Invoke-RestMethod http://127.0.0.1:8802/api/alpha-trace/agent-runs/runners/status
docker exec hyper-arena-mysql mysql -ualpha_user -palpha_pass alpha_trace -e "SELECT config_key, provider, model, enabled, secret_encrypted IS NOT NULL AS has_secret FROM alpha_trace_system_configs WHERE config_key='llm:default';"
```

Expected after re-save:

1. `llm_config_source=mysql_system_config`.
2. `llm_api_key_available=true`.
3. Qwen runner reports `available=true`.
4. MySQL query only confirms `has_secret=1`; it must not print the secret.

## M40 - Data Source Page Recovery and Back Navigation

Required checks:

`````powershell
pnpm --dir frontend build
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard#data-source
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard#data-sources
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard#assets/asset_etf_510300
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/evidence?limit=3
```

Expected:

1. `data-source`, `datasource`, and `data-sources` resolve to the Data Sources page.
2. Data Sources can project current backend evidence into data-source cards.
3. Asset Detail and Agent Run Detail retain visible back/dashboard navigation.
4. No backend compile is required unless backend files changed in this milestone.

## M41 - MySQL Configuration Re-save Awaiting User Key

Required checks after a valid Qwen key is saved from Settings:

`````powershell
Invoke-RestMethod http://127.0.0.1:8805/api/hyper-ai/profile
Invoke-RestMethod http://127.0.0.1:8805/api/hyper-ai/profile/llm/test-current -Method POST
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/agent-runs/runners/status
docker exec hyper-arena-mysql mysql -ualpha_user -palpha_pass alpha_trace -e "SELECT config_key, provider, model, enabled, secret_encrypted IS NOT NULL AS has_secret FROM alpha_trace_system_configs WHERE config_key='llm:default';"
```

Expected:

1. `llm_config_source=mysql_system_config`.
2. `llm_api_key_available=true`.
3. Qwen runner `available=true`.
4. MySQL confirms encrypted secret presence without printing the secret.

## M42 - System Config Admin and Diagnostics Cleanup

Required checks:

`````powershell
docker exec hyper-arena-app sh -lc "cd /app && python -m py_compile backend/api/hyper_ai_routes.py"
pnpm --dir frontend build
Invoke-RestMethod http://127.0.0.1:8805/api/hyper-ai/profile
Invoke-RestMethod http://127.0.0.1:8805/api/hyper-ai/tools
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/agent-runs/runners/status
```

Expected:

1. `/hyper-ai/profile` exposes `llm_config_source` and `llm_api_key_available`; no raw API key is returned.
2. `/hyper-ai/tools` exposes `config_source` and `api_key_available` for Bocha; no raw API key is returned.
3. Agent Lab runner diagnostics and Settings show the same Qwen source, normally `mysql_system_config`.
4. Settings key rotation flow:
   - Save Qwen Config validates and writes encrypted backend config.
   - Test Current Qwen Config validates the saved backend secret without exposing it.
   - Save Bocha Key validates and writes encrypted backend config.
   - Remove Bocha Key disables Bocha and leaves static evidence fallback available.
5. If validation fails, the UI should show the backend message, and the operator should re-save the relevant key instead of editing frontend state.

## M43 - Long-Run Milestone Plan Extension

Required checks:

`````powershell
Select-String -Path docs/EXECUTION_PLAN.md -Pattern "M43|M44|M45|M46|M47|M48"
Select-String -Path docs/VALIDATION.md -Pattern "M43|M44|M45|M46|M47|M48"
Select-String -Path docs/IMPLEMENTATION_LOG.md -Pattern "M43"
```

Expected:

1. M43-M48 exist in `docs/EXECUTION_PLAN.md`.
2. M43-M48 exist in `docs/VALIDATION.md`.
3. `docs/IMPLEMENTATION_LOG.md` records the M43 batch entry.
4. No business code changes are required.

## M44 - Agent Lab and Settings Runtime Diagnostics Closure

Required checks:

`````powershell
pnpm --dir frontend build
Invoke-RestMethod http://127.0.0.1:8805/api/hyper-ai/profile
Invoke-RestMethod http://127.0.0.1:8805/api/hyper-ai/tools
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/agent-runs/runners/status
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard#settings
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard#agent-lab
```

Expected:

1. Settings and Agent Lab expose the same Qwen source and availability.
2. Bocha source and key availability are visible without exposing raw secrets.
3. TradingAgents disabled/import failure is actionable in the UI.
4. Backend error details surface in frontend messages.

## M45 - TradingAgents PoC Observability Closure

Required checks:

`````powershell
python -m py_compile <changed-backend-files>
pnpm --dir frontend build
```

Smoke checks:

`````powershell
# TradingAgents disabled smoke
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/agent-runs/submit -Method POST -ContentType "application/json" -Body '{"assetId":"asset_etf_510300","taskType":"single_asset_analysis","question":"TradingAgents disabled smoke","runnerConfig":{"runnerType":"tradingagents","enableStreaming":true}}'

# Stub regression
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/agent-runs/submit -Method POST -ContentType "application/json" -Body '{"assetId":"asset_etf_510300","taskType":"single_asset_analysis","question":"Stub regression","runnerConfig":{"runnerType":"stub","enableStreaming":true}}'
```

Expected:

1. TradingAgents disabled smoke returns a clear not-enabled or disabled error; service does not crash.
2. Stub regression creates a completed run.
3. Qwen regression may be run if Qwen key is configured; it should complete and persist.

## M46 - AlphaTrace Market Data v1 Demo Reinforcement

Required checks:

`````powershell
python -m py_compile <changed-backend-files>
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/market-data/quote/asset_etf_510300
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/market-data/snapshot/asset_etf_510300
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/market-data/klines/asset_etf_510300
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard#assets/asset_etf_510300
```

Expected:

1. ETF static market data is queryable or a documented route mismatch/blocker is recorded.
2. Asset Detail does not render blank.
3. Legacy BTC endpoint is not treated as AlphaTrace primary market data.

## M47 - AlphaTrace Demo Path Stabilization

Required checks:

`````powershell
pnpm --dir frontend build
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard#dashboard
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard#assets
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard#assets/asset_etf_510300
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard#evidence
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard#agent-lab
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard#decisions
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard#portfolio
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard#leaderboard
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard#settings
```

Expected:

1. All demo pages return HTTP 200.
2. Critical real-mode API smoke passes.
3. Any submitted Qwen/portfolio runId is recorded in `docs/IMPLEMENTATION_LOG.md`.

## M48 - Four-Hour Batch Closure and Freeze Point

Required checks:

`````powershell
git status --short
Invoke-RestMethod http://127.0.0.1:8805/api/health
Invoke-RestMethod http://127.0.0.1:8805/api/hyper-ai/profile
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/agent-runs/runners/status
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/assets
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/evidence
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/leaderboard
```

Expected:

1. Final state is recorded in `docs/IMPLEMENTATION_LOG.md`.
2. `docs/EXECUTION_PLAN.md` statuses match actual completed/blocked work.
3. Next recommended milestone is explicit.

## M43-M48 Batch Validation Result - 2026-05-04

Status: Completed

Commands and checks completed:

1. M43 documentation consistency check confirmed M43-M48 exist in `docs/EXECUTION_PLAN.md` and `docs/VALIDATION.md`.
2. M44 `pnpm --dir frontend build` passed; runtime credential APIs and Settings/Agent Lab page smoke passed.
3. M45 backend py_compile passed for TradingAgents adapter/runtime route/service files; frontend build passed; TradingAgents disabled smoke, Stub regression, and Qwen regression passed.
4. M46 market-data API smoke passed for 510300 quote, snapshot, klines, and indicators; market data py_compile passed; Asset Detail page smoke passed.
5. M47 page/API demo smoke passed; frontend build passed; portfolio diagnosis completed as `run_qwen_20260504_065828_198259` with 275 events, 4 reports, 5 evidence references, and decision `overweight` confidence `0.72`.
6. M48 final API smoke passed for health, Hyper AI profile, runner status, assets, evidence, and leaderboard.

Known validation warnings:

1. Frontend build still reports existing chunk-size and Browserslist warnings.
2. Legacy BTC/Hyperliquid logs were intentionally not addressed in this batch.
3. TradingAgents remains disabled by default; enabled/full external dependency validation is out of scope for M43-M48.

## M49-M54 Validation Rules

M49 required checks:

`````powershell
git status --short
git diff --stat
Invoke-RestMethod http://127.0.0.1:8805/api/health
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/agent-runs/runners/status
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/assets
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/evidence
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/decisions
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/leaderboard
```

M50 required checks:

`````powershell
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard#settings
Invoke-RestMethod http://127.0.0.1:8805/api/health
Invoke-RestMethod http://127.0.0.1:8805/api/hyper-ai/profile
```

M51 required checks:

`````powershell
docker exec hyper-arena-mysql mysql -uroot -p$env:MYSQL_ROOT_PASSWORD -e "SHOW DATABASES;"
# Use only safe count/config metadata queries; do not print raw secrets.
```

M52 required checks:

`````powershell
# TradingAgents disabled smoke, unsupported runner smoke, stub regression, runner status.
```

M53 required checks:

`````powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard#dashboard
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard#assets/asset_etf_510300
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard#agent-lab
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard#portfolio
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard#leaderboard
```

M54 required checks:

`````powershell
git status --short
Invoke-RestMethod http://127.0.0.1:8805/api/health
Invoke-RestMethod http://127.0.0.1:8805/api/hyper-ai/profile
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/agent-runs/runners/status
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/assets
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/evidence
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/leaderboard
```

## M49-M54 Batch Validation Result - 2026-05-04

Status: Completed

Commands and checks completed:

1. M49 captured `git status --short`, `git diff --stat`, API smoke, and stub regression `run_stub_20260504_130155_819376`.
2. M50 confirmed Docker backend/MySQL health and documented the correct 8805 Vite proxy startup env.
3. M51 verified MySQL database `alpha_trace`, runtime/config tables, safe table counts, Qwen/Bocha MySQL config availability, and latest portfolio run persistence.
4. M52 verified TradingAgents disabled behavior, unsupported runner validation, Stub regression `run_stub_20260504_130628_404756`, and runner status.
5. M53 verified key demo pages and frontend build.
6. M54 final API smoke passed for health, Hyper AI profile, runner status, assets, evidence, and leaderboard.

Known validation warnings:

1. Frontend build still reports existing chunk-size, dynamic import, Browserslist, and baseline-browser-mapping warnings.
2. Legacy BTC/Hyperliquid logs remain intentionally out of scope.
3. TradingAgents remains disabled unless explicitly configured.
4. Worktree remains broad and dirty; commit grouping is the next operational priority.

## M55-M64 Continuation Validation Result - 2026-05-04

Status: Completed

Commands and checks completed:

1. M55 captured change-set grouping and added ignore rules for local run artifacts.
2. M56 passed container backend compile sweep: `python -m compileall -q backend/api backend/schemas backend/services`.
3. M57 passed `pnpm --dir frontend build` and page smoke.
4. M60 generated `docs/engineering/36_mysql_schema_snapshot.md` from safe schema-only queries.
5. M61 generated and executed `docs/engineering/37_runtime_api_smoke_collection.md` checks; stub smoke completed as `run_stub_20260504_131914_531650`.
6. M62 documented TradingAgents preflight and confirmed disabled behavior.
7. M63 documented legacy runtime noise isolation design without code changes.
8. M64 final API smoke passed.

Known warnings:

1. Frontend build warnings remain unchanged.
2. TradingAgents remains disabled by default.
3. Legacy runtime noise remains enabled in current Docker profile because AlphaTrace-only env vars are not set.
4. Worktree remains broad with 115 dirty entries; commit grouping is the next priority.

## M71-M78 Validation Rules

M71 required checks:

`````powershell
Select-String -Path docs\EXECUTION_PLAN.md -Pattern "M71|M72|M73|M74|M75|M76|M77|M78"
Select-String -Path docs\VALIDATION.md -Pattern "M71-M78"
```

M72 required checks:

`````powershell
Invoke-RestMethod http://127.0.0.1:8805/api/hyper-ai/profile
Invoke-RestMethod http://127.0.0.1:8805/api/hyper-ai/tools
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/agent-runs/runners/status
pnpm --dir frontend build  # only if frontend changes
python -m py_compile <changed_backend_files>  # only if backend changes
```

M73 required checks:

`````powershell
pnpm --dir frontend build
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard#dashboard
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard#assets
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard#assets/asset_etf_510300
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard#evidence
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard#agent-lab
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard#portfolio
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard#decisions
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard#leaderboard
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard#data-sources
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard#settings
```

M74 required checks:

`````powershell
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/evidence/<ev_bocha_or_run_scoped_id>
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/agent-runs/<runId>/evidence
pnpm --dir frontend build  # only if frontend changes
python -m py_compile backend/api/alpha_trace_evidence_routes.py  # if backend evidence route changes
```

M75 required checks:

`````powershell
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/agent-runs/runners/status
# Submit runnerType=alphatrace_native and poll until completed/failed.
pnpm --dir frontend build  # if frontend changes
python -m py_compile <changed_backend_files>  # if backend changes
```

M76 required checks:

`````powershell
# Safe metadata only; do not print raw secrets.
Invoke-RestMethod http://127.0.0.1:8805/api/hyper-ai/profile
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/assets
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/evidence
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/agent-runs/<recentRunId>
# Restart app if required, then repeat critical API checks.
```

M77 required checks:

`````powershell
Invoke-RestMethod http://127.0.0.1:8805/api/health
Invoke-RestMethod http://127.0.0.1:8805/api/hyper-ai/profile
Invoke-RestMethod http://127.0.0.1:8805/api/hyper-ai/tools
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/agent-runs/runners/status
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/assets
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/evidence
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/portfolios
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/decisions
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/leaderboard
# Submit stub, native, optional qwen, and tradingagents disabled smoke.
```

M78 required checks:

`````powershell
git status --short
Invoke-RestMethod http://127.0.0.1:8805/api/health
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/agent-runs/runners/status
```

## M79-M92 Full-Stack Optimization Validation Rules

M79 Backend layering:
`````powershell
python -m py_compile <changed_backend_files>
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/agent-runs/runners/status
```

M80 Calculation/scoring:
`````powershell
python -m py_compile <changed_backend_files>
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/leaderboard
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/decisions
```

M81 Runtime state machine:
`````powershell
python -m py_compile <changed_backend_files>
# submit/cancel/retry/failure smoke as applicable
```

M82 Evidence governance:
`````powershell
python -m py_compile <changed_backend_files>
pnpm --dir frontend build  # if UI changes
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/evidence
```

M83 Data Source domain:
`````powershell
pnpm --dir frontend build
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8805/dashboard#data-sources
```

M84 Frontend layout:
`````powershell
pnpm --dir frontend build
# page smoke for all AlphaTrace routes
```

M85 Frontend API contract:
`````powershell
pnpm --dir frontend build
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/assets
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/evidence
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/agent-runs/runners/status
```

M86 Performance/resource boundaries:
`````powershell
pnpm --dir frontend build  # if UI changes
# inspect large completed run detail and high event count run
```

M87 Test harness:
`````powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/run_runtime_smoke.ps1 -DryRun
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/run_runtime_smoke.ps1 -BaseUrl http://127.0.0.1:8805/api
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/run_runtime_smoke.ps1 -BaseUrl http://127.0.0.1:8805/api -IncludeSubmit
```
Expected: no secrets printed; default mode is GET-only; `-IncludeSubmit` writes disposable Stub and TradingAgents-disabled smoke runs.

M88 MySQL schema hardening:
`````powershell
# safe schema-only MySQL metadata queries; no secret output
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/assets
```

M89 Security/secrets:
`````powershell
Invoke-RestMethod http://127.0.0.1:8805/api/hyper-ai/profile
Invoke-RestMethod http://127.0.0.1:8805/api/hyper-ai/tools
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/agent-runs/runners/status
# verify no plaintext secret values in responses
```

M90 Legacy boundary:
`````powershell
python -m py_compile backend/main.py  # if startup code changes
Invoke-RestMethod http://127.0.0.1:8805/api/health
```

M91 Commit grouping:
`````powershell
git status --short
git diff --stat
```

M92 Closure:
`````powershell
Invoke-RestMethod http://127.0.0.1:8805/api/health
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/agent-runs/runners/status
git status --short
```


## M93-M100 Validation Rules

M93 Evidence detail/source preview:
`````powershell
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/evidence?limit=10
# If UI changes:
pnpm --dir frontend build
```

M94 Tool invocation contract:
`````powershell
# py_compile changed backend files if event mappers change
# pnpm build if frontend timeline changes
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/agent-runs/runners/status
```

M95 Native runner:
`````powershell
# submit alphatrace_native smoke if backend changes
# verify events/reports/evidence/decision for returned runId
```

M96/M97 architecture analyses:
Documentation-only unless code changes.

M98 frontend boundary cleanup:
`````powershell
pnpm --dir frontend build
```

M99 backend boundary cleanup:
`````powershell
python -m py_compile <changed_backend_files>
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/run_runtime_smoke.ps1 -BaseUrl http://127.0.0.1:8805/api
```

M100 closure:
`````powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/run_runtime_smoke.ps1 -BaseUrl http://127.0.0.1:8805/api
git status --short
```

## Validation Rules for M101-M108

### M101 Tool Registry Service Contract

- If backend code changes: `python -m py_compile <changed_backend_files>`.
- Run runtime smoke helper.
- Verify Tool Calls Timeline still renders known tool IDs.

### M102 Agent Artifact Model Design

- Documentation-only unless code changes.
- If schema/code changes, run backend py_compile and frontend build as applicable.

### M103 Native Research Manager Node

- If runner changes: `python -m py_compile backend/services/agent_runners/qwen_runner.py backend/services/agent_runners/native_multi_agent_runner.py`.
- Submit `runnerType=alphatrace_native` smoke if implemented.
- Confirm status completes or failed reason persists.
- Run runtime smoke helper.

### M104 Native Risk Sub-Perspective Design

- Documentation-only unless code changes.
- If frontend/runner changes, run build/py_compile accordingly.

### M105 Runtime Event Contract Validator

- Run py_compile for changed backend/script files where applicable.
- Run validator against a recent Native run.
- Run runtime smoke helper.

### M106 Route/API Smoke Script Expansion

- Run the new/updated script against `http://127.0.0.1:8805`.
- Ensure `#decisions` alias and canonical AlphaTrace routes return HTTP 200.

### M107 MySQL Config and Store Health Endpoint

- If endpoint changes: backend py_compile for route/service files.
- API smoke for the new endpoint.
- Confirm no raw key or secret is returned.
- Run runtime smoke helper.

### M108 Next-Batch Closure

- Run runtime smoke helper.
- Run frontend build if any frontend code changed in M101-M107.
- Capture `git status --short`.

### M109 Final Mapper Event Contract Cleanup

- `python -m py_compile backend/services/agent_runners/qwen_runner.py backend/services/agent_runners/native_multi_agent_runner.py`.
- Submit one `runnerType=alphatrace_native` run.
- Run `scripts/alphatrace/validate_runtime_event_contract.ps1` against the new run with `-FailOnViolation`.
- Run runtime smoke helper.

### M110 AgentRunDetail Research Manager UI Compatibility

- `pnpm --dir frontend build`.
- Run route smoke helper against `http://127.0.0.1:8805`.
- Open or smoke `/dashboard#agent-lab/runs/<latest_native_run_id>`.

### M111 Evidence Detail Traceability for Bocha and Run Evidence

- Backend py_compile if routes/stores change.
- `pnpm --dir frontend build` if UI changes.
- Smoke `GET /api/alpha-trace/evidence/<evidenceId>` for static and run-scoped/Bocha evidence where available.
- Run route smoke helper.

### M112 Tool Invocation Detail UX

- `pnpm --dir frontend build`.
- Run route smoke helper for latest Native run page.
- Confirm no tool detail exposes secrets.

### M113 Native Risk Sub-Perspective Implementation

- `python -m py_compile backend/services/agent_runners/qwen_runner.py backend/services/agent_runners/native_multi_agent_runner.py`.
- Submit one `runnerType=alphatrace_native` run.
- Verify Risk Review report includes Conservative/Neutral/Aggressive sections or a documented fallback.
- Run runtime event validator and runtime smoke helper.

### M114 Native Tool Execution Boundary Pass

- Backend py_compile if event payload code changes.
- Submit or inspect a recent Native run.
- Confirm Tool Calls Timeline represents actual backend tools only.
- Run runtime validator and runtime smoke helper.

### M115 MySQL Persistence Roundtrip Smoke

- Run the new MySQL persistence smoke script if added.
- Confirm latest run detail/events/reports/evidence/decision are readable.
- Confirm system config health flags without raw secrets.
- Run runtime smoke helper.

### M116 Full-Stack Closure and Build

- Run frontend build if M110-M112 changed frontend.
- Run runtime smoke helper.
- Run route smoke helper.
- Capture `git status --short`.

## Validation Rules for M117-M126

### M117 Backend Architecture Boundary Audit

- Documentation-only unless code changes.
- Confirm `docs/engineering/60_backend_boundary_audit.md` exists.
- Confirm legacy modules are explicitly marked non-core.

### M118 Integration Abstraction Layer Design

- Confirm `docs/engineering/61_integration_abstraction_layer.md` exists.
- If skeleton files are added, run:

`````powershell
python -m py_compile backend/services/integration_adapters/base.py backend/services/async_tasks/base.py backend/services/agent_orchestrator/base.py
```

### M119 Orchestration / LangGraph / TradingAgents / LangAlpha Boundary Model

- Documentation review.
- If orchestration code changes, run py_compile for changed files.
- Confirm frontend contract remains AlphaTrace `AgentRun` / `AgentRuntimeEvent` / `AgentReport` / `EvidenceReference` / `AgentDecision`.

### M120 Async Task Manager and Scheduler Design Pass

- Documentation review.
- If task scheduler code changes, run py_compile for changed files.
- Do not introduce Celery/Redis/Docker changes unless a later milestone explicitly requires it.

### M121 Data API Management Layer Design

- Documentation review.
- If data source/evidence/market API code changes, run related py_compile and API smoke.
- Confirm no API keys are exposed in frontend or logs.

### M122 LangAlpha Reusable Module Inventory Refresh

- Documentation review.
- Use local git objects or upstream docs if the LangAlpha worktree is dirty/missing files.
- Do not copy or import LangAlpha code.

### M123 LangAlpha External Adapter Design

- Documentation review.
- If `langalpha_adapter.py` changes, run:

`````powershell
python -m py_compile backend/services/agent_runners/langalpha_adapter.py
```

### M124 TradingAgents Component Selection Plan

- Documentation review.
- Confirm TradingAgents remains opt-in PoC and no source code is copied.

### M125 Initial Abstraction Skeleton

Run:

`````powershell
python -m py_compile backend/services/integration_adapters/base.py backend/services/integration_adapters/__init__.py backend/services/async_tasks/base.py backend/services/async_tasks/__init__.py backend/services/agent_orchestrator/base.py
```

No frontend build is required unless frontend code changes.

### M126 Architecture Review and Next Refactor Queue

- Run M125 py_compile command.
- Run `git status --short`.
- Update `docs/IMPLEMENTATION_LOG.md` with completed milestones, assumptions, validation, and next refactor queue.

### M127 Runtime Tool Catalog Endpoint

- Run:

`````powershell
python -m py_compile backend/api/alpha_trace_agent_runtime_routes.py backend/services/agent_tool_registry.py
```

- After backend reload/restart, smoke:

`````powershell
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/agent-runs/runtime/tools
```

- Confirm no secret material is present.

### M128 Bocha DataProviderAdapter Wrapper

Run:

`````powershell
python -m py_compile backend/services/integration_adapters/bocha_adapter.py backend/services/integration_adapters/__init__.py
```

No runtime smoke is required until a later milestone rewires EvidenceRetriever through the adapter.

### M129 Static Market Data ProviderAdapter Wrapper

Run:

`````powershell
python -m py_compile backend/services/integration_adapters/market_data_adapter.py backend/services/integration_adapters/__init__.py
```

### M130 Qwen ModelProviderAdapter Boundary

Run:

`````powershell
python -m py_compile backend/services/integration_adapters/qwen_model_adapter.py backend/services/integration_adapters/__init__.py
```

No model-call smoke is required until this adapter is wired into a runner.

### M131 AlphaTrace Native OrchestrationPlan Builder

Run:

`````powershell
python -m py_compile backend/services/agent_orchestrator/native_plan.py backend/services/agent_orchestrator/base.py
```

### M132 Native OrchestrationPlan Diagnostics Endpoint

Run:

`````powershell
python -m py_compile backend/api/alpha_trace_agent_runtime_routes.py backend/services/agent_orchestrator/native_plan.py
```

After backend reload/restart, smoke:

`````powershell
Invoke-RestMethod "http://127.0.0.1:8805/api/alpha-trace/agent-runs/runners/plans/alphatrace-native?taskType=single_asset_analysis"
```

### M133 AgentArtifact Contract Skeleton

Run:

`````powershell
python -m py_compile backend/services/agent_artifacts/base.py backend/services/agent_artifacts/__init__.py
```

### M135 Runtime Integration Diagnostics Endpoint

Run:

`````powershell
python -m py_compile backend/api/alpha_trace_agent_runtime_routes.py backend/services/integration_adapters/qwen_model_adapter.py
```

After backend reload/restart, smoke:

`````powershell
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/agent-runs/runtime/integrations
```

Confirm response does not include raw API keys.

### M136 Tool Contract Enrichment for TradingAgents Events

Run:

`````powershell
python -m py_compile backend/services/agent_tool_registry.py backend/services/agent_runners/tradingagents_adapter.py
```

### M137 IntegrationAdapterRegistry

Run:

`````powershell
python -m py_compile backend/services/integration_adapters/registry.py backend/services/integration_adapters/__init__.py backend/api/alpha_trace_agent_runtime_routes.py
```

### M138 Integration Registry Local Smoke

Run a local Python smoke with `PYTHONPATH=backend` to instantiate `build_default_integration_registry()`, list diagnostics, and fail if obvious secret markers such as `sk-`, `Bearer`, or `api_key` appear in the output.

### M139 MySQL AsyncTaskStore Skeleton

Run:

`````powershell
python -m py_compile backend/services/async_tasks/mysql_store.py backend/services/async_tasks/__init__.py
```

A real DB write smoke is deferred until this store is wired behind an endpoint or controlled script.

### M140 AsyncTask Diagnostics Endpoint

Run:

`````powershell
python -m py_compile backend/api/alpha_trace_agent_runtime_routes.py backend/services/async_tasks/mysql_store.py
```

After backend reload/restart, smoke:

`````powershell
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/agent-runs/runtime/tasks
```

### M141-M142 Evidence and Market ToolAdapters

Run:

`````powershell
python -m py_compile backend/services/integration_adapters/tool_adapters.py backend/services/integration_adapters/registry.py backend/services/integration_adapters/__init__.py
```

Optional local smoke invokes both adapters with static data and `includeExternal=False` for evidence to avoid network dependency.

### M143 ToolExecutor Event Payload Helper

Run:

`````powershell
python -m py_compile backend/services/agent_orchestrator/tool_executor.py
```

Optional local smoke executes `MarketContextToolAdapter` through `ToolExecutor`.

### M144 Feature-Flagged Market Context ToolAdapter Path

Run:

`````powershell
python -m py_compile backend/services/agent_runners/qwen_runner.py backend/services/agent_orchestrator/tool_executor.py backend/services/integration_adapters/tool_adapters.py
```

Runtime smoke with `ALPHATRACE_USE_TOOL_ADAPTERS=true` is optional and should only be run in a safe backend reload window.

### M145 Feature-Flagged Evidence Retrieve ToolAdapter Path

Run:

`````powershell
python -m py_compile backend/services/agent_runners/qwen_runner.py backend/services/integration_adapters/tool_adapters.py backend/services/agent_orchestrator/tool_executor.py
```

Runtime smoke with `ALPHATRACE_USE_TOOL_ADAPTERS=true` is optional and should only be run in a safe backend reload window.

### M146 Backend Abstraction Smoke Script

Run:

`````powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_backend_abstractions.ps1
```

### M147-M148 Frontend Boundary and API Client Plans

Documentation-only unless frontend code changes.

Required docs:

- `docs/engineering/68_frontend_boundary_audit.md`
- `docs/engineering/69_frontend_api_client_abstraction_plan.md`

### M149 Runtime Config Facade

Required backend compile:

```powershell
python -m py_compile backend/services/runtime_config/facade.py backend/services/runtime_config/__init__.py backend/api/alpha_trace_agent_runtime_routes.py
```

Required local smoke:

```powershell
# Run from repo root; add backend to sys.path before importing services.
```

The smoke must verify qwen/bocha/tradingagents/langalpha keys are present and obvious secret markers are absent.

### M150 In-Process Async Task Scheduler Boundary

Required backend compile:

```powershell
python -m py_compile backend/services/async_tasks/base.py backend/services/async_tasks/memory_store.py backend/services/async_tasks/in_process_scheduler.py backend/services/async_tasks/__init__.py
```

Required local smoke:

- Schedule a callable that returns a small result and verify `completed`.
- Schedule a callable that raises and verify `failed` with error code.

### M151 AgentRun TaskSpec Factory

Required backend compile:

```powershell
python -m py_compile backend/services/agent_orchestrator/task_spec_factory.py
```

Required local smoke:

- Build an `AsyncTaskSpec` from `SubmitAgentRunRequest`.
- Verify runner/task tags.
- Verify accidental key-like `extraParams` are redacted in task payload.

### M152 Optional AgentRun Submit Task Snapshot Recording

Required backend compile:

```powershell
python -m py_compile backend/services/alpha_trace_agent_runtime_service.py backend/services/agent_orchestrator/task_spec_factory.py backend/services/async_tasks/mysql_store.py
```

Runtime smoke when safe:

- Set `ALPHATRACE_RECORD_ASYNC_TASKS=true`.
- Submit stub/native run.
- Verify `/api/alpha-trace/agent-runs/runtime/tasks` returns a task snapshot.

### M153 AlphaTrace Data API Catalog

Required backend compile:

```powershell
python -m py_compile backend/services/data_api/catalog.py backend/services/data_api/__init__.py backend/api/alpha_trace_data_source_routes.py
```

Required local smoke:

- `get_data_api_catalog().to_response()` includes market data and agent runtime resources.
- Response contains no key/credential values.

### M154 Runner Adapter Composition Matrix

Required backend compile:

```powershell
python -m py_compile backend/services/agent_orchestrator/adapter_matrix.py backend/api/alpha_trace_agent_runtime_routes.py
```

Required local smoke:

- Matrix includes qwen, alphatrace_native, tradingagents, and langalpha.
- TradingAgents is `poc_opt_in`.
- LangAlpha is `design_only`.

### M155 Runner Flow Catalog

Required backend compile:

```powershell
python -m py_compile backend/services/agent_orchestrator/flow_catalog.py backend/api/alpha_trace_agent_runtime_routes.py
```

Required local smoke:

- Qwen/AlphaTrace Native flow has at least five nodes.
- TradingAgents flow is `poc_opt_in`.
- LangAlpha flow is `design_only`.

### M156 Abstraction Endpoint Smoke Script

Required script syntax validation:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_abstraction_endpoints.ps1 -SkipHttp
```

Full HTTP smoke after backend reload:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_abstraction_endpoints.ps1
```

### M157 AgentArtifact Store Boundary

Required backend compile:

```powershell
python -m py_compile backend/services/agent_artifacts/base.py backend/services/agent_artifacts/memory_store.py backend/services/agent_artifacts/mysql_store.py backend/services/agent_artifacts/registry.py backend/services/agent_artifacts/__init__.py backend/api/alpha_trace_agent_runtime_routes.py
```

Required local smoke:

- Save/get/list a `web_url` artifact in `MemoryAgentArtifactStore`.

### M158 Evidence URL to AgentArtifact Mapper

Required backend compile:

```powershell
python -m py_compile backend/services/agent_artifacts/evidence_mapper.py backend/services/agent_artifacts/__init__.py
```

Required local smoke:

- Map an evidence reference with `https://` URL to `web_url` artifact.
- Verify placeholder URL does not create an artifact.

### M159 Optional Evidence URL Artifact Creation

Required backend compile:

```powershell
python -m py_compile backend/services/alpha_trace_agent_runtime_service.py backend/services/agent_artifacts/evidence_mapper.py backend/services/agent_artifacts/registry.py
```

Runtime smoke when safe:

- Set `ALPHATRACE_CREATE_EVIDENCE_URL_ARTIFACTS=true`.
- Submit a run with Bocha/static evidence URL.
- Verify `/agent-runs/{runId}/artifacts` returns web_url artifacts.

### M160 Backend Abstraction Smoke Coverage Expansion

Required script run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_backend_abstractions.ps1
```

### M161 Architecture Documentation Sync

Documentation-only.

Required checks:

- `docs/ARCHITECTURE.md` mentions runtime_config, async_tasks scheduler, data_api catalog, agent_artifacts, adapter matrix, and flow catalog.

### M162 Stale AgentRun Diagnostics

Required backend compile:

```powershell
python -m py_compile backend/services/agent_runtime_health.py backend/api/alpha_trace_agent_runtime_routes.py
```

Required local smoke:

- Old running run is detected.
- Completed run is ignored.

### M163 Qwen Adapter Health Configuration Alignment

Required backend compile:

```powershell
python -m py_compile backend/services/integration_adapters/qwen_model_adapter.py backend/services/runtime_config/facade.py
```

Required local smoke:

- `QwenModelProviderAdapter().health()` returns `ready` or `missing_config`.
- Health source is consistent with runtime config diagnostics.
- Response contains no raw token-shaped credential such as `sk-` or `Bearer ...`.

### M164 Model Provider Catalog Boundary

Required backend compile:

```powershell
python -m py_compile backend/services/model_providers/catalog.py backend/services/model_providers/__init__.py backend/api/alpha_trace_agent_runtime_routes.py
```

Required local smoke:

- `list_model_provider_descriptors()` includes Qwen, TradingAgents bridge, and LangAlpha bridge.
- Response contains no raw token-shaped credential.
- `scripts/alphatrace/smoke_backend_abstractions.ps1` passes.
- `scripts/alphatrace/smoke_abstraction_endpoints.ps1 -SkipHttp` passes.

Runtime HTTP smoke after backend reload:

```powershell
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/agent-runs/runtime/model-providers
```

### M165 AgentRun Metrics Snapshot Endpoint

Required backend compile:

```powershell
python -m py_compile backend/services/agent_runtime_metrics.py backend/api/alpha_trace_agent_runtime_routes.py
```

Required local smoke:

- Missing run returns `None` from `get_agent_run_metrics_snapshot`.

Runtime HTTP smoke after backend reload:

```powershell
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/agent-runs/<runId>/metrics
```

Expected:

- Response includes `metrics`, `counts`, `eventCounts`, `agentEventCounts`, and `persistence`.

### M166 Orchestrator Catalog Boundary

Required backend compile:

```powershell
python -m py_compile backend/services/agent_orchestrator/orchestrator_catalog.py backend/api/alpha_trace_agent_runtime_routes.py
```

Required local smoke:

- `list_orchestrator_descriptors()` includes inline background thread, subprocess worker, TradingAgents LangGraph runtime, and LangAlpha external service descriptors.
- `scripts/alphatrace/smoke_backend_abstractions.ps1` passes.
- `scripts/alphatrace/smoke_abstraction_endpoints.ps1 -SkipHttp` passes.

Runtime HTTP smoke after backend reload:

```powershell
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/agent-runs/runtime/orchestrators
```

### M167 AlphaTrace Runtime Architecture Index

Required backend compile:

```powershell
python -m py_compile backend/services/architecture_index.py backend/api/alpha_trace_agent_runtime_routes.py
```

Required local smoke:

- `get_alphatrace_architecture_index()` includes runtime config, model providers, orchestrators, runner adapters and tools/artifacts layers.
- `scripts/alphatrace/smoke_backend_abstractions.ps1` passes.
- `scripts/alphatrace/smoke_abstraction_endpoints.ps1 -SkipHttp` passes.

Runtime HTTP smoke after backend reload:

```powershell
Invoke-RestMethod http://127.0.0.1:8805/api/alpha-trace/agent-runs/runtime/architecture
```

### M168 Frontend Runtime Diagnostics API Client Boundary

Required frontend build:

```powershell
pnpm --dir frontend build
```

Expected:

- Build succeeds.
- Existing Vite chunk/browserslist warnings are acceptable unless this milestone changes bundling behavior.

### M169 LangAlpha Reuse Backlog

Documentation-only.

Required checks:

```powershell
git -C ..\LangAlpha log --oneline -1
git -C ..\LangAlpha show HEAD:README.md
git -C ..\LangAlpha show HEAD:pyproject.toml
git -C ..\LangAlpha ls-tree -r --name-only HEAD
```

Expected:

- `docs/engineering/70_langalpha_reuse_backlog.md` exists.
- Document states LangAlpha should be adapter/reference, not AlphaTrace main backend.

### M170 LangAlpha External Workbench Adapter Boundary

Required backend compile:

```powershell
python -m py_compile backend/services/integration_adapters/langalpha_workbench_adapter.py backend/services/integration_adapters/registry.py backend/services/integration_adapters/__init__.py
```

Required local smoke:

- `LangAlphaExternalWorkbenchAdapter().health()` returns disabled/missing/degraded.
- Default integration registry includes `langalpha_external_workbench`.
- `scripts/alphatrace/smoke_backend_abstractions.ps1` passes.

### M171 ToolResult to AgentArtifact Mapper

Required backend compile:

```powershell
python -m py_compile backend/services/agent_artifacts/tool_result_mapper.py backend/services/agent_artifacts/__init__.py
```

Required local smoke:

- Bocha-like `ToolInvocationResult` maps to `web_url`, `json`, and `text` artifacts.
- `scripts/alphatrace/smoke_backend_abstractions.ps1` passes.

### M172 ToolExecutor Artifact Mapping Hook

Required backend compile:

```powershell
python -m py_compile backend/services/agent_orchestrator/tool_executor.py backend/services/agent_artifacts/tool_result_mapper.py
```

Required local smoke:

- Fake tool with Bocha-like web result produces `ToolExecutionRecord.artifacts`.
- `result_payload.artifactIds` includes mapped artifact ids.
- `scripts/alphatrace/smoke_backend_abstractions.ps1` passes.

### M173 Frontend AgentArtifact API Contract

Required frontend build:

```powershell
pnpm --dir frontend build
```

Expected:

- Build succeeds.
- `frontend/app/entities/runtime/api.ts` exports AgentArtifact types and `listAgentRunArtifactsAsync`.

### M174 Reusable AgentArtifact Preview Card

Required frontend build:

```powershell
pnpm --dir frontend build
```

Expected:

- Build succeeds.
- `frontend/app/shared/ui/AgentArtifactPreviewCard.tsx` compiles without new dependencies.
- No existing page wiring is changed in this milestone.

### M175 AgentRun Timeline Compaction Read Model

Required backend compile:

```powershell
python -m py_compile backend/services/agent_runtime_timeline.py backend/api/alpha_trace_agent_runtime_routes.py
```

Required local smoke:

- `summarize_runtime_events` groups adjacent `reasoning.chunk` events.
- `summarize_runtime_events` groups adjacent `metric.updated` events.
- Raw event counts remain visible in the summary response.

Required regression:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_backend_abstractions.ps1
```

Expected:

- Existing `/events` and `/events/stream` contracts remain unchanged.
- New `/timeline-summary` endpoint is additive.

### M176 Frontend Timeline Summary API Contract

Required frontend build:

```powershell
pnpm --dir frontend build
```

Expected:

- Build succeeds.
- `frontend/app/shared/api/endpoints.ts` exports the timeline-summary endpoint.
- `frontend/app/entities/runtime/api.ts` exports timeline summary types and `getAgentRunTimelineSummaryAsync`.
- No existing page wiring is changed in this milestone.

### M177 AgentArtifact Catalog Contract

Required backend compile:

```powershell
python -m py_compile backend/services/agent_artifacts/catalog.py backend/services/agent_artifacts/__init__.py backend/services/architecture_index.py backend/api/alpha_trace_agent_runtime_routes.py
```

Required regression:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_backend_abstractions.ps1
```

Expected:

- Artifact catalog includes all supported artifact types.
- Catalog policies state canonical URL and HTML safety behavior.
- Runtime architecture index links to `/runtime/artifacts/catalog`.

### M178 Frontend Artifact Catalog API Contract

Required frontend build:

```powershell
pnpm --dir frontend build
```

Expected:

- Build succeeds.
- `frontend/app/shared/api/endpoints.ts` exports the artifact catalog endpoint.
- `frontend/app/entities/runtime/api.ts` exports artifact catalog types and `getAgentArtifactCatalogAsync`.
- No existing page wiring is changed in this milestone.

### M179 Agent Runtime Task Spec Catalog

Required backend compile:

```powershell
python -m py_compile backend/services/agent_orchestrator/task_spec_catalog.py backend/services/architecture_index.py backend/api/alpha_trace_agent_runtime_routes.py
```

Required regression:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_backend_abstractions.ps1
```

Expected:

- Task spec catalog includes qwen, alphatrace_native, tradingagents, and langalpha runner contracts.
- Secret-scrub and timeout policies are documented in the response.
- Runtime architecture index links to `/runtime/task-specs`.

### M180 Frontend Task Spec API Contract

Required frontend build:

```powershell
pnpm --dir frontend build
```

Expected:

- Build succeeds.
- `frontend/app/shared/api/endpoints.ts` exports the task specs endpoint.
- `frontend/app/entities/runtime/api.ts` exports task spec types and `getTaskSpecContractsAsync`.
- No existing page wiring is changed in this milestone.

### M181 Runtime Readiness Summary

Required backend compile:

```powershell
python -m py_compile backend/services/runtime_readiness.py backend/services/architecture_index.py backend/api/alpha_trace_agent_runtime_routes.py
```

Required regression:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_backend_abstractions.ps1
```

Expected:

- `/runtime/readiness` response contains runtimeConfig, modelProviders, orchestrators, taskSpecs, and artifacts sections.
- Response includes action items for missing optional/blocking configuration.
- No raw credentials are returned.

### M182 Frontend Runtime Readiness API Contract

Required frontend build:

```powershell
pnpm --dir frontend build
```

Expected:

- Build succeeds.
- `frontend/app/shared/api/endpoints.ts` exports the readiness endpoint.
- `frontend/app/entities/runtime/api.ts` exports readiness types and `getRuntimeReadinessAsync`.
- No existing page wiring is changed in this milestone.

### M183 Data API Provider Catalog

Required backend compile:

```powershell
python -m py_compile backend/services/data_api/catalog.py backend/services/architecture_index.py
```

Required regression:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_backend_abstractions.ps1
```

Expected:

- Data API catalog includes provider descriptors for static seed, MySQL, Bocha, future professional market data, and LangAlpha.
- Catalog policies clarify credential, fallback, professional data, and legacy BTC/Hyperliquid boundaries.

### M184 Frontend Data API Catalog Contract

Required frontend build:

```powershell
pnpm --dir frontend build
```

Expected:

- Build succeeds.
- `frontend/app/shared/api/endpoints.ts` exports the Data API catalog endpoint.
- `frontend/app/entities/data-source/api.ts` exports Data API catalog types and `getDataApiCatalogAsync`.
- No existing page wiring is changed in this milestone.

### M185 Professional Market Data Adapter Boundary

Required backend compile:

```powershell
python -m py_compile backend/services/integration_adapters/market_data_adapter.py backend/services/integration_adapters/registry.py backend/services/integration_adapters/__init__.py
```

Required regression:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_backend_abstractions.ps1
```

Expected:

- Integration diagnostics include `professional_market_data_provider`.
- Adapter does not call external providers.
- Adapter health is disabled by default unless explicitly configured.

### M186 Abstraction Endpoint Smoke Pack Refresh

Required script syntax check:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_abstraction_endpoints.ps1 -SkipHttp
```

Expected:

- Endpoint list includes runtime readiness, task specs, and artifact catalog.
- `-SkipHttp` passes even when the running Docker backend is stale.

### M187 Architecture Document Alignment for Runtime Read Models

Documentation-only check:

```powershell
Select-String -Path docs/ARCHITECTURE.md -Pattern "Runtime Observability and Artifact Contract Additions"
```

Expected:

- Architecture document includes runtime read model, artifact contract, data provider boundary, and frontend API contract notes.

### M188 Reusable Runtime Readiness Panel

Required frontend build:

```powershell
pnpm --dir frontend build
```

Expected:

- Build succeeds.
- `frontend/app/shared/ui/RuntimeReadinessPanel.tsx` compiles without new dependencies.
- No existing page wiring is changed in this milestone.

### M189 Reusable Data API Catalog Panel

Required frontend build:

```powershell
pnpm --dir frontend build
```

Expected:

- Build succeeds.
- `frontend/app/shared/ui/DataApiCatalogPanel.tsx` compiles without new dependencies.
- No existing page wiring is changed in this milestone.

### M190 Backend Module Boundary Catalog

Required backend compile:

```powershell
python -m py_compile backend/services/backend_module_boundaries.py backend/services/architecture_index.py backend/api/alpha_trace_agent_runtime_routes.py
```

Required regression:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_backend_abstractions.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_abstraction_endpoints.ps1 -SkipHttp
```

Expected:

- Module boundary catalog includes AlphaTrace-owned, legacy, infrastructure-target, external-runner, and external-workbench boundaries.
- Architecture index links `/api/alpha-trace/agent-runs/runtime/module-boundaries`.
- Smoke scripts pass without external provider keys.

### M191 Frontend Module Boundary Contract

Required frontend build:

```powershell
pnpm --dir frontend build
```

Expected:

- Build succeeds.
- `frontend/app/shared/api/endpoints.ts` exports the module boundary endpoint.
- `frontend/app/entities/runtime/api.ts` exports module boundary types and `getRuntimeModuleBoundariesAsync`.
- No existing page wiring is changed.

### M192 Reusable Module Boundary Panel

Required frontend build:

```powershell
pnpm --dir frontend build
```

Expected:

- Build succeeds.
- `frontend/app/shared/ui/ModuleBoundaryPanel.tsx` compiles without new dependencies.
- No existing page wiring is changed.

### M193 External Component Integration Catalog

Required backend compile:

```powershell
python -m py_compile backend/services/external_component_catalog.py backend/services/architecture_index.py backend/api/alpha_trace_agent_runtime_routes.py
```

Required regression:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_backend_abstractions.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_abstraction_endpoints.ps1 -SkipHttp
```

Expected:

- External component catalog includes TradingAgents, LangAlpha, Bocha, and future professional market data.
- Catalog states integration mode, non-goals, runtime requirements, and risk notes.
- No external project is imported or executed.

### M194 Frontend External Component Contract

Required frontend build:

```powershell
pnpm --dir frontend build
```

Expected:

- Build succeeds.
- `frontend/app/shared/api/endpoints.ts` exports the external component endpoint.
- `frontend/app/entities/runtime/api.ts` exports external component types and `getRuntimeExternalComponentsAsync`.
- No existing page wiring is changed.

### M195 Reusable External Component Panel

Required frontend build:

```powershell
pnpm --dir frontend build
```

Expected:

- Build succeeds.
- `frontend/app/shared/ui/ExternalComponentPanel.tsx` compiles without new dependencies.
- No existing page wiring is changed.

### M196 Integration Decision Guide

Required backend compile:

```powershell
python -m py_compile backend/services/integration_decision_guide.py backend/services/external_component_catalog.py backend/services/architecture_index.py backend/api/alpha_trace_agent_runtime_routes.py
```

Required regression:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_backend_abstractions.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_abstraction_endpoints.ps1 -SkipHttp
```

Expected:

- Integration decision guide includes proceed/stop criteria for TradingAgents, LangAlpha, Bocha, and future professional market data.
- Architecture index links `/api/alpha-trace/agent-runs/runtime/integration-decisions`.
- No external project is imported or executed.

### M197 Frontend Integration Decision Contract

Required frontend build:

```powershell
pnpm --dir frontend build
```

Expected:

- Build succeeds.
- `frontend/app/shared/api/endpoints.ts` exports the integration decision endpoint.
- `frontend/app/entities/runtime/api.ts` exports integration decision types and `getRuntimeIntegrationDecisionsAsync`.
- No existing page wiring is changed.

### M198 Reusable Integration Decision Panel

Required frontend build:

```powershell
pnpm --dir frontend build
```

Expected:

- Build succeeds.
- `frontend/app/shared/ui/IntegrationDecisionPanel.tsx` compiles without new dependencies.
- No existing page wiring is changed.

### M199 Architecture Review Bundle

Required backend compile:

```powershell
python -m py_compile backend/services/architecture_review_bundle.py backend/services/architecture_index.py backend/services/backend_module_boundaries.py backend/services/external_component_catalog.py backend/services/integration_decision_guide.py backend/api/alpha_trace_agent_runtime_routes.py
```

Required regression:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_backend_abstractions.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_abstraction_endpoints.ps1 -SkipHttp
```

Expected:

- Architecture review bundle contains architecture, moduleBoundaries, externalComponents, integrationDecisions, readiness, summary, and policies.
- No external project is imported or executed.

### M200 Frontend Architecture Review Contract

Required frontend build:

```powershell
pnpm --dir frontend build
```

Expected:

- Build succeeds.
- `frontend/app/shared/api/endpoints.ts` exports the architecture review endpoint.
- `frontend/app/entities/runtime/api.ts` exports `ArchitectureReviewBundleResponse` and `getRuntimeArchitectureReviewAsync`.
- No existing page wiring is changed.

### M201 Reusable Architecture Review Panel

Required frontend build:

```powershell
pnpm --dir frontend build
```

Expected:

- Build succeeds.
- `frontend/app/shared/ui/ArchitectureReviewPanel.tsx` compiles without new dependencies.
- No existing page wiring is changed.

### M202 Architecture Documentation Alignment for Review Layer

Documentation-only check:

```powershell
Select-String -Path docs/ARCHITECTURE.md -Pattern "Architecture Review and External Component Decision Layer"
```

Expected:

- Architecture document includes backend review endpoints, frontend review components, integration rules, and review workflow.

### M203 Architecture Overview with Directory and Data Flow Diagrams

Documentation-only check:

```powershell
Select-String -Path docs/ARCHITECTURE_OVERVIEW.md -Pattern "Overall Architecture","Agent Runtime Data Flow","Current Directory Structure"
```

Expected:

- Overview includes directory structure, overall architecture diagram, runtime data flow, external component decision flow, Data API/evidence flow, review endpoints, and refactor priorities.

### M204 Data Center, Agent Skill, and ClickHouse Storage Direction Alignment

Required backend compile:

```powershell
python -m py_compile backend/services/data_api/catalog.py backend/services/backend_module_boundaries.py backend/services/external_component_catalog.py backend/services/integration_decision_guide.py backend/services/data_center_catalog.py backend/services/agent_skill_catalog.py backend/services/architecture_index.py backend/services/architecture_review_bundle.py backend/api/alpha_trace_agent_runtime_routes.py
```

Required regression:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_backend_abstractions.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_abstraction_endpoints.ps1 -SkipHttp
pnpm --dir frontend build
```

Documentation check:

```powershell
Select-String -Path docs/PROJECT_SPEC.md,docs/ARCHITECTURE.md,docs/ARCHITECTURE_OVERVIEW.md -Pattern "ClickHouse","Data Center","Agent Skill","Bocha is a tool"
```

Expected:

- Data Center catalog endpoint and skills endpoint are present in endpoint smoke.
- Backend abstraction smoke verifies Data Center connectors and Agent Skill descriptors.
- Architecture review bundle includes `dataCenter` and `skills`.
- Bocha is represented as a tool provider, MySQL as config/task store, and ClickHouse as business/analytics target.

### M205 Reusable Data Center and Agent Skill Panels

Required frontend build:

```powershell
pnpm --dir frontend build
```

Expected:

- `frontend/app/shared/ui/DataCenterPanel.tsx` compiles.
- `frontend/app/shared/ui/AgentSkillPanel.tsx` compiles.
- `ArchitectureReviewPanel` renders review bundle `dataCenter` and `skills` sections.
- No new dependencies are introduced.

### M206 Agent Role Skill Binding Matrix

Required backend compile:

```powershell
python -m py_compile backend/services/agent_skill_bindings.py backend/services/architecture_index.py backend/services/architecture_review_bundle.py backend/api/alpha_trace_agent_runtime_routes.py
```

Required regression:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_backend_abstractions.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/smoke_abstraction_endpoints.ps1 -SkipHttp
pnpm --dir frontend build
```

Expected:

- Binding catalog includes evidence, analyst, research, risk, and portfolio roles.
- Architecture review bundle includes `agentSkillBindings`.
- Endpoint smoke includes `/runtime/agent-skill-bindings`.

### M207 Reusable Agent Skill Binding Panel

Required frontend build:

```powershell
pnpm --dir frontend build
```

Expected:

- `frontend/app/shared/ui/AgentSkillBindingPanel.tsx` compiles.
- `ArchitectureReviewPanel` renders `agentSkillBindings` from the review bundle.
- No new dependencies are introduced.

### M208 Data Center Tool Skill Agent Flow Documentation

Documentation-only check:

```powershell
Select-String -Path docs/engineering/72_data_center_tool_skill_agent_flow.md -Pattern "Data Center","Tool Registry","Skill Catalog","ClickHouse","TradingAgents","LangAlpha"
```

Expected:

- Document describes the end-to-end Data Center -> Tool -> Skill -> Agent -> Store flow.
- Bocha is documented as a backend tool provider.
- MySQL and ClickHouse responsibilities are separated.
