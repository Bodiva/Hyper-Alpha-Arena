# 04 Frontend API Contracts

日期：2026-04-27  
任务：Task 16 + Task 17 + Task 18（后端 API 适配层 + 新页面 mock 访问收敛 + API Mode 预备）

## 1. API 适配层目标

在不接入真实后端的前提下，先建立稳定的数据访问边界，避免页面直接依赖 `mocks/*.mock.ts`，为后续真实 API 接入降低改造成本。

核心目标：

1. 页面层只调用 `entities/*/api.ts`。
2. `entities/*/api.ts` 内部当前仍可读取 mock。
3. 通过统一 API Mode 控制 mock / real 的切换边界。
4. 后续切换真实接口时，尽量不改页面逻辑。

当前默认模式：

1. `API_MODE = "mock"`
2. `API_BASE_URL = "/api"`
3. 未配置环境变量时页面继续使用 mock 数据。

可选 Vite 环境变量：

1. `VITE_ALPHA_TRACE_API_MODE=mock|real`
2. `VITE_ALPHA_TRACE_API_BASE_URL=/api`
3. 未知 mode 会 fallback 到 `mock`。

## 2. 为什么不直接在页面 import mock

页面直接 import mock 的问题：

1. 数据源耦合在 UI 层，迁移真实 API 需要逐页改。
2. 相同查询逻辑在多页面重复，维护成本高。
3. 页面与实体边界不清晰，不利于测试和演进。

约定：

1. 新页面禁止直接 import `mocks/*.mock.ts`。
2. 统一通过 `entities/*/api.ts` 访问数据。
3. mock 文件保留，作为 service 层底层数据源。

## 3. shared/api 文件

### `frontend/app/shared/api/api-config.ts`

统一配置：

1. `API_MODE`
2. `API_BASE_URL`

### `frontend/app/shared/api/api-mode.ts`

模式工具：

1. `getApiMode()`
2. `isMockMode()`
3. `isRealApiMode()`
4. `shouldUseMockData()`

### `frontend/app/shared/api/api-types.ts`

通用类型：

1. `ApiMode`
2. `ApiResponse<T>`
3. `PaginatedResponse<T>`
4. `ApiError`
5. `QueryParams`
6. `SortOrder`
7. `EntityId`
8. `DateRange`
9. `RequestOptions`
10. `ApiStatus`

### `frontend/app/shared/api/endpoints.ts`

预留 endpoint 常量与 `ENDPOINTS` 对象：

1. `ASSETS` / `ASSET_DETAIL`
2. `EVIDENCE` / `EVIDENCE_DETAIL` / `EVIDENCE_USED_BY`
3. `AGENT_RUNS` / `AGENT_RUN_DETAIL` / `AGENT_RUN_EVENTS` / `AGENT_RUN_REPORTS` / `AGENT_RUN_EVIDENCE` / `AGENT_RUN_DECISION`
4. `DECISIONS` / `DECISION_DETAIL`
5. `PORTFOLIOS` / `PORTFOLIO_DETAIL`
6. `STRATEGIES` / `STRATEGY_DETAIL`
7. `LEADERBOARD`
8. `DATA_SOURCES` / `DATA_SOURCE_DETAIL` / `DATA_SOURCE_TASKS`
9. `SETTINGS`

约定：endpoint 不包含 `/api` 前缀，由 `API_BASE_URL` 统一补齐。例如 `ENDPOINTS.assets` 为 `/assets`，最终请求地址为 `/api/assets`。

### `frontend/app/shared/api/http-client.ts`

轻量 `fetch` client：

1. `get`
2. `post`
3. `put`
4. `delete`

约定：

1. 使用 `API_BASE_URL` 作为统一前缀。
2. 支持 query params、JSON body 和 `AbortController` timeout。
3. 成功时直接返回 `T`，不额外包一层 `ApiResponse<T>`。
4. 错误时抛出结构化 `ApiError` 对象。
5. 当前页面仍不直接调用真实后端。

### `frontend/app/shared/api/mock-delay.ts`

