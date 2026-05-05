# TradingAgents PoC Runtime Validation

Date: 2026-05-01

## Goal

Validate whether TradingAgents can be used as an optional AlphaTrace `AgentRunnerAdapter` without replacing the AlphaTrace backend or exposing TradingAgents internal state to the frontend.

AlphaTrace remains the product backend and continues to expose only:

1. `AgentRun`
2. `AgentRuntimeEvent`
3. `AgentReport`
4. `EvidenceReference`
5. `AgentDecision`

## Enablement

TradingAgents execution is disabled by default.

Required environment variables:

```powershell
$env:ALPHATRACE_TRADINGAGENTS_ENABLED = "true"
$env:TRADINGAGENTS_REPO_PATH = "../TradingAgents"
```

If TradingAgents is installed as a Python package, `TRADINGAGENTS_REPO_PATH` can be omitted.

Model/provider variables depend on the TradingAgents configuration. For Qwen/DashScope testing, the expected minimum is:

```powershell
$env:DASHSCOPE_API_KEY = "<server-side-key>"
$env:QWEN_MODEL = "qwen-plus"
$env:QWEN_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
```

No TradingAgents key or model key should be placed in frontend code.

## Submit Example

```bash
curl -X POST http://127.0.0.1:8802/api/alpha-trace/agent-runs/submit \
  -H "Content-Type: application/json" \
  -d "{\"assetId\":\"asset_etf_510300\",\"taskType\":\"single_asset_analysis\",\"question\":\"Use TradingAgents PoC to analyze SPY.\",\"runnerConfig\":{\"runnerType\":\"tradingagents\",\"modelProvider\":\"qwen\",\"modelName\":\"qwen-plus\",\"enableStreaming\":true,\"extraParams\":{\"ticker\":\"SPY\",\"tradeDate\":\"2025-06-05\",\"selectedAnalysts\":[\"market\"]}}}"
```

## Expected Disabled Behavior

When `ALPHATRACE_TRADINGAGENTS_ENABLED` is not `true`:

```json
{
  "detail": "TradingAgents runner is not enabled."
}
```

HTTP status: `400`.

## Expected Import-Failure Behavior

When enabled but TradingAgents cannot be imported:

```json
{
  "detail": "TradingAgents package is not importable: ..."
}
```

HTTP status: `400`.

This is expected in environments where:

1. the sibling `TradingAgents` repo is not mounted,
2. the Python package is not installed,
3. or required dependencies such as `langgraph.checkpoint.sqlite` are missing.

## Successful PoC Behavior

When enabled and importable:

1. `/submit` immediately returns `runId` with `status=running`.
2. The adapter runs `TradingAgentsGraph(...).propagate(ticker, tradeDate)` in a background thread.
3. AlphaTrace persists events, reports, context evidence, and decision into the existing AgentRun JSON store.
4. `/events/stream` can observe the AlphaTrace events for the run.
5. `/reports`, `/evidence`, and `/decision` return AlphaTrace schema objects.

## Output Mapping

Reports are generated from TradingAgents final state fields when present:

1. `market_report`
2. `sentiment_report`
3. `news_report`
4. `fundamentals_report`
5. `investment_plan`
6. `trader_investment_plan`
7. `risk_debate_state`
8. `final_trade_decision`

Decision action mapping:

1. `buy`, `long`, `bullish` -> `overweight`
2. `sell`, `short`, `bearish` -> `underweight`
3. `hold` -> `hold`
4. unknown -> `watch`

Evidence is limited to:

```txt
ev_tradingagents_poc_context
```

This is runtime context evidence only. It is not a real market-data evidence chain.

## Current Validation Result

Current local discovery found:

1. TradingAgents repo exists as sibling project.
2. `TradingAgentsGraph(selected_analysts, debug, config).propagate(ticker, trade_date)` exists.
3. TradingAgents supports Qwen/DashScope provider configuration.
4. Host import currently fails due missing `langgraph.checkpoint.sqlite`.
5. Docker app does not automatically mount the sibling TradingAgents repo.

Therefore, the first expected validation in the current environment is the disabled or import-failure path, not a successful live TradingAgents run.

TG-POC-1 validation:

1. Disabled submit returned HTTP 400: `TradingAgents runner is not enabled.`
2. Enabled container submit without installed/mounted TradingAgents returned HTTP 400: `TradingAgents package is not importable: No module named 'tradingagents'`.
3. Enabled container submit with a missing `TRADINGAGENTS_REPO_PATH` returned HTTP 400 with the missing path.
4. Stub runner regression returned `status=completed`.
5. Frontend build passed.
6. Backend py_compile passed.

## TG-POC-1.5 Local venv Validation

Date: 2026-05-01

Purpose:

1. Install TradingAgents dependencies in a local Python venv.
2. Verify that AlphaTrace can import TradingAgents from the sibling repo.
3. Verify `runnerType=tradingagents` through the AlphaTrace submit route without using Docker backend.

Local venv:

```txt
H:\git0412\hyperalphaarena_codex\ai-investment-workbench\.venv-alphatrace-tg
```

Python:

