# 05 Agent Runtime Event Stream

日期：2026-04-27  
任务：Task 19（Agent Runtime Event Stream 接入准备）

## 1. 设计目标

AlphaTrace 后续需要接入 TradingAgents 或其他多 Agent 后端。前端先定义统一的 runtime event stream 协议，使 Agent Lab 可以从静态 mock 展示逐步演进为可流式追踪的投研运行过程。

本阶段目标：

1. 定义统一事件类型和 payload 边界。
2. 提供事件到页面快照的聚合 adapter。
3. 基于现有 `agent-runs.mock.ts` 提供 mock event replay。
4. 预留 SSE / WebSocket client 入口。
5. 在 `AgentRunDetailPage` 中加入 streaming mode 占位，不接真实后端。

## 2. Event Stream 类型

核心文件：

1. `frontend/app/entities/agent/runtime-events.ts`
2. `frontend/app/entities/agent/runtime-adapter.ts`
3. `frontend/app/entities/agent/mock-runtime-replay.ts`
4. `frontend/app/shared/api/event-stream-client.ts`

事件类型包括：

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

每个事件包含：

1. `eventId`
2. `runId`
3. `type`
4. `timestamp`
5. `agentId?`
6. `agentName?`
7. `team?`
8. `sequence`
9. `payload`

## 3. Runtime Snapshot 聚合逻辑

`runtime-adapter.ts` 提供：

1. `createInitialRuntimeSnapshot(runId)`
2. `applyRuntimeEvent(snapshot, event)`
3. `applyRuntimeEvents(snapshot, events)`
4. `mapRuntimeSnapshotToAgentRun(snapshot, fallbackAgentRun?)`

聚合规则：

1. `agent.started` / `agent.completed` / `agent.failed` 更新 Agent 状态。
2. `tool.called` / `tool.result` 更新 Tool Call Timeline。
3. `reasoning.chunk` / `debate.message` 进入 runtime timeline。
4. `report.generated` 更新 reports。
5. `decision.updated` 更新 final decision snapshot。
6. `evidence.linked` 更新 evidenceIds。
7. `metric.updated` 更新 runtime metrics。
8. `checkpoint.created` 记录可恢复节点。

## 4. Mock Replay 机制

`mock-runtime-replay.ts` 基于现有 `AgentRun` mock 数据生成 runtime events。

暴露方法：

1. `buildMockRuntimeEventsFromAgentRun(agentRun)`
2. `replayMockRuntimeEvents(runId, handlers, options?)`

`replayMockRuntimeEvents` 支持：

1. `onEvent(event)`
2. `onComplete()`
3. `onError(error)`
4. `intervalMs`
5. `autoStart`
6. `maxEvents`
7. `cancel()`

该 replay 只用于前端 mock，不连接真实 TradingAgents 或任何后端服务。

## 5. SSE / WebSocket 设计

`event-stream-client.ts` 暴露：

1. `createEventStreamClient(options)`

Transport 类型：

1. `mock`
2. `sse`
3. `websocket`

当前行为：

1. `mock`：调用 `replayMockRuntimeEvents`。
2. `sse`：通过浏览器 `EventSource` 连接后端 stub SSE endpoint。
3. `websocket`：保留占位，调用时抛出未实现错误。

Task 23 已接入前端 EventSource transport，但只连接 AlphaTrace 后端 stub：

1. `GET /api/alpha-trace/agent-runs/{runId}/events/stream`
2. 不连接 TradingAgents。
3. 不连接 Qwen。
4. 不启用 WebSocket。
5. 只有 real mode 下手动点击 `Start SSE Stream` 才会打开 SSE。

## 6. TradingAgents 接入映射预留

后续可将 TradingAgents 运行过程映射为统一事件：

1. progress -> `agent.started` / `agent.completed` / `metric.updated`
2. messages -> `reasoning.chunk` / `debate.message`
3. tool calls -> `tool.called` / `tool.result`
4. reports -> `report.generated`
5. final decision -> `decision.updated`
6. checkpoints -> `checkpoint.created`
7. evidence references -> `evidence.linked`
8. failures -> `agent.failed` / `agent.run.failed`

