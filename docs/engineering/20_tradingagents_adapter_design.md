# TradingAgents Adapter Design

## Scope

Task 44 defines an AlphaTrace integration boundary for future TradingAgents support. It does not run TradingAgents, import TradingAgents code, copy TradingAgents code, or map real TradingAgents outputs.

## Adapter Boundary

`TradingAgentsAdapter` implements the same backend runner boundary as the current stub and Qwen runners:

```python
class TradingAgentsAdapter:
    runner_type = "tradingagents"

    def submit(self, request, context):
        raise AgentRunnerNotImplementedError("tradingagents")
```

The adapter is registered in `AgentRunnerRegistry` so `runnerType=tradingagents` has an explicit behavior: clear NotImplemented response.

## Future Mapper Interfaces

Design placeholders were added for:

- `TradingAgentsEventMapper`
- `TradingAgentsReportMapper`
- `TradingAgentsDecisionMapper`

Expected future mapping:

| TradingAgents Output | AlphaTrace Runtime Type |
| --- | --- |
| Progress / stage updates | `AgentRuntimeEvent` with `agent.started`, `reasoning.chunk`, `checkpoint.created` |
| Messages | `reasoning.chunk` or `debate.message` |
| Tool calls | `tool.called` / `tool.result` |
| Reports | `AgentReport` |
| Final decision | `AgentDecision` |
| Evidence links | `EvidenceReference` / `evidence.linked` |

## Current Behavior

- `runnerType=stub` remains available.
- `runnerType=qwen` remains available.
- `runnerType=tradingagents` returns NotImplemented.
- No TradingAgents process is invoked.
- No external code is copied into AlphaTrace.

## Future Connection Plan

1. Define a read-only adapter to call a TradingAgents backend process or service.
2. Convert progress messages into `AgentRuntimeEvent` in real time.
3. Persist events/reports/evidence/decision through the existing `AgentRunStore`.
4. Keep AlphaTrace frontend unchanged by preserving the current runtime event contract.
5. Add runtime safeguards: timeout, cancellation, retry policy and output validation.
