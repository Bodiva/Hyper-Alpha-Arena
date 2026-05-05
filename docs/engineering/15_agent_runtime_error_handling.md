# Agent Runtime Error Handling

Date: 2026-05-01

## Goal

Task 39 hardens AlphaTrace Agent Runtime failure behavior without changing the runner architecture. The goal is to keep failed runs explainable, queryable, and replayable through the existing JSON store and AgentRunDetailPage.

## Failure Cases Covered

### Qwen configuration / request failure

When Qwen configuration is unavailable or a request fails, the runner now persists failure artifacts:

- `agent.failed` event
- `agent.run.failed` event
- run status `failed`
- `Qwen Runtime Failure Report`
- fallback `AgentDecision` with `action=watch` and `confidence=0.5`

The fallback decision is explicitly marked as a failure fallback and must not be treated as an investment conclusion.

### Qwen timeout

Timeouts raised by the Qwen HTTP client are propagated as runner execution errors. The background runner catches them through the same failure path, persists failed events, and marks the run as failed.

### Abnormal Qwen output structure

If Qwen returns malformed or unparseable output during mapping, the mapper falls back to a raw report path:

- Market View report stores a raw Qwen output excerpt.
- Bull / Bear / Risk sections receive low-structure fallback text.
- Final decision defaults to `watch`.
- Confidence falls back to the parser default.
- A runtime warning is appended to explain the parser fallback.

### Empty evidence retrieval

If no retrieved evidence exists, the runner keeps the existing Qwen assumption fallback but marks assumption evidence as lower quality (`qualityScore=45`). The run continues instead of failing.

### SSE interruption

The frontend EventSource client already reports stream errors. AgentRunDetailPage now annotates the stream error with an HTTP events fallback message and attempts to reload latest runtime events and run outputs via HTTP.

## Frontend Behavior

AgentRunDetailPage now displays a visible failure message when `run.status === FAILED`. It derives the message from `agent.failed` / `agent.run.failed` events and does not require a new backend endpoint.

## Validation

Validation used a local forced-failure run with a fake Qwen configuration and no external model call dependency. The runner persisted:

- final status: `failed`
- failed events: present
- failure report: present
- fallback decision: `watch`, confidence `0.5`

Build checks:

- `python -m py_compile backend/services/agent_runners/qwen_runner.py backend/services/alpha_trace_agent_runtime_service.py backend/schemas/alpha_trace_agent_runtime.py`
- `cd frontend && pnpm build`

## Non-Goals

- No TradingAgents integration.
- No real DB persistence.
- No retry / cancellation scheduler.
- No external search or real-time market data.
