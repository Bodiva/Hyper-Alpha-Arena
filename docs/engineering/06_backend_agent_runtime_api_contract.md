# 06 Backend Agent Runtime API Contract

日期：2026-04-27  
任务：Task 20（第一版后端 Agent Runtime API 契约与 stub）

## 1. 设计目标

AlphaTrace 后续需要接入 Qwen、TradingAgents 或自研 Agent Runner。当前先在 Hyper-Alpha-Arena 后端定义统一 Agent Runtime API 契约与最小 stub，使前端未来可以通过稳定 endpoint 获取：

1. Agent Run 列表
2. Agent Run 详情
3. Runtime Events
4. Reports
5. Evidence 引用
6. Final Decision
7. Demo Agent Run 创建占位
8. 正式 Agent Runner submit 契约占位
9. SSE event stream 占位

当前阶段不接真实 TradingAgents、不写数据库。Task 27 后，`runnerType=qwen` 已支持 Qwen OpenAI-compatible 最小真实调用；默认 stub runner 仍可用。

## 2. 新增后端文件

1. `backend/schemas/alpha_trace_agent_runtime.py`
2. `backend/services/alpha_trace_agent_runtime_service.py`
3. `backend/api/alpha_trace_agent_runtime_routes.py`

Router 注册：

1. `backend/main.py` 引入并 `include_router(alpha_trace_agent_runtime_router)`

## 3. Endpoint 列表

统一前缀：

```txt
/api/alpha-trace/agent-runs
```

### GET `/api/alpha-trace/agent-runs`

返回 Agent Run 列表。

Query 参数：

1. `assetId`
2. `portfolioId`
3. `strategyId`
4. `status`
5. `taskType`
6. `limit`
7. `offset`

响应示例：

