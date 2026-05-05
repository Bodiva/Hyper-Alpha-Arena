# LangAlpha Adapter Design

Status update 2026-05-05:

This document is a design reference for a future LangAlpha external-service adapter. The current canonical AlphaTrace persistence direction is MySQL for system config/task control and ClickHouse for structured business/analytics data. LangAlpha should not introduce PostgreSQL/Redis/sandbox dependencies into AlphaTrace unless it is deployed as a separate external service with explicit mapping back into AlphaTrace schemas.

Date: 2026-05-01

## Status

Design-only. AlphaTrace includes a disabled `runnerType=langalpha` stub, but it does not import, start, or call LangAlpha.

## Goal

Define a safe future boundary where AlphaTrace can submit research work to LangAlpha as an external workbench/service while keeping AlphaTrace as the product backend and frontend schema owner.

## Non-Goals

- Do not replace AlphaTrace backend.
- Do not expose LangAlpha internal state to AlphaTrace frontend.
- Do not import LangAlpha into the current FastAPI process in this phase.
- Do not copy LangAlpha code.
- Do not require PostgreSQL/Redis/sandbox setup for the current MVP.
- Do not implement real trading.

## Runner Type

Future runner mode:

`runnerType=langalpha`

Current behavior:

- Disabled unless `ALPHATRACE_LANGALPHA_ENABLED=true`.
- Even when enabled, current adapter returns a clear design-only error.
- No fallback to Qwen, Stub, or TradingAgents.

## Proposed Environment Variables

Future adapter configuration may use:

- `ALPHATRACE_LANGALPHA_ENABLED=true`
- `LANGALPHA_BASE_URL=http://127.0.0.1:<port>`
- `LANGALPHA_API_KEY=<server-side-token-if-required>`
- `LANGALPHA_WORKSPACE_ID=<optional-default-workspace>`
- `LANGALPHA_TIMEOUT_SECONDS=120`

API keys or credentials must remain server-side.

## Future Request Mapping

AlphaTrace input:

- `assetId`
- `portfolioId`
- `strategyId`
- `taskType`
- `question`
- `horizon`
- `riskPreference`
- `evidenceScope`
- `runnerConfig.extraParams`

Future LangAlpha mapping:

1. Resolve AlphaTrace asset/portfolio/strategy context.
2. Create or select a LangAlpha workspace.
3. Upload or attach relevant evidence/context files when needed.
4. Create a LangAlpha task/thread/message.
5. Subscribe to LangAlpha events or poll task state.
6. Map final files/messages/results into AlphaTrace reports and decisions.

## Future Event Mapping

LangAlpha event or task state should map into AlphaTrace runtime events:

| LangAlpha Concept | AlphaTrace Event |
|---|---|
| workspace/task created | `agent.run.started` |
| agent/tool started | `agent.started` or `tool.called` |
| model/output delta | `reasoning.chunk` |
| tool completed | `tool.result` |
| file/report produced | `report.generated` |
| risk/validation warning | `risk.warning` or `evidence.linked` |
| final result | `decision.updated` |
| task completed | `agent.run.completed` |
| task failed | `agent.run.failed` |

## Future Output Mapping

LangAlpha output must be converted into AlphaTrace schemas:

- `AgentReport`: summaries, generated documents, markdown reports, workspace files.
- `EvidenceReference`: cited files, web results, uploaded docs, validated context items.
- `AgentDecision`: final recommendation, confidence, thesis, risks, watch indicators, evidence ids.
- `AgentRuntimeEvent`: all user-visible progress and tool/model activity.

Raw LangAlpha workspace, task, file, and event payloads may be stored in `payload` for debugging only, but should not become the frontend contract.

## Current Stub Behavior

`backend/services/agent_runners/langalpha_adapter.py` defines `LangAlphaRunnerAdapter`:

- `runner_type = "langalpha"`
- If `ALPHATRACE_LANGALPHA_ENABLED` is not `true`, submit raises `LangAlpha runner is not enabled.`
- If enabled, submit raises a design-only message explaining that the external adapter is not implemented yet.
- The adapter does not import LangAlpha.

## Why External Service Adapter First

LangAlpha appears to own substantial backend concerns: database, cache, background tasks, workspaces, files, sandbox, MCP, and web/backend deployment. Embedding that directly inside AlphaTrace would create overlapping lifecycle and persistence responsibilities. A service boundary lets AlphaTrace remain stable while evaluating LangAlpha capabilities.

## PoC Plan

1. Complete local LangAlpha checkout and source verification.
2. Start LangAlpha independently with its own documented dependencies.
3. Identify minimal task submission and event retrieval APIs.
4. Build a `LangAlphaExternalClient` in AlphaTrace.
5. Implement `LangAlphaRunnerAdapter` using the external client.
6. Map events/files/results into AlphaTrace schemas.
7. Validate one `single_asset_analysis` and one `portfolio_diagnosis` run.

## Risks

- Incomplete local source verification.
- Potential DB/Redis/sandbox setup cost.
- Schema overlap with AlphaTrace portfolio/watchlist/market-data domains.
- Latency and event stream impedance mismatch.
- Auth and workspace ownership model not yet mapped.
- License and attribution requirements must be reviewed before code reuse.
