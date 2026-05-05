# 26 AlphaTrace Backend Implementation Plan

日期：2026-05-01

目标：给出 AlphaTrace 商业化后端的分阶段实施计划。

## 总体路线

推荐路线：

1. 保留当前 AlphaTrace MVP。
2. 优先把 AgentRunStore PostgreSQL 化。
3. 再把 Asset / Evidence / Strategy / Portfolio / Decision store DB 化。
4. 稳定 Agent Runtime 状态机和 worker。
5. 最后接 TradingAgentsAdapter PoC。

不建议路线：

1. 不建议直接把 TradingAgents 改造成主后端。
2. 不建议直接复制 TradingAgents 代码进主工程。
3. 不建议先做 MySQL 迁移。
4. 不建议继续在 legacy crypto/trading 模块上叠加 AlphaTrace 核心能力。
5. 不建议先接外部数据源再做 Evidence Store。

## 阶段 1：当前 MVP 收口

目标：

1. 保持 JSON store。
2. 完成 Task 36-45。
3. 做演示闭环。
4. 不接 TradingAgents。

已完成能力：

1. Qwen async submit。
2. SSE runtime events。
3. Live Output。
4. Bull / Bear parallel Qwen calls。
5. Evidence retrieval seed。
6. JSON store persistence。
7. Asset / Evidence / Strategy / Portfolio / Decision / Leaderboard real mode。
8. Portfolio Diagnosis Agent Task。
9. TradingAgents design-only adapter stub。

不做事项：

1. 不做真实 DB。
2. 不接 TradingAgents。
3. 不接外部行情。
4. 不接真实交易。

验收标准：

1. Docker 能启动。
2. Vite real mode 能连接后端。
3. Qwen run 可 running -> completed。
4. AgentRunDetail 可复盘。
5. JSON store Docker volume 持久化。

风险：

1. JSON store 不适合生产。
2. threading runner 不适合高并发。
3. static seed 不是真实数据源。

优先级：已完成。

## 阶段 2：AgentRunStore PostgreSQL 化

目标：

1. 将 AgentRun / RuntimeEvent / Report / EvidenceRef / Decision 写入 PostgreSQL。
2. 保留 JSON store fallback。
3. API response 不变。

要做模块：

1. `DbAgentRunStore`
2. `alpha_trace_agent_runs`
3. `alpha_trace_runtime_events`
4. `alpha_trace_agent_reports`
5. `alpha_trace_evidence_refs`
6. `alpha_trace_decisions`
7. JSON -> DB migration script
8. env：`ALPHA_TRACE_AGENT_RUN_STORE=db`

不做事项：

1. 不改前端 schema。
2. 不接 TradingAgents。
3. 不做多租户权限。
4. 不做复杂队列。

验收标准：

1. Qwen run 写入 PostgreSQL。
2. 服务重启后 run 可查。
3. Docker recreate 后 run 可查。
4. JSON fallback 仍可用。
5. SSE 从 DB-backed store 读取 events。

风险：

1. 需要 migration 管理。
2. 事件写入频繁，需要索引和批量写策略。
3. JSONB payload 需要控制大小。

预计优先级：最高。

## 阶段 3：Domain Store DB 化

目标：

1. Asset / Evidence / Strategy / Portfolio / Decision / DataSource 进入 PostgreSQL。
2. static seed 改为 seed import。
3. Evidence 成为可治理资产。

要做模块：

1. `DbAssetStore`
2. `DbEvidenceStore`
3. `DbStrategyStore`
4. `DbPortfolioStore`
5. `DbDecisionStore`
6. `DbDataSourceStore`
7. seed import scripts
8. Evidence quality / reliability 字段
9. Evidence -> Asset / Strategy / Decision 关联表

不做事项：

1. 不接外部实时行情。
2. 不接真实交易。
3. 不做复杂权限。

验收标准：

1. Asset Research 从 DB 读。
2. Evidence Center 从 DB 读。
3. Strategy Lab 从 DB 读。
4. Portfolio Workspace 从 DB 读。
5. Decision Attribution 从 DB 读。
6. QwenRunner evidence retrieval 从 DB evidence 读。

风险：

1. seed 数据和 API schema 需要兼容。
2. Evidence 搜索初期可能仍是 SQL keyword，不是向量。
3. DataSource 真实接入前仍是半静态。

预计优先级：高。

## 阶段 4：Runner 稳定化

目标：

1. Agent Runtime 从 demo threading 变成可控执行层。
2. 支持任务状态机、取消、重试、timeout、错误原因、SSE reconnect。

要做模块：

1. Run status machine。
2. Background worker abstraction。
3. Cancel endpoint。
4. Retry endpoint。
5. Timeout policy。
6. Error reason schema。
7. Cost / token tracking。
8. SSE reconnect cursor。
9. Concurrency limiter。

不做事项：

1. 不一定立即引入 Celery / Redis。
2. 不接 TradingAgents 深度流程。
3. 不做 billing。

验收标准：

1. run 可取消。
2. run timeout 后状态明确。
3. run failure 可复盘。
4. SSE 断线可按 sequence 恢复。
5. 多个 run 不会无限创建线程。

风险：

1. Python thread 模型高并发能力有限。
2. worker 和 FastAPI 同进程会影响稳定性。
3. 后续可能需要独立 worker service。

预计优先级：高。

## 阶段 5：TradingAgentsAdapter PoC

目标：

1. `runnerType=tradingagents` 可执行最小单资产分析。
2. TradingAgents stream 映射到 AlphaTrace events。
3. final decision 映射到 AlphaTrace decision。

最小输入：

