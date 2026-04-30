# Strategy Store/API

## 1. 目标

Task 34 为 AlphaTrace 增加只读 Strategy Store/API，使 Strategy Lab 在 real mode 下可以从后端读取策略列表、策略详情、关联资产和关联证据。

当前目标是 API 边界和页面 real mode 最小接入，不接真实回测、不接交易、不接外部行情、不写真实 DB。

## 2. 后端 endpoints

统一前缀：`/api/alpha-trace/strategies`

1. `GET /api/alpha-trace/strategies`
2. `GET /api/alpha-trace/strategies/{strategyId}`
3. `GET /api/alpha-trace/strategies/{strategyId}/assets`
4. `GET /api/alpha-trace/strategies/{strategyId}/evidence`

列表接口支持可选查询参数：

1. `strategyType`
2. `style`
3. `assetType`
4. `status`
5. `keyword`
6. `limit`
7. `offset`

## 3. 数据来源

当前数据来源是静态 seed：

```txt
backend/services/strategy_store/static_strategy_seed.py
```

不接真实回测引擎、交易接口、外部行情或数据库。

## 4. Strategy seed 覆盖

当前 seed 覆盖以下策略类型和风格：

1. `ETF_ROTATION`：沪深300与成长 ETF 轮动、ETF 均值回归
2. `FUND_SELECTION`：平衡型基金筛选
3. `FUTURES_TIMING`：沪深300股指期货择时
4. `MULTI_ASSET_ALLOCATION`：多资产核心配置、风险平价
5. `RULE_BASED`：红利防御规则策略
6. `AGENT_GENERATED`：成长进攻 Agent 生成策略

覆盖的风格包括红利防御、成长进攻、宏观配置、趋势择时、低波稳健、风险平价、均值回归。

## 5. Store 实现

实现文件：

```txt
backend/services/strategy_store/strategy_store.py
```

`StaticStrategyStore` 提供：

1. `list_strategies(...)`
2. `count_strategies(...)`
3. `get_strategy(strategy_id)`
4. `get_strategy_assets(strategy_id)`
5. `get_strategy_evidence(strategy_id)`

## 6. 与 Asset / Evidence API 的关系

Strategy Store 不复制资产和证据 seed。

`get_strategy_assets()` 复用：

```txt
backend/services/asset_store/asset_store.py
```

`get_strategy_evidence()` 复用：

```txt
backend/services/evidence_retrieval/evidence_store.py
```

这保证 Strategy Lab、Asset Research 和 Evidence Center 对资产与证据使用同一后端静态边界。

## 7. 前端接入

`frontend/app/entities/strategy/api.ts` 新增 real mode async 方法：

1. `listStrategiesAsync(params)`
2. `getStrategyByIdAsync(strategyId)`
3. `getStrategyAssetsAsync(strategyId)`
4. `getStrategyEvidenceAsync(strategyId)`

`StrategyLabPage` 在 real mode 下：

1. 调用 `listStrategiesAsync()` 获取后端策略 seed。
2. 调用 `getStrategyAssetsAsync()` 和 `getStrategyEvidenceAsync()` 获取关联资产和证据。
3. 继续使用页面内本地筛选、搜索、详情展示和跨页跳转。
4. 显示 `Data Mode: Real API / Static Strategy Store`。
5. API 失败时展示友好错误，不让页面崩溃。

mock mode 保持原 mock 数据。

## 8. 当前限制

1. 不接真实回测。
2. 不接交易接口。
3. 不接外部行情。
4. 不接 TradingAgents。
5. 不写真实 DB。
6. 关联 Decisions / Portfolios / Leaderboard 仍主要依赖前端现有 mock 边界。

## 9. 后续计划

1. 增加 DB-backed Strategy Store。
2. 接入真实回测摘要和策略版本管理。
3. 打通 Portfolio / Decision / Leaderboard real mode。
4. 将 Agent 生成策略与 Qwen/TradingAgents Runner 输出衔接。

## Task 35: Portfolio API Linkage

Task 35 adds `GET /api/alpha-trace/portfolios/{portfolioId}/strategies`, which internally reuses the static Strategy Store. Portfolio API only owns portfolio seed and relationship IDs; Strategy API remains the source of strategy records.
