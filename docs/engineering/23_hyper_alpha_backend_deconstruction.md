# 23 Hyper-Alpha-Arena Backend Deconstruction

日期：2026-05-01

目标：解构当前 Hyper-Alpha-Arena 后端，为 AlphaTrace 商业化后端重构做输入。

本文件基于本地代码结构，不做代码修改。

## 1. 总体判断

Hyper-Alpha-Arena 后端是一个产品型 FastAPI 后端，已经具备：

1. FastAPI app。
2. REST API router。
3. WebSocket / SSE 能力。
4. SQLAlchemy / PostgreSQL 连接。
5. Docker / PostgreSQL 部署。
6. 原 Hyper AI 模型配置和 streaming 能力。
7. 大量交易、行情、Kline、Factor、Signal、Prompt、Program、Portfolio、Analytics 能力。
8. AlphaTrace 新增的 Agent Runtime / Asset / Evidence / Strategy / Portfolio / Decision / Leaderboard API。

核心问题：

1. 旧业务强绑定 crypto / Hyperliquid / Binance / trading / order。
2. `main.py` 承担过多职责，既初始化 app，也包含 watcher、monitor、静态文件、router 注册和若干兼容 endpoint。
3. `database/models.py` 是大型集中模型文件，边界较重。
4. AlphaTrace 新模块仍是渐进式叠加，没有形成独立商业化后端目录。

结论：

1. 它适合作为 AlphaTrace 商业化后端的起点。
2. 它不适合直接作为干净目标架构。
3. 需要逐步拆出 AlphaTrace 自有 domains / runtime / integrations / infrastructure。

## 2. backend 目录结构

已发现主要目录：

1. `api/`：FastAPI router。
2. `routes/`：部分 program 相关 router。
3. `services/`：业务服务、AI 服务、交易服务、AlphaTrace store / runner。
4. `schemas/`：Pydantic schema。
5. `database/`：SQLAlchemy 连接和模型。
6. `repositories/`：部分数据访问封装。
7. `config/`：配置和 prompt。
8. `backtest/`：回测相关。
9. `factors/`：因子相关。
10. `program_trader/`：程序化策略能力。
11. `static/`：前端 build 产物。
12. `utils/`：通用工具。

模块图：

```mermaid
flowchart TD
  FE["Frontend static / Vite"] --> Main["backend/main.py"]
  Main --> API["api/*.py routers"]
  Main --> Routes["routes/*.py"]
  API --> Services["services/*.py"]
  Routes --> Services
  Services --> DB["database/models.py + connection.py"]
  Services --> External["Exchange / LLM / News / Market Data"]
  Services --> Alpha["AlphaTrace stores / runners"]
  Alpha --> Json["JSON AgentRunStore"]
  Alpha --> SSE["SSE Runtime Events"]
```

## 3. FastAPI app 初始化方式

`backend/main.py` 负责：

1. `load_dotenv()`。
2. 创建 `FastAPI(title="Hyper Alpha Arena API")`。
3. 添加 CORS middleware。
4. 挂载 `static` 和 `assets`。
5. 提供 `/api/health`。
6. 提供 `/api/rebuild-frontend`。
7. 启动 frontend watcher。
8. 启动 runtime monitor。
9. 导入并注册大量 routers。
10. 注册 WebSocket endpoint。
11. 提供 SPA fallback。

风险：

1. `main.py` 已过重。
2. AlphaTrace 商业化后端应该避免继续把初始化、运维、路由、兼容逻辑都堆在一个文件。
3. 新架构应拆成 `app_factory`、`router_registry`、`lifespan`、`static_serving`、`runtime_monitor`。

## 4. 路由注册方式

`main.py` 中集中 import router 并逐个 `app.include_router(...)`。

主要 legacy routers：

1. `market_data_routes`
2. `order_routes`
3. `account_routes`
4. `config_routes`
5. `ranking_routes`
6. `crypto_routes`
7. `arena_routes`
8. `system_log_routes`
9. `prompt_routes`
10. `sampling_routes`
11. `hyperliquid_action_routes`
12. `hyperliquid_routes`
13. `user_routes`
14. `kline_routes`
15. `kline_analysis_routes`
16. `market_flow_routes`
17. `signal_routes`
18. `market_regime_routes`
19. `analytics_routes`
20. `trader_data_routes`
21. `prompt_backtest_routes`
22. `program_routes`
23. `system_routes`
24. `binance_routes`
25. `ai_stream_routes`
26. `hyper_ai_routes`
27. `bot_routes`
28. `factor_routes`
29. `news_routes`
30. `market_intelligence_routes`

AlphaTrace routers：

