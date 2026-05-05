# Agent Run Token Usage Tracking

## Goal

Add per-task token usage visibility for AlphaTrace Qwen / Native runs:

- update token metrics while a run is still streaming,
- expose the live totals through existing runtime SSE events,
- persist the latest totals on `AgentRun.metrics`,
- avoid new dependencies and avoid exposing provider secrets.

## Implementation

The runtime reuses the existing `metric.updated` event type.

`RuntimeMetrics` now includes:

- `promptTokens`
- `completionTokens`
- `totalTokens`

Qwen streaming steps estimate prompt tokens before each model call and completion tokens as streaming text accumulates. The runner emits:

```json
{
  "type": "metric.updated",
  "payload": {
    "stepId": "bull_view",
    "metrics": {
      "promptTokens": 2031,
      "completionTokens": 185,
      "totalTokens": 2216
    },
    "tokenDelta": {
      "promptTokens": 0,
      "completionTokens": 12,
      "totalTokens": 12
    },
    "tokenCountingMode": "estimated"
  }
}
```

The same metrics are saved back to `AgentRun.metrics`, so the current values survive backend restart when MySQL / JSON store persistence is enabled.

## Counting Method

Current counting is estimated:

- CJK characters are counted close to one token each.
- Latin / symbol characters use a character-to-token ratio.
- No tokenizer dependency is added.

This keeps the feature lightweight and stable for the MVP. If Qwen / DashScope returns exact usage in a future non-streaming or final streaming metadata payload, the estimator can be replaced with provider usage without changing the frontend contract.

## Frontend

`AgentRunDetailPage` Runtime Metrics now displays:

- Prompt Tokens
- Completion Tokens
- Total Tokens

The page merges static `run.metrics` with SSE-derived `runtimeSnapshot.metrics`, so running tasks update in near real time.

## Validation

2026-05-05 validation:

- `python -m py_compile backend/schemas/alpha_trace_agent_runtime.py backend/services/agent_runners/qwen_runner.py backend/services/alpha_trace_agent_runtime_service.py backend/services/agent_runtime_store/memory_store.py backend/services/agent_runtime_store/json_store.py backend/services/agent_runtime_store/mysql_store.py`: passed.
- `pnpm --dir frontend build`: passed.
- Submitted Native run `run_native_20260505_032154_858435`.
- Observed 13 `metric.updated` events during the first short polling window with monotonic token totals.
- Cancelled the run after validation to avoid unnecessary model usage.
- Restarted app and verified the run remained queryable with persisted token metrics.

## Follow-up Fix

During validation, MySQL returned `Out of sort memory` for endpoints depending on `AgentRunStore.list_runs()` because it sorted large `payload_json` rows directly.

The MySQL store now sorts lightweight `run_id` rows first, then fetches payloads by id. This keeps leaderboard/evidence list queries stable without changing schema.

## MySQL Run Metrics Table

Run-level metrics are also normalized into a dedicated MySQL table:

`alpha_trace_agent_run_metrics`

Key fields:

- `run_id`
- `status`
- `mode`
- `asset_id`
- `portfolio_id`
- `strategy_id`
- `task_type`
- `started_at`
- `updated_at`
- `completed_at`
- `llm_calls`
- `tool_calls`
- `generated_reports`
- `duration_seconds`
- `prompt_tokens`
- `completion_tokens`
- `total_tokens`
- `estimated_cost_usd`
- `payload_json`

The table is upserted whenever the runtime saves an `AgentRun` payload. It is intentionally run-level, not event-level. Raw token update events remain in `alpha_trace_runtime_events`.

Startup also performs a non-destructive backfill from existing `alpha_trace_agent_runs.payload_json`, so old runs become available for aggregate reporting without changing their source payload.

Validation on 2026-05-05:

- Table exists in MySQL.
- Backfill produced 81 rows.
- Latest rows include persisted token metrics for Native/Qwen runs.
- Runtime smoke passed 15/15.
- Route smoke passed 12/12.

## Limitations

- Counts are estimates, not provider-billed exact usage.
- Current metrics are run-level totals, not a separate persisted per-step token table.
- Cancelled in-process model calls may still write a few metric events until the underlying HTTP stream exits; this is a known limitation of the current in-process runner model.
