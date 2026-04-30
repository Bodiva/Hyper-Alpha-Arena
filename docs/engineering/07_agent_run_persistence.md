# AlphaTrace Agent Run Persistence

## 1. Goal

AlphaTrace Agent Lab now supports asynchronous Qwen runs and SSE progress. Before this task, AgentRun, runtime events, reports, evidence references, and decisions lived only in process memory. A backend restart lost all submitted runs.

Task 29 adds a minimal persistence store so recently submitted AlphaTrace runs remain queryable after service restart.

## 2. Store Choice

The current implementation uses a JSON store by default:

```txt
backend/runtime_data/alpha_trace_agent_runs.json
```

In Docker, `docker-compose.yml` overrides the path to the existing persistent `app_data` volume:

```txt
/app/data/alpha_trace_agent_runs.json
```

Reasons:

1. The project already has SQLAlchemy/Postgres and many existing migrations, but adding new DB models now would touch shared legacy database files and migration startup behavior.
2. The Task 29 goal is minimal persistence for Agent Runtime data, not production-grade database design.
3. JSON storage keeps the AlphaTrace runtime isolated from old trading/database modules.
4. The store abstraction leaves room for a future DB-backed implementation.

The JSON file is runtime data and is ignored by Git.

## 3. Environment Variables

Default behavior:

```txt
ALPHA_TRACE_AGENT_RUN_STORE=json
ALPHA_TRACE_AGENT_RUN_STORE_PATH=backend/runtime_data/alpha_trace_agent_runs.json
```

Docker compose behavior:

```txt
ALPHA_TRACE_AGENT_RUN_STORE=json
ALPHA_TRACE_AGENT_RUN_STORE_PATH=/app/data/alpha_trace_agent_runs.json
```

The `/app/data` directory is backed by the `app_data` Docker volume. This is the same persistent volume already used by the application for runtime data, so Task 29.5 does not add a second overlapping mount under `/app/data`.

Supported store values:

1. `json`: default development persistence store.
2. `memory`: process-local store, useful for tests or fully ephemeral runs.
3. `db`: reserved; currently returns a clear not-implemented error.

If `ALPHA_TRACE_AGENT_RUN_STORE_PATH` is relative, it is resolved from the backend process current working directory. If it is omitted, the backend uses `backend/runtime_data/alpha_trace_agent_runs.json`.

## 4. Store Interface

`AgentRunStore` exposes:

1. `save_run(run)`
2. `get_run(run_id)`
3. `list_runs()`
4. `update_run_status(run_id, status, timestamp=None)`
5. `append_event(run_id, event)`
6. `get_events(run_id)`
7. `save_reports(run_id, reports, llm_calls=None)`
8. `get_reports(run_id)`
9. `save_evidence(run_id, evidence)`
10. `get_evidence(run_id)`
11. `save_decision(run_id, decision)`
12. `get_decision(run_id)`

The service layer no longer needs to directly mutate scattered global runtime dicts for submitted runs.

## 5. Persisted Data

The JSON store persists:

1. AgentRun snapshots, including status, participants, reports, events, metrics, and final decision.
2. Runtime events by run.
3. Agent reports by run.
4. Evidence references by run.
5. Final decision by run.

Complex nested data is stored through Pydantic `model_dump()` payloads and reloaded with `model_validate()`.

## 6. Runtime Integration

The following endpoints now read from `AgentRunStore`:

1. `GET /api/alpha-trace/agent-runs`
2. `GET /api/alpha-trace/agent-runs/{runId}`
3. `GET /api/alpha-trace/agent-runs/{runId}/events`
4. `GET /api/alpha-trace/agent-runs/{runId}/reports`
5. `GET /api/alpha-trace/agent-runs/{runId}/evidence`
6. `GET /api/alpha-trace/agent-runs/{runId}/decision`
7. `GET /api/alpha-trace/agent-runs/{runId}/events/stream`

The following writes also go through the store:

1. `/demo` run creation.
2. `/submit` run creation.
3. Qwen runtime event append.
4. Qwen report/evidence/decision updates.
5. Qwen status transitions to `running`, `completed`, or `failed`.

## 7. Current Boundaries

This task intentionally does not implement:

1. TradingAgents integration.
2. Database schema or migration.
3. User permission isolation.
4. Task cancellation.
5. Retry policy.
6. Distributed worker coordination.
7. Cross-process locking.