## 7. Endpoint 预留

后续建议接口：

1. `GET /api/agent-runs/:runId/events`
2. `GET /api/agent-runs/:runId/events/stream`
3. `WS /ws/agent-runs/:runId`

其中：

1. `GET /events` 用于历史事件列表。
2. `GET /events/stream` 用于 SSE 增量流。
3. `WS /ws/agent-runs/:runId` 用于双向控制和运行监控。

## 8. AgentRunDetailPage Runtime Stream 能力

`AgentRunDetailPage` 新增 Runtime Event Stream 区域：

1. mock mode 显示 `Runtime Mode: Mock Replay` 和 `Transport: mock`。
2. real mode 显示 `Runtime Mode: Real API Events` 和 `Transport: sse`。
3. 显示 `Event Stream Ready` / `RUNNING` / `COMPLETED` / `STOPPED` / `ERROR`。
4. mock mode 提供 `Replay Runtime Events` / `Stop Replay`。
5. real mode 提供 `Start SSE Stream` / `Stop SSE Stream`。
6. 展示 mock replay 或 SSE 事件 timeline。
7. 展示 runtime snapshot 中的 tool calls、reports、evidence、checkpoints 数量。

该区域不影响原有 Agent Progress、Tool Calls、Evidence、Report、Final Decision 和 Runtime Metrics。

## 9. 当前边界

1. Task 23 未修改 backend，复用 Task 20 已有 stub SSE endpoint。
2. 未接入 TradingAgents。
3. Task 27 后，`runnerType=qwen` 可通过后端 QwenRunnerAdapter 生成一组可查询的 runtime events，但 SSE 仍只是回放后端已生成事件，不是 Qwen token 流。
4. 已连接后端 stub SSE；未连接真实 TradingAgents SSE / WebSocket。
5. 未引入新依赖。
6. mock 数据仍然保留。
7. 页面默认展示仍保持 mock mode。

## 10. Backend Stub 对齐（Task 20）

后端新增 `/api/alpha-trace/agent-runs` 系列 stub endpoint，与本 runtime event stream 设计对齐。

当前可用于 contract 验证的 endpoint：

1. `GET /api/alpha-trace/agent-runs/{run_id}/events`
2. `GET /api/alpha-trace/agent-runs/{run_id}/events/stream`
3. `GET /api/alpha-trace/agent-runs/{run_id}/reports`
4. `GET /api/alpha-trace/agent-runs/{run_id}/evidence`
5. `GET /api/alpha-trace/agent-runs/{run_id}/decision`

## 11. Demo Run 创建到 Runtime Stream（Task 24）

Task 24 将后端 demo run 创建接口接入前端入口：

1. `POST /api/alpha-trace/agent-runs/demo`
2. `AgentLabPage` 的 `Create Demo Agent Run`
3. `AssetDetailPage` 的 `发起 Agent 分析`

创建成功后，前端跳转：

1. `/dashboard#agent-lab/runs/{runId}`

进入详情页后，可继续使用：

1. `GET /api/alpha-trace/agent-runs/{runId}`
2. `GET /api/alpha-trace/agent-runs/{runId}/events`
3. `GET /api/alpha-trace/agent-runs/{runId}/reports`
4. `GET /api/alpha-trace/agent-runs/{runId}/evidence`
5. `GET /api/alpha-trace/agent-runs/{runId}/decision`
6. `GET /api/alpha-trace/agent-runs/{runId}/events/stream`

Demo Run 与真实 Agent Runner 的区别：

1. Demo Run 由后端 stub 模板生成。
2. 不调用 Qwen。
3. 不调用 TradingAgents。
4. 不写数据库。
5. 仅用于验证 AlphaTrace 前端 API contract、详情页展示和 SSE runtime stream。

后续接入计划：

1. 将 demo create 替换为真实 Agent Runner submit endpoint。
2. 将 stub events 映射替换为 TradingAgents progress/messages/tool calls/reports/final decision。

## 12. Qwen Runner 与 Event Stream（Task 27）

Task 27 新增 QwenRunnerAdapter 最小真实调用能力：

