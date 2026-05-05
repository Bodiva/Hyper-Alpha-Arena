# AlphaTrace Native Research Manager Node

Date: 2026-05-05

## Purpose

M103 adds a bounded `research_manager` node to the AlphaTrace Native/Qwen runner DAG. The node sits after Bull/Bear review and before Risk Review:

```text
Evidence Retrieval
  -> Market View
  -> Bull View / Bear View
  -> Research Manager Summary
  -> Risk Review
  -> Final Decision
```

The goal is to preserve the TradingAgents-style research manager concept without importing or copying TradingAgents code. AlphaTrace still owns the runtime contract, event schema, report schema, evidence mapping, and persistence.

## Runtime Contract

`research_manager` is now included in the DAG contract emitted on `agent.run.started.payload.dagNodes`.

Step dependencies:

| stepId | dependsOn | team |
| --- | --- | --- |
| evidence_retrieval | [] | analyst_team |
| market_view | evidence_retrieval | analyst_team |
| bull_view | market_view | research_team |
| bear_view | market_view | research_team |
| research_manager | bull_view, bear_view | research_team |
| risk_review | research_manager | risk_team |
| final_decision | risk_review | portfolio_team |

## Tool Contract

New tool contract:

- `qwen.research_manager`
- category: `model_call`
- source: `qwen_openai_compatible_api`
- authMode: `server_side_api_key`
- timeoutPolicy: `bounded_step_timeout`
- outputClass: `agent_report_section`

## Behavior

After Bull and Bear complete, QwenRunner calls one additional bounded Qwen step:

- agentName: `Research Manager`
- team: `research_team`
- title: `Research Manager Summary`
- required: `false`

If this step fails, the run continues with a fallback summary and records an `agent.failed` event for the step. This prevents the aggregation node from making the whole run brittle.

Risk Review now receives:

- Market View
- Bull View
- Bear View
- Research Manager Summary

Final Decision receives the same upstream context plus Risk Review.

## Reports

Completed runs now generate at least five reports:

1. Market View Report
2. Bull View Report
3. Bear View Report
4. Research Manager Summary Report
5. Risk Review Report

Final Decision remains an `AgentDecision`, not a report.

## Validation

Validated run:

- runId: `run_native_20260505_020313_855841`
- final status: `completed`
- events: 351
- reports: 5
- Research Manager related events: 68
- Research Manager reports: 1
- decision action: `overweight`

Static checks:

- `python -m py_compile backend/services/agent_tool_registry.py backend/services/agent_runners/qwen_runner.py backend/services/agent_runners/native_multi_agent_runner.py backend/services/alpha_trace_agent_runtime_service.py backend/schemas/alpha_trace_agent_runtime.py`
- runtime smoke: 14/14 checks passed against `http://127.0.0.1:8805/api`

## Non-Goals

- No TradingAgents code was imported or copied.
- No frontend layout changes were required.
- No database migration was introduced.
- No real trading or realtime market data integration was added.