```json
{
  "items": [
    {
      "runId": "demo-run-001",
      "name": "AlphaTrace Demo Agent Run",
      "target": "CSI 300 ETF demo analysis",
      "taskType": "single_asset_analysis",
      "status": "completed"
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

### GET `/api/alpha-trace/agent-runs/{run_id}`

返回单个 Agent Run 详情。

### GET `/api/alpha-trace/agent-runs/{run_id}/events`

返回该 run 的 runtime event 列表。

### GET `/api/alpha-trace/agent-runs/{run_id}/reports`

返回该 run 的报告列表。

### GET `/api/alpha-trace/agent-runs/{run_id}/evidence`

返回该 run 使用的 evidence 引用。

### GET `/api/alpha-trace/agent-runs/{run_id}/decision`

返回最终决策。

### GET `/api/alpha-trace/agent-runs/{run_id}/events/stream`

SSE runtime event endpoint。

当前行为：

1. 返回静态 mock events。
2. `media_type = text/event-stream`。
3. 不连接真实 TradingAgents。
4. 不连接真实 Agent Runner。

### POST `/api/alpha-trace/agent-runs/demo`

创建 demo Agent Run 占位。

请求：

```json
{
  "assetId": "asset_etf_510300",
  "taskType": "single_asset_analysis",
  "question": "请分析该 ETF 是否适合中期配置"
}
```

响应：

1. 返回静态模板生成的 Agent Run。
2. 不写数据库。
3. 不调用 LLM。
4. 不调用 TradingAgents。

### POST `/api/alpha-trace/agent-runs/submit`

正式 Agent Runner 提交入口。当前支持 stub runner 与 Qwen runner；TradingAgents 和 custom runner 仍未实现。

请求示例：

```json
{
  "assetId": "asset_etf_510300",
  "portfolioId": "portfolio_etf_core_001",
  "strategyId": "strategy_etf_rotation_001",
  "taskType": "single_asset_analysis",
  "question": "请分析该 ETF 是否适合中期配置",
  "horizon": "medium_term",
  "riskPreference": "balanced",
  "evidenceScope": {
    "includeNews": true,
    "includeReports": true,
    "includeMacro": true,
    "includeMarketSnapshot": true
  },
  "runnerConfig": {
    "runnerType": "stub",
    "modelProvider": "none",
    "modelName": "none",
    "enableStreaming": true
  }
}
```

响应示例：

```json
{
  "runId": "run_submit_20260428_153012_123456",
  "status": "completed",
  "mode": "stub",
  "message": "Agent task accepted by AlphaTrace submit stub. Real runner integration is not enabled.",
  "run": {
    "runId": "run_submit_20260428_153012_123456",
    "name": "AlphaTrace Submitted Agent Task Stub",
    "taskType": "single_asset_analysis",
    "status": "completed"
  }
}
```

`runnerConfig` 设计：

1. `runnerType`: `stub` / `qwen` / `tradingagents` / `custom_runner`
2. `modelProvider`: 未来模型供应方占位
3. `modelName`: 未来模型名称占位
4. `enableStreaming`: 是否需要 runtime event stream

`evidenceScope` 设计：

1. `includeNews`
2. `includeReports`
3. `includeMacro`
4. `includeMarketSnapshot`

## 4. AgentRuntimeEvent Schema

字段：

1. `eventId`
2. `runId`
3. `type`
4. `timestamp`
5. `sequence`
6. `agentName`
7. `team`
8. `payload`

支持事件类型：

1. `agent.run.started`
2. `agent.run.completed`
3. `agent.run.failed`
4. `agent.started`
5. `agent.completed`
6. `agent.failed`
7. `tool.called`
8. `tool.result`
9. `reasoning.chunk`
10. `report.generated`
11. `debate.message`
12. `risk.warning`
13. `decision.updated`
14. `evidence.linked`
15. `metric.updated`
16. `checkpoint.created`

示例：

```json
{
  "eventId": "evt-demo-004",
  "runId": "demo-run-001",
  "type": "tool.result",
  "timestamp": "2026-04-27T09:31:18+08:00",
  "sequence": 4,
  "agentName": "Market Analyst",
  "team": "analyst_team",
  "payload": {
    "toolName": "market_snapshot.fetch",
    "summary": "Market breadth and liquidity snapshot loaded.",
    "evidenceIds": ["ev_stub_snapshot_001"]
  }
}
```

## 5. 与前端 runtime-events.ts 的字段映射

后端 schema 与前端 `frontend/app/entities/agent/runtime-events.ts` 对齐：

1. `eventId` -> `eventId`
2. `runId` -> `runId`
3. `type` -> `AgentRuntimeEventType`
4. `timestamp` -> ISO string
5. `sequence` -> sequence number
6. `agentName` -> optional display name
7. `team` -> optional Agent team
8. `payload` -> event-specific payload dict

后续若接真实服务，应保持该 contract 稳定，避免前端 runtime adapter 大改。

## 6. Demo Stub 说明

当前 service 位于：

```txt
backend/services/alpha_trace_agent_runtime_service.py
```

提供方法：

1. `list_agent_runs()`
2. `get_agent_run(run_id)`
3. `get_agent_run_events(run_id)`
4. `get_agent_run_reports(run_id)`
5. `get_agent_run_evidence(run_id)`
6. `get_agent_run_decision(run_id)`
7. `create_demo_agent_run(request)`
8. `submit_agent_run(request)`

限制：

1. `/demo` 和 `stub` runner 不依赖数据库。
2. `/submit` 的 Qwen runner 会读取已有 Hyper AI LLM 配置，但不写数据库。
3. `/demo` 和 `stub` runner 不调用外部 API。
4. `/demo` 和 `stub` runner 不调用 Qwen。
5. 不调用 TradingAgents。

## 6.1 `/demo` 与 `/submit` 的区别

1. `/demo`：演示用 stub，生成固定或模板化 demo run，用于快速验证前端展示。
2. `/submit`：正式任务提交契约，未来接入真实 Agent Runner。
3. 当前 `/submit` 仍是 stub mode，返回 `SubmitAgentRunResponse`，并将 run 写入内存 registry，方便后续读取 detail / events / reports / evidence / decision / SSE。
4. `/submit` 不会替代 `/demo`，两者保持独立。
5. 当前 `/submit` 的 `runnerType=qwen` 会调用 Qwen OpenAI-compatible API；其他 runner 不调用 Qwen、不调用 TradingAgents、不写数据库。

## 7. SSE / WebSocket 后续计划

当前 SSE endpoint：

```txt
GET /api/alpha-trace/agent-runs/{run_id}/events/stream
```

后续计划：

1. SSE 用于单向 runtime events 增量推送。
2. WebSocket 用于双向控制、取消、确认 checkpoint、实时状态同步。
3. 预留 WebSocket path：`/ws/alpha-trace/agent-runs/{run_id}`。

## 8. TradingAgents 后续映射计划

TradingAgents 或其他 Agent Runner 可映射为：

1. progress -> `agent.started` / `agent.completed` / `metric.updated`
2. messages -> `reasoning.chunk` / `debate.message`
3. tool calls -> `tool.called` / `tool.result`
4. reports -> `report.generated`
5. evidence references -> `evidence.linked`
6. final decision -> `decision.updated`
7. checkpoints -> `checkpoint.created`
8. failures -> `agent.failed` / `agent.run.failed`

## 9. Qwen Demo 后续接入计划

Qwen runner 已作为独立 adapter 接入，而不是直接写入 route：

1. route 接收请求。
2. service 创建 Agent Run。
3. runner adapter 产生 runtime events。
4. event store 保存或缓存事件。
5. frontend 通过 events / stream 读取。

Task 27 已完成 Qwen runner 最小接入。当前只做单次 OpenAI-compatible chat completions 调用，不做复杂多 Agent 调度。

## 9.1 Submit Runner 后续接入计划

`POST /submit` 后续应演进为：

1. route 校验 `SubmitAgentRunRequest`。
2. service 创建持久化 Agent Run。
3. 根据 `runnerConfig.runnerType` 分发到 Qwen / TradingAgents / custom runner adapter。
4. runner adapter 产生统一 `AgentRuntimeEvent`。
5. frontend 通过 `/events` 或 `/events/stream` 读取。

当前 Task 25 仅完成 contract 和 stub 隔离。

## 9.2 AgentRunnerAdapter 抽象（Task 26）

Task 26 将 `/submit` 的 runner 逻辑从 `alpha_trace_agent_runtime_service.py` 主流程中抽离到 adapter 层。

新增文件：

1. `backend/services/agent_runners/base.py`
2. `backend/services/agent_runners/stub_runner.py`
3. `backend/services/agent_runners/registry.py`
4. `backend/services/agent_runners/__init__.py`
5. `backend/services/agent_runners/qwen_runner.py`

核心接口：

```python
class AgentRunnerAdapter(Protocol):
    runner_type: str

    def submit(self, request: SubmitAgentRunRequest, context: AgentRunnerContext) -> SubmitAgentRunResponse:
        ...