1. `alpha_trace_agent_runtime_routes`
2. `alpha_trace_evidence_routes`
3. `alpha_trace_asset_routes`
4. `alpha_trace_strategy_routes`
5. `alpha_trace_portfolio_routes`
6. `alpha_trace_decision_routes`
7. `alpha_trace_leaderboard_routes`

## 5. AlphaTrace API endpoints

当前 AlphaTrace endpoints：

### Agent Runtime

1. `GET /api/alpha-trace/agent-runs`
2. `GET /api/alpha-trace/agent-runs/{run_id}`
3. `GET /api/alpha-trace/agent-runs/{run_id}/events`
4. `GET /api/alpha-trace/agent-runs/{run_id}/reports`
5. `GET /api/alpha-trace/agent-runs/{run_id}/evidence`
6. `GET /api/alpha-trace/agent-runs/{run_id}/decision`
7. `GET /api/alpha-trace/agent-runs/{run_id}/events/stream`
8. `POST /api/alpha-trace/agent-runs/demo`
9. `POST /api/alpha-trace/agent-runs/submit`

### Asset

1. `GET /api/alpha-trace/assets`
2. `GET /api/alpha-trace/assets/{asset_id}`
3. `GET /api/alpha-trace/assets/{asset_id}/evidence`

### Evidence

1. `GET /api/alpha-trace/evidence`
2. `GET /api/alpha-trace/evidence/search`
3. `GET /api/alpha-trace/evidence/{evidence_id}`

### Strategy

1. `GET /api/alpha-trace/strategies`
2. `GET /api/alpha-trace/strategies/{strategy_id}`
3. `GET /api/alpha-trace/strategies/{strategy_id}/assets`
4. `GET /api/alpha-trace/strategies/{strategy_id}/evidence`

### Portfolio

1. `GET /api/alpha-trace/portfolios`
2. `GET /api/alpha-trace/portfolios/{portfolio_id}`
3. `GET /api/alpha-trace/portfolios/{portfolio_id}/holdings`
4. `GET /api/alpha-trace/portfolios/{portfolio_id}/recommendations`
5. `GET /api/alpha-trace/portfolios/{portfolio_id}/assets`
6. `GET /api/alpha-trace/portfolios/{portfolio_id}/strategies`
7. `GET /api/alpha-trace/portfolios/{portfolio_id}/decisions`

### Decision

1. `GET /api/alpha-trace/decisions`
2. `GET /api/alpha-trace/decisions/{decision_id}`
3. `GET /api/alpha-trace/decisions/{decision_id}/evidence`
4. `GET /api/alpha-trace/decisions/{decision_id}/agent-run`

### Leaderboard

1. `GET /api/alpha-trace/leaderboard`

## 6. services 目录结构

主要 service 文件可分为：

### AlphaTrace 新模块

1. `alpha_trace_agent_runtime_service.py`
2. `agent_runners/base.py`
3. `agent_runners/registry.py`
4. `agent_runners/stub_runner.py`
5. `agent_runners/qwen_runner.py`
6. `agent_runners/tradingagents_adapter.py`
7. `agent_runtime_store/base.py`
8. `agent_runtime_store/json_store.py`
9. `agent_runtime_store/memory_store.py`
10. `agent_runtime_store/registry.py`
11. `asset_store/*`
12. `decision_store/*`
13. `evidence_retrieval/*`
14. `leaderboard_store/*`
15. `portfolio_store/*`
16. `strategy_store/*`

### 原 Hyper AI / AI stream

1. `hyper_ai_service.py`
2. `hyper_ai_llm_providers.py`
3. `hyper_ai_tools.py`
4. `hyper_ai_tool_registry.py`
5. `hyper_ai_subagents.py`
6. `hyper_ai_skill_engine.py`
7. `hyper_ai_memory_service.py`
8. `hyper_ai_harness.py`
9. `ai_stream_service.py`
10. `ai_decision_service.py`
11. `ai_prompt_generation_service.py`
12. `ai_signal_generation_service.py`
13. `ai_attribution_service.py`
14. `ai_program_service.py`

### Program / Prompt / Factor / Signal / Backtest

1. `program_execution_service.py`
2. `prompt_backtest_service.py`
3. `prompt_initializer.py`
4. `factor_registry.py`
5. `factor_resolver.py`
6. `factor_expression_engine.py`
7. `factor_computation_service.py`
8. `factor_effectiveness_service.py`
9. `signal_detection_service.py`
10. `signal_analysis_service.py`
11. `signal_backtest_service.py`

### Market / Kline / News / Intelligence