工具函数：

1. `mockDelay<T>(data: T, delayMs = 50): Promise<T>`

用于后续平滑切换异步数据流。

## 4. entities API 方法清单

### `frontend/app/entities/asset/api.ts`

1. `listAssets(params?)`
2. `getAssetById(assetId)`
3. `getAssetsByType(assetType)`
4. `getAssetsByIds(assetIds)`
5. `getRelatedEvidenceForAsset(assetId)`
6. `getRelatedAgentRunsForAsset(assetId)`

### `frontend/app/entities/evidence/api.ts`

1. `listEvidence(params?)`
2. `getEvidenceById(evidenceId)`
3. `getEvidenceByIds(evidenceIds)`
4. `getEvidenceByAssetId(assetId)`
5. `getEvidenceBySourceName(sourceName)`
6. `getEvidenceUsedBy(evidenceId)`

### `frontend/app/entities/agent/api.ts`

1. `listAgentRuns(params?)`
2. `getAgentRunById(runId)`
3. `getAgentRunsByAssetId(assetId)`
4. `getAgentRunsByPortfolioId(portfolioId)`
5. `getAgentRunEvents(runId)`
6. `getAgentRunReports(runId)`
7. `getAgentRunEvidence(runId)`

### `frontend/app/entities/decision/api.ts`

1. `listDecisions(params?)`
2. `getDecisionById(decisionId)`
3. `getDecisionsByAssetId(assetId)`
4. `getDecisionsByRunId(runId)`
5. `getDecisionsByPortfolioId(portfolioId)`

### `frontend/app/entities/portfolio/api.ts`

1. `listPortfolios()`
2. `getPortfolioById(portfolioId)`
3. `getPortfolioDecisions(portfolioId)`

### `frontend/app/entities/strategy/api.ts`

1. `listStrategies(params?)`
2. `getStrategyById(strategyId)`
3. `getStrategiesByAssetType(assetType)`
4. `listLeaderboard(params?)`
5. `getLeaderboardItemByStrategyId(strategyId)`

### `frontend/app/entities/data-source/api.ts`

1. `listDataSources(params?)`
2. `getDataSourceById(sourceId)`
3. `getDataSourceTasks(sourceId)`
4. `getDataSourceEvidence(sourceName)`

### `frontend/app/entities/settings/api.ts`

1. `getSettings()`
2. 导出 Settings 相关枚举/类型/选项常量（供 `SettingsPage` 使用）

## 5. 已 service 化页面清单

以下页面已从“直接 import mock”迁移为“调用 entities API service”：

1. `AssetResearchPage.tsx`
2. `AssetDetailPage.tsx`
3. `EvidenceCenterPage.tsx`
4. `AgentLabPage.tsx`
5. `AgentRunDetailPage.tsx`
6. `StrategyLabPage.tsx`
7. `LeaderboardPage.tsx`
8. `PortfolioWorkspacePage.tsx`
9. `DecisionAttributionPage.tsx`
10. `DataSourcesPage.tsx`
11. `DashboardPage.tsx`
12. `SettingsPage.tsx`

## 6. 尚未 service 化页面

当前 Task 范围内新页面已全部完成 service 化。  
旧业务页面与旧模块按约定不在本次改造范围。

## 7. 未来真实后端 endpoint 映射（预留）

建议映射：

1. `asset/api.ts` -> `/api/assets`, `/api/assets/:assetId`
2. `evidence/api.ts` -> `/api/evidence`, `/api/evidence/:evidenceId`, `/api/evidence/:evidenceId/used-by`
3. `agent/api.ts` -> `/api/agent-runs`, `/api/agent-runs/:runId`, `/api/agent-runs/:runId/events`, `/api/agent-runs/:runId/reports`
4. `decision/api.ts` -> `/api/decisions`, `/api/decisions/:decisionId`
5. `portfolio/api.ts` -> `/api/portfolios`, `/api/portfolios/:portfolioId`
6. `strategy/api.ts` -> `/api/strategies`, `/api/strategies/:strategyId`, `/api/leaderboard`
7. `data-source/api.ts` -> `/api/data-sources`, `/api/data-sources/:sourceId`, `/api/data-sources/:sourceId/tasks`

