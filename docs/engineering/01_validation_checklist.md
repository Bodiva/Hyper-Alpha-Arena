# 01 验证清单

## 每次 Codex 任务后检查

### 查看结果摘要

重点看：

- Changed files
- Commands run
- Build result
- Known issues

如果 Codex 没跑 build，让它补跑。

### 本地执行

```bash
cd frontend
pnpm install
pnpm build
```

如有脚本：

```bash
pnpm lint
pnpm typecheck
pnpm test
```

### 检查 Git 变更

```bash
git status
git diff --stat
```

重点看：

- 是否删除了旧 components 目录？
- 是否大面积删除文件？
- 是否把 hyperliquid/binance 直接删掉？
- 是否改坏 vite / package / tailwind 配置？
- 是否引入了大量不必要依赖？

第一阶段应该是新增多、删除少。

## 页面验收

至少打开：

```txt
/dashboard
/assets
/agent-lab
/leaderboard
/evidence
/data-sources
/portfolio
/decision-attribution
```

## 文案扫描

新页面不应大量出现 crypto 语义。

```bash
grep -R "Hyperliquid\|Binance Futures\|perpetual\|crypto\|Funding\|CVD" frontend/app/features frontend/app/pages || true
```

## Leaderboard 验收

- 是否有多 AI 交易员排行？
- 是否有多策略排行？
- 是否支持 ETF / 基金 / 期货筛选？
- 是否支持策略风格筛选？
- 是否有收益、回撤、Sharpe、胜率等指标？
- 是否没有游戏化擂台文案？

## Agent Lab 验收

- 是否有 Agent Progress？
- 是否有 Analyst / Research / Strategy / Risk / Portfolio 分组？
- 是否有 Tool Calls？
- 是否有 Current Report？
- 是否有 Final Decision？
- 是否有 Evidence 入口？
- 是否有 Runtime Metrics？

## Asset Research 验收

- 是否支持 ETF / 基金 / 期货 / 指数类型？
- ETF 是否有跟踪指数、规模、流动性、持仓/成分？
- 基金是否有基金经理、净值、风格、持仓？
- 期货是否有主力合约、期限结构、持仓量、基差等占位？
- 是否能关联 Agent Run 和 Evidence？
