# Long-Run Closure M93-M99 and Next Strategic Batch

Status: M100 closure baseline.

## Completed Scope

M93-M99 closed the current long-run optimization track:

- M93 Evidence Detail and Source Preview Hardening
- M94 Tool Invocation Contract and UX Hardening
- M95 Native Multi-Agent Runner Contract Deepening
- M96 TradingAgents Component Reuse Analysis
- M97 LangAlpha Useful Module Analysis
- M98 Frontend Architecture Boundary Cleanup
- M99 Backend Architecture Boundary Cleanup

## Runtime Validation

Latest runtime smoke:

`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/run_runtime_smoke.ps1 -BaseUrl http://127.0.0.1:8805/api`

Result: 14/14 checks passed.

Covered endpoints:

- health
- Hyper AI profile/tools
- runner status/capabilities
- assets
- asset detail
- evidence
- data sources
- strategies
- portfolios
- decisions
- leaderboard
- market-data quote

## Build / Compile Validation In This Track

- Frontend build passed after M94 and M98 frontend changes.
- Backend py_compile passed after M95 runner contract changes.
- Native smoke run `run_native_20260505_013443_486553` completed with 245 events, 225 step events, 4 reports, decision action `overweight`, `contractVersion=alphatrace_agent_runtime_v1`, and 6 DAG nodes.

## Key Product Decisions

1. `alphatrace_native` is the preferred product runner.
2. `qwen` remains a direct baseline runner.
3. `tradingagents` remains opt-in PoC/benchmark, not the product backend.
4. `langalpha` remains external-service/design reference, not in-process.
5. AlphaTrace schema remains the frontend contract.
6. Bocha/static evidence is mapped into Evidence before frontend/model usage.
7. MySQL is the canonical persistence direction; JSON remains fallback/transition.
8. Legacy BTC/Hyperliquid noise is documented and deferred unless it blocks AlphaTrace.

## Dirty Worktree State

The branch remains broad and should be staged in logical groups before any formal review:

1. Runtime/runner contracts and adapters.
2. MySQL/domain stores and system config.
3. Evidence/Bocha/data-source integrations.
4. Frontend AlphaTrace pages and navigation.
5. Scripts/smoke tests.
6. Governance and engineering docs.

No commit was created in this closure milestone.

## Remaining Risks

- Worktree is large; review/commit grouping is necessary.
- Some runtime contracts are convention-based and need validators.
- LangAlpha local checkout is not clean; deeper source verification needs separate action.
- TradingAgents remains opt-in and dependency-sensitive.
- Native runner still depends on Qwen for LLM output.
- Legacy startup noise remains visible in backend logs, though filtered in AgentRunDetail by default.

## Recommended Next Strategic Batch

The next batch should continue from product-hardening work, not broad new integration:

1. M101 Tool Registry Service Contract
2. M102 Agent Artifact Model Design
3. M103 Native Research Manager Node
4. M104 Native Risk Sub-Perspective Design
5. M105 Runtime Event Contract Validator
6. M106 Route/API Smoke Script Expansion
7. M107 MySQL Config and Store Health Endpoint
8. M108 Next-Batch Closure

This sequence advances the Native runner and product observability without pulling in TradingAgents/LangAlpha internals directly.
