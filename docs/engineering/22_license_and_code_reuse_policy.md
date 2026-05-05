# 22 License and Code Reuse Policy

日期：2026-05-01

范围：

1. `Hyper-Alpha-Arena`
2. `TradingAgents`
3. AlphaTrace 后续商业化后端架构重构中的代码复用、架构借鉴和 clean-room 重写边界

本文件不是法律意见。正式商业化发布前，应由法务或开源合规负责人复核。

## 1. 发现的 License / NOTICE 文件

### Hyper-Alpha-Arena

已发现：

1. `LICENSE`
2. `NOTICE`

`LICENSE` 为 Apache License 2.0。

`NOTICE` 内容显示：

1. 项目名：Hyper Alpha Arena
2. Copyright 2025 Heliki AI Community
3. 声明本项目基于 `open-alpha-arena`
4. 原始项目链接：`https://github.com/etrobot/open-alpha-arena`
5. 当前仓库链接：`https://github.com/HammerGPT/Hyper-Alpha-Arena`
6. 列出 Heliki AI Community 的主要改动，包括 LLM API 兼容、UI、后端性能、Hyperliquid 集成等

结论：

1. Hyper-Alpha-Arena 可以在 Apache-2.0 条款下用于商业化，但必须保留 license 和 notice。
2. 如果 AlphaTrace 继续复用 Hyper-Alpha-Arena 源代码或派生代码，需要保留原始 attribution。
3. 不能通过改名、改变量名、翻写文案来规避 NOTICE / attribution 义务。

### TradingAgents

已发现：

1. `LICENSE`

未发现：

1. `NOTICE`

`LICENSE` 为 Apache License 2.0。

结论：

1. TradingAgents 可以在 Apache-2.0 条款下用于商业化。
2. 如果直接复制、修改、分发 TradingAgents 代码，需要保留 Apache-2.0 license。
3. 当前仓库未发现 NOTICE 文件，但商业化分发时仍建议在第三方声明中记录 TradingAgents 来源。

## 2. Apache-2.0 合规要求摘要

Apache-2.0 的关键要求：

1. 分发源码或二进制时，必须附带 Apache-2.0 license 文本。
2. 如果原项目有 NOTICE 文件，派生分发中通常需要保留 NOTICE 中的 attribution。
3. 修改过的文件需要保留显著修改声明。
4. 不得移除版权、专利、商标和 attribution 声明。
5. Apache-2.0 不要求开源派生作品整体源码，但被复用代码的 license / notice 义务仍存在。
6. 商标权不自动授权，产品品牌不能误导用户认为由原作者背书。

## 3. 第三方依赖 License 风险

### Hyper-Alpha-Arena backend 依赖

`backend/pyproject.toml` 中主要依赖包括：

1. FastAPI / Uvicorn
2. SQLAlchemy / psycopg2
3. requests
4. APScheduler
5. pandas / scipy
6. ccxt
7. pydantic
8. cryptography
9. eth-account / eth-utils / hyperliquid-python-sdk
10. pandas-ta
11. python-telegram-bot / discord.py
12. mistune
13. tavily-python / trafilatura

风险点：

1. `ccxt`、`hyperliquid-python-sdk`、`eth-*` 与 crypto / exchange 旧业务强相关，AlphaTrace 商业化投研平台不应默认暴露为主能力。
2. `tavily-python`、`trafilatura` 涉及外部搜索和网页抓取能力，后续若启用，需要单独审查数据来源、使用条款和内容版权。
3. `pandas-ta` 版本固定且偏技术指标场景，商业化时要确认维护状态和 license。

### Hyper-Alpha-Arena frontend 依赖

`frontend/package.json` 中主要依赖包括：

1. React / Vite
2. Radix UI
3. chart.js / recharts / lightweight-charts
4. assistant-ui
5. react-markdown / remark-gfm / rehype-raw
6. ethers
7. i18next
8. lucide-react

风险点：

1. `ethers` 和部分旧 UI 与 crypto 旧模块相关，AlphaTrace 新产品可保留依赖但不应作为主叙事。
2. `rehype-raw` 若渲染外部模型输出，需要严格避免 XSS 风险。

### TradingAgents 依赖

`TradingAgents/pyproject.toml` 中主要依赖包括：

1. LangChain / LangGraph
2. langgraph-checkpoint-sqlite
3. langchain-openai / anthropic / google-genai
4. yfinance
5. backtrader
6. redis
7. rich / typer / questionary
8. stockstats

风险点：

1. `yfinance` 和数据源工具更适合研究/演示，商业化数据使用要确认数据授权。
2. `backtrader` 可用于回测研究，但与 AlphaTrace 的机构级证据链、组合治理需要重新建模。
3. LangGraph 引入后会带来运行时复杂度、checkpoint、状态迁移和 worker 管理问题。

## 4. 可合规复用范围

可在 Apache-2.0 合规前提下复用：

