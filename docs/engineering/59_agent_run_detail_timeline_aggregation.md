# AgentRunDetail Timeline Aggregation

Date: 2026-05-05
Milestone: M110 - AgentRunDetail Research Manager UI Compatibility

## Problem

Agent Timeline was rendering raw runtime events, so streaming `reasoning.chunk` and `debate.message` events appeared as many small rows. That made the decision chain hard to scan even though the raw events are still useful for SSE replay and audit.

## Change

AgentRunDetail now renders the existing aggregated `timelineItems` instead of raw event rows. Streaming chunks are grouped by step, agent, and event type, and the card shows:

- event type
- step label
- aggregated chunk count
- agent name
- timestamp
- compact summary excerpt

Raw chunk-level events remain available in Runtime Event Stream and persisted storage. This keeps auditability while making the Timeline usable as a phase-level decision flow.

The top-level Agent Run Progress card now applies the same rule for its expanded `Recent Events` list. It builds recent events from runtime events first, aggregates streaming chunks as `live.output`, and uses the raw runtime snapshot timeline only as a fallback. This prevents `reasoning.chunk` rows from dominating the progress summary while preserving chunk-level output in the dedicated Runtime Event Stream.

## Research Manager Compatibility

The report section model now includes `research_manager`, and report detection recognizes Research Manager / Research Synthesis reports. This keeps Native runs with the new Research Manager node from leaving the report orphaned outside the section tabs.

## Validation

- `pnpm --dir frontend build`: passed after Agent Timeline update and after Agent Run Progress recent-event update.
- `scripts/alphatrace/run_route_smoke.ps1 -BaseUrl http://127.0.0.1:8805 -FailOnError`: 12/12 passed.
- `scripts/alphatrace/run_runtime_smoke.ps1 -BaseUrl http://127.0.0.1:8805/api`: 15/15 passed.

## Rollback

Revert `frontend/app/pages/AgentRunDetailPage.tsx` changes for the Timeline card and report section list. Backend event persistence and Runtime Event Stream do not need changes.