```txt
Python 3.12.10
```

Install commands:

```powershell
py -3.12 -m venv .\.venv-alphatrace-tg
.\.venv-alphatrace-tg\Scripts\python.exe -m pip install --upgrade pip
.\.venv-alphatrace-tg\Scripts\python.exe -m pip install -e .\Hyper-Alpha-Arena\backend
.\.venv-alphatrace-tg\Scripts\python.exe -m pip install -e .\TradingAgents
```

Key dependency result:

1. `tradingagents` import passed.
2. `langgraph` import passed.
3. `langgraph.checkpoint.sqlite` import passed.
4. `TradingAgentsGraph` import passed.
5. Missing `langgraph.checkpoint.sqlite` from TG-POC-1 was resolved by installing TradingAgents from its local `pyproject.toml`, which includes `langgraph-checkpoint-sqlite`.

Runtime configuration:

```powershell
$env:ALPHATRACE_TRADINGAGENTS_ENABLED = "true"
$env:TRADINGAGENTS_REPO_PATH = "H:\git0412\hyperalphaarena_codex\ai-investment-workbench\TradingAgents"
$env:QWEN_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
$env:QWEN_MODEL = "qwen-plus"
```

The local validation reused the Hyper AI Qwen key stored server-side in PostgreSQL. The key was decrypted only in process using the existing backend encryption key and was not printed or written to any file.

Local backend note:

1. Direct `uvicorn main:app --port 8812` on Windows initially hit a console encoding issue and legacy startup side effects from the older Hyper Alpha backend.
2. For the PoC, validation used FastAPI `TestClient` against the real AlphaTrace app/routes and the same adapter/service/store path.
3. This avoided modifying Docker or old startup services while still exercising `/api/alpha-trace/agent-runs/submit`.

Disabled smoke test:

```txt
POST /api/alpha-trace/agent-runs/submit runnerType=tradingagents
ALPHATRACE_TRADINGAGENTS_ENABLED=false
```

Result:

```txt
HTTP 400
TradingAgents runner is not enabled.
```

Enabled smoke test:

```txt
POST /api/alpha-trace/agent-runs/submit
runnerType=tradingagents
ticker=SPY
tradeDate=2025-06-05
selectedAnalysts=["market"]
```

Result:

1. Submit returned HTTP 200 immediately.
2. `runId=run_tradingagents_20260501_153611_428611`
3. Initial status was `running`.
4. TradingAgents package and `TradingAgentsGraph` were importable.
5. TradingAgents graph execution started and was persisted as AlphaTrace events.
6. The run ended as `failed` because TradingAgents' internal Yahoo Finance data access returned `Too Many Requests. Rate limited. Try after a while.`
7. AlphaTrace persisted the failed run, runtime events, failure report, PoC context evidence, and fallback `watch` decision.

Generated AlphaTrace artifacts for the failed PoC run:

1. Events: 7
2. Reports: 1 (`TradingAgents PoC Failure Report`)
3. Evidence: 1 (`ev_tradingagents_poc_context`)
4. Decision: fallback `watch`, confidence `0.5`

Endpoint patch note:

TradingAgents' qwen provider defaults to `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`. The current local Hyper AI key is valid for the configured AlphaTrace endpoint `https://dashscope.aliyuncs.com/compatible-mode/v1`. The adapter now patches TradingAgents' qwen provider endpoint at runtime to use `QWEN_BASE_URL`. This does not modify TradingAgents source code.

Regression:

1. Stub runner submit still returned `status=completed`, `mode=stub`.
2. Qwen runner code path was not modified by TG-POC-1.5.

Validation commands:

```powershell
.\.venv-alphatrace-tg\Scripts\python.exe -m py_compile backend/services/agent_runners/tradingagents_adapter.py backend/services/agent_runners/registry.py backend/services/alpha_trace_agent_runtime_service.py backend/schemas/alpha_trace_agent_runtime.py
cd Hyper-Alpha-Arena/frontend
pnpm build
```

Result:

1. py_compile passed.
2. pnpm build passed with existing Vite warnings only.

## Limitations

1. No TradingAgents graph streaming is implemented in TG-POC-1.
2. No TradingAgents code is copied into Hyper-Alpha-Arena.
3. No TradingAgents project source is modified.
4. No real trading is performed.
5. No real database is written.
6. TradingAgents checkpoint state remains runner-internal and is not product persistence.
7. TG-POC-1.5 did not complete a successful TradingAgents final decision because the external Yahoo Finance data source was rate limited during the run.

## 2026-05-01 Update: TG-POC-1.5 Local Venv and Offline SPY Validation

Local venv:

`H:\git0412\hyperalphaarena_codex\ai-investment-workbench\.venv-alphatrace-tg`

Validation summary:

- Python 3.12.10.
- Installed Hyper-Alpha-Arena backend into the venv.
- Installed sibling TradingAgents repo into the venv with editable install.
- Import checks passed for `tradingagents`, `langgraph`, `langgraph.checkpoint.sqlite`, and `TradingAgentsGraph`.
- Disabled smoke returned HTTP 400 with `TradingAgents runner is not enabled.`
- Enabled PoC with `SPY` and `offlineData=true` completed.