JSON persistence is a development-stage durability layer, not a production store.

## 8. Cleanup

To clear local AlphaTrace runtime data:

```powershell
Remove-Item backend\runtime_data\alpha_trace_agent_runs.json
```

The next backend start will reseed the static `demo-run-001`.

To clear Docker-persisted AlphaTrace runtime data without removing all app data:

```powershell
docker compose exec app rm -f /app/data/alpha_trace_agent_runs.json
docker compose restart app
```

To remove Docker volumes entirely:

```powershell
docker compose down -v
```

Use `down -v` carefully. It deletes named volumes, including Postgres and app runtime data.

To inspect volume names:

```powershell
docker volume ls
```

In this project the AlphaTrace JSON store currently lives in the `app_data` volume, mounted at `/app/data`.

## 9. Restart Verification

Suggested verification flow:

1. Start backend.
2. Submit a Qwen run through `POST /api/alpha-trace/agent-runs/submit`.
3. Wait until the run reaches `completed` or `failed`.
4. Confirm `backend/runtime_data/alpha_trace_agent_runs.json` contains the run.
5. Restart the app container or backend process.
6. Query:

```bash
curl http://127.0.0.1:8802/api/alpha-trace/agent-runs/{runId}
curl http://127.0.0.1:8802/api/alpha-trace/agent-runs/{runId}/events
curl http://127.0.0.1:8802/api/alpha-trace/agent-runs/{runId}/reports
curl http://127.0.0.1:8802/api/alpha-trace/agent-runs/{runId}/decision
```

7. Open:

```txt
/dashboard#agent-lab/runs/{runId}
```

The run should remain visible after restart.

For Docker container recreation verification:

```powershell
docker compose up -d --force-recreate app
```

Because the JSON file is stored under `/app/data`, it remains available after container recreation as long as the `app_data` volume is not deleted.

`docker compose restart app` restarts the existing container. `docker compose up -d --force-recreate app` removes and recreates the app container. Both preserve named volumes. `docker compose down -v` removes named volumes and deletes the persisted JSON store.

## 10. Future DB Migration

When moving to a production backend, add a DB implementation behind the same `AgentRunStore` interface. Recommended tables:

1. `alpha_trace_agent_runs`
2. `alpha_trace_agent_runtime_events`
3. `alpha_trace_agent_reports`
4. `alpha_trace_agent_evidence`
5. `alpha_trace_agent_decisions`

The JSON store should then remain only for local development or test fixtures.

## 11. Multi-step Qwen Run Persistence

Task 30 increases the amount of runtime data saved per Qwen run.

The JSON store now persists:

1. Multiple reports per run:
   - Market View Report
   - Bull View Report
   - Bear View Report
   - Risk Review Report
2. Multiple evidence references per run:
   - Market assumption
   - Bull assumption
   - Bear assumption
   - Risk assumption
3. Multi-step runtime events for Market / Bull / Bear / Risk / Final Decision.
4. The final `AgentDecision` inferred from the `Final Decision` section.

No store schema migration is required because the JSON store persists Pydantic model payloads. Existing single-report runs remain readable.

## 12. Static Evidence Retrieval Persistence

Task 31 changes the evidence payload saved for Qwen runs. When static retrieval succeeds, the JSON store persists the retrieved evidence references instead of only `ev_qwen_*_assumption` placeholders.

Persisted evidence may now include optional metadata:

1. `reliabilityScore`
2. `publishedAt`
3. `url`
4. `relatedAssetIds`
5. `extractedFields`

No JSON store schema migration is required. Existing runs with older assumption evidence remain readable because these fields are optional.

## Task 36: Portfolio Diagnosis Persistence

Portfolio diagnosis Agent Runs use the same AgentRunStore persistence path as other Qwen runs. The stored payload includes:

- the running/completed AgentRun detail;
- runtime events for portfolio context loading, evidence retrieval, Qwen steps, and final decision updates;
- generated reports such as Portfolio Overview / Exposure Review and Risk Review / Rebalance Suggestions;
- retrieved evidence references;
- final decision and observation indicators.

The default JSON store still persists these records in `backend/runtime_data/alpha_trace_agent_runs.json` for local development, or `/app/data/alpha_trace_agent_runs.json` when the Docker volume is configured. No database-backed persistence is introduced in this task.
