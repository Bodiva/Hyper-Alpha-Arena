# Portfolio Store/API

## 1. 目标

Task 35 为 AlphaTrace 增加只读 Portfolio Store/API，使 Portfolio Workspace 在 real mode 下可以从后端读取组合列表、组合详情、持仓、调仓建议、关联资产和关联策略。

当前目标是最小 API 边界和页面 real mode 接入，不接真实交易、不接券商/交易所接口、不接真实风控引擎、不写真实 DB。

## 2. 后端 endpoints

统一前缀：`/api/alpha-trace/portfolios`

1. `GET /api/alpha-trace/portfolios`
2. `GET /api/alpha-trace/portfolios/{portfolioId}`
3. `GET /api/alpha-trace/portfolios/{portfolioId}/holdings`
4. `GET /api/alpha-trace/portfolios/{portfolioId}/recommendations`
5. `GET /api/alpha-trace/portfolios/{portfolioId}/assets`
6. `GET /api/alpha-trace/portfolios/{portfolioId}/strategies`
7. `GET /api/alpha-trace/portfolios/{portfolioId}/decisions`

列表接口支持可选查询参数：

1. `riskLevel`
2. `objective`
3. `status`
4. `keyword`
5. `limit`
6. `offset`

## 3. 数据来源

当前数据来源是静态 seed：

```txt
backend/services/portfolio_store/static_portfolio_seed.py
```

没有接入真实交易、券商接口、交易所接口、外部行情、真实风控引擎或数据库。

## 4. Portfolio seed 覆盖

当前 seed 包含 3 个组合：

1. `portfolio_etf_core_001`：ETF 核心配置组合，主要关联 `510300.SH`、`159915.SZ`、`000300.SH`。
2. `portfolio_multi_asset_001`：多资产配置组合，覆盖 ETF / FUND / FUTURE / INDEX。
3. `portfolio_defensive_income_001`：稳健防御组合，关联红利防御、风险平价、基金筛选策略。

每个组合包含：

1. holdings / positions
2. exposures
3. riskMetrics
4. rebalanceRecommendations / rebalanceSuggestions
5. relatedAssetIds
6. relatedStrategyIds
7. relatedDecisionIds

## 5. Store 实现

实现文件：

```txt
backend/services/portfolio_store/portfolio_store.py
```

`StaticPortfolioStore` 提供：

1. `list_portfolios(...)`
2. `count_portfolios(...)`
3. `get_portfolio(portfolio_id)`
4. `get_portfolio_holdings(portfolio_id)`
5. `get_portfolio_recommendations(portfolio_id)`
6. `get_portfolio_assets(portfolio_id)`
7. `get_portfolio_strategies(portfolio_id)`
8. `get_portfolio_decisions(portfolio_id)`

## 6. 与 Asset / Strategy / Decision API 的关系

Portfolio Store 不复制资产和策略 seed。

`get_portfolio_assets()` 复用：

```txt
backend/services/asset_store/asset_store.py
```

`get_portfolio_strategies()` 复用：

```txt
backend/services/strategy_store/strategy_store.py
```

`get_portfolio_decisions()` 当前返回空数组。Decision Store 不在 Task 35 范围内，后续可替换为正式 Decision Store/API。

## 7. 前端接入

`frontend/app/entities/portfolio/api.ts` 新增 real mode async 方法：

1. `listPortfoliosAsync(params)`
2. `getPortfolioByIdAsync(portfolioId)`
3. `getPortfolioHoldingsAsync(portfolioId)`
4. `getPortfolioRecommendationsAsync(portfolioId)`
5. `getPortfolioAssetsAsync(portfolioId)`
6. `getPortfolioStrategiesAsync(portfolioId)`
7. `getPortfolioDecisionsAsync(portfolioId)`

`PortfolioWorkspacePage` 在 real mode 下：

1. 使用 `listPortfoliosAsync()` 加载组合列表。
2. 使用 `getPortfolioByIdAsync()` 加载当前组合详情。
3. 使用 `getPortfolioHoldingsAsync()` 展示持仓表。
4. 使用 `getPortfolioRecommendationsAsync()` 展示调仓建议。
5. 使用 `getPortfolioAssetsAsync()` 和 `getPortfolioStrategiesAsync()` 展示相关资产/策略。
6. `getPortfolioDecisionsAsync()` 当前安全降级为空数组。
7. 显示 `Data Mode: Real API / Static Portfolio Store`。
8. API 失败时展示友好错误，不让页面崩溃。

mock mode 保持原 mock 数据。

## 8. 当前限制

1. 不接真实交易。
2. 不接券商或交易所接口。
3. 不接真实风控引擎。
4. 不接外部行情。
5. 不接 TradingAgents。
6. 不写真实 DB。
7. Decision 关联当前为空，等待 Decision Store/API。
8. 组合净值、成本、市值均为静态样例。

## 9. 后续计划

1. 增加 DB-backed Portfolio Store。
2. 接入真实持仓导入和组合净值计算。
3. 接入真实风控引擎和风险预算规则。
4. 打通 Decision Store/API，实现调仓建议与历史决策复盘闭环。
5. 与 Agent Runner 的组合诊断任务联动。

## Task 36: Portfolio Diagnosis Agent Entry

Portfolio Workspace now exposes a `Submit Portfolio Diagnosis Agent Task` action. In real API mode it calls the shared Agent Runtime submit endpoint with `taskType=portfolio_diagnosis` and the selected `portfolioId`. The backend Qwen runner reads the selected portfolio from `PortfolioStore`, injects holdings/risk/rebalance context into the prompt, and writes the resulting runtime events, reports, evidence, and decision to the existing AgentRunStore.

This action does not execute trades, does not call an external risk engine, and does not use real-time market data. Mock mode continues to use local sample Agent Run data and does not call the backend.