Completed PoC run:

- `runId`: `run_tradingagents_20260501_164331_478899`
- `ticker`: `SPY`
- `tradeDate`: `2025-06-05`
- `status`: `completed`
- `events`: `15`
- `reports`: `5`
- `evidence`: `1`
- `decision.action`: `hold`
- `decision.confidence`: `0.6`

Reports generated:

- TradingAgents Market Report
- TradingAgents Investment Plan
- TradingAgents Trader Plan
- TradingAgents Risk Review
- TradingAgents Final Decision

The run used AlphaTrace offline static market context to avoid yfinance rate-limit failures. No TradingAgents source code was modified.

## 2026-05-02 Update: M9 Runtime Environment Diagnostics

Goal:

Standardize how operators determine whether TradingAgents PoC can run in the current backend process.

Status endpoint:

```txt
GET /api/alpha-trace/agent-runs/runners/status
```

TradingAgents status values:

1. `disabled` - `ALPHATRACE_TRADINGAGENTS_ENABLED` is not `true`.
2. `import_error` - PoC is enabled but the TradingAgents package or sibling repo cannot be imported.
3. `missing_qwen_key` - TradingAgents is importable but no Qwen/DashScope key is visible to this backend process.
4. `ready` - TradingAgents is enabled, importable, and Qwen key is available.

Returned diagnostic fields:

1. `repoPathConfigured`
2. `repoPathExists`
3. `repoPath`
4. `importable`
5. `importError`
6. `qwenKeyConfigured`
7. `qwenConfigSource`

Qwen key reuse rule:

1. TradingAgents first uses `DASHSCOPE_API_KEY` if it exists in the backend process environment.
2. If the environment variable is absent, the adapter attempts to hydrate it from the server-side Hyper AI Qwen profile.
3. A Qwen key saved from the Settings page can therefore be reused by TradingAgents only when the TradingAgents run is submitted to the same backend process/database profile that can read that Settings entry.
4. If Docker backend owns the Settings entry but TradingAgents is run from a separate local venv backend, the local venv backend will not automatically see the Docker-only profile unless it points to the same database/config store or receives `DASHSCOPE_API_KEY` through environment variables.

Operational modes:

1. Local venv PoC:
   - Use `.venv-alphatrace-tg`.
   - Set `ALPHATRACE_TRADINGAGENTS_ENABLED=true`.
   - Set `TRADINGAGENTS_REPO_PATH` to the sibling `TradingAgents` repo.
   - Either configure Qwen in the same backend profile or set `DASHSCOPE_API_KEY`.
2. Docker-adjacent mode:
   - Current Docker image does not package TradingAgents dependencies.
   - Docker can still run QwenRunner and other AlphaTrace services.
   - To run TradingAgents inside Docker later, add a dedicated Docker profile or image layer; do not silently mount host venvs.

Frontend:

Agent Lab `Runner Runtime Status` now displays repo/import/Qwen key diagnostics without exposing secret values.

## 2026-05-02 Update: M10 Local PoC Operating Kit

Decision:

TradingAgents remains a local-vendored PoC runner for now. Docker packaging is deferred because the current image does not include TradingAgents dependencies, and silently mounting a host venv into Docker would make the runtime harder to reproduce.

Helper scripts:

```txt
scripts/alphatrace/start_tradingagents_backend.ps1
scripts/alphatrace/check_tradingagents_status.ps1
scripts/alphatrace/submit_tradingagents_spy_poc.ps1
```

Start local TradingAgents-enabled backend:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/start_tradingagents_backend.ps1
```

Default behavior:

1. Uses sibling workspace root `..\`.
2. Uses venv `..\.venv-alphatrace-tg`.
3. Uses sibling repo `..\TradingAgents`.
4. Starts `uvicorn main:app` with backend app-dir on port `8812`.
5. Sets:
   - `ALPHATRACE_TRADINGAGENTS_ENABLED=true`
   - `TRADINGAGENTS_REPO_PATH=<workspace>\TradingAgents`
   - `ALPHATRACE_BACKEND_LOG_PATH=<repo>\backend-tg-local.log`
   - `PYTHONUTF8=1`
   - `PYTHONIOENCODING=utf-8`
6. Does not set or store `DASHSCOPE_API_KEY`.

Check status:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/check_tradingagents_status.ps1
```

Submit SPY offline PoC:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/submit_tradingagents_spy_poc.ps1
```

Dry-run validation:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/start_tradingagents_backend.ps1 -DryRun
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/check_tradingagents_status.ps1 -DryRun
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/submit_tradingagents_spy_poc.ps1 -DryRun
```

Security note:

The scripts never print, write, or persist API key values. Qwen/DashScope credentials must come from either the active backend's server-side Hyper AI profile or from a pre-existing `DASHSCOPE_API_KEY` environment variable.

Docker note:

Docker remains supported for QwenRunner and the AlphaTrace MVP path. TradingAgents inside Docker should be implemented later as an explicit Docker profile or image layer, not as an implicit host-path dependency.
