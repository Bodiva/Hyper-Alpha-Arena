# 10 Asset Store API

日期：2026-04-29  
任务：Task 33（Asset Store/API 与 Asset Research real mode 最小接入）

## 1. 目标

Task 33 为 AlphaTrace 建立后端 Asset Store/API，使 Asset Research 和 Asset Detail 在 real mode 下可以读取后端资产列表、资产详情和相关 evidence。

当前阶段仍是静态资产 seed，不接外部行情、不接交易接口、不写真实 DB。

## 2. 后端文件

新增：

1. `backend/api/alpha_trace_asset_routes.py`
2. `backend/schemas/alpha_trace_asset.py`
3. `backend/services/asset_store/static_asset_seed.py`
4. `backend/services/asset_store/asset_store.py`
5. `backend/services/asset_store/__init__.py`

路由在 `backend/main.py` 注册。

## 3. Endpoints

统一前缀：

```txt
/api/alpha-trace/assets
```

当前 endpoints：

1. `GET /api/alpha-trace/assets`
2. `GET /api/alpha-trace/assets/{assetId}`
3. `GET /api/alpha-trace/assets/{assetId}/evidence`

### GET `/api/alpha-trace/assets`

Query 参数：

1. `assetType`
2. `market`
3. `keyword`
4. `tag`
5. `limit`
6. `offset`

### GET `/api/alpha-trace/assets/{assetId}`

返回单个 `AlphaTraceAssetItem`。

### GET `/api/alpha-trace/assets/{assetId}/evidence`

内部复用 Evidence Store，根据 assetId、symbol 和 aliases 查询相关 evidence。

## 4. Static Asset Seed

当前 seed 覆盖：

1. ETF：`asset_etf_510300` / `510300.SH` / 沪深300ETF
2. ETF：`asset_etf_159915` / `159915.SZ` / 创业板ETF
3. FUND：`asset_fund_000001` / `000001.OF` / 平衡型基金样例
4. FUND：`asset_fund_110022` / `110022.OF` / 指数增强基金样例
5. FUTURE：`asset_future_if_main` / IF主连 / 沪深300股指期货
6. FUTURE：`asset_future_au_main` / AU主连 / 黄金期货
7. INDEX：`asset_index_000300` / `000300.SH` / 沪深300指数
8. INDEX：`asset_index_399006` / `399006.SZ` / 创业板指

## 5. Asset 与 Evidence 的关系

`AssetStore.get_asset_evidence(asset_id)` 复用：

```txt
backend/services/evidence_retrieval/evidence_store.py
```

不会复制第二份 evidence seed。

资产可通过以下方式关联 evidence：

1. `assetId`
2. `id`
3. `symbol`
4. `aliases`

## 6. 前端接入

`frontend/app/entities/asset/api.ts` 新增 real mode async 方法：

1. `listAssetsAsync(params)`
2. `getAssetByIdAsync(assetId)`
3. `getAssetEvidenceAsync(assetId)`

页面接入：

1. `AssetResearchPage` real mode 使用 `listAssetsAsync()`。
2. `AssetDetailPage` real mode 使用 `getAssetByIdAsync()` 和 `getAssetEvidenceAsync()`。
3. `EvidenceCenterPage` real mode 也通过 `listAssetsAsync()` 获得资产边界，用于资产类型筛选。

mock mode 保持原 mock 数据。

## 7. 当前限制

1. 不接外部行情。
2. 不接交易接口。
3. 不接 TradingAgents。
4. 不写真实 DB。
5. Asset metrics/profile 是静态样例。
6. 相关 Agent Runs/Strategies 尚未全部后端化。

## 8. 后续计划

1. 增加 DB-backed Asset Store。
2. 接入基金净值、ETF 份额、期货主力合约和指数成分数据。
3. 与 Data Sources 同步任务打通。
4. 增加资产 ID alias 规范和统一 identifier registry。

## Task 34: Strategy API Linkage

Task 34 adds `GET /api/alpha-trace/strategies/{strategyId}/assets`, which internally reuses the static Asset Store. Strategy API only owns strategy seed and relationship IDs; Asset API remains the source of asset records.

## Task 35: Portfolio API Linkage

Task 35 adds `GET /api/alpha-trace/portfolios/{portfolioId}/assets`, which internally reuses the static Asset Store. Portfolio API only owns portfolio seed and relationship IDs; Asset API remains the source of asset records.
