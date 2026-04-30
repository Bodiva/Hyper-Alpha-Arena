# 09 Evidence Store API

日期：2026-04-29  
任务：Task 32（Evidence Store/API 与 Evidence Center real mode 最小接入）

## 1. 目标

Task 32 将 Task 31 的 static evidence seed 与 EvidenceRetriever 抽象为后端 Evidence Store/API，使前端 Evidence Center 在 real mode 下可以查询后端 evidence，而不是只依赖前端 mock。

## 2. Endpoint

统一前缀：

```txt
/api/alpha-trace/evidence
```

当前 endpoints：

1. `GET /api/alpha-trace/evidence`
2. `GET /api/alpha-trace/evidence/{evidence_id}`
3. `GET /api/alpha-trace/evidence/search`

### GET `/api/alpha-trace/evidence`

Query 参数：

1. `assetId`
2. `evidenceType`
3. `sourceType`
4. `keyword`
5. `limit`
6. `minQualityScore`

返回：`EvidenceListResponse`。

### GET `/api/alpha-trace/evidence/{evidence_id}`

返回单条 `AlphaTraceEvidenceItem`。

### GET `/api/alpha-trace/evidence/search`

Query 参数：

1. `assetId`
2. `q`
3. `taskType`
4. `limit`

内部调用 `EvidenceRetriever`，用于模拟后续 Agent Runner 的 evidence retrieval API 边界。

## 3. 数据来源

当前数据来源仍是静态 seed：

```txt
backend/services/evidence_retrieval/static_evidence_seed.py
```

没有接入外部新闻、公告、研报、行情、ES、向量库或文件库。

## 4. Store 实现

实现文件：

```txt
backend/services/evidence_retrieval/evidence_store.py
```

`StaticEvidenceStore` 提供：

1. `list_evidence(...)`
2. `get_evidence(evidence_id)`
3. `search(asset_id, query, task_type, limit)`

这是只读 store，不写数据库。

## 5. 前端接入

`frontend/app/entities/evidence/api.ts` 新增 real mode async 方法：

1. `listEvidenceAsync(params)`
2. `getEvidenceByIdAsync(evidenceId)`
3. `searchEvidenceAsync(params)`

`EvidenceCenterPage` 在 real mode 下调用 `listEvidenceAsync()`，并继续在前端做本地筛选、详情面板和追溯链路展示。

## 6. 当前限制

1. Evidence Center real mode 只接后端 static evidence seed。
2. 资产、决策、Agent Run 的跨页反查仍主要依赖现有 mock/API 边界；本任务不扩大接入范围。
3. 不接外部数据源。
4. 不接 TradingAgents。
5. 不写真实 DB。
6. 不做权限隔离。

## 7. 后续计划

1. 将 static seed 替换为 DB-backed Evidence Store。
2. 接 Data Sources 的文件导入、爬虫、API 同步结果。
3. 增加全文检索 / 向量检索。
4. 增加 evidence 引用校验和引用质量评分。
5. 让 QwenRunner 与 Evidence Center 共用同一后端 Evidence Store。

## Task 33: Asset API Linkage

Task 33 adds `GET /api/alpha-trace/assets/{assetId}/evidence`, which internally reuses the static Evidence Store. Evidence API remains the source of evidence records; Asset API only provides an asset-scoped convenience endpoint.

## Task 34: Strategy API Linkage

Task 34 adds `GET /api/alpha-trace/strategies/{strategyId}/evidence`, which internally reuses the static Evidence Store. Strategy API only owns strategy seed and relationship IDs; Evidence API remains the source of evidence records.