1. `kline_data_service.py`
2. `kline_collectors.py`
3. `kline_realtime_collector.py`
4. `kline_backfill_manager.py`
5. `kline_ai_analysis_service.py`
6. `market_data.py`
7. `market_stream.py`
8. `market_events.py`
9. `market_flow_collector.py`
10. `market_flow_indicators.py`
11. `market_regime_service.py`
12. `news_feed.py`
13. `news_collector_service.py`
14. `news_ai_classifier.py`
15. `news_prompt_variables.py`

### Exchange / Trading / Order / Bot

1. `hyperliquid_*`
2. `binance_*`
3. `exchanges/*`
4. `order_executor.py`
5. `order_matching.py`
6. `order_monitor.py`
7. `order_scheduler.py`
8. `auto_trader.py`
9. `trading_commands.py`
10. `trading_strategy.py`
11. `bot_*`
12. `telegram_bot_service.py`
13. `discord_bot_service.py`

## 7. database / models / connection

`database/connection.py`：

1. 使用 SQLAlchemy。
2. 默认 `DATABASE_URL=postgresql://alpha_user:alpha_pass@postgres:5432/alpha_arena`。
3. 定义 `engine`、`SessionLocal`、`Base`、`get_db()`。
4. 连接池参数来自环境变量。

`database/models.py` 是集中式 SQLAlchemy 模型文件。

已发现模型清单：

1. `User`
2. `Account`
3. `UserAuthSession`
4. `Position`
5. `Order`
6. `Trade`
7. `TradingConfig`
8. `SystemConfig`
9. `CryptoPrice`
10. `CryptoKline`
11. `CryptoPriceTick`
12. `AccountAssetSnapshot`
13. `AccountStrategyConfig`
14. `GlobalSamplingConfig`
15. `UserSubscription`
16. `AIDecisionLog`
17. `PromptTemplate`
18. `AccountPromptBinding`
19. `HyperliquidWallet`
20. `HyperliquidAccountSnapshot`
21. `HyperliquidPosition`
22. `HyperliquidExchangeAction`
23. `PerpFunding`
24. `PriceSample`
25. `UserExchangeConfig`
26. `KlineCollectionTask`
27. `BinanceWallet`
28. `BinanceAccountSnapshot`
29. `BinanceBackfillTask`
30. `HyperliquidBackfillTask`
31. `KlineAIAnalysisLog`
32. `AiPromptConversation`
33. `AiPromptMessage`
34. `AiSignalConversation`
35. `AiSignalMessage`
36. `AiAttributionConversation`
37. `AiAttributionMessage`
38. `AiProgramConversation`
39. `AiProgramMessage`
40. `MarketTradesAggregated`
41. `MarketOrderbookSnapshots`
42. `MarketAssetMetrics`
43. `MarketSentimentMetrics`
44. `SignalDefinition`
45. `SignalPool`
46. `SignalTriggerLog`
47. `TraderTriggerConfig`
48. `MarketRegimeConfig`
49. `PromptBacktestTask`
50. `PromptBacktestItem`
51. `TradingProgram`
52. `AccountProgramBinding`
53. `ProgramExecutionLog`
54. `BacktestResult`
55. `BacktestTriggerLog`
56. `HyperAiProfile`
57. `HyperAiMemory`
58. `HyperAiConversation`
59. `HyperAiMessage`
60. `BotConfig`
61. `BotChatBinding`
62. `FactorValue`
63. `FactorEffectiveness`
64. `CustomFactor`
65. `NewsArticle`

风险：

1. 单文件模型过大。
2. AlphaTrace 新商业模型尚未进入 DB。
3. 旧模型中交易执行和 crypto 语义很重。

## 8. PostgreSQL / Docker 配置

`docker-compose.yml` 当前包含：

1. `postgres` service。
2. PostgreSQL 14。
3. `POSTGRES_DB=alpha_arena`。
4. `postgres_data` volume。
5. `DATABASE_URL=postgresql://alpha_user:alpha_pass@postgres:5432/alpha_arena`。
6. AlphaTrace JSON store volume：`app_data:/app/data`。
7. `ALPHA_TRACE_AGENT_RUN_STORE=json`。
8. `ALPHA_TRACE_AGENT_RUN_STORE_PATH=/app/data/alpha_trace_agent_runs.json`。

结论：

1. 项目已天然支持 PostgreSQL。
2. AlphaTrace AgentRunStore DB 化应优先基于现有 PostgreSQL。
3. MySQL 可行但不是当前最低成本路径。

## 9. 原模型配置能力

`hyper_ai_service.py` 中 `get_llm_config(db)` 读取 `HyperAiProfile`。

支持字段：

1. provider
2. base URL
3. model
4. encrypted API key
5. api format

`hyper_ai_llm_providers.py` 中预设 provider 包括：