## 8. TradingAgents 后端接入预留

预留接口：

1. `/api/agent-runs`
2. `/api/agent-runs/:runId/events`
3. `/api/agent-runs/:runId/reports`
4. `/api/agent-runs/:runId/evidence`
5. `/api/agent-runs/:runId/decision`

接入策略：

1. 页面调用层保持不变。
2. 在 `entities/agent/api.ts` 内从 mock 查询切到 `httpClient + endpoints`。
3. 逐步引入分页、增量事件流和错误处理。

## 9. mock -> 真实 API 迁移计划

Phase 1（已完成）：

1. 页面调用统一收敛到 `entities/*/api.ts`。
2. service 层内部仍读取 mock 数据。

Phase 2（下一阶段）：

1. service 层增加 mock/real 切换开关。（已完成 Task 18）
2. 逐实体替换为真实 HTTP 请求。

Phase 3：

1. 增加统一分页、缓存、重试与错误分层。
2. 引入稳定的契约测试和回归验证。

## 10. 当前说明

1. 本阶段未接入真实 API。
2. 默认仍为 mock mode。
3. real mode 仅作为占位：`entities/*/api.ts` 会明确抛出未实现错误。
4. 未修改 backend / package.json / Docker。
5. mock 文件未删除，作为 service 数据源持续保留。
6. 页面展示保持不变。

## 11. API Mode 行为

`entities/*/api.ts` 统一使用 `shouldUseMockData()` 判断当前模式。

当前行为：

1. mock mode：同步返回现有 mock 数据，保持页面行为不变。
2. real mode：抛出 `Real API mode for <operation> is not implemented yet.`。

这样做的原因：

1. 避免页面提前进入半异步状态。
2. 明确真实 API 尚未接入。
3. 后续逐个实体切换为 `httpClient + ENDPOINTS` 时，改动集中在 service 层。

## 12. Agent Runtime Event Stream 预备（Task 19）

新增前端 runtime event stream 适配层：

1. `frontend/app/entities/agent/runtime-events.ts`
2. `frontend/app/entities/agent/runtime-adapter.ts`
3. `frontend/app/entities/agent/mock-runtime-replay.ts`
4. `frontend/app/shared/api/event-stream-client.ts`

新增 `entities/agent/api.ts` 方法：

1. `getAgentRunRuntimeEvents(runId)`
2. `createAgentRuntimeEventStream(runId, options?)`

当前行为：

1. 默认 transport 为 `mock`。
2. mock transport 从现有 `agent-runs.mock.ts` 派生 runtime events。
3. `sse` / `websocket` transport 仅占位，不会连接真实后端。
4. `AgentRunDetailPage` 可手动 replay runtime events，用于验证流式事件展示结构。

预留 endpoint：

1. `GET /api/agent-runs/:runId/events`
2. `GET /api/agent-runs/:runId/events/stream`
3. `WS /ws/agent-runs/:runId`

详细设计见：`docs/engineering/05_agent_runtime_event_stream.md`。

## 13. Backend Agent Runtime API Stub（Task 20）

后端已预留 AlphaTrace Agent Runtime API：

1. `GET /api/alpha-trace/agent-runs`
2. `GET /api/alpha-trace/agent-runs/{run_id}`
3. `GET /api/alpha-trace/agent-runs/{run_id}/events`
4. `GET /api/alpha-trace/agent-runs/{run_id}/reports`
5. `GET /api/alpha-trace/agent-runs/{run_id}/evidence`
6. `GET /api/alpha-trace/agent-runs/{run_id}/decision`
7. `GET /api/alpha-trace/agent-runs/{run_id}/events/stream`
8. `POST /api/alpha-trace/agent-runs/demo`

前端 endpoint 常量已补充 `alphaTraceAgentRuns` 等字段，但页面仍保持 mock mode，不切换到真实 API。