1. `POST /api/alpha-trace/agent-runs/submit`
2. `runnerConfig.runnerType = "qwen"`
3. QwenRunner 优先复用原 Hyper AI 后端模型配置：
   - `hyper_ai_profile.llm_provider`
   - `hyper_ai_profile.llm_base_url`
   - `hyper_ai_profile.llm_api_key_encrypted`
   - `hyper_ai_profile.llm_model`
4. 如果原 Hyper AI 未配置 qwen/custom-dashscope，则回退到后端环境变量。
5. API Key 只在后端读取或解密，不进入 AlphaTrace 前端。
6. Qwen 输出会被映射为统一 `AgentRuntimeEvent`：
   - `agent.run.started`
   - `agent.started`
   - `reasoning.chunk`
   - `report.generated`
   - `decision.updated`
   - `agent.run.completed`
7. `GET /events` 和 `GET /events/stream` 读取的是该 run 已生成的事件。

当前限制：

1. 不做 Qwen token-level streaming。
2. 不接 TradingAgents。
3. 不写数据库持久化 Agent Run。
4. Qwen 生成内容使用保守文本映射，尚未要求严格 JSON schema。
3. 在 Qwen 或其他模型接入前，保留统一 `AgentRuntimeEvent` 协议作为边界。

## 12. Submit Contract 与 Event Stream（Task 25）

Task 25 新增正式提交入口：

1. `POST /api/alpha-trace/agent-runs/submit`

submit 创建 run 后，前端可继续使用同一套 runtime event 读取链路：

1. `/api/alpha-trace/agent-runs/{runId}`
2. `/api/alpha-trace/agent-runs/{runId}/events`
3. `/api/alpha-trace/agent-runs/{runId}/events/stream`

`runnerConfig.runnerType` 与 event stream 的关系：

1. `stub`：当前内存模板事件，立即可用于 contract 验证。
2. `qwen`：后续 Qwen adapter 需要将模型推理、报告生成、风险复核映射为 `AgentRuntimeEvent`。
3. `tradingagents`：后续 TradingAgents adapter 需要将 progress、messages、tool calls、reports、final decision 映射为 `AgentRuntimeEvent`。
4. `custom_runner`：用于自研 Agent Runner，仍必须输出统一事件协议。

当前限制：

1. submit 仍为 stub runner。
2. 不调用 Qwen。
3. 不调用 TradingAgents。
4. 不写数据库。
5. Event stream 仍来自后端内存 stub events。

## 13. Runner Adapter 与 Event Stream（Task 26）

Task 26 新增 `AgentRunnerAdapter` / `AgentRunnerRegistry` 后端边界。

不同 runner 必须统一输出 `AgentRuntimeEvent`：

1. `stub`：当前已实现，从静态模板复制 events / reports / tool calls。
2. `qwen`：Task 27 已实现最小真实调用，将模型输出映射为 `reasoning.chunk`，报告映射为 `report.generated`，结论映射为 `decision.updated`。
3. `tradingagents`：后续将 TradingAgents progress、messages、tool calls、reports、final decision 映射为统一事件。
4. `custom_runner`：后续自研 runner 也必须走同一事件协议。

当前 `StubAgentRunnerAdapter` 行为：

1. 接收 `SubmitAgentRunRequest`。
2. 生成 `run_stub_...`。
3. 复制 stub events，并标记 source 为 `stub_runner`。
4. 将 run 写入内存 registry。
5. `/events` 与 `/events/stream` 可继续读取这些事件。

未实现 runner 行为：

1. `tradingagents` / `custom_runner` 不 fallback 到 stub。
2. API 返回 400 NotImplemented，避免误导为真实运行结果。

## 14. Qwen Runner Event Mapping（Task 27）

Task 27 新增 `QwenRunnerAdapter`：

1. 读取 `DASHSCOPE_API_KEY`。
2. 调用 DashScope OpenAI-compatible `/chat/completions`。
3. 将 Qwen 自由文本映射为 `AgentRun`、`AgentReport`、`AgentDecision`、`EvidenceReference` 和 runtime events。

当前 Qwen event mapping：

