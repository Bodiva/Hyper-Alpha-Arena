# 02 前端目录结构迁移对比

## 原项目目录特点

```txt
frontend/
  app/
    components/
      analytics/
      arena/
      binance/
      common/
      crypto/
      exchange/
      factor/
      hyper-ai/
      hyperliquid/
      klines/
      layout/
      mobile/
      portfolio/
      premium/
      program/
      prompt/
      settings/
      signal/
      trader/
      trading/
      ui/
    hooks/
    lib/
    styles/
    i18n/
```

特点：

- 以 `components/` 为中心。
- 按功能模块平铺。
- 加密交易语义较强。
- 适合快速迭代，但不利于长期业务域分层。

## 建议新目录结构

```txt
frontend/app/
  app/
    main.tsx
    App.tsx
    router.tsx
    providers/
    layouts/

  shared/
    ui/
    api/
    hooks/
    lib/
    charting/
    i18n/

  entities/
    asset/
    portfolio/
    strategy/
    agent/
    evidence/
    data-source/
    decision/

  features/
    dashboard/
    asset-research/
    agent-lab/
    strategy-lab/
    leaderboard/
    portfolio-workspace/
    evidence-center/
    data-sources/
    decision-attribution/
    settings/

  pages/
  mocks/
  styles/
```

## 原目录到新目录映射

| 原目录 | 新目录 | 处理方式 |
|---|---|---|
| components/ui | shared/ui | 保留并迁移 |
| components/layout | app/layouts | 保留并改造 |
| components/common | shared/ui / shared/lib | 拆分 |
| components/analytics | features/decision-attribution + features/leaderboard | 改造 |
| components/arena | features/agent-lab + features/leaderboard | 改造 |
| components/trader | features/agent-lab / features/strategy-lab | 改造 |
| components/trading | features/strategy-lab | 降级 |
| components/program | features/strategy-lab | 保留改造 |
| components/prompt | features/agent-lab / features/strategy-lab | 改造 |
| components/signal | features/strategy-lab | 改造 |
| components/factor | features/strategy-lab / features/asset-research | 保留改造 |
| components/portfolio | features/portfolio-workspace | 保留增强 |
| components/klines | shared/charting + features/asset-research | 保留改造 |
| components/hyper-ai | features/agent-lab | 改造 |
| components/crypto | legacy 或删除候选 | 降级 |
| components/hyperliquid | broker adapter 或 legacy | 抽象 |
| components/binance | broker adapter 或 legacy | 抽象 |
| components/exchange | broker adapter / settings | 降级 |
| components/settings | features/settings | 保留 |

## 迁移策略

1. 并行新增 shared / entities / features / pages / mocks，不删除旧目录。
2. 新页面先使用 mock 数据。
3. 从旧 components 中抽取可复用能力到 shared 和 features。
4. 逐步弱化 crypto / hyperliquid / binance 相关强绑定表达。
5. 等后端完成后再接真实 API。
