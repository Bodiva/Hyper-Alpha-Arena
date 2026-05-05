# TradingAgents and LangAlpha Component Selection Strategy

Status: M122/M124 baseline.  
Date: 2026-05-05.

## Decision Summary

AlphaTrace should not choose between Hyper-Alpha-Arena, TradingAgents, and LangAlpha. It should own the product backend and selectively integrate ideas/components through explicit adapters.

1. TradingAgents is useful for research DAG semantics, analyst/research/risk/portfolio manager flow, debate structure, and LangGraph node orchestration.
2. LangAlpha is useful for workbench infrastructure: persistent workspace, background tasks, SSE replay, subagents, PTC/sandbox, MCP, BYOK, artifacts, and frontend subagent monitoring.
3. AlphaTrace Native is the product path: evidence-first, portfolio-aware, MySQL-backed, and frontend-stable.

## TradingAgents Components To Reuse Conceptually

| Component | Use In AlphaTrace | Integration Level |
|---|---|---|
| Analyst Team DAG | Native DAG step design: market, fundamentals, news/sentiment, technical. | Reimplement concepts. |
| Bull/Bear Debate | Debate panel and parallel perspective nodes. | Reimplement concepts; optionally compare with TradingAgents PoC output. |
| Risk Management Team | Conservative/neutral/aggressive/risk manager perspectives. | Reimplement in Native runner; optional adapter mapping. |
| Portfolio Manager final decision | Decision mapper vocabulary and final action rationale. | Reimplement into AgentDecision schema. |
| LangGraph node lifecycle | Event mapper contract: node started/completed, message, tool call. | Adapter mapping only. |
| Checkpoint | Runner-internal recovery and debugging. | Do not treat as product persistence. |

## TradingAgents Components Not To Copy Directly

1. Internal graph state as frontend API.
2. Default stock/ticker data tools as AlphaTrace production evidence source.
3. Project source code copied into Hyper-Alpha-Arena.
4. Trading-oriented action vocabulary as product schema without mapping.
5. Checkpoint DB as AgentRunStore replacement.

## LangAlpha Components To Reimplement Or Adapt Later

| Component | AlphaTrace Target | Priority |
|---|---|---|
| Background task manager | Durable AgentRun worker/scheduler. | High |
| Redis SSE replay | Reconnect-safe runtime event stream. | Medium; MySQL cursor first. |
| Subagent orchestration UI | AgentRunDetail DAG and subagent panels. | High |
| Workspace/artifact filesystem | Research workspace + AgentArtifact model. | Medium |
| PTC/sandbox | Advanced data analysis mode, not default MVP. | Later |
| MCP tool layer | DataSource tool plugin boundary. | Medium |
| BYOK/vault | MySQL-backed encrypted provider credentials. | High |
| Middleware stack | Prompt/tool safety, compaction, steering, HITL. | Medium |
| Automations | Scheduled research tasks and monitors. | Later |

## LangAlpha Components Not To Embed Now

1. Full LangAlpha FastAPI server inside AlphaTrace.
2. LangAlpha PostgreSQL/Redis schema as AlphaTrace schema.
3. Daytona/sandbox lifecycle inside current backend process.
4. LangAlpha web UI components copied directly.
5. LangAlpha workspace/thread IDs as AlphaTrace primary IDs.

## Native AlphaTrace Refactor Target

Native runner should become a real AlphaTrace orchestrator, not just a Qwen runner subclass:

```text
AgentRunService
  -> AlphaTraceNativeOrchestrator
    -> ToolRegistry / DataProviderAdapters
    -> ModelProviderAdapter
    -> AsyncTaskScheduler
    -> AgentRunStore
```

Native DAG should support:

1. Evidence Retrieval.
2. Market View.
3. Bull View / Bear View parallel branches.
4. Risk Review with conservative/neutral/aggressive perspectives.
5. Research Manager synthesis.
6. Final Decision.
7. Evidence validation and future semantic support scoring.
8. Token/cost metrics persisted per run.

## Future LangAlpha Adapter Boundary

Future external adapter flow:

1. AlphaTrace creates AgentRun.
2. Adapter calls LangAlpha service to create/select workspace.
3. Adapter submits task with AlphaTrace context and allowed tools.
4. Adapter consumes LangAlpha events/artifacts through REST/SSE.
5. Adapter maps events into AlphaTrace runtime events and artifacts.
6. AlphaTrace persists reports/evidence/decision in MySQL.

## Current Risks

1. TradingAgents can run long and consume data provider/model quota; keep subprocess isolation and opt-in gating.
2. LangAlpha dependency surface is large; keep as external service adapter until intentionally scoped.
3. Native runner code is still concentrated in `qwen_runner.py`; staged extraction is required.
4. MySQL stores exist but are not yet a full migration framework.
5. Legacy startup noise can obscure runtime logs; do not confuse logs with AgentRun events.

## Next Work Queue

1. Add integration adapter interface skeletons.
2. Add async task abstraction skeleton.
3. Add orchestrator plan/step interface.
4. Extract Bocha/evidence/market context into ToolAdapter-compatible modules.
5. Extract Qwen call into ModelProviderAdapter-compatible module.
6. Start moving Native DAG out of `qwen_runner.py` into a dedicated orchestrator.
