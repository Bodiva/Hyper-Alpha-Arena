# 08 Evidence Retrieval Minimal

日期：2026-04-28  
任务：Task 31（Evidence retrieval 最小真实接入）

## 1. 目标

AlphaTrace 的 Qwen Runner 已经可以生成多步骤投研报告，但 Task 30 的 evidence 仍主要是 `ev_qwen_*_assumption`。Task 31 增加一个最小 evidence retrieval 层，让 QwenRunner 在不接外部数据源、不接 TradingAgents、不写真实 DB 的前提下，从后端静态 evidence seed 中检索相关证据，并将其注入 Qwen prompt、runtime events、reports、decision 和 JSON store。

## 2. 当前数据来源

当前数据来源是后端静态 seed：

```txt
backend/services/evidence_retrieval/static_evidence_seed.py
```

覆盖范围包括：

1. CSI 300 ETF / `asset_etf_510300` / `510300.SH`
2. CSI 300 Index / `asset_index_csi300` / `000300.SH`
3. Balanced Fund / `asset_fund_000001` / `000001.OF`
4. Index futures / `asset_future_if_main`
5. Commodity futures / `asset_future_sc_main`
6. Macro data
7. Market snapshot
8. Fund quarterly report
9. News / announcement
10. Research report / industry data / user upload

该 seed 是开发态样例，不代表外部实时数据源。

## 3. Retriever 规则

实现文件：

```txt
backend/services/evidence_retrieval/retriever.py
```

`EvidenceRetriever.retrieve(asset_id, question, task_type, limit)` 使用轻量规则打分：

1. `assetId` 精确匹配 `relatedAssetIds` 时加高分。
2. `question` 中的关键词匹配 title / summary / relatedAssetIds 时加分。
3. `taskType` 与 evidenceType 的简单映射加分。
4. `qualityScore` 与 `reliabilityScore` 作为排序加权。
5. 返回 top 3-5 条证据。

当前没有向量库、ES、外部行情、新闻或研报 API。

## 4. Qwen Prompt 注入

`QwenRunnerAdapter` 在调用 Qwen 前执行：

1. 写入 `tool.called: evidence.retrieve`。
2. 调用 `EvidenceRetriever`。
3. 写入 `tool.result: evidence.retrieve`。
4. 如有结果，写入 `evidence.linked`。
5. 将 evidenceId、title、sourceName、publishedAt、summary、qualityScore、reliabilityScore 注入 user prompt 的 `availableEvidence`。

Prompt 要求 Qwen：

1. 优先基于提供的 evidence 进行分析。
2. 在 Market / Bull / Bear / Risk / Final Decision 中引用 evidenceId。
3. 不编造不存在的证据。
4. 证据不足时明确说明。
5. 不承诺收益。

## 5. Runtime 与持久化

Qwen run 新增事件：

1. `tool.called`，`toolName=evidence.retrieve`
2. `tool.result`，`toolName=evidence.retrieve`
3. `evidence.linked`，包含检索到的 evidenceIds

完成后：

1. `/evidence` 优先返回 retrieved static evidence item。
2. `decision.evidenceIds` 包含 retrieved evidenceIds。
3. reports summary 追加 `Evidence used: ...`，方便前端和审计查看引用。
4. JSON store 持久化 retrieved evidence references、events、reports 和 decision。

## 6. Fallback

如果检索失败或没有命中证据：

1. Qwen run 不失败。
2. 继续执行 Qwen。
3. 保存原有 `ev_qwen_*_assumption` fallback evidence。
4. runtime event 中记录 retrieval failure 或空结果。

## 7. 当前限制

1. 静态 seed 不是实时数据源。
2. 无向量检索。
3. 无 evidence 原文下载和校验。
4. 无权限、租户或数据源质量治理。
5. 不接 TradingAgents。
6. 不写真实 DB。
7. Qwen 引用 evidenceId 依赖 prompt 约束，不做严格引用校验。

## 8. 后续计划

1. 将 static seed 替换为 Data Sources / Evidence Center 的后端数据。
2. 增加文件库、公告、研报、宏观数据和行情快照同步。
3. 增加检索评分解释和引用校验。
4. 引入 DB-backed Evidence Store。
5. 后续 TradingAgents adapter 也应复用同一 evidence retrieval 边界。

## Task 32: Evidence Store/API and Evidence Center Real Mode

Task 32 exposes the static evidence seed through backend Evidence API endpoints:

1. `GET /api/alpha-trace/evidence`
2. `GET /api/alpha-trace/evidence/{evidenceId}`
3. `GET /api/alpha-trace/evidence/search`

`EvidenceCenterPage` can now use `listEvidenceAsync()` in real mode to load backend static evidence. The data source is still local static seed, not an external data provider.

## Task 33: Asset-aware Evidence Retrieval

The static asset seed now provides asset aliases such as `asset_index_000300`, `000300.SH`, `510300.SH`, and `IF_MAIN`. Asset-scoped evidence lookup uses these identifiers to query the same static Evidence Store used by QwenRunner evidence retrieval.
