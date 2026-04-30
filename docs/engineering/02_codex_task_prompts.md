# 02 Codex 分步任务提示词

## 使用方式

每次只给 Codex 一个任务。不要一次性让它完成全部重构。

---

## Task 0：新增重构文档

```txt
请先不要改业务代码。请阅读当前仓库结构，并新增一组重构规划文档，用于后续渐进式前端重构。

目标：将当前偏加密交易的 AI Trading Workbench，逐步重构为面向 ETF、基金、期货的 Agentic 投研决策平台。

请新增：

1. AGENTS.md
2. docs/product/00_product_positioning.md
3. docs/product/01_capability_mapping.md
4. docs/product/02_frontend_directory_migration.md
5. docs/product/03_information_architecture.md
6. docs/product/04_agent_runtime_design.md
7. docs/product/05_leaderboard_design.md
8. docs/engineering/00_frontend_refactor_plan.md
9. docs/engineering/01_validation_checklist.md
10. docs/engineering/02_codex_task_prompts.md
11. TODO.md

要求：
- 不要修改现有业务代码。
- 不要删除任何旧目录。
- 文档中明确：排行榜能力需要保留，并改造为多 AI 交易员、多策略、多观点的量化结果对比。
- 文档中明确：crypto、hyperliquid、binance 相关能力第一阶段不删除，只标记为 legacy 或 broker adapter 候选。
- 最后运行 `git status`，说明新增了哪些文件。
```

---

## Task 1：新增前端目录骨架

```txt
请基于 AGENTS.md 和 docs 中的重构规划，新增前端新目录骨架，但不要迁移旧组件，也不要删除旧目录。

请在 frontend/app 下新增：

- shared/ui
- shared/api
- shared/hooks
- shared/lib
- shared/charting
- shared/i18n
- entities/asset
- entities/portfolio
- entities/strategy
- entities/agent
- entities/evidence
- entities/data-source
- entities/decision
- features/dashboard
- features/asset-research
- features/agent-lab
- features/strategy-lab
- features/leaderboard
- features/portfolio-workspace
- features/evidence-center
- features/data-sources
- features/decision-attribution
- features/settings
- pages
- mocks

每个目录先放一个 README.md，说明该目录职责。

要求：
- 不改现有路由。
- 不改现有业务页面。
- 不删除旧 components 目录。
- 执行 `cd frontend && pnpm build`。
```

---

## Task 2：新增类型和 mock 数据

```txt
请为新系统新增基础 TypeScript 类型和 mock 数据，不接真实后端。

新增以下类型文件：

- frontend/app/entities/asset/model.ts
- frontend/app/entities/agent/model.ts
- frontend/app/entities/evidence/model.ts
- frontend/app/entities/portfolio/model.ts
- frontend/app/entities/strategy/model.ts
- frontend/app/entities/decision/model.ts
- frontend/app/entities/data-source/model.ts

新增 mock 数据：

- frontend/app/mocks/assets.mock.ts
- frontend/app/mocks/agent-runs.mock.ts
- frontend/app/mocks/evidence.mock.ts
- frontend/app/mocks/leaderboard.mock.ts
- frontend/app/mocks/portfolio.mock.ts

类型至少覆盖 Asset、AgentRun、LeaderboardItem、Evidence、Portfolio、Decision、DataSource。

要求：
- 只新增类型和 mock 数据。
- 不接 API。
- 不改旧页面。
- 执行 `cd frontend && pnpm build`。
```

---

## Task 3：新增新路由和空页面

```txt
请新增新信息架构的空页面和路由，但页面内容先用简单 Card + 标题 + 简短说明。

新增页面：
DashboardPage、AssetResearchPage、AssetDetailPage、AgentLabPage、AgentRunDetailPage、StrategyLabPage、LeaderboardPage、PortfolioWorkspacePage、EvidenceCenterPage、DataSourcesPage、DecisionAttributionPage、SettingsPage。

新增路由：
/dashboard、/assets、/assets/:assetId、/agent-lab、/agent-lab/runs/:runId、/strategy-lab、/leaderboard、/portfolio、/evidence、/data-sources、/decision-attribution、/settings。

要求：
- 尽量复用现有 AppShell / layout。
- 不删除旧路由。
- 旧页面仍然可访问。
- 执行 `cd frontend && pnpm build`。
```

---

## Task 4：实现 Leaderboard

```txt
请实现新版 Leaderboard 策略排行榜页面，使用 mock 数据。

目标：将原来的 Arena / 排行榜能力改造为多 AI 交易员、多策略、多观点的量化对比中心。

页面路径：/leaderboard

页面需要包含：
1. 顶部说明：多 AI 交易员策略对比，支持 ETF / 基金 / 期货，支持不同风格策略量化评估。
2. 筛选器：资产类型、策略风格、时间区间、运行模式。
3. 排行榜表格：排名、AI 交易员、策略名称、风格、资产类型、累计收益、年化收益、最大回撤、Sharpe、胜率、证据评分、风控评分。
4. 图表区域：收益对比、回撤对比、风险收益散点图。

要求：
- 使用 mock 数据。
- 不接真实 API。
- 不使用 crypto 文案。
- 不使用“竞技场擂台”风格文案。
- 保留专业投研风格。
- 执行 `cd frontend && pnpm build`。
```

---

## Task 5：实现 Agent Lab

```txt
请实现 Agent Lab 多 Agent 投研页面，使用 mock 数据。

页面：/agent-lab 和 /agent-lab/runs/:runId

AgentRunDetail 页面布局：
左侧 Agent Progress Board；中间 Current Report / Agent Debate / Final Decision；右侧 Tool Calls / Evidence Used / Data Context；底部 Runtime Metrics。

要求：
- 使用 mock agent-runs 数据。
- 参考 TradingAgents CLI 的 Progress / Messages / Current Report 结构，但不要做成终端风格。
- 强调 ETF / 基金 / 期货投研。
- 保留 Tool Calling 可视化。
- 执行 `cd frontend && pnpm build`。
```
