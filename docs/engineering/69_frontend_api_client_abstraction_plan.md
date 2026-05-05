# Frontend API Client Abstraction Plan

Status: M148 baseline.  
Date: 2026-05-05.

## Goal

Ensure frontend API calls follow a predictable pattern as backend grows more runtime diagnostics, tool contracts, integration metadata, task scheduling, and future artifacts.

## Current API Pattern

Entity APIs such as `frontend/app/entities/agent/api.ts`, `asset/api.ts`, `evidence/api.ts`, and `settings/api.ts` own real/mock mode behavior.

Shared transport lives under:

1. `frontend/app/shared/api/endpoints.ts`.
2. `frontend/app/shared/api/event-stream-client.ts`.

This is acceptable, but runtime diagnostics are expanding and need a stable client grouping.

## Required Agent Runtime API Client Surface

Future `agent/api.ts` should expose:

1. `getRunnerStatusAsync()`.
2. `getRunnerCapabilitiesAsync()`.
3. `getRuntimeToolContractsAsync()`.
4. `getRuntimeIntegrationsAsync()`.
5. `getRuntimeTasksAsync()`.
6. `getNativeRunnerPlanAsync(taskType)`.
7. Existing submit/detail/events/reports/evidence/decision APIs.

## API Contract Rules

1. API clients return normalized frontend-safe objects.
2. Raw backend errors must preserve `detail` / `message` for UI display.
3. Mock mode should either return mock-compatible objects or clear mock placeholders.
4. Settings must never expose raw API keys.
5. Backend diagnostics may include `source` and `status`, but never secret values.

## AgentRunDetail Refactor Plan

`AgentRunDetailPage.tsx` should eventually become:

1. Data hooks / API orchestration.
2. `AgentRunProgressCard`.
3. `AgentFlowPanel`.
4. `CurrentReportPanel`.
5. `AgentDebatePanel`.
6. `FinalDecisionView`.
7. `EvidenceUsedPanel`.
8. `ToolCallsTimeline`.
9. `RuntimeEventStreamPanel`.
10. `BackendRuntimeLogPanel`.
11. Future `AgentArtifactsPanel`.

## External Framework Rule

TradingAgents and LangAlpha frontend displays must be rendered from AlphaTrace-mapped events/reports/decision/artifacts. Do not add TradingAgents or LangAlpha frontend models as first-class product state.

## Acceptance

1. New backend diagnostics can be consumed through entity API methods.
2. Pages do not hardcode provider/runtime details when backend can provide them.
3. Mock mode remains parallel.
