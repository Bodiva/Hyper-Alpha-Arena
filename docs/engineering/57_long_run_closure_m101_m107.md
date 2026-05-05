# Long-Run Closure: M101-M107

Date: 2026-05-05

## Completed Milestones

| Milestone | Result |
| --- | --- |
| M101 Tool Registry Service Contract | Added backend tool registry and injected `payload.toolContract` for known Qwen/Native tool calls. |
| M102 Agent Artifact Model Design | Documented `AgentArtifact` boundary for future generated files/charts/tables/web snapshots. |
| M103 Native Research Manager Node | Added real `research_manager` node after Bull/Bear and before Risk Review. |
| M104 Native Risk Sub-Perspective Design | Designed Conservative/Neutral/Aggressive risk perspectives inside a bounded Risk Review step. |
| M105 Runtime Event Contract Validator | Added event contract validator script and fixed initial orchestrator event metadata. |
| M106 Route/API Smoke Script Expansion | Added repeatable frontend hash route smoke script. |
| M107 MySQL Config and Store Health Endpoint | Added safe runtime/config store health endpoint and included it in runtime smoke. |

## Key Validation Results

- py_compile passed for changed backend files in M101, M103, M105, and M107.
- Native smoke run `run_native_20260505_021040_004774` completed with 323 events and 5 reports.
- Runtime event validator strict mode passed with 0 violations and 16 expected legacy mapper warnings.
- Route smoke passed with 12/12 checks.
- Runtime API smoke passed with 15/15 checks.
- Store health endpoint returned `overallStatus=ok`, `MysqlAgentRunStore`, MySQL ping ok, Qwen config available, and Bocha config available.
- Store health secret scan found no raw key-like pattern.

## Current Known Warnings

The event validator reports 16 warnings for legacy final mapper events that do not carry `stepId`. They are non-fatal and do not block UI/readability. M109 should clean these up by emitting mapper events through the same step payload contract.

## Dirty Worktree Grouping Recommendation

The worktree is intentionally broad and should be committed in grouped changes, not as one opaque commit:

1. Runtime/backend runner changes: Qwen/Native/TradingAgents adapters, runtime store, orchestrator, status machine.
2. MySQL/config/data-source/domain store changes.
3. Frontend AlphaTrace pages/entities/shared UI.
4. Scripts and smoke validation tools.
5. Engineering/demo docs.
6. Docker/env changes, reviewed separately.

## Next Batch

Continue with M109-M116:

1. M109 Final Mapper Event Contract Cleanup
2. M110 AgentRunDetail Research Manager UI Compatibility
3. M111 Evidence Detail Traceability for Bocha/Run Evidence
4. M112 Tool Invocation Detail UX
5. M113 Native Risk Sub-Perspective Implementation
6. M114 Native Tool Execution Boundary Pass
7. M115 MySQL Persistence Roundtrip Smoke
8. M116 Full-Stack Closure and Build
