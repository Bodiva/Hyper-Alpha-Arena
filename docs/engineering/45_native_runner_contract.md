# AlphaTrace Native Runner Contract

Status: M95 contract baseline.

## Purpose

`alphatrace_native` is the preferred AlphaTrace product runner. It keeps the product-facing schema owned by AlphaTrace while reusing the proven Qwen execution path for the first production-facing implementation. TradingAgents remains an opt-in PoC runner and does not define the frontend schema.

## Runtime Contract

Every Native run should persist and stream AlphaTrace-owned objects only:

- `AgentRun`
- `AgentRuntimeEvent`
- `AgentReport`
- `EvidenceReference`
- `AgentDecision`

The frontend must not depend on Qwen raw response shape, TradingAgents internal state, or third-party graph checkpoints.

## DAG Nodes

Stable node IDs:

| stepId | Team | Depends on | Responsibility |
|---|---|---|---|
| `evidence_retrieval` | `analyst_team` | none | Load market context, static evidence, Bocha evidence, and run-scoped evidence references. |
| `market_view` | `analyst_team` | `evidence_retrieval` | Produce market/portfolio overview. |
| `bull_view` | `research_team` | `market_view` | Produce constructive thesis and upside/supporting arguments. |
| `bear_view` | `research_team` | `market_view` | Produce risk thesis, invalidation conditions, and downside arguments. |
| `risk_review` | `risk_team` | `bull_view`, `bear_view` | Review drawdown, concentration, liquidity, scenario, and evidence quality risk. |
| `final_decision` | `portfolio_team` | `risk_review` | Produce normalized action, confidence, thesis, risks, watch indicators, and evidence IDs. |

Bull/Bear may execute concurrently. The DAG is logical and product-facing; it does not require exposing the underlying model implementation.

## Event Payload Requirements

Each node-level event should include:

- `contractVersion`: currently `alphatrace_agent_runtime_v1`
- `stepId`
- `dependsOn`
- `progress`: 0-100
- `toolName` for tool events
- `source` where useful, for example `static_evidence_seed`, `bocha_web_search`, `alphatrace_static_market_seed`, or `qwen`
- `summary` for bounded human-readable result summaries
- `evidenceIds` when evidence is linked or consumed

The initial `agent.run.started` event includes `runnerType` and `dagNodes`, allowing the frontend to render the graph without hardcoding runner internals.

## Report Contract

Native single-asset reports should include at least:

- Market View Report
- Bull View Report
- Bear View Report
- Risk Review Report

Portfolio diagnosis runs can map portfolio overview/exposure review into the Market View report while preserving the same DAG nodes.

## Decision Contract

Native final decisions must normalize to:

- `action`: `overweight`, `underweight`, `hold`, `watch`, or `avoid`
- `confidence`: 0-1 number, fallback 0.5-0.65 when parsing is weak
- `horizon`
- `thesis`
- `risks`
- `observationIndicators`
- `evidenceIds`

Invalid evidence IDs are filtered by the existing evidence ID validation path and should be recorded as validation warnings rather than failing the run.

## Current Implementation Note

`AlphaTraceNativeRunnerAdapter` inherits `QwenRunnerAdapter` to avoid duplicating orchestration code. The product contract is differentiated by:

- `runnerType=alphatrace_native`
- `run_native_*` IDs
- Native-specific run metadata and response message
- initial `dagNodes` metadata
- native agent participant IDs

Future native work can replace Qwen step execution with a dedicated orchestrator without changing the frontend schema.

## Known Gaps

- Node contracts are enforced by convention and smoke tests, not by a schema validator yet.
- Tool result summaries are bounded but not uniformly normalized across every producer.
- Native runner still depends on Qwen availability for actual LLM output.
- TradingAgents component reuse remains analysis-only until a later milestone decides which concepts should be reimplemented inside Native.
