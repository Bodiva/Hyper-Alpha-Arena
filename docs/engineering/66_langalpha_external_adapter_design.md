# LangAlpha External Adapter Design

Status: M123 design baseline.  
Date: 2026-05-05.

## Decision

LangAlpha should not be imported into AlphaTrace as an in-process runner. It is a future external workbench adapter candidate and a strong architecture reference.

## Why External Service Adapter

LangAlpha includes:

1. FastAPI backend.
2. PostgreSQL dual pool.
3. Redis SSE replay/event buffer.
4. Workspace/sandbox lifecycle.
5. Background task manager.
6. PTC code execution.
7. MCP servers.
8. BYOK/vault.
9. Web UI and subagent monitoring.

Embedding that inside AlphaTrace would couple service lifecycle, persistence, Redis, sandbox, and frontend assumptions. AlphaTrace should instead call a LangAlpha service if a PoC is intentionally scoped.

## Future Adapter Flow

```text
AlphaTrace /submit
  -> create AgentRun
  -> LangAlphaExternalWorkbenchAdapter.submit_task
  -> LangAlpha workspace/thread/task
  -> consume LangAlpha events/artifacts
  -> map to AlphaTrace AgentRuntimeEvent/AgentReport/EvidenceReference/AgentDecision/AgentArtifact
  -> persist in AlphaTrace MySQL
```

## Input Mapping

| AlphaTrace | LangAlpha candidate |
|---|---|
| `assetId` | workspace/task context and prompt. |
| `portfolioId` | workspace/task context and data files. |
| `question` | task prompt. |
| `evidence` | uploaded memo/context or prompt references. |
| `runnerConfig.extraParams` | external service config, workspace ID, mode, skills. |

## Output Mapping

| LangAlpha | AlphaTrace |
|---|---|
| Workspace/thread/task ID | Payload metadata only. |
| SSE event | AgentRuntimeEvent. |
| Subagent state | OrchestrationStep / StepExecutionSnapshot. |
| Files/charts/tables | Future AgentArtifact. |
| Final response | AgentReport. |
| Recommendation | AgentDecision. |
| Tool output | ToolInvocationResult / EvidenceReference / AgentArtifact. |

## Adapter Health

`runnerType=langalpha` remains disabled unless:

1. `ALPHATRACE_LANGALPHA_ENABLED=true`.
2. LangAlpha base URL is configured.
3. Authentication mode is configured.
4. API compatibility is verified.

Current behavior should remain clear failure, not silent fallback.

## Non-Goals

1. Do not copy LangAlpha code.
2. Do not change LangAlpha source.
3. Do not use LangAlpha DB as AlphaTrace DB.
4. Do not expose LangAlpha internal state to frontend.
5. Do not require LangAlpha for current Qwen/Native/TradingAgents flows.

## First PoC Criteria

A future LangAlpha adapter PoC is justified only after:

1. AlphaTrace `AgentArtifact` exists.
2. Async task scheduler/status table exists.
3. DataSource/tool provider contracts are in place.
4. LangAlpha service API endpoints are stable and documented locally.
5. A bounded task such as one research workspace report can run without replacing AlphaTrace runtime.