1. Hyper-Alpha-Arena 的 FastAPI 项目启动方式。
2. Hyper-Alpha-Arena 的 PostgreSQL / SQLAlchemy 连接模式。
3. Hyper-Alpha-Arena 的模型 provider / base URL / encrypted API key 配置机制。
4. Hyper-Alpha-Arena 的 SSE / AI streaming 工程经验。
5. AlphaTrace 当前新增的 Agent Runtime API、store、runner adapter、SSE 事件协议。
6. TradingAgents 的高层 Agent DAG 设计思想。
7. TradingAgents 的 LangGraph runtime 作为未来 adapter 内部执行引擎。
8. TradingAgents 的 provider factory 思路和 tool node 思路。

直接复用代码时必须保留 license / notice；只借鉴架构思想时仍建议在内部设计文档中记录来源。

## 5. 建议只借鉴、不直接复制的模块

### Hyper-Alpha-Arena

建议只借鉴：

1. Hyper AI 的模型配置、streaming、tool registry 思路。
2. Prompt / Program / Factor / Signal 的服务划分经验。
3. Market data / Kline / Analytics 的数据管线经验。
4. Order / Exchange / Bot 的接口边界经验。

不建议直接复制到 AlphaTrace 新商业化后端：

1. `hyperliquid_*`
2. `binance_*`
3. `crypto_*`
4. `order_*`
5. `auto_trader.py`
6. 与交易执行强绑定的 wallet / exchange / order 模型

原因：

1. 与 AlphaTrace 的 ETF / 基金 / 期货投研平台定位不一致。
2. 容易带入 crypto / exchange / auto trading 旧语义。
3. 商业化投研系统需要把执行能力后置，不应让交易接口成为主轴。

### TradingAgents

建议只借鉴：

1. Analyst / Research / Risk / Portfolio 的团队式分工。
2. Bull / Bear debate。
3. Risk debate。
4. LangGraph state machine。
5. Checkpoint / resume 设计。
6. Memory log / reflection 思路。

不建议直接复制：

1. 内部 `AgentState` 作为 AlphaTrace 前端 schema。
2. CLI display / rich UI 代码。
3. 默认股票 ticker / trade_date 输入模型。
4. 面向交易动作的 final decision 原文结构。
5. yfinance / Alpha Vantage 工具直接暴露给产品层。

## 6. 建议 clean-room 风格重写的范围

建议 clean-room 重写：

1. AlphaTrace 产品领域模型：Asset / Evidence / Strategy / Portfolio / Decision / AgentRun。
2. AlphaTrace REST API schema。
3. AlphaTrace RuntimeEvent schema。
4. AlphaTrace 前端消费模型。
5. AlphaTrace DB schema。
6. AlphaTrace 多租户 / 权限 / workspace 模型。
7. AlphaTrace 证据质量评分、引用校验、决策归因。
8. TradingAgents 到 AlphaTrace 的 mapper。

理由：

1. 这是 AlphaTrace 的商业化核心资产。
2. 不能让前端直接绑定 TradingAgents 内部 state。
3. 不能让产品 DB 依赖 TradingAgents checkpoint 或 markdown log。
4. 不能让旧 crypto / trading 执行模型污染 AlphaTrace 的投研治理模型。

## 7. 商业化风险

主要风险：

1. 误以为 Apache-2.0 允许移除 attribution。
2. 把 TradingAgents 内部代码直接复制到 AlphaTrace 后端但未记录来源和修改。
3. 继续使用 Hyper-Alpha-Arena 的旧 crypto/exchange 文案作为 AlphaTrace 主叙事。
4. 外部数据源 license 未审查就进入商业产品。
5. LLM 输出、网页抓取、新闻摘要涉及第三方内容版权。
6. API key 加密、租户隔离、权限审计不足。
7. 旧交易执行模块被误认为 AlphaTrace 已提供真实交易服务。

## 8. 后续合规 checklist

商业化前至少检查：

1. 保留 Hyper-Alpha-Arena `LICENSE` 和 `NOTICE`。
2. 保留 TradingAgents `LICENSE`。
3. 新增 `THIRD_PARTY_NOTICES.md`。
4. 标记 AlphaTrace 修改过的派生文件。
5. 记录 TradingAgents adapter 是否直接 import 了 TradingAgents package。
6. 记录是否复制了 TradingAgents 源码片段。
7. 审查所有第三方依赖 license。
8. 审查外部数据源条款。
9. 审查模型 provider 条款。
10. 审查是否存在商标混淆。
11. 审查用户 API key 加密和访问控制。
12. 审查 AlphaTrace 是否明确不是交易执行系统。

## 9. 原则声明

AlphaTrace 后续商业化后端应坚持：

1. 不以“改名翻写”规避 license。
2. 不复制 TradingAgents 代码到主工程，除非经过明确合规记录。
3. TradingAgents 优先作为外部 runner package / adapter 接入。
4. 产品 schema、DB schema、API schema 使用 AlphaTrace 自有设计。
5. 旧项目能力可借鉴，但 AlphaTrace 主叙事和主模型必须独立。