```

`AgentRunnerContext` 当前包含：

1. `base_run`
2. `base_decision`
3. `copy_runtime_artifacts(run_id, source_label)`
4. `save_run(run)`
5. `save_evidence_references(items)`

当前实现：

1. `StubAgentRunnerAdapter`
2. `runner_type = "stub"`
3. 生成 `run_stub_YYYYMMDD_HHMMSS_ffffff`
4. 复用 stub runtime artifacts
5. 写入内存 registry，保证 detail / events / reports / evidence / decision / SSE 可查询
6. `QwenRunnerAdapter`
7. `runner_type = "qwen"`
8. 调用 DashScope OpenAI-compatible Chat Completions
9. 将自由文本映射为 AgentRun / events / reports / evidence / decision

`AgentRunnerRegistry` 支持：

1. `register_runner(adapter)`
2. `get_runner(runner_type)`
3. `submit(request, context)`

runnerType 分发：

1. `stub`：已实现
2. `qwen`：已实现最小真实调用
3. `tradingagents`：未实现，返回 400 NotImplemented
4. `custom_runner`：未实现，返回 400 NotImplemented

设计原则：

1. `/demo` 保持原有 demo stub 行为。
2. `/submit` 走 `AgentRunnerRegistry`。
3. 当前只接 Qwen。
4. 当前不接 TradingAgents。
5. 当前不写数据库。
6. 当前不引入队列或大型依赖。

Qwen runner 配置来源：

1. 优先读取原 Hyper AI 后端配置：`services.hyper_ai_service.get_llm_config(db)`。
2. 原配置来自 `hyper_ai_profile` 表：
   - `llm_provider`
   - `llm_base_url`
   - `llm_api_key_encrypted`
   - `llm_model`
3. API Key 使用 `utils.encryption.decrypt_private_key` 在后端解密，不暴露给 AlphaTrace 前端页面。
4. 当 `llm_provider=qwen`，或 `llm_provider=custom` 且 endpoint/model 明确指向 Qwen/DashScope 时，Qwen runner 会复用该配置。
5. 如果没有可用 Hyper AI Qwen 配置，再回退到后端环境变量：
   - `DASHSCOPE_API_KEY`
   - `QWEN_BASE_URL`，默认 `https://dashscope.aliyuncs.com/compatible-mode/v1`
   - `QWEN_MODEL`，默认 `qwen-plus`

