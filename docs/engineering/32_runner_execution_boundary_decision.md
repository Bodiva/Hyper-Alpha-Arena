# AlphaTrace Runner Execution Boundary Decision

Date: 2026-05-04

Status: accepted for the current milestone.

## Decision

AlphaTrace will use different execution boundaries for different runner types:

| Runner | Current execution boundary | Decision |
|---|---|---|
| `stub` | In-process | Keep in-process. |
| `qwen` | In-process background execution | Keep in-process for now. |
| `tradingagents` | Subprocess worker | Keep subprocess worker as the default. |
| `langalpha` | Design-only / disabled | Treat as a future external service adapter, not an in-process runner. |

The product-facing contract remains AlphaTrace schema:

1. `AgentRun`
2. `AgentRuntimeEvent`
3. `AgentReport`
4. `EvidenceReference`
5. `AgentDecision`

Runner-specific internal state, worker artifacts, logs, LangGraph checkpoints, or external workbench state must not become the frontend contract.

## Why TradingAgents Uses A Subprocess Boundary

TradingAgents is a LangGraph-based runtime with graph traversal, tool calls, model calls, checkpoint behavior, and external project dependencies.

The subprocess boundary is justified because:

1. LangGraph/tool execution can be long-running or stuck.
2. Python threads cannot safely kill a blocked model/tool call.
3. TradingAgents dependencies and import failures should not break FastAPI startup.
4. Worker stdout/stderr and JSONL artifacts are useful diagnostics.
5. Cancel semantics need a best-effort process termination path.
6. The PoC should remain opt-in and isolated from QwenRunner and StubRunner.

Current implementation:

1. Parent FastAPI process creates and persists the AlphaTrace `AgentRun`.
2. Parent launches a subprocess worker for `runnerType=tradingagents`.
3. Worker writes `events.jsonl`, `result.json`, `stdout.log`, and `stderr.log`.
4. Parent monitors worker files and maps output back into AlphaTrace schema.
5. Parent can terminate a registered subprocess worker on cancel.

## Why QwenRunner Stays In-Process For Now

QwenRunner should not be moved into a subprocess in the current phase.

Reasons:

1. Qwen streaming and typewriter-style Live Output are already stable and central to the current AgentRunDetail experience.
2. Qwen execution is a bounded HTTP API call path controlled by request timeout and runner-level error handling.
3. Moving Qwen into a subprocess would add event relay complexity and could regress smooth streaming.
4. Qwen does not currently import a large external graph runtime or execute arbitrary tool chains.
5. The current Qwen path already persists events, reports, evidence, and decisions through `AgentRunStore`.

The engineering tradeoff is explicit:

1. Qwen in-process has lower overhead and better live streaming latency.
2. Qwen in-process has weaker hard-cancel semantics than a subprocess.
3. TradingAgents subprocess has stronger isolation and cancellation, but higher complexity and diagnostic overhead.

## Qwen Subprocess Migration Triggers

Move QwenRunner behind an Orchestrator worker only if one or more of these conditions becomes true:

1. Qwen calls repeatedly hang despite configured HTTP timeout.
2. Users need hard cancel/kill semantics for Qwen tasks.
3. Qwen multi-agent mode creates unbounded thread or memory pressure.
4. Provider-specific SDKs create unstable imports or global state.
5. A unified worker quota/concurrency model becomes mandatory.
6. Security requirements require provider calls to run in an isolated process.

Until those triggers are observed, QwenRunner remains in-process.

## Future Qwen Worker Design If Needed

If QwenRunner is later moved behind the Orchestrator boundary, the worker must preserve existing product behavior:

1. Worker emits AlphaTrace-compatible `AgentRuntimeEvent` JSONL.
2. Streaming chunks remain `reasoning.chunk` events with `payload.streaming=true`.
3. Parent tails worker `events.jsonl` and writes events to `AgentRunStore`.
4. Parent continues serving SSE from `AgentRunStore`.
5. Cancel terminates the worker process.
6. Final reports, evidence, and decision remain in AlphaTrace schema.
7. AgentRunDetail should not know whether chunks came from in-process code or a worker.

The worker boundary must not expose raw provider responses or internal worker state as frontend contracts.

## LangAlpha Boundary

LangAlpha is not a good in-process runner candidate for the current phase. It resembles a full agent workbench backend with its own services, persistence, workspaces, tools, and event buffering.

Recommended future boundary:

1. AlphaTrace submits a task to a LangAlpha external service adapter.
2. LangAlpha owns its internal workspace/thread/task execution.
3. AlphaTrace polls or streams LangAlpha outputs through an adapter.
4. Adapter maps outputs to AlphaTrace `AgentRuntimeEvent`, `AgentReport`, `EvidenceReference`, and `AgentDecision`.
5. AlphaTrace remains the product backend and persistence owner.

## Current Execution Policy

The current policy is:

| Runner type | Execution mode | Reason |
|---|---|---|
| `stub` | `in_process` | Deterministic and low-risk. |
| `qwen` | `in_process` | Smooth streaming, bounded HTTP calls, lower overhead. |
| `tradingagents` | `subprocess` | Long-running graph/tool runtime, killable boundary, diagnostics. |
| `langalpha` | `external_disabled` | Future external service adapter; not embedded. |

This policy should become an explicit small policy layer in the next milestone so UI and diagnostics can show execution mode consistently.

## Next Milestone Recommendation

Recommended next milestone:

`M25 - Orchestrator Policy Layer v1`

Scope:

1. Add a small runner execution policy helper.
2. Report each runner's execution mode in runner status diagnostics.
3. Keep behavior unchanged:
   - `stub -> in_process`
   - `qwen -> in_process`
   - `tradingagents -> subprocess`
   - `langalpha -> external_disabled`
4. Show execution mode in Agent Lab diagnostics.

Out of scope for M25:

1. No Qwen subprocess migration.
2. No LangAlpha real integration.
3. No queue or distributed worker.
4. No Docker/package change.

## Risks

1. Qwen hard cancel remains cooperative while in-process.
2. TradingAgents subprocess diagnostics are process-local and not durable worker history.
3. Docker backend may lag behind local source until rebuilt.
4. Worker artifacts are debug data and must not be treated as product persistence.

## Validation

This milestone is documentation-only.

Required checks:

1. The decision document exists.
2. The document states the QwenRunner in-process decision.
3. The document states the TradingAgents subprocess decision.
4. The document states the future triggers for moving Qwen to subprocess.

