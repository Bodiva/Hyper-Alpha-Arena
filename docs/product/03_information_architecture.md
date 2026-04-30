# 03 新信息架构

## 新主菜单

1. Dashboard 首页
2. Asset Research 资产研究
3. Agent Lab 多 Agent 投研
4. Strategy Lab 策略中心
5. Leaderboard 策略排行榜
6. Portfolio Workspace 组合工作台
7. Evidence Center 证据中心
8. Data Sources 数据源中心
9. Decision Attribution 决策归因
10. Settings 设置

## 路由规划

```txt
/dashboard
/assets
/assets/:assetId
/agent-lab
/agent-lab/runs/:runId
/strategy-lab
/leaderboard
/portfolio
/evidence
/evidence/:evidenceId
/data-sources
/decision-attribution
/settings
```

## 模块说明

### Dashboard

市场概览、组合概览、今日风险、最近 Agent 分析、重点机会 / 风险、Leaderboard 摘要、数据源健康状态。

### Asset Research

ETF、基金、期货、指数、自选池。

### Agent Lab

Agent Run 列表、Agent Run 详情、多 Agent 进度、多空辩论、工具调用、报告生成、证据引用、最终建议。

### Strategy Lab

ETF 轮动、基金筛选、期货择时、规则策略、Agent 生成策略、回测配置。

### Leaderboard

多 AI 交易员排行、多策略排行、多风格对比、多资产对比、收益 / 风险 / 证据 / Agent 表现综合评估。

### Portfolio Workspace

当前持仓、权重分布、行业 / 风格 / 资产类别暴露、风险指标、调仓建议、情景压力测试。

### Evidence Center

新闻、公告、研报、基金季报、宏观数据、行情快照、产业数据、用户上传文件。

### Data Sources

API 数据源、爬虫数据源、文件导入、人工上传、同步任务、数据质量、来源可信度。

### Decision Attribution

决策记录、决策详情、原始建议、使用证据、实际结果、收益归因、错误复盘、Agent 贡献评分。
