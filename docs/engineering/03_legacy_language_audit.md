# 03 Legacy Language Audit

日期：2026-04-27  
任务：Task 15（品牌统一为 AlphaTrace + crypto 文案清理与旧语义隔离）

## 1. 扫描范围

- `frontend/app/pages/`
- `frontend/app/shared/ui/ResearchWorkspaceNav.tsx`
- `frontend/app/shared/lib/product-branding.ts`
- `frontend/app/shared/lib/navigation.ts`
- `frontend/app/mocks/`
- `frontend/app/entities/`
- `docs/`（产品与工程文档）
- 对照范围（仅记录，不改动）：`frontend/app/components/` 旧业务模块

关键词集合：

- 品牌/项目名：`ResearchOS`、`Hyper-Alpha-Arena`、`AI Trading Workbench`、`Trading Arena` 等
- crypto 语义：`crypto`、`Hyperliquid`、`Binance Futures`、`Funding`、`CVD`、`永续` 等
- 竞技叙事：`擂台`、`厮杀`、`竞技场`、`battle` 等
- 自动交易主叙事：`自动下单`、`trading bot`、`auto trading first` 等

## 2. 扫描发现（本次新产品范围）

### frontend/app/pages

- 清理后无命中（`ResearchOS`、crypto、竞技化、自动交易优先等关键词均未命中）。

### frontend/app/shared

- `product-branding.ts` 保留 `LEGACY_PROJECT_NAME = "Hyper-Alpha-Arena"`（符合允许保留项）。
- 其余关键词在 shared 新模块中无异常命中。

### frontend/app/mocks 与 frontend/app/entities

- 本次扫描未发现品牌与旧语义残留。

### docs

- 命中主要位于迁移/治理文档，语义用于“旧能力来源、禁用词规范、迁移边界”说明，例如：
  - `docs/engineering/00_frontend_refactor_plan.md`
  - `docs/engineering/01_validation_checklist.md`
  - `docs/engineering/02_codex_task_prompts.md`
  - `docs/product/00_product_positioning.md`
  - `docs/product/01_capability_mapping.md`
  - `docs/product/02_frontend_directory_migration.md`
  - `docs/product/05_leaderboard_design.md`
- 以上文档定位为迁移和规范说明，属于可保留的 legacy/历史语境。

## 3. ResearchOS 清理结果

- `frontend/app` 范围内 `ResearchOS` 已清理完成（0 命中）。
- 品牌常量已统一替换为 `AlphaTrace`。

## 4. 保留为 Legacy 的内容

- `product-branding.ts` 中 `LEGACY_PROJECT_NAME = "Hyper-Alpha-Arena"`。
- `Settings` 页面中的 legacy 说明：
  - “基于原 Hyper-Alpha-Arena 工作台能力渐进式重构（不作为当前主品牌）”。
- `docs/` 中历史迁移语境下的旧词汇（用于说明“来源与边界”）。

## 5. 已替换内容

- `ResearchOS` → `AlphaTrace`（产品主品牌）。
- 产品描述更新为“可追溯、可复盘、可量化评估”。
- 新增并统一品牌背书：
  - `BRAND_OWNER = SUNYARD.AI`
  - `BRAND_BADGE = Powered by SUNYARD.AI`
  - `BRAND_CN_BADGE = SUNYARD.AI 出品`
- Dashboard 品牌区使用 `PRODUCT_CN_FULL_NAME` 并展示 `BRAND_BADGE`。
- Workspace 导航头部文案更新为 `AlphaTrace · SUNYARD.AI`。

## 6. 旧业务模块中未处理项（仅记录）

`frontend/app/components/` 中仍存在大量旧语义命中（按要求不处理），包括但不限于：

- `components/arena/*`：Arena 场景、资源、文案与状态 key。
- `components/analytics/*`：`updateArenaPnl`、`hyperliquid`、`binance` 等引用。
- 其他与旧交易执行/交易所适配相关组件。

这些内容属于旧业务模块保留范围，本任务不改动。

## 7. SUNYARD.AI 品牌背书展示方式

- Dashboard：展示 `PRODUCT_CN_FULL_NAME` + `Powered by SUNYARD.AI`。
- Settings：展示 `BRAND_OWNER`、`BRAND_CN_BADGE`、`BRAND_BADGE`。
- Workspace Nav：轻量展示 `AlphaTrace · SUNYARD.AI`。

## 8. 后续建议

1. 下一步可在新页面的空状态/帮助文案中补充统一品牌短句（仅引用 `product-branding.ts`，不硬编码）。
2. 在不改旧模块行为前提下，可新增“legacy module boundary”文档，明确旧 `components/arena`、`components/hyperliquid` 的冻结策略。
3. 当进入后端联动阶段，再将 Settings 配置逐步接入真实配置服务，并保持 AlphaTrace 品牌口径一致。