详细后端契约见：`docs/engineering/06_backend_agent_runtime_api_contract.md`。

## 14. Agent Lab Real Mode 最小切片（Task 21）

Task 21 只验证 Agent Lab 链路，不切换全部页面。

已接入 real mode 的前端 service：

1. `listAgentRunsAsync(params?)`
2. `getAgentRunByIdAsync(runId)`
3. `getAgentRunRuntimeEventsAsync(runId)`

对应后端 stub endpoint：

1. `GET /api/alpha-trace/agent-runs`
2. `GET /api/alpha-trace/agent-runs/{runId}`
3. `GET /api/alpha-trace/agent-runs/{runId}/events`

页面范围：

1. `AgentLabPage.tsx` 支持 mock / real mode 数据加载。
2. `AgentRunDetailPage.tsx` 支持 mock / real mode Agent Run 详情加载。
3. `AgentRunDetailPage.tsx` 支持 real mode runtime events 加载，但不接真实 SSE / WebSocket。

默认行为：

1. 未配置环境变量时仍为 `mock`。
2. mock mode 页面行为保持原有 mock 展示。
3. real mode 只在显式配置 `VITE_ALPHA_TRACE_API_MODE=real` 时启用。
4. real API 请求失败时页面展示错误提示，不会崩溃。

Windows PowerShell real mode 示例：

```powershell
$env:VITE_ALPHA_TRACE_API_MODE="real"
$env:VITE_ALPHA_TRACE_API_BASE_URL="http://127.0.0.1:8802/api"
cd frontend
pnpm dev
```

如果使用同源后端静态服务，可设置：

```powershell
$env:VITE_ALPHA_TRACE_API_MODE="real"
$env:VITE_ALPHA_TRACE_API_BASE_URL="/api"
cd frontend
pnpm dev
```

Task 21 后仍未接入 real mode 的 Agent Runtime 接口：

1. reports 独立接口
2. evidence 独立接口
3. decision 独立接口
4. events/stream SSE
5. demo create

这些接口仍作为后续切片处理。本任务未接 Qwen、未接 TradingAgents、未写数据库。

## 15. Agent Run Detail Reports / Evidence / Decision Real Mode（Task 22）

Task 22 继续限定在 Agent Lab 链路，不切换全部页面。

新增已接入 real mode 的前端 service：

1. `getAgentRunReportsAsync(runId)`
2. `getAgentRunEvidenceAsync(runId)`
3. `getAgentRunDecisionAsync(runId)`

对应后端 stub endpoint：

1. `GET /api/alpha-trace/agent-runs/{runId}/reports`
2. `GET /api/alpha-trace/agent-runs/{runId}/evidence`
3. `GET /api/alpha-trace/agent-runs/{runId}/decision`

`AgentRunDetailPage.tsx` 在 real mode 下现在加载：

1. run detail：`GET /api/alpha-trace/agent-runs/{runId}`
2. events：`GET /api/alpha-trace/agent-runs/{runId}/events`
3. reports：`GET /api/alpha-trace/agent-runs/{runId}/reports`
4. evidence：`GET /api/alpha-trace/agent-runs/{runId}/evidence`
5. decision：`GET /api/alpha-trace/agent-runs/{runId}/decision`

页面行为：

1. 默认未配置环境变量时仍为 `mock`。
2. real mode 只在显式配置 `VITE_ALPHA_TRACE_API_MODE=real` 时启用。
3. reports / evidence / decision 独立加载，单个接口失败只显示对应状态和错误提示，不阻断其他区域。
4. Current Report 优先展示 reports API 返回内容。
5. Evidence Used 优先展示 evidence API 返回内容。
6. Final Decision Card 优先展示 decision API 返回内容。

Windows PowerShell real mode 示例：

```powershell
$env:VITE_ALPHA_TRACE_API_MODE="real"
$env:VITE_ALPHA_TRACE_API_BASE_URL="http://127.0.0.1:8802/api"
cd H:\git0412\hyperalphaarena_codex\ai-investment-workbench\Hyper-Alpha-Arena\frontend
pnpm dev
```