1. `agent.run.started`
2. `agent.started`
3. `reasoning.chunk`
4. `report.generated`
5. `decision.updated`
6. `agent.run.completed`

当前限制：

1. 不接 TradingAgents。
2. 不写数据库。
3. 不做复杂多 Agent 调度。
4. 不强制 Qwen 返回严格 JSON。
5. evidence 为 `ev_qwen_assumption_*` 假设证据，占位用于前端追溯展示，不代表外部已验证来源。

Task 27 起已接入 Qwen runner 最小真实调用；Task 28 起 Qwen run 可通过异步 submit 与 SSE 观察运行进度；Task 29 起 runtime 数据通过 `AgentRunStore` 写入 JSON store。当前仍不接 TradingAgents、不写真实 DB。详细后端契约见：`docs/engineering/06_backend_agent_runtime_api_contract.md`。

## Task 28: Running Run SSE Lifecycle

Task 28 upgrades the runtime event stream from a static replay endpoint to a live in-memory progress stream for running Qwen runs.

SSE behavior:

1. Client connects to `GET /api/alpha-trace/agent-runs/{runId}/events/stream`.
2. Backend sends all existing events in sequence order.
3. If the run is still `running`, the endpoint polls the in-memory run for newly appended events.
4. When the run reaches `completed`, `failed`, or `cancelled`, the stream sends a terminal event and closes.
5. If no terminal status arrives before idle timeout, the stream sends `done` with the current status and closes.

Frontend consumption:

1. `AgentRunDetailPage` auto-starts SSE when `apiMode=real` and the loaded run has `status=RUNNING`.
2. Manual `Start SSE Stream` / `Stop SSE Stream` controls remain available.
3. Runtime events are de-duplicated by `eventId` and sorted by `sequence`.
4. On stream completion or failure, the page refetches run detail, reports, evidence, and decision.

Current limits:

1. SSE is one-way progress observation only.
2. It does not stream Qwen tokens directly.
3. It does not use WebSocket control messages.
4. It does not connect TradingAgents.

## Task 29: Store-backed Event Stream

Task 29 moves runtime reads/writes from process-only dict access to `AgentRunStore`.

SSE now observes:

1. Existing events loaded from the store.
2. New events appended by Qwen background execution through the store.
3. Latest run status from the store.
4. Reports/evidence/decision that are saved after Qwen completion.

The default implementation is JSON-backed:

```txt
backend/runtime_data/alpha_trace_agent_runs.json
```

This means a completed or failed Qwen run can be queried after backend restart, and the detail page can still render historical events/reports/decision. Running tasks are not resumed after restart; persistence preserves the latest saved state only.

## Task 30: Qwen Multi-step Runtime Events

Task 30 upgrades `QwenRunnerAdapter` from a single-report mapping to a lightweight multi-step research flow.

Current flow:

1. Market View
2. Bull View
3. Bear View
4. Risk Review
5. Final Decision

Implementation detail:

1. The runner still makes one Qwen chat completion call for cost and timeout control.
2. The prompt asks Qwen to return fixed sections: `Market View`, `Bull View`, `Bear View`, `Risk Review`, `Final Decision`, and `Watch Indicators`.
3. The backend mapper splits the response into report sections and emits runtime events for each step.
4. This is a lightweight AlphaTrace runner, not a full TradingAgents multi-agent orchestration.

Event mapping:

1. `agent.started` for Market Analyst, Bull Researcher, Bear Researcher, Risk Analyst, and Portfolio Manager.
2. `tool.called` for `qwen.market_view`, `qwen.bull_view`, `qwen.bear_view`, `qwen.risk_review`, and `qwen.final_decision`.
3. `tool.result` when the single Qwen multi-step response is received.
4. `report.generated` for Market View, Bull View, Bear View, and Risk Review reports.
5. `debate.message` for bull and bear views.
6. `risk.warning` for risk review.
7. `evidence.linked` for Qwen assumption evidence.
8. `decision.updated` for final decision.
9. `agent.run.completed` when mapping is complete.

SSE does not need a protocol change. The frontend receives more granular runtime events from the same `/events/stream` endpoint.