1. OpenAI
2. Anthropic
3. Gemini
4. Deepseek
5. Z.ai / Zhipu
6. MiniMax
7. OpenRouter
8. Qwen / DashScope
9. Moonshot
10. Custom

结论：

1. AlphaTrace QwenRunner 已能复用原 Hyper AI 配置。
2. 后续应抽象为 `ModelConfigService`，避免继续绑定 Hyper AI 命名。
3. API key 必须继续只在后端读取，不暴露给前端。

## 10. Hyper AI / AI stream

Hyper AI 模块能力：

1. 多 provider LLM 调用。
2. stream buffer。
3. background task。
4. tool registry。
5. subagents。
6. memory。
7. context compression。
8. risk / confirmation harness。

适合 AlphaTrace 借鉴：

1. provider config。
2. stream task 管理。
3. tool safety / confirmation。
4. memory 存储经验。

不建议直接沿用：

1. Hyper AI 产品语义。
2. 交易助手 prompt。
3. 面向 crypto/trading onboarding 的 profile 字段。

## 11. AI Trader / Program Trader / Prompt / Factor / Signal

这些模块提供：

1. prompt 模板。
2. prompt backtest。
3. program execution。
4. factor registry / expression / computation。
5. signal detection / analysis / backtest。
6. attribution。

适合 AlphaTrace 复用/借鉴：

1. Strategy Lab 的规则策略能力。
2. 因子表达式和计算能力。
3. prompt backtest 作为研究实验入口。
4. attribution 思路。

需要重写：

1. 面向 ETF / 基金 / 期货的策略 schema。
2. 面向组合配置的 signal schema。
3. 证据链与策略回测的绑定关系。

## 12. Kline / market data / exchange / order / trading

强绑定 legacy 的模块：

1. `hyperliquid_routes.py`
2. `hyperliquid_action_routes.py`
3. `binance_routes.py`
4. `crypto_routes.py`
5. `order_routes.py`
6. `hyperliquid_*`
7. `binance_*`
8. `auto_trader.py`
9. `order_executor.py`
10. `order_scheduler.py`

建议：

1. 归入 Legacy。
2. 不作为 AlphaTrace 商业化后端主模块。
3. 可以借鉴数据采集和市场指标 pipeline，但应 clean-room 重写 AlphaTrace DataSource / MarketSnapshot。

## 13. 当前 AlphaTrace 新模块优缺点

优点：

1. API schema 已经形成。
2. 前端已接入 real mode。
3. AgentRun / Events / Reports / Evidence / Decision 可复盘。
4. QwenRunner 已支持异步、SSE、JSON store。
5. Evidence 是一等公民的雏形。
6. TradingAgentsAdapter 边界已存在，且当前明确 NotImplemented。

缺点：

1. 大量 store 仍是 static seed。
2. AgentRunStore 仍是 JSON，不是产品级 DB。
3. 任务调度仍是 thread，不是可控 worker。
4. 没有多租户 / 权限。
5. 没有正式 migration。
6. AlphaTrace 模块仍散落在旧 backend 目录中。

## 14. 可复用模块

建议复用：

1. FastAPI + router 结构。
2. SQLAlchemy / PostgreSQL 连接方式。
3. Hyper AI provider config 和 encrypted API key 经验。
4. SSE runtime 经验。
5. AlphaTrace 当前 API schema。
6. AlphaTrace AgentRunnerRegistry / AgentRunStore 接口。
7. AlphaTrace Evidence / Asset / Strategy / Portfolio API 形态。

## 15. Legacy 模块

建议归入 Legacy：

1. crypto routes。
2. Hyperliquid routes/services/models。
3. Binance routes/services/models。
4. exchange wallet / order / position / trade 执行模块。
5. arena / ranking crypto 竞技叙事。
6. bot/telegram/discord 交易命令。

## 16. 重写建议

建议重写为 AlphaTrace 自有模块：

1. `domains/assets`
2. `domains/evidence`
3. `domains/strategy`
4. `domains/portfolio`
5. `domains/decision`
6. `runtime/agent_runs`
7. `runtime/events`
8. `runners/qwen`
9. `runners/tradingagents`
10. `integrations/model_providers`
11. `integrations/data_sources`
12. `infrastructure/db`
13. `infrastructure/auth`
14. `infrastructure/audit`

## 17. 风险点

1. 继续在 legacy backend 中叠加 AlphaTrace，会加剧模块混乱。
2. 直接暴露旧 routes 会影响商业化定位。
3. JSON store 不适合长期运行。
4. threading runner 需要限流、取消、超时、重试。
5. 当前 QwenRunner 成本和并发控制仍初级。
6. 外部数据源没有真实授权和治理。
7. 权限和 workspace 尚未建立。