验证 URL：

1. `http://127.0.0.1:<vite-port>/dashboard#agent-lab`
2. `http://127.0.0.1:<vite-port>/dashboard#agent-lab/runs/demo-run-001`

当前仍未接入：

1. `events/stream` SSE
2. WebSocket runtime stream
3. Qwen
4. TradingAgents
5. database persistence
6. demo create 的前端触发入口

后续建议：

1. 将 SSE endpoint 接入 `event-stream-client.ts` 的 `sse` transport。
2. 为 Agent Run 创建流程增加 demo create 前端入口。
3. 定义 TradingAgents event 到 `AgentRuntimeEvent` 的字段映射测试集。

## 16. Agent Runtime SSE EventSource Transport（Task 23）

Task 23 只接入 Agent Run Detail 的 runtime event stream 前端 transport，不扩展到其他页面。

已接入：

1. `frontend/app/shared/api/event-stream-client.ts` 支持 `transport: "sse"`。
2. `createEventStreamClient({ transport: "sse" })` 使用浏览器 `EventSource`。
3. `entities/agent/api.ts` 的 `createAgentRuntimeEventStream(runId, { transport: "sse" })` 默认连接 `ENDPOINTS.alphaTraceAgentRunEventsStream(runId)`。
4. `AgentRunDetailPage.tsx` 在 real mode 下提供 `Start SSE Stream` / `Stop SSE Stream`。
5. SSE event 会逐条追加到 Runtime Event Stream 面板，并通过 runtime adapter 聚合为 snapshot。
6. SSE 失败时只更新面板错误状态，不会让页面崩溃。

使用 endpoint：

1. `GET /api/alpha-trace/agent-runs/{runId}/events/stream`

启动方式：

```powershell
$env:VITE_ALPHA_TRACE_API_MODE="real"
$env:VITE_ALPHA_TRACE_API_BASE_URL="http://127.0.0.1:8802/api"
cd H:\git0412\hyperalphaarena_codex\ai-investment-workbench\Hyper-Alpha-Arena\frontend
pnpm dev
```

访问：

1. `http://127.0.0.1:<vite-port>/dashboard#agent-lab/runs/demo-run-001`
2. 点击 `Start SSE Stream`

当前仍未接入：

1. WebSocket runtime stream
2. Qwen
3. TradingAgents
4. database persistence
5. demo create 的前端触发入口

默认行为仍是 mock mode；未配置 `VITE_ALPHA_TRACE_API_MODE=real` 时不会连接 SSE。

## 17. Demo Agent Run 创建入口（Task 24）

Task 24 只接入 AlphaTrace Agent Lab 链路的 demo run 创建，不扩展到其他页面的真实 API。

新增前端 service：

1. `createDemoAgentRunAsync(payload)`

payload 字段：

1. `assetId?: string`
2. `taskType: string`
3. `question: string`
4. `portfolioId?: string`
5. `strategyId?: string`

real mode 行为：

1. 调用 `POST /api/alpha-trace/agent-runs/demo`。
2. 返回后端 stub `AgentRun`，由 `agent/api.ts` 映射为前端 `AgentRun`。
3. 成功后页面跳转 `/dashboard#agent-lab/runs/{runId}`。
4. 后续详情页继续读取 run detail、events、reports、evidence、decision，并可手动启动 SSE stream。

mock mode 行为：

1. 不请求后端。
2. 返回本地 mock run，用于导航和页面流程演练。
3. 默认仍保持 mock mode，不会自动创建 demo run。

页面入口：

1. `AgentLabPage.tsx` Header 增加 `Create Demo Agent Run` 按钮。
2. `AssetDetailPage.tsx` 的 `发起 Agent 分析` / `发起单资产分析` 接入 demo run 创建。

当前仍未接入：

1. Qwen
2. TradingAgents
3. database persistence
4. 真实 Agent Runner

