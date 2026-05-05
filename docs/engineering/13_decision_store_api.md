# Decision Store/API

## Task 37: Decision Store/API and Decision Attribution Real Mode

AlphaTrace Decision Store derives decision records from persisted Agent Runs in the AgentRunStore. It does not write a real database and does not introduce a separate decision persistence table in the MVP phase.

## Endpoints

- `GET /api/alpha-trace/decisions`
- `GET /api/alpha-trace/decisions/{decisionId}`
- `GET /api/alpha-trace/decisions/{decisionId}/evidence`
- `GET /api/alpha-trace/decisions/{decisionId}/agent-run`

## Data Source

Decision records are derived from `AgentRun.finalDecision` in the JSON AgentRunStore. The generated `decisionId` is `decision_{runId}`. Evidence and agent-run links are read from the same persisted run.

## Frontend Real Mode

`DecisionAttributionPage` uses `listDecisionsAsync`, `listAssetsAsync`, `listEvidenceAsync`, and `listAgentRunsAsync` in real mode. Filtering remains mostly local to preserve the current page behavior.

## Current Limitations

- Actual outcome is still pending placeholder data.
- Attribution factors are rule-derived summaries from AgentRun metadata, not statistically validated performance attribution.
- No TradingAgents, external data source, real trading, or database-backed decision table is used.