未配置 Hyper AI Qwen 配置且未配置 `DASHSCOPE_API_KEY` 时：

1. `/submit` 返回 400
2. message: `Hyper AI qwen configuration is not available and DASHSCOPE_API_KEY is not configured.`
3. 不 fallback 到 stub
4. 不产生误导性真实结果

Qwen runner 复用的旧能力：

1. Provider 列表：`services.hyper_ai_llm_providers.py`，已内置 `qwen` provider。
2. 配置保存：`POST /api/hyper-ai/profile/llm`。
3. 配置读取：`services.hyper_ai_service.get_llm_config(db)`。
4. OpenAI-compatible headers / payload / endpoint helper：
   - `services.ai_decision_service.build_llm_headers`
   - `services.ai_decision_service.build_llm_payload`
   - `services.ai_decision_service.build_chat_completion_endpoints`
   - `services.ai_decision_service._extract_text_from_message`

AlphaTrace 没有新增第二套前端 API Key 配置，也不会从前端 submit payload 接收明文 API Key。

Qwen runner 当前限制：

1. 不做复杂多 Agent 调度。
2. 不强制 Qwen 返回严格 JSON。
3. 对 Qwen 自由文本做保守映射。
4. `decision.action` 简单关键词推断，无法判断时为 `watch`。
5. `decision.confidence` 默认 `0.65`。
6. evidence 使用 `ev_qwen_assumption_*` 占位，表示模型生成假设，不代表外部已验证证据。

后续 Qwen adapter 增强计划：

1. 要求 Qwen 返回严格 JSON schema。
2. 增加证据检索 / 引用校验。
3. 增加模型调用成本和 token 用量记录。
4. 增加异步运行、取消、重试和状态持久化。

后续 TradingAgents adapter 接入计划：

1. 新增 `TradingAgentsRunnerAdapter`。
2. 将 TradingAgents progress、messages、tool calls、reports、final decision 映射为 `AgentRuntimeEvent`。
3. 不把 TradingAgents 代码复制进主工程，通过 adapter 边界调用。

## 10. 当前边界

1. 已接 Qwen 最小真实调用，优先复用原 Hyper AI 后端模型配置。
2. 未接 TradingAgents。
3. 未写数据库。
4. 未修改旧业务 API。
5. 未修改 Docker / package.json。
6. 前端页面仍默认使用 mock mode，不切换到真实 API。

## 11. curl 测试示例