1. `taskType=single_asset_analysis`
2. `assetId=asset_etf_510300`
3. mapped ticker / symbol
4. horizon / riskPreference

要做模块：

1. `TradingAgentsRunnerAdapter`
2. `TradingAgentsConfigMapper`
3. `TradingAgentsEventMapper`
4. `TradingAgentsReportMapper`
5. `TradingAgentsDecisionMapper`
6. assetId -> ticker/symbol mapper
7. stream -> RuntimeEvent mapper

不做事项：

1. 不复制 TradingAgents 代码。
2. 不让前端消费 TradingAgents state。
3. 不把 TradingAgents checkpoint 当产品 DB。
4. 不做全量 portfolio diagnosis。

验收标准：

1. `/submit runnerType=tradingagents` 返回 runId。
2. SSE 能看到 TradingAgents node progress。
3. reports 可展示。
4. decision 可展示。
5. failure 有明确错误。

风险：

1. TradingAgents 默认股票/ticker 语义需要适配 ETF / 基金 / 期货。
2. 依赖 LangGraph / LangChain 环境和模型配置。
3. 外部数据源授权风险。
4. 运行时间和成本高于 QwenRunner。

预计优先级：中高，建议在阶段 2/3 后做。

## 阶段 6：外部数据源和证据治理

目标：

1. Data Sources 真正接入。
2. Evidence 不再只是 seed。
3. 支持可追溯、可复盘、可验证。

数据源：

1. news
2. announcements
3. reports
4. fund quarterly reports
5. macro
6. market snapshot
7. file upload
8. user upload

要做模块：

1. DataSource connector interface。
2. ingestion jobs。
3. file parser。
4. report parser。
5. evidence quality scoring。
6. citation validation。
7. duplicate detection。
8. source reliability scoring。
9. sync task monitor。

不做事项：

1. 不做未授权数据抓取。
2. 不直接把外部内容全文暴露给 LLM。
3. 不接真实交易。

验收标准：

1. Evidence 有 source lineage。
2. AgentRun evidenceIds 可追踪到 DataSource。
3. Evidence quality/reliability 可计算。
4. Decision 引用的 evidence 可校验。
5. Data Sources 页面显示同步状态。

风险：

1. 数据授权。
2. 内容版权。
3. 抓取稳定性。
4. OCR / PDF 解析成本。
5. 引用校验复杂。

预计优先级：中。

## 当前最推荐路线

最推荐：

1. 阶段 2：AgentRunStore PostgreSQL 化。
2. 阶段 3：Domain Store DB 化。
3. 阶段 4：Runner 稳定化。
4. 阶段 5：TradingAgentsAdapter PoC。
5. 阶段 6：外部数据源和证据治理。

理由：

1. 先解决产品数据持久化。
2. 再解决领域数据模型。
3. 再接复杂 Agent runtime。
4. 避免把 TradingAgents 接入建立在 JSON/static seed 上。

## 当前不建议做的事情

不建议：

1. 直接把 TradingAgents 改成 FastAPI 后端。
2. 直接复制 TradingAgents 源码到 Hyper-Alpha-Arena。
3. 让前端读取 TradingAgents internal state。
4. 先接外部行情再做 Evidence Store。
5. 先做真实交易接口。
6. 先做 MySQL 迁移。
7. 继续把 AlphaTrace 核心模块散落在 legacy services 中。
8. 让 QwenRunner 和 TradingAgentsRunner 各自定义一套输出 schema。

## 核心技术决策

建议决策：

1. 主后端：AlphaTrace FastAPI。
2. Runtime schema：AlphaTrace 自有 schema。
3. 产品 DB：PostgreSQL。
4. JSON store：仅开发 fallback。
5. Runner abstraction：AgentRunnerAdapter。
6. TradingAgents：adapter 内部执行引擎。
7. Evidence：一等公民，所有 runner 输出必须引用。
8. 前端：只消费 AlphaTrace REST/SSE。
9. 多租户：workspace-first。
10. 模型配置：server-side encrypted config。

## 是否建议直接复制两个开源项目代码

不建议。

建议：

1. Hyper-Alpha-Arena：复用产品后端基础设施和现有 AlphaTrace 代码，逐步迁移到清晰目录。
2. TradingAgents：优先作为 package / adapter 调用，不复制代码。
3. 对于核心商业领域模型，clean-room 重写。

## 建议借鉴后重写的能力

1. TradingAgents 的 Agent DAG。
2. Bull / Bear debate。
3. Risk debate。
4. Tool node 机制。
5. Checkpoint / resume 思路。
6. Hyper AI provider config。
7. Hyper AI streaming runtime。
8. Factor / Signal / Program 的研究实验思路。

## 可在 license 合规前提下局部复用的能力

1. Apache-2.0 下的 FastAPI router 模式。
2. SQLAlchemy connection 模式。
3. Hyper AI provider preset。
4. AlphaTrace 当前 RuntimeEvent schema。
5. AlphaTrace 当前 AgentRunStore interface。
6. TradingAgents package API 调用。

直接复用时必须保留 license / notice / attribution。

## 待人工确认事项

1. AlphaTrace 商业化是否允许继续基于 Hyper-Alpha-Arena 派生分发。
2. TradingAgents 是否作为依赖包引入，还是作为独立 worker service。
3. PostgreSQL 是否为最终 DB，还是客户部署需要 MySQL。
4. 是否引入 Alembic 作为 migration 工具。
5. 是否需要对象存储保存研报/PDF/原文。
6. 外部数据源授权范围。
7. 多租户权限模型。
8. 是否需要审计日志满足金融机构内控要求。