后端 stub 仅做内存态 contract 验证，不代表真实任务调度。

## 18. Agent Runner Submit Contract（Task 25）

Task 25 新增正式 Agent Runner 提交契约。它不替代 Task 24 的 demo 创建入口。

新增前端 service：

1. `submitAgentRunAsync(payload)`

payload 与后端 `SubmitAgentRunRequest` 对齐：

1. `assetId?: string`
2. `portfolioId?: string`
3. `strategyId?: string`
4. `taskType: string`
5. `question: string`
6. `horizon?: "short_term" | "medium_term" | "long_term"`
7. `riskPreference?: "conservative" | "balanced" | "aggressive"`
8. `evidenceScope?: { includeNews, includeReports, includeMacro, includeMarketSnapshot }`
9. `runnerConfig?: { runnerType, modelProvider, modelName, enableStreaming }`

endpoint：

1. `POST /api/alpha-trace/agent-runs/submit`

`createDemoAgentRunAsync` 与 `submitAgentRunAsync` 区别：

1. `createDemoAgentRunAsync` 只用于演示固定 demo run。
2. `submitAgentRunAsync` 是未来真实 Agent Runner 的正式提交边界。
3. 当前 `submitAgentRunAsync` 在 real mode 下支持 stub 和 qwen runner；Task 28 起 qwen submit 会立即返回 RUNNING run。
4. 当前 `submitAgentRunAsync` 已接 Qwen runner 最小链路，但仍不接 TradingAgents、不写数据库。

页面入口：

1. `AgentLabPage.tsx` 新增 `Submit Stub Agent Task` 按钮。
2. mock mode 下返回本地 mock run，不请求后端。
3. real mode 下调用 `/submit`，成功后跳转 `/dashboard#agent-lab/runs/{runId}`。

当前未接真实模型；`runnerConfig.runnerType` 仅作为后续分发 Qwen / TradingAgents / custom runner 的契约字段。

## 19. Qwen Runner 页面测试与错误透传（Task 27 follow-up）

AlphaTrace Agent Lab 提供 `Submit Qwen Agent Task` 页面入口，用于测试：

1. `POST /api/alpha-trace/agent-runs/submit`
2. `runnerConfig.runnerType = "qwen"`
3. `modelProvider = "qwen"`
4. `modelName = "qwen-plus"`

前端修复：

1. `shared/api/http-client.ts` 现在会读取 FastAPI 的 `detail` 字段。
2. 如果后端返回 `{ "detail": "..." }`，页面显示具体原因，而不是只显示 `HTTP request failed: 400`。
3. `AgentLabPage.tsx` 中错误提示统一为 `Agent task failed: ...`。

当前真实 400 的主要原因通常是：

1. Hyper AI 后端配置中没有可用 qwen/custom-dashscope 配置。
2. 后端环境变量 `DASHSCOPE_API_KEY` 未配置。

后端 key 来源：

1. 优先复用原 Hyper AI DB 配置：`services.hyper_ai_service.get_llm_config(db)`。
2. API Key 存于 `hyper_ai_profile.llm_api_key_encrypted`，只在后端解密。
3. 若没有 Hyper AI qwen 配置，则 fallback 到后端环境变量：
   - `DASHSCOPE_API_KEY`
   - `QWEN_BASE_URL`
   - `QWEN_MODEL`

Docker compose 只透传环境变量名，不写入真实 key。

当前仍不接入：

1. TradingAgents
2. database persistence for Agent Run
3. real trading
4. front-end API key passing

## 20. Async Submit and Live Runtime Observation（Task 28）

Task 28 changes the Agent Lab real-mode submit flow:

1. `AgentLabPage` calls `submitAgentRunAsync`.
2. Backend immediately returns `runId` with `status=running` for `runnerType=qwen`.
3. Agent Lab navigates immediately to `/dashboard#agent-lab/runs/{runId}`.
4. `AgentRunDetailPage` loads the running run and automatically starts SSE in real mode.
5. The Runtime Event Stream panel receives incremental runtime events.
6. When SSE completes or fails, the page refetches run detail, reports, evidence, and decision.