```bash
curl http://127.0.0.1:8802/api/alpha-trace/agent-runs
curl http://127.0.0.1:8802/api/alpha-trace/agent-runs/demo-run-001/events
curl http://127.0.0.1:8802/api/alpha-trace/agent-runs/demo-run-001/reports
curl http://127.0.0.1:8802/api/alpha-trace/agent-runs/demo-run-001/evidence
curl http://127.0.0.1:8802/api/alpha-trace/agent-runs/demo-run-001/decision
curl -N http://127.0.0.1:8802/api/alpha-trace/agent-runs/demo-run-001/events/stream
curl -X POST http://127.0.0.1:8802/api/alpha-trace/agent-runs/demo \
  -H "Content-Type: application/json" \
  -d '{"assetId":"asset_etf_510300","taskType":"single_asset_analysis","question":"请分析该 ETF 是否适合中期配置"}'
curl -X POST http://127.0.0.1:8802/api/alpha-trace/agent-runs/submit \
  -H "Content-Type: application/json" \
  -d '{"assetId":"asset_etf_510300","taskType":"single_asset_analysis","question":"请分析该 ETF 是否适合中期配置","horizon":"medium_term","riskPreference":"balanced","runnerConfig":{"runnerType":"stub","modelProvider":"none","modelName":"none","enableStreaming":true}}'
curl -X POST http://127.0.0.1:8802/api/alpha-trace/agent-runs/submit \
  -H "Content-Type: application/json" \
  -d '{"assetId":"asset_etf_510300","taskType":"single_asset_analysis","question":"请分析该 ETF 是否适合中期配置","horizon":"medium_term","riskPreference":"balanced","runnerConfig":{"runnerType":"qwen","modelProvider":"qwen","modelName":"qwen-plus","enableStreaming":true}}'
```

## Task 28: Async Agent Runner Submit and Live SSE Progress

Task 28 changes `POST /api/alpha-trace/agent-runs/submit` for `runnerType=qwen` from a blocking call into an in-process asynchronous runtime flow.

Current behavior:

1. `POST /submit` validates config and creates a `running` AgentRun in memory.
2. The response returns immediately with `runId`, `status=running`, `mode=qwen`, and the initial run snapshot.
3. A daemon background thread executes `QwenRunnerAdapter`.
4. Runtime events are appended to the in-memory run while Qwen executes.
5. On success, reports, evidence, decision, metrics, and `status=completed` are written back to the in-memory run.
6. On failure, `agent.failed` and `agent.run.failed` events are appended and `status=failed` is stored.
7. `GET /events/stream` first sends existing events, then polls the in-memory run for new events until the run reaches `completed`, `failed`, or `cancelled`, or until the stream idle timeout is reached.

Runner status values currently used by AlphaTrace runtime:

1. `running`
2. `completed`
3. `failed`
4. existing legacy-compatible values remain supported by schema: `queued`, `partially_completed`, `cancelled`

The async runtime is intentionally lightweight:

1. No Celery, Redis, or external queue.
2. No TradingAgents integration.
3. Task 29 adds a JSON-backed `AgentRunStore` so submitted runs can survive backend restart in development environments.
4. Production DB persistence is still a future migration.

Qwen event lifecycle now includes:

1. `agent.run.started`
2. `agent.started`
3. `reasoning.chunk` for prompt preparation
4. `tool.called` for `qwen.chat.completions`
5. `reasoning.chunk` while waiting for Qwen
6. `tool.result` when Qwen returns
7. `reasoning.chunk` for mapping output
8. `report.generated`
9. `evidence.linked`
10. `decision.updated`
11. `agent.completed`
12. `agent.run.completed` or `agent.run.failed`

## Task 29: Agent Run Persistence Store

Task 29 introduces `AgentRunStore` as the persistence boundary for AlphaTrace runtime data.

Default store:

```txt
ALPHA_TRACE_AGENT_RUN_STORE=json
ALPHA_TRACE_AGENT_RUN_STORE_PATH=backend/runtime_data/alpha_trace_agent_runs.json
```

Runtime data now flows through the store:

