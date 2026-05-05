# AlphaTrace Orchestrator Run Contract

Date: 2026-05-04

Status: MVP contract for TradingAgents subprocess PoC.

## Purpose

AlphaTrace owns the product runtime contract. Runner engines such as Qwen and TradingAgents can execute analysis, but the frontend and product APIs consume only AlphaTrace schemas:

- `AgentRun`
- `AgentRuntimeEvent`
- `AgentReport`
- `EvidenceReference`
- `AgentDecision`

TradingAgents remains a runner engine. Its internal LangGraph state, checkpoints, and raw tool state are not product data and must not be directly exposed as frontend contract.

## Worker Lifecycle

For `runnerType=tradingagents`, the default path is now a subprocess worker.

Lifecycle:

1. `/submit` validates runner enablement and provider configuration.
2. AlphaTrace creates a `running` `AgentRun`.
3. AlphaTrace writes an orchestrator `agent.started` event.
4. AlphaTrace writes `input.json` under the worker directory.
5. `SubprocessOrchestrator` launches `python -m services.agent_runners.tradingagents_worker`.
6. Worker writes runtime events to `events.jsonl`.
7. Parent process tails `events.jsonl` and appends events to `AgentRunStore`.
8. Worker writes final `result.json`.
9. Parent maps `result.json` to reports, evidence, decision, and terminal status.
10. Parent unregisters the subprocess from the process-local worker registry.

## Artifact Directory

Default path:

```text
backend/runtime_data/agent_workers/{runId}
```

Config override:

```text
ALPHATRACE_AGENT_WORKER_DIR
```

Files:

| File | Meaning | Product Data? |
|---|---|---|
| `input.json` | Submit request, initial run snapshot, resolved ticker/date/analysts | No |
| `events.jsonl` | Worker-emitted AlphaTrace runtime events | Debug source; persisted events are product data |
| `result.json` | Worker final mapped result | Debug source; mapped outputs are product data |
| `stdout.log` | Worker stdout | No |
| `stderr.log` | Worker stderr | No |

The product source of truth remains `AgentRunStore`. Artifact files are diagnostics and can be deleted without changing the logical product schema, although deleting them reduces debugging ability.

## API Contract

### Worker Artifacts

```http
GET /api/alpha-trace/agent-runs/{runId}/worker-artifacts
```

Behavior:

- Requires an existing `AgentRun`.
- Only reads fixed files under the configured worker directory.
- Rejects invalid run ids and prevents path traversal.
- Redacts known secret patterns in stdout/stderr.
- Returns `exists=false` for Qwen, Stub, older runs, or deleted artifacts.

### Worker Registry

```http
GET /api/alpha-trace/agent-runs/runtime/workers
```

Behavior:

- Process-local only.
- Reports active subprocesses in the current FastAPI process.
- Not durable across backend restart.
- Empty registry is valid.

Response fields:

- `workerType`
- `activeCount`
- `registeredCount`
- `workers[].runId`
- `workers[].pid`
- `workers[].running`
- `workers[].returnCode`

## Cancellation Contract

```http
POST /api/alpha-trace/agent-runs/{runId}/cancel
```

Behavior:

- If run is terminal, returns current run unchanged.
- If a subprocess worker is registered for `runId`, AlphaTrace sends a best-effort kill signal.
- If no worker is registered, cancellation remains cooperative.
- Run status is set to `cancelled`.
- `agent.run.cancelled` event includes `workerCancellation`.
- Late worker callbacks must not overwrite `cancelled` with `failed`.

Current limitation:

- QwenRunner and StubRunner do not use subprocess worker yet, so their cancellation remains cooperative.

## Runtime Event Guidelines

Orchestrator-level events should use:

- `agent.started` with `agentName=AlphaTrace Orchestrator`
- `tool.called` with `toolName=tradingagents.subprocess_worker`
- `tool.result` with `toolName=tradingagents.subprocess_worker`
- `agent.run.cancelled` for cancellation
- `agent.run.failed` for terminal worker errors that are not cancelled

Worker-emitted events must already be valid `AgentRuntimeEvent` payloads before being written to `events.jsonl`.

## Frontend Display Rules

AgentRunDetail should separate:

1. Product output:
   - Runtime Event Stream
   - Reports
   - Evidence
   - Decision
2. Worker diagnostics:
   - Worker Runtime Artifacts
   - stdout/stderr tails
   - JSONL event tail
3. Global backend logs:
   - Legacy/global runtime log tail

The frontend should not require worker artifacts for Qwen, Stub, or older runs.

## Security Notes

1. API keys must never be written to frontend state or committed files.
2. stdout/stderr should be redacted before returning to the frontend.
3. Artifact endpoint must not accept arbitrary file paths.
4. TradingAgents internal state should only be shown after mapping to AlphaTrace schemas or as explicit debug artifacts.

## Current Limitations

1. Worker registry is process-local and disappears after backend restart.
2. Worker artifacts are file-based diagnostics, not production observability.
3. No distributed queue or worker pool exists.
4. No heartbeat protocol exists between parent and worker.
5. No retry from worker artifact is implemented.
6. QwenRunner has not yet moved to subprocess execution.

## Next Steps

1. Add worker heartbeat events if TradingAgents runs remain long.
2. Move QwenRunner to the same Orchestrator boundary if cancellation/timeout needs become strict.
3. Add durable worker state when MySQL-backed runtime is used in production mode.
4. Add a production worker model only after runner contracts stabilize.
