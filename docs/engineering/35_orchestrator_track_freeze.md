# Orchestrator / TradingAgents Track Freeze

Date: 2026-05-04

Status: frozen for this engineering slice.

## Summary

This slice advanced AlphaTrace from a raw TradingAgents PoC into a more controlled Orchestrator-oriented design:

1. TradingAgents runs through a subprocess worker boundary.
2. Worker artifacts are inspectable by `runId`.
3. Cancellation can terminate registered subprocess workers.
4. Worker registry diagnostics exist.
5. Runner execution policy is documented and exposed.
6. Runner capability matrix exists.
7. Agent Lab has explicit draft task selection and an advisory Orchestrator Intent Preview.
8. Agent Lab diagnostics are collapsed to reduce product UI noise.

The track should now pause. Further work should return to AlphaTrace core product backend:

1. MySQL-backed persistence hardening.
2. AlphaTrace ETF/fund/index data source domain.
3. Evidence governance and attribution.
4. Product demo stability.

## Current Runner State

| Runner | State | Boundary | Notes |
|---|---|---|---|
| `stub` | available | in-process | Smoke/test only. |
| `qwen` | available | in-process | Current MVP production-like analysis runner. |
| `tradingagents` | opt-in PoC | subprocess | Disabled in default Docker chain. |
| `langalpha` | design-only | external disabled | Architecture reference only. |

## What Is Done

Done in this slice:

1. `SubprocessOrchestrator`
2. TradingAgents worker process wrapper
3. Worker artifacts endpoint
4. Worker registry endpoint
5. Cancel propagation to subprocess worker
6. Worker artifacts panel in AgentRunDetail
7. Worker registry display in Agent Lab
8. Cancel Run UI in AgentRunDetail
9. Orchestrator run contract documentation
10. Runner execution boundary decision
11. Runner execution policy layer
12. Runner capability matrix
13. Orchestrator intent contract
14. Agent Lab intent preview
15. Agent Lab draft task form
16. Runtime smoke through the active `8805 -> 8802` chain

## What Is Intentionally Not Done

Not done:

1. TradingAgents is not enabled in the default Docker chain.
2. TradingAgents is not packaged into the main app image.
3. TradingAgents is not a replacement for AlphaTrace backend.
4. LangAlpha is not integrated.
5. QwenRunner is not moved into subprocess.
6. No distributed queue, Celery, Redis worker, or production scheduler is added.
7. No real trading is added.

## Why Freeze Now

Continuing deeper on TradingAgents now would create diminishing returns before core product infrastructure catches up.

The remaining high-value work is:

1. Make AlphaTrace data durable and queryable through MySQL.
2. Build a clean ETF/fund/index data-source domain rather than relying on legacy BTC runtime.
3. Improve evidence quality and decision attribution.
4. Keep QwenRunner stable as the MVP analysis runner.
5. Treat TradingAgents as a secondary PoC until product data contracts are stronger.

## Recommended Next Track

Return to core AlphaTrace backend/data work:

1. Verify current MySQL AgentRunStore/DomainStore state against the active Docker chain.
2. Decide whether JSON or MySQL is the default for the next demo.
3. Build AlphaTrace market data provider abstraction for ETF/fund/index.
4. Add data-source import/governance endpoints.
5. Then revisit TradingAgents with a dedicated worker container if still needed.

## Validation Summary

Recent validation:

1. `pnpm build` passed after Agent Lab policy/capability/draft/diagnostic UI changes.
2. Backend py_compile passed for execution policy, capability matrix, and runtime route changes.
3. `8805/api` runner status returns execution modes.
4. `8805/api` capabilities returns runner matrix.
5. Stub submit through `8805/api` completed and was queryable.

