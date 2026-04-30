# 00 产品定位

## 背景

当前项目基于 Hyper-Alpha-Arena 的产品级 AI 交易工作台能力，同时计划引入 TradingAgents 的多 Agent 协同投研逻辑。

原项目重点偏向加密交易、AI Trader、Program Trader、交易执行、行情信号与收益表现。新项目关注 ETF、基金和期货，不适合继续以“高频交易 / 自动下单 / 加密交易竞技场”为主线。

## 新产品定位

> 面向 ETF、基金、期货的 Agentic 投研与配置决策平台。

完整表述：

> 系统通过外部数据源、行情数据、基金/ETF/期货基础数据、新闻政策、宏观信息、研报公告、基金季报等数据，驱动多 Agent 协同投研，并以前端可视化方式展示 Agent 分工、工具调用、证据链、研究报告、投资建议、风险审核、组合调仓逻辑和复盘归因。

## 产品主线变化

原主线：

```txt
行情 / 交易所数据
→ AI Trader
→ 交易信号
→ 下单执行
→ 收益表现
```

新主线：

```txt
外部数据 + 行情 + 证据
→ 多 Agent 投研
→ 研究报告 / 辩论 / 风险审查
→ 投资建议 / 调仓建议
→ 可选执行
→ 复盘 / 记忆 / 归因
```

## 关键原则

1. 保留原项目成熟前端工作台能力。
2. 保留 AI Trader / Program Trader / Tool Calling / Portfolio / Analytics / Leaderboard。
3. 弱化自动交易优先叙事。
4. 删除或抽象加密交易强绑定表达。
5. 新增 Asset Research、Agent Lab、Evidence Center、Data Sources、Portfolio Workspace、Decision Attribution。
6. Leaderboard 必须保留，并改造为多 AI 交易员、多策略、多观点的量化对比中心。
