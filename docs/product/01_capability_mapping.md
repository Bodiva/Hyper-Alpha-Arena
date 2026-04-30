# 01 能力映射：保留 / 改造 / 删除 / 新增

## 总体取舍表

| 原生能力 | 处理方式 | 新系统表达 | 说明 |
|---|---|---|---|
| 产品级前端工作台 | 保留 | AI Investment Research Workbench | 保留工作台、侧边栏、Dashboard、模块化页面 |
| AI Trader | 改造 | AI 投研员 / 配置顾问 / 策略 Agent | 不再强调自动下单，而是强调研究、观点、配置建议 |
| Program Trader | 改造保留 | ETF 轮动 / 基金筛选 / 期货择时 / 规则策略 | 适合做可验证策略 |
| Prompt 管理 | 改造保留 | Agent Template / Research Template | 从 Prompt 管理升级为研究模板 / Agent 模板 |
| Tool Calling 可视化 | 保留 | Agent Tool Trace / Evidence Trace | 这是信任界面，必须保留 |
| 运行监控与日志 | 保留改造 | Agent Runtime / Data Sync Runtime | 从交易机器人监控扩展为 Agent 任务与数据源监控 |
| 图表与可视化 | 保留改造 | ETF / 基金 / 期货图表、净值曲线、期限结构、组合暴露 | K线保留，但不能只服务交易触发 |
| Portfolio / Analytics | 保留增强 | Portfolio Workspace / Decision Attribution | 从账户收益监控升级为组合分析、决策归因和复盘 |
| 排行榜 / Arena | 保留改造 | 多 AI 交易员策略表现排行榜 | 保留量化对比能力，去掉夸张竞技叙事 |
| Signal 模块 | 改造 | 市场信号 / 宏观信号 / 事件信号 / 风险信号 | 不只看行情，也看外部信息和风险条件 |
| Factor 模块 | 保留改造 | ETF / 基金 / 期货因子实验室 | 因子从交易触发扩展到资产筛选、风格分析、组合解释 |
| Hyperliquid / Binance 强绑定 | 删除 / 抽象 | Broker / Exchange Adapter | 不再作为主入口，改成底层可选适配器 |
| 币对中心视图 | 删除 | Asset Universe / Watchlist / Portfolio | 资产组织方式改成 ETF、基金、期货、指数、组合 |
| 永续合约特有主指标 | 删除 / 降级 | 期货结构指标 / ETF 流动性 / 基金持仓 | Funding、CVD 不再主页化；期货 OI 可保留但语义重做 |
| 自动交易优先主线 | 弱化 | 研究 → 建议 → 调仓 → 执行 | 交易执行后置，不作为默认核心叙事 |
| 纯行情技术指标主导 | 弱化 | 外部信息 + 证据 + 多 Agent 研究 | 技术指标只是一个维度，不再是唯一研究框架 |
| 数据源中心 | 新增 | Data Sources | 管理 API、爬虫、文件、外部数据、同步状态 |
| 证据中心 | 新增 | Evidence Center | 管理新闻、公告、研报、基金季报、宏观数据快照 |
| Agent 运行过程页 | 新增 | Agent Lab / Agent Runtime | 展示多 Agent 进度、辩论、工具调用、报告 |
| 决策归因 | 新增 | Decision Attribution | 记录每次判断、证据、结果、错误原因 |
| 复盘记忆 | 新增 | Memory Log / Checkpoint / Decision Replay | 产品化复盘闭环 |

## 明确保留

- 产品级工作台结构
- AI Trader 任务配置能力
- Program Trader / 规则策略能力
- Tool Calling 可视化
- Prompt / 模板能力
- WebSocket 实时状态
- 日志 / 运行监控
- Dashboard / Portfolio / Analytics 基础骨架
- 图表和可视化能力
- 多模型配置能力
- 排行榜和量化结果对比能力

## 明确删除或弱化

删除或抽象：

- 币对中心视图
- Hyperliquid / Binance Futures 强绑定主入口
- 加密原生钱包 / 交易所账户语义
- 加密永续合约特有指标主页化
- 竞技场式夸张叙事

弱化：

- 自动交易优先主叙事
- 高频执行导向产品组织方式
- 纯行情 / 技术指标主导的单薄研究框架
