# TODO: ETF / 基金 / 期货 Agentic 投研决策平台重构

## 0. 项目目标

将现有偏加密交易的 AI Trading Workbench，渐进式重构为面向 ETF、基金、期货的 Agentic 投研与配置决策平台。

核心原则：

1. 保留原项目成熟的产品级前端工作台能力。
2. 保留 AI Trader、Program Trader、Tool Calling、运行监控、图表、Portfolio、Analytics 等基础能力。
3. 保留排行榜能力，但从“竞技场叙事”改造成“多 AI 交易员 / 多策略 / 多观点的量化结果对比能力”。
4. 删除或弱化加密货币特有表达。
5. 新增 Asset Research、Agent Lab、Evidence Center、Data Sources、Portfolio Workspace、Decision Attribution 等模块。
6. 后端未来会新增基于 TradingAgents 的多 Agent 协同投研逻辑，前端需要预留 Agent Runtime、工具调用、报告、证据链和复盘接口。

## 1. 现有能力盘点

- [ ] 扫描 `frontend/app/components`
- [ ] 梳理 analytics / arena / factor / hyper-ai / klines / portfolio / program / prompt / signal / trader / trading / ui 等目录
- [ ] 标记可复用的 UI、图表、运行监控、Tool Calling、Prompt、Portfolio、Analytics、排行榜组件
- [ ] 找出 Hyperliquid / Binance / crypto / perpetual / Funding / CVD / OI 等强绑定文案与组件

## 2. 新目录骨架

- [ ] `app/`
- [ ] `shared/`
- [ ] `entities/`
- [ ] `features/`
- [ ] `pages/`
- [ ] `mocks/`

## 3. 第一阶段页面

- [ ] `/dashboard`
- [ ] `/assets`
- [ ] `/assets/:assetId`
- [ ] `/agent-lab`
- [ ] `/agent-lab/runs/:runId`
- [ ] `/strategy-lab`
- [ ] `/leaderboard`
- [ ] `/portfolio`
- [ ] `/evidence`
- [ ] `/data-sources`
- [ ] `/decision-attribution`
- [ ] `/settings`

## 4. 优先实现

1. Leaderboard
2. Agent Lab
3. Asset Research
4. Evidence Center
5. Data Sources
6. Portfolio Workspace
7. Decision Attribution

## 5. 验收命令

每个任务后至少运行：

```bash
cd frontend
pnpm build
```

如有脚本，也运行：

```bash
pnpm lint
pnpm typecheck
pnpm test
```
