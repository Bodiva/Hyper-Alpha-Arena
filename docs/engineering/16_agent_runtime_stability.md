# Agent Runtime Stability Notes

## Scope

Task 39 adds small stability guards around the AlphaTrace Agent Runtime path without changing the runner model, persistence model, or frontend page flow.

## Changes

- `/api/alpha-trace/agent-runs/submit` now wraps unexpected backend exceptions in a clear HTTP 500 message instead of leaking an unstructured failure.
- `/api/alpha-trace/agent-runs/{runId}/events/stream` now sends `Cache-Control: no-cache` and `Connection: keep-alive` headers for SSE clients.
- The frontend SSE client treats a `done` event with `status=running` as an interrupted stream, not as a completed run.
- Agent timeline rendering now falls back to a generic failure message when an event does not include a detailed error string.

## Current Failure Semantics

- Unsupported runner types still return HTTP 400 with a clear not-implemented message.
- Runner configuration failures still return HTTP 400.
- Runner execution failures still return HTTP 502.
- Unexpected submit failures return HTTP 500 with an `Agent run submit failed unexpectedly` prefix.
- SSE idle timeout returns a `done` marker with `status=running`; the frontend reports it as an interrupted stream and refreshes run detail via HTTP fallback.

## Out of Scope

- No TradingAgents integration.
- No retry queue.
- No cancellation endpoint.
- No persistent job scheduler.
- No real database writes.