1. `/demo` saves demo runs through the store.
2. `/submit` saves submitted stub/Qwen runs through the store.
3. Qwen background execution appends runtime events through the store.
4. Qwen completion saves reports, evidence references, final decision, and status through the store.
5. Detail/events/reports/evidence/decision endpoints read from the store.
6. SSE reads events and status from the store while polling for new runtime events.

Current persistence scope:

1. AgentRun snapshot.
2. Runtime events.
3. Reports.
4. Evidence references.
5. Final decision.

Current limits:

1. JSON store is a development persistence layer, not a production DB.
2. No distributed locking or multi-worker coordination.
3. No cancellation or retry persistence.
4. DB-backed store is reserved for a later migration.

See `docs/engineering/07_agent_run_persistence.md` for cleanup and restart verification steps.

## Task 30: Qwen Runner Multi-step Output

Task 30 keeps the same `/submit` API contract and asynchronous runtime semantics, but changes the Qwen runner output shape.

The runner now models a lightweight research team:

1. Market Analyst: Market View.
2. Bull Researcher: Bull View.
3. Bear Researcher: Bear View.
4. Risk Analyst: Risk Review.
5. Portfolio Manager: Final Decision.

The first implementation still uses one Qwen API call. The backend prompt requests six sections:

1. `Market View`
2. `Bull View`
3. `Bear View`
4. `Risk Review`
5. `Final Decision`
6. `Watch Indicators`

Backend mapping:

1. Generates four reports:
   - Market View Report
   - Bull View Report
   - Bear View Report
   - Risk Review Report
2. Generates four Qwen assumption evidence references:
   - `ev_qwen_market_assumption_*`
   - `ev_qwen_bull_assumption_*`
   - `ev_qwen_bear_assumption_*`
   - `ev_qwen_risk_assumption_*`
3. Infers final decision action from the `Final Decision` section.
4. Infers confidence from `confidence` / `置信度` when present; otherwise defaults to `0.65`.
5. Extracts observation indicators from the `Watch Indicators` section.

Current limits:

1. It is not a full multi-agent scheduler.
2. It does not call Qwen once per agent.
3. It does not stream Qwen tokens.
4. TradingAgents remains out of scope.


## Task 31: Evidence Retrieval Contract

Task 31 adds a minimal internal retrieval stage for `runnerType=qwen`.

New backend files:

1. `backend/services/evidence_retrieval/static_evidence_seed.py`
2. `backend/services/evidence_retrieval/retriever.py`

Behavior:

1. `/submit` still returns immediately for Qwen runs.
2. Background Qwen execution retrieves static evidence by assetId, question, and taskType.
3. Retrieved evidence is injected into Qwen prompt.
4. `/api/alpha-trace/agent-runs/{runId}/evidence` returns retrieved static evidence references when available.
5. `decision.evidenceIds` references retrieved evidenceIds.
6. If retrieval fails or returns empty, Qwen assumption evidence is still used as fallback.

This does not connect external data sources, TradingAgents, or a production database.

## Task 35.7 Qwen Streaming Contract

The Qwen runner now uses OpenAI-compatible chat completions with `stream=true` for `runnerType=qwen`.

Runtime behavior:

1. `POST /api/alpha-trace/agent-runs/submit` still returns immediately with `status=running`.
2. The background Qwen runner reads streaming delta content.
3. Each flushed text chunk is persisted as a `reasoning.chunk` runtime event with `payload.streaming=true`.
4. The existing `GET /api/alpha-trace/agent-runs/{runId}/events/stream` SSE endpoint forwards those events.
5. After the stream completes, the runner uses the accumulated text to generate the existing four reports, evidence references, and final decision.

Chunk payload shape:

```json
{
  "content": "incremental text",
  "accumulatedLength": 1234,
  "sectionHint": "market_view",
  "streaming": true
}
```

The final API shape is unchanged:

1. `GET /reports` returns structured reports after completion.
2. `GET /evidence` returns retrieved or fallback evidence references.
3. `GET /decision` returns the final decision after completion.
4. `GET /events` also includes persisted streaming chunk events.