Frontend behavior:

1. Mock mode remains unchanged and uses mock replay.
2. Real mode uses EventSource SSE for running runs.
3. The page shows `Run Status`, `Stream`, `Events`, `Reports`, `Evidence`, and `Decision` state badges.
4. Existing manual Start/Stop SSE controls remain available.

Current limits:

1. No TradingAgents.
2. No database persistence.
3. No token-level Qwen streaming.
4. No external task queue.


## Task 32: Evidence API Real Mode Slice

Evidence API endpoints added for real mode:

1. `GET /api/alpha-trace/evidence`
2. `GET /api/alpha-trace/evidence/{evidenceId}`
3. `GET /api/alpha-trace/evidence/search`

Frontend service methods:

1. `listEvidenceAsync(params)`
2. `getEvidenceByIdAsync(evidenceId)`
3. `searchEvidenceAsync(params)`

`EvidenceCenterPage` now loads evidence through `listEvidenceAsync()`. Mock mode still returns `evidence.mock.ts`; real mode queries the AlphaTrace backend static Evidence Store. Other Evidence Center filters remain local on the page.

## Task 33: Asset Store/API Real Mode Slice

Task 33 adds AlphaTrace Asset API endpoints:

1. `GET /api/alpha-trace/assets`
2. `GET /api/alpha-trace/assets/{assetId}`
3. `GET /api/alpha-trace/assets/{assetId}/evidence`

Frontend service methods:

1. `listAssetsAsync(params)`
2. `getAssetByIdAsync(assetId)`
3. `getAssetEvidenceAsync(assetId)`

`AssetResearchPage` and `AssetDetailPage` now use these async methods in real mode. Mock mode still uses `assets.mock.ts`.

## Task 34: Strategy Store/API Real Mode Slice

Task 34 adds AlphaTrace Strategy API endpoints:

1. `GET /api/alpha-trace/strategies`
2. `GET /api/alpha-trace/strategies/{strategyId}`
3. `GET /api/alpha-trace/strategies/{strategyId}/assets`
4. `GET /api/alpha-trace/strategies/{strategyId}/evidence`

Frontend service methods:

1. `listStrategiesAsync(params)`
2. `getStrategyByIdAsync(strategyId)`
3. `getStrategyAssetsAsync(strategyId)`
4. `getStrategyEvidenceAsync(strategyId)`

`StrategyLabPage` now uses these async methods in real mode and keeps mock mode unchanged. Strategy-related assets and evidence are resolved through backend Asset Store and Evidence Store rather than duplicated seeds.

## Task 35: Portfolio Store/API Real Mode Slice

Task 35 adds AlphaTrace Portfolio API endpoints:

1. `GET /api/alpha-trace/portfolios`
2. `GET /api/alpha-trace/portfolios/{portfolioId}`
3. `GET /api/alpha-trace/portfolios/{portfolioId}/holdings`
4. `GET /api/alpha-trace/portfolios/{portfolioId}/recommendations`
5. `GET /api/alpha-trace/portfolios/{portfolioId}/assets`
6. `GET /api/alpha-trace/portfolios/{portfolioId}/strategies`
7. `GET /api/alpha-trace/portfolios/{portfolioId}/decisions`

Frontend service methods:

1. `listPortfoliosAsync(params)`
2. `getPortfolioByIdAsync(portfolioId)`
3. `getPortfolioHoldingsAsync(portfolioId)`
4. `getPortfolioRecommendationsAsync(portfolioId)`
5. `getPortfolioAssetsAsync(portfolioId)`
6. `getPortfolioStrategiesAsync(portfolioId)`
7. `getPortfolioDecisionsAsync(portfolioId)`

`PortfolioWorkspacePage` now uses these async methods in real mode and keeps mock mode unchanged. Related assets and strategies are resolved through backend Asset Store and Strategy Store. Decisions currently degrade safely to an empty list until Decision Store/API is introduced.