## Task 31: Evidence Retrieval Minimal

Task 31 adds a backend-only static evidence retrieval layer before Qwen prompt construction.

Runtime additions:

1. `tool.called` with `toolName=evidence.retrieve`.
2. `tool.result` with retrieved evidence count and evidenceIds.
3. `evidence.linked` before prompt construction when static evidence is found.
4. Final `evidence.linked` now references retrieved static evidence when available; otherwise it falls back to Qwen assumption evidence.

The Qwen prompt now receives an `availableEvidence` array and is instructed to cite evidenceIds and avoid inventing evidence. This is still not TradingAgents and not an external data source integration.

## Task 35.7 Qwen Token Streaming

Task 35.7 adds token-level streaming for the Qwen runner while keeping the existing async `/submit` and SSE transport.

Lifecycle:

1. `/submit` creates a running `AgentRun` and returns immediately.
2. `QwenRunnerAdapter` calls the OpenAI-compatible Qwen chat completions endpoint with `stream=true`.
3. Delta text is accumulated in memory and flushed into runtime events as `reasoning.chunk`.
4. `/events/stream` forwards those chunk events through the existing SSE endpoint.
5. `AgentRunDetailPage` renders chunk events as Live Output while the run is still running.
6. When the Qwen stream completes, the accumulated text is parsed by the existing multi-step mapper into reports, evidence references, and final decision.

Streaming chunk event payload:

```json
{
  "content": "incremental text",
  "accumulatedLength": 1234,
  "sectionHint": "market_view | bull_view | bear_view | risk_review | final_decision | unknown",
  "streaming": true
}
```

The event type remains `reasoning.chunk`; no `report.chunk` event type is introduced in this phase. The runner batches small deltas before writing events to avoid excessive event growth.

Live Output is different from Final Report:

1. Live Output is a transient running view assembled from streaming `reasoning.chunk` events.
2. Final Report is persisted as structured `AgentReport[]` after Qwen completes.
3. Completed runs still use reports / evidence / decision as the source of record.

This is Qwen token streaming only. It does not connect TradingAgents and does not implement TradingAgents token or progress streaming.

## Task 35.8 Qwen Multi-Agent Parallel Calls

Qwen runner now executes a lightweight multi-agent call sequence instead of using one Qwen response split into sections.

Execution flow:

1. Evidence Retrieval uses the static EvidenceRetriever.
2. Market Analyst calls Qwen once for `market_view`.
3. Bull Researcher and Bear Researcher call Qwen concurrently through `ThreadPoolExecutor`.
4. Risk Analyst calls Qwen after Market / Bull / Bear are available.
5. Portfolio Manager calls Qwen for the final decision.

Runtime event payloads include DAG metadata where possible:

```json
{
  "stepId": "bull_view",
  "dependsOn": ["market_view"],
  "progress": 70
}
```

DAG:

`evidence_retrieval -> market_view -> bull_view / bear_view -> risk_review -> final_decision`

Bull / Bear are the only parallel calls in this phase. This is still not TradingAgents. It is a lightweight Qwen runner that produces TradingAgents-style runtime events and remains compatible with the existing SSE endpoint.

Task 35.8 does not use token-level streaming for the Qwen model calls. The previous `reasoning.chunk` event type remains available for progress text, but Qwen step calls are non-streaming chat completion calls in this phase.

## Task 35.7 Update: Qwen Streaming Chunks

QwenRunner now requests OpenAI-compatible chat completions with `stream=true` for each lightweight Qwen agent step. Streaming deltas are persisted as `reasoning.chunk` runtime events and forwarded by the existing `/events/stream` SSE endpoint.

Chunk payload shape:

```json
{
  "content": "incremental text",
  "streaming": true,
  "accumulatedLength": 1200,
  "sectionHint": "market_view | bull_view | bear_view | risk_review | final_decision | unknown",
  "stepId": "market_view",
  "dependsOn": ["evidence_retrieval"],
  "progress": 55
}
```

Chunks are lightly coalesced before persistence to avoid excessive event volume. Final structured reports, evidence references and decisions are still generated after the relevant Qwen step output is complete.