Current limitations:

1. Streaming is implemented only for Qwen runner.
2. Stub runner is unchanged.
3. TradingAgents is not connected.
4. The runner still performs one Qwen call and then maps accumulated text into multiple AlphaTrace sections.

## Task 35.8 Qwen Multi-Agent Parallel Runner

`runnerType=qwen` now follows a lightweight multi-agent execution model:

1. `evidence_retrieval`: static evidence retrieval.
2. `market_view`: one Qwen call.
3. `bull_view` and `bear_view`: two Qwen calls in parallel.
4. `risk_review`: one Qwen call using Market / Bull / Bear outputs.
5. `final_decision`: one Qwen call using Market / Bull / Bear / Risk outputs.

Concurrency:

- `ThreadPoolExecutor` is used for Bull / Bear.
- `QWEN_AGENT_MAX_PARALLEL_CALLS` defaults to `2` and is clamped to `1..2`.
- `QWEN_AGENT_STEP_TIMEOUT_SECONDS` defaults to `90` seconds.
- There is no global queue or cross-run concurrency limiter yet.

Failure behavior:

- Market failure fails the run.
- Bull failure does not stop Bear; the Risk prompt receives a fallback unavailable message.
- Bear failure does not stop Bull.
- Risk failure fails the run in this phase.
- Final Decision failure fails the run.

Runtime events include `stepId`, `dependsOn`, and `progress` in payloads where possible. Existing API responses remain unchanged: final reports / evidence / decision are still available through the existing endpoints after completion.

This phase does not connect TradingAgents and does not perform token-level streaming.

## Task 35.7 Update: Qwen Streaming Contract

The `qwen` runner keeps `/submit` asynchronous and now performs each Qwen agent step with `stream=true`. The backend persists incremental output as `reasoning.chunk` events with `payload.streaming=true`, while preserving the completed run contract: reports, evidence references, decision and status are written after the run finishes.

This is Qwen streaming through AlphaTrace runtime events, not TradingAgents streaming. TradingAgents remains unconnected.

## Task 36: Portfolio Diagnosis Agent Task

AlphaTrace now supports submitting a portfolio-level diagnosis task through the existing `POST /api/alpha-trace/agent-runs/submit` contract.

### Request shape

The frontend submits the task with:

```json
{
  "portfolioId": "portfolio_etf_core_001",
  "taskType": "portfolio_diagnosis",
  "question": "请诊断当前组合的资产配置、风险暴露、调仓建议和后续观察指标",
  "horizon": "medium_term",
  "riskPreference": "balanced",
  "runnerConfig": {
    "runnerType": "qwen",
    "modelProvider": "qwen",
    "modelName": "qwen-plus",
    "enableStreaming": true
  }
}
```

`portfolio_diagnostic` remains accepted for compatibility; `portfolio_diagnosis` is the preferred task type used by the Portfolio Workspace UI.

### Runner behavior

For `taskType=portfolio_diagnosis`, `QwenRunnerAdapter` reads portfolio context from the static `PortfolioStore` when `portfolioId` is present. The context includes portfolio metadata, holdings, exposures, risk metrics, rebalance recommendations, related assets, and related strategies. This context is injected into the Qwen prompts together with retrieved static evidence.

The runner continues to use the existing async Agent Runtime flow:

1. `/submit` returns a `runId` immediately with `status=running`.
2. Runtime events are written to the AgentRunStore and streamed over SSE.
3. Qwen produces Portfolio Overview / Exposure Review, Bull View, Bear View, Risk Review / Rebalance Suggestions, and Final Diagnosis content through the existing logical agent steps.
4. Reports, evidence references, and the final decision are persisted through the AgentRunStore.

### Limitations

This is not a real trading or risk engine. It does not place orders, connect to brokerage systems, use external market data, or execute TradingAgents. Portfolio context comes from static seed data and should be treated as a development-stage analysis context.
