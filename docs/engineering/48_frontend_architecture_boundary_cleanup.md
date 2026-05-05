# Frontend Architecture Boundary Cleanup

Status: M98 baseline.

## Goal

Keep AlphaTrace frontend pages on AlphaTrace-owned schemas and routing while avoiding accidental coupling to legacy Hyper Alpha Arena pages, TradingAgents internal state, LangAlpha internal state, or external provider payloads.

## Active AlphaTrace Pages

Current active AlphaTrace pages under `frontend/app/pages`:

- `DashboardPage.tsx`
- `AssetResearchPage.tsx`
- `AssetDetailPage.tsx`
- `EvidenceCenterPage.tsx`
- `AgentLabPage.tsx`
- `AgentRunDetailPage.tsx`
- `DecisionAttributionPage.tsx`
- `PortfolioWorkspacePage.tsx`
- `StrategyLabPage.tsx`
- `LeaderboardPage.tsx`
- `DataSourcesPage.tsx`
- `SettingsPage.tsx`

All audited AlphaTrace pages include `ResearchWorkspaceNav`, which provides a consistent workspace nav plus `返回上一页` and `返回 Dashboard` where appropriate.

## Frontend Contract Boundary

AlphaTrace pages should consume only these frontend entity modules:

- `frontend/app/entities/agent/*`
- `frontend/app/entities/asset/*`
- `frontend/app/entities/evidence/*`
- `frontend/app/entities/strategy/*`
- `frontend/app/entities/portfolio/*`
- `frontend/app/entities/decision/*`
- `frontend/app/entities/data-source/*`
- `frontend/app/entities/settings/*`

They should not consume:

- TradingAgents raw LangGraph state.
- LangAlpha workspace/thread/file internal objects.
- Bocha raw API response objects except after backend mapping to Evidence.
- Legacy crypto/BTC/Hyperliquid API shapes as AlphaTrace domain models.

## Routing Boundary

Canonical AlphaTrace routes use `/dashboard#...` hash routes through `frontend/app/shared/lib/navigation.ts`.

Canonical routes:

- `#dashboard`
- `#assets`
- `#assets/<assetId>`
- `#agent-lab`
- `#agent-lab/runs/<runId>`
- `#strategy-lab`
- `#portfolio`
- `#evidence`
- `#data-sources`
- `#decision-attribution`
- `#leaderboard`
- `#settings`

M98 adds a compatibility alias:

- `#decisions` -> `decision-attribution`

This matches earlier planning docs and prevents a common route drift from breaking user navigation.

## Navigation Findings

- `ResearchWorkspaceNav` is present across active AlphaTrace pages.
- `AgentRunDetailPage` also has contextual links to Asset Detail, Evidence Center, Decision Attribution, and Portfolio Workspace.
- Data Sources and Settings are integrated through the same nav, so they should not white-screen due to missing back/dashboard controls.

## Real/Mock Mode Boundary

- Mock mode remains page-specific and should be preserved.
- Real mode API calls should go through entity APIs, not direct fetches inside arbitrary UI sections unless there is a small local reason.
- Settings and Data Sources are mostly real operational pages; they do not use the same `apiMode` pattern as research pages, which is acceptable but should be documented.

## Low-Risk Cleanup Applied

- Added route alias support for `/decisions` / `#decisions` in `frontend/app/shared/lib/navigation.ts`.

## Remaining Cleanup Opportunities

- Centralize repeated Data Mode badges into a shared UI helper.
- Centralize common error/empty-state cards for real-mode pages.
- Move page-local mapping helpers into entity mappers where they are reused across pages.
- Add a lightweight route smoke script that checks every canonical hash route via Vite.
