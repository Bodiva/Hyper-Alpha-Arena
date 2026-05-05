# Async Task Manager and Scheduler Design

Status: M120 design baseline.  
Date: 2026-05-05.

## Goal

AlphaTrace currently uses in-process threads and a subprocess orchestrator. The next production step is a unified task manager that can represent submit, run, cancel, timeout, retry, reconnect, and failure states independent of runner implementation.

## Status Vocabulary

| Status | Meaning |
|---|---|
| `pending` | Accepted but not started. |
| `running` | Worker has started. |
| `completed` | Outputs persisted successfully. |
| `failed` | Terminal error with persisted reason. |
| `cancelled` | User/system cancellation completed. |
| `timed_out` | Execution exceeded timeout. |

## Execution Modes

| Mode | Current | Future |
|---|---|---|
| In-process thread | Qwen/Native MVP. | Keep for local/dev low-cost runs. |
| Subprocess worker | TradingAgents PoC. | Use for dependency-heavy or killable workers. |
| Durable worker | Not implemented. | MySQL task table + worker process; optional Redis later. |

## Minimum MySQL Task Table Draft

`alpha_trace_async_tasks`

| Field | Type | Notes |
|---|---|---|
| `task_id` | varchar pk | May equal runId initially. |
| `run_id` | varchar index | AgentRun link. |
| `runner_type` | varchar index | qwen/native/tradingagents/langalpha/custom. |
| `task_type` | varchar index | single_asset_analysis, portfolio_diagnosis, etc. |
| `status` | varchar index | Status vocabulary above. |
| `attempt` | int | Retry counter. |
| `max_attempts` | int | Default 1. |
| `timeout_seconds` | int | Per run timeout. |
| `cancellation_requested` | tinyint | Cooperative cancellation flag. |
| `started_at` | varchar/datetime | Use typed datetime in final migration. |
| `updated_at` | varchar/datetime | Cursor for monitoring. |
| `completed_at` | varchar/datetime | Terminal timestamp. |
| `error_code` | varchar | Machine-readable reason. |
| `error_message` | text | User-visible sanitized reason. |
| `payload_json` | json | Request/scheduler payload. |
| `result_json` | json | Worker result summary. |

## Scheduler Responsibilities

1. Accept task and persist snapshot.
2. Start execution through selected mode.
3. Append runtime events on state transitions.
4. Enforce timeout and cancellation.
5. Persist failure reason even if runner crashes.
6. Provide status to API and frontend diagnostics.
7. Avoid duplicating work after frontend refresh.

## Non-Goals For Current Pass

1. No Celery/Redis.
2. No Docker worker container.
3. No destructive migration.
4. No TradingAgents deep integration.

## Migration Plan

1. Keep existing runtime behavior.
2. Add task snapshot alongside AgentRun metrics.
3. Route new submits through task manager while preserving `/submit` response.
4. Move Qwen/Native to scheduler-managed threads.
5. Move TradingAgents subprocess into scheduler-managed worker.
6. Add cancellation/retry endpoints only after state table is stable.
