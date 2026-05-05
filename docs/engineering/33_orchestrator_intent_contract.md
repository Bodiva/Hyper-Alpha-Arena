# AlphaTrace Orchestrator Intent Contract

Date: 2026-05-04

Status: v1 implemented as diagnostics and capability metadata.

## Purpose

AlphaTrace needs a clear boundary between user intent, runner capability, and execution mode before adding a true Orchestrator / intent worker.

This document defines the first version of that contract:

1. User-facing task intent stays in AlphaTrace schema.
2. Runner adapters advertise capabilities.
3. AlphaTrace does not silently fallback from one runner to another.
4. Execution mode is visible to operators and users.
5. Future Orchestrator logic can use the same capability matrix.

## Current Capability Matrix

| Runner | Execution mode | Supported tasks | Streaming | Evidence | Portfolio context | External tools | Production ready |
|---|---|---|---|---|---|---|---|
| `stub` | `in_process` | `single_asset_analysis`, `portfolio_diagnosis` | No | No | No | No | No |
| `qwen` | `in_process` | `single_asset_analysis`, `portfolio_diagnosis` | Yes | Yes | Yes | Yes | No |
| `tradingagents` | `subprocess` | `single_asset_analysis` | Yes | Yes | No | Yes | No |
| `langalpha` | `external_disabled` | none | No | No | No | No | No |

The matrix is intentionally conservative. It records what is supported by the current product path, not what could theoretically be implemented later.

## Intent Fields

The current submit contract already contains the core intent fields:

1. `taskType`
2. `assetId`
3. `portfolioId`
4. `strategyId`
5. `question`
6. `horizon`
7. `riskPreference`
8. `evidenceScope`
9. `runnerConfig.runnerType`
10. `runnerConfig.extraParams`

Future Orchestrator logic should use these fields to recommend a runner, but should not rewrite user intent silently.

## Recommendation Rule

The current policy is advisory:

1. If `runnerConfig.runnerType` is explicit, AlphaTrace uses that runner or returns a clear error.
2. If no runner is explicit, `qwen` is the default MVP research runner.
3. `portfolio_diagnosis` recommends `qwen` because it needs AlphaTrace portfolio context.
4. `tradingagents` is only recommended for explicit PoC single-asset requests, typically ticker-based examples such as `SPY`.
5. `langalpha` is not recommended because it is design-only.

No silent fallback is allowed. For example:

1. `runnerType=tradingagents` must not silently become `qwen`.
2. `runnerType=qwen` must not silently become `stub`.
3. `runnerType=langalpha` must return disabled/design-only behavior until implemented.

## New Diagnostics

Backend:

1. `GET /api/alpha-trace/agent-runs/runners/status`
   - now includes `executionMode`, `executionPolicyReason`, and `capabilities`.
2. `GET /api/alpha-trace/agent-runs/runners/capabilities`
   - returns the capability matrix and an advisory recommendation.

Frontend:

1. Agent Lab shows execution mode badges.
2. Agent Lab shows supported task types and capability flags.
3. This is diagnostic information only; it does not change submit behavior.

## Orchestrator vs Worker

The Orchestrator is the decision/control layer. A worker is an execution boundary.

The current split is:

| Component | Responsibility |
|---|---|
| Orchestrator policy | Decide which runner can satisfy which intent. |
| Runner adapter | Convert AlphaTrace request into runner execution. |
| Subprocess worker | Isolate long-running TradingAgents execution. |
| AgentRunStore | Persist product-facing run/events/reports/evidence/decision. |
| Frontend | Observe AlphaTrace schema, not runner internals. |

M26 does not implement a full Orchestrator worker. It creates the capability contract required before that worker is introduced.

## Future Orchestrator Worker

A future Orchestrator may:

1. Classify a free-form user request into `taskType`.
2. Select a recommended runner.
3. Ask for confirmation if the selected runner is experimental or disabled.
4. Apply budget/timeout/concurrency policy.
5. Dispatch to Qwen, TradingAgents, or external service adapters.
6. Track failure categories and retry policy.

This should be implemented only after the capability matrix is stable.

## Validation

Required checks:

1. Backend compile for capability matrix and route.
2. Runner status smoke returns execution mode and capabilities.
3. Runner capabilities endpoint returns a recommendation.
4. Frontend build passes.

