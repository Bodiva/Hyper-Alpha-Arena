# Frontend Boundary Audit for AlphaTrace

Status: M147 baseline.  
Date: 2026-05-05.

## Goal

Define the frontend boundary for AlphaTrace so future backend refactors, TradingAgents/LangAlpha adapters, and data provider integrations do not leak external framework state into UI components.

## Current Frontend Structure

| Path | Role | Boundary |
|---|---|---|
| `frontend/app/pages/` | Route-level pages such as Dashboard, Asset, Evidence, Agent Lab, Run Detail, Portfolio, Settings. | Page orchestration only; heavy mapping should move to entity/shared libs. |
| `frontend/app/entities/` | Domain API/model adapters for agent, asset, evidence, strategy, portfolio, decision, settings, data-source. | AlphaTrace API contract boundary. |
| `frontend/app/shared/api/` | API client primitives, endpoints, event stream client. | HTTP/SSE transport only. |
| `frontend/app/shared/lib/` | Reusable mapping utilities, runtime mappers, navigation helpers. | Pure frontend logic. |
| `frontend/app/shared/ui/` | Reusable UI components such as report views, progress cards, workspace nav. | Presentation components without backend-specific side effects. |
| `frontend/app/mocks/` | Mock mode data and services. | Must remain usable; mock mode cannot be deleted. |
| `frontend/app/components/layout/` | Shell/header/sidebar. | App shell; should not own AlphaTrace domain logic. |

## Product Boundary

Frontend consumes AlphaTrace schemas only:

1. AgentRun.
2. AgentRuntimeEvent.
3. AgentReport.
4. EvidenceReference / EvidenceItem.
5. AgentDecision.
6. Asset / Strategy / Portfolio / Leaderboard / DataSource.
7. Future AgentArtifact.

Frontend must not consume or depend on:

1. TradingAgents internal graph state.
2. LangAlpha workspace/thread/task internals as primary objects.
3. Legacy Hyperliquid/Binance/BTC stream shapes.
4. Provider-specific raw API responses such as Bocha/Bing payloads.

## Current Risk Areas

1. `AgentRunDetailPage.tsx` remains large and mixes layout, event mapping, live output, reports, tool details, evidence cards, logs, and runtime controls.
2. Some AlphaTrace pages still have page-local filtering and mapping logic that should eventually move to entity/shared libs.
3. Real/mock mode behavior is spread across entity APIs and pages; API mode diagnostics should stay explicit.
4. Tool detail display has improved, but future tool contracts should come from backend `/runtime/tools` instead of only hardcoded frontend mappings.
5. Agent Flow UI should eventually consume backend `OrchestrationPlan` endpoint rather than duplicating DAG definitions.
6. Evidence URL/web preview should be best-effort; canonical truth is Evidence API detail and source URL.

## Recommended Frontend Refactor Direction

1. Keep pages as composition roots.
2. Move runtime mapping into `frontend/app/entities/agent/` and `frontend/app/shared/lib/`.
3. Add API clients for runtime tools, integrations, tasks, and native plan endpoints.
4. Add `AgentArtifact` frontend model before integrating LangAlpha-style files/charts/tables.
5. Keep mock mode parallel to real mode for all core AlphaTrace pages.
6. Avoid new UI dependencies unless necessary.

## Near-Term Tasks

1. Add typed API client methods for:
   - `/agent-runs/runtime/tools`
   - `/agent-runs/runtime/integrations`
   - `/agent-runs/runtime/tasks`
   - `/agent-runs/runners/plans/alphatrace-native`
2. Move AgentRunDetail tool contract fallback to prefer backend contract catalog when available.
3. Move AgentRunDetail DAG display to prefer backend Native plan when available.
4. Add AgentArtifact frontend type and placeholder display.
5. Continue shrinking `AgentRunDetailPage.tsx` by extracting panels.

## Acceptance

1. Frontend boundary matches backend abstraction layer.
2. External runner/workbench state remains behind AlphaTrace mapping.
3. Mock mode remains available.
4. Future refactors are incremental and reviewable.
