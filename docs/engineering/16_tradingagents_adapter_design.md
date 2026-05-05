# TradingAgents Adapter Design

Task: 44
Date: 2026-05-01

## 1. Boundary Decision

TradingAgents should be integrated as an AlphaTrace `AgentRunnerAdapter`, not as the AlphaTrace product backend.

Rationale:
- AlphaTrace owns product APIs, auth, assets, evidence, portfolios, decisions, persistence, SSE, and UI-facing schemas.
- TradingAgents owns research orchestration logic, agent DAG execution, tool calls, debate, risk review, and checkpointing.
- The frontend should only consume AlphaTrace schemas: `AgentRun`, `AgentRuntimeEvent`, `AgentReport`, `EvidenceReference`, and `AgentDecision`.
- TradingAgents internal graph state should not leak into the product API because it is execution-state, not product-state.

## 2. TradingAgents Inputs

Expected TradingAgents-side inputs for a future PoC:
- `ticker`: stock or ETF symbol such as `510300.SH` or a mapped US ticker.
- `trade_date`: analysis date.
- `config`: model provider, model name, tool flags, and data provider config.
- `selected_analysts`: market, technical, fundamentals, news/sentiment.
- `debate_rounds`: number of bull/bear research rounds.
- `risk_config`: risk team and portfolio manager parameters.
- optional memory/checkpoint identifiers.

These inputs must be wrapped by AlphaTrace and never assembled directly by the frontend.

## 3. AlphaTrace Inputs

AlphaTrace submit contract:
- `SubmitAgentRunRequest`
- `assetId`
- `portfolioId`
- `strategyId`
- `taskType`
- `question`
- `evidenceScope`
- `runnerConfig`

The future TradingAgents runner receives this request plus an `AgentRunnerContext` that can access AlphaTrace stores and append AlphaTrace runtime events.

## 4. Input Mapping

| AlphaTrace field | TradingAgents input | Notes |
|---|---|---|
| `assetId` | `ticker` / symbol / asset context | Requires AssetStore mapping, e.g. `asset_etf_510300` -> `510300.SH`. |
| `portfolioId` | portfolio context | TradingAgents stock-oriented graph may need custom prompt context. |
| `strategyId` | strategy context/config | Optional PoC field. |
| `taskType` | run config | First PoC should support `single_asset_analysis` only. |
| `question` | initial user objective | Included in graph prompt/config. |
| `evidenceScope` | data/tool scope | Controls which AlphaTrace evidence/data sources are injected or enabled. |
| AlphaTrace evidence | tool/context input | Evidence should be provided as context or tool result, not exposed as frontend-only state. |

## 5. Output Mapping

| TradingAgents output | AlphaTrace schema |
|---|---|
| graph progress / node status | `AgentRuntimeEvent` with `agent.started`, `agent.completed`, `checkpoint.created` |
| analyst messages | `reasoning.chunk` |
| bull/bear debate | `debate.message` |
| tool calls | `tool.called` / `tool.result` |
| analyst reports | `AgentReport` |
| risk team warnings | `risk.warning` |
| final portfolio decision | `AgentDecision` |
| memory/checkpoint | internal runner state only; optionally summarized in `checkpoint.created` |

## 6. Event Mapper Design

Future event mapper should emit:
- node started -> `agent.started`
- node completed -> `agent.completed`
- analyst output -> `reasoning.chunk`
- debate turn -> `debate.message`
- tool invocation -> `tool.called`
- tool return -> `tool.result`
- risk concern -> `risk.warning`
- final decision -> `decision.updated` and `agent.run.completed`

Payload should include:
- `stepId`
- `nodeName`
- `dependsOn`
- `progress`
- `source="tradingagents"`
- optional `checkpointId`

## 7. Report Mapper Design

TradingAgents reports should map to AlphaTrace reports:
- Market Analyst report -> `Market Analyst Report`
- Technical Analyst report -> `Technical Analyst Report`
- Fundamentals report -> `Fundamentals Report`
- News/Sentiment report -> `News and Sentiment Report`
- Bull/Bear debate summary -> `Research Debate Summary`
- Risk review -> `Risk Review Report`
- Final decision rationale -> `Portfolio Manager Decision Report`

Reports should remain plain AlphaTrace `AgentReport` objects with title, agentName, summary, and createdAt.

## 8. Decision Mapper Design

Recommended action mapping:
- `buy` -> `overweight`
- `sell` -> `underweight` or `no_action` depending on context
- `hold` -> `hold`
- `neutral` -> `watch`
- `avoid` -> `no_action`

Decision fields:
- `confidence`: infer from TradingAgents final rationale, vote strength, or debate convergence; fallback 0.65.
- `horizon`: derive from AlphaTrace request horizon; fallback `medium_term`.
- `thesis`: final decision rationale.
- `risks`: risk manager output and bear arguments.
- `evidenceIds`: AlphaTrace evidence ids mapped from tool outputs or injected context.

## 9. Checkpoint Boundary

TradingAgents checkpoint is not product persistence.

AlphaTrace must still save:
- AgentRun
- Runtime Events
- Reports
- Evidence References
- Final Decision

TradingAgents checkpoint can help resume or debug execution, but it is not sufficient for product replay, Decision Attribution, Leaderboard, audit, or customer-facing reporting.

## 10. PoC Plan

First PoC constraints:
- `runnerType=tradingagents`
- `taskType=single_asset_analysis`
- `assetId=asset_etf_510300`
- No production exposure.
- No frontend schema change.
- No direct TradingAgents state exposure.
- No external tools enabled until credentials and data licensing are reviewed.

PoC flow:
1. AlphaTrace submit creates a running AgentRun.
2. Adapter maps `assetId` to ticker and context.
3. Adapter runs TradingAgents graph in an isolated boundary.
4. Mapper converts progress/messages/tools/reports/final decision to AlphaTrace schema.
5. AlphaTrace stores all product-facing outputs in AgentRunStore.

## 11. Risks

- TradingAgents is more stock/ticker oriented than AlphaTrace's ETF/fund/future/product model.
- Tool data source licensing may not match commercial AlphaTrace usage.
- Runtime event mapping can lose detail if graph state is not normalized carefully.
- Cost and latency may exceed current Qwen runner behavior.
- Checkpoint state and product store state can diverge.
- Directly exposing TradingAgents state would couple frontend to runner internals.

## 12. Current MVP Stub Behavior

Current backend includes a design-only `TradingAgentsRunnerAdapter`:
- `runner_type = "tradingagents"`
- Does not import TradingAgents.
- Does not copy TradingAgents code.
- Does not execute TradingAgentsGraph.
- Returns: `TradingAgents runner is designed but not implemented in this MVP.`

This keeps the registry boundary explicit without implying the runner is production-ready.

## 13. TG-POC-1 Adapter Implementation

TG-POC-1 upgrades the design-only boundary into an opt-in PoC adapter without making TradingAgents part of the default AlphaTrace runtime.

Activation requirements:

1. `ALPHATRACE_TRADINGAGENTS_ENABLED=true`
2. TradingAgents is importable either as an installed Python package or through `TRADINGAGENTS_REPO_PATH`.
3. The request uses `runnerConfig.runnerType=tradingagents`.
4. The request uses `taskType=single_asset_analysis`.

If the runner is not enabled, `/submit` returns HTTP 400 with:

```txt
TradingAgents runner is not enabled.
```

If TradingAgents cannot be imported, `/submit` returns HTTP 400 with:

```txt
TradingAgents package is not importable: ...
```

The adapter does not fallback to Qwen or Stub because that would make the execution source ambiguous.

## 14. Import Strategy

`TradingAgentsRunnerAdapter` imports TradingAgents lazily inside `submit()`, never during FastAPI startup.

Supported modes:

1. `TRADINGAGENTS_REPO_PATH=../TradingAgents`
2. TradingAgents installed as a normal Python package in the backend environment.

Relative `TRADINGAGENTS_REPO_PATH` values are resolved against the `Hyper-Alpha-Arena` project root. The adapter temporarily inserts the resolved repo path into `sys.path`.

Known current local state:

1. Host Python import currently fails without `langgraph.checkpoint.sqlite`.
2. Docker app container does not automatically mount the sibling `TradingAgents` repo.
3. These failures are expected to produce clear configuration errors, not FastAPI startup failures.

## 15. PoC Input Mapping

`AgentRunnerConfig.extraParams` is now the PoC extension point.

Supported keys:

1. `ticker`
2. `tradeDate`
3. `selectedAnalysts`
4. `maxDebateRounds`
5. `maxRiskDiscussRounds`
6. `outputLanguage`
7. `baseUrl`

Ticker mapping order:

1. `runnerConfig.extraParams.ticker`
2. `AssetStore.get_asset(assetId).symbol`
3. fallback `SPY`

If fallback is used, the adapter writes a runtime event:

```txt
No ticker mapping found; fallback to SPY for TradingAgents PoC.
```

Default config:

1. `llm_provider`: request `modelProvider`, fallback `qwen`
2. `quick_think_llm`: request `modelName`, fallback `QWEN_MODEL`, fallback `qwen-plus`
3. `deep_think_llm`: same as `quick_think_llm`
4. `backend_url`: `extraParams.baseUrl` or `QWEN_BASE_URL`
5. `max_debate_rounds`: default `1`
6. `max_risk_discuss_rounds`: default `1`
7. `checkpoint_enabled`: `false`

Qwen endpoint compatibility:

1. The local TradingAgents qwen client defaults to the international DashScope endpoint.
2. AlphaTrace commonly stores `QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1`.
3. The PoC adapter patches TradingAgents' qwen provider endpoint in memory at runtime to use `QWEN_BASE_URL`.
4. This is not a TradingAgents source-code modification and should be replaced by an upstream-compatible config hook if the PoC graduates to production.

## 16. PoC Runtime Mapping

The adapter creates an AlphaTrace `AgentRun` with status `running`, persists it through `AgentRunStore`, and executes `TradingAgentsGraph(...).propagate(ticker, tradeDate)` in a background thread.

Minimum events:

1. `agent.run.started`
2. `agent.started`
3. `reasoning.chunk`
4. `tool.called` with `toolName=tradingagents.graph.run`
5. `tool.result`
6. `report.generated`
7. `decision.updated`
8. `agent.completed`
9. `agent.run.completed`

Failure events:

1. `agent.failed`
2. `agent.run.failed`

## 17. PoC Output Mapping

TradingAgents state fields mapped to reports when present:

1. `market_report`
2. `sentiment_report`
3. `news_report`
4. `fundamentals_report`
5. `investment_plan`
6. `trader_investment_plan`
7. `risk_debate_state`
8. `final_trade_decision`

Decision mapping:

1. `buy`, `long`, `bullish` -> `overweight`
2. `sell`, `short`, `bearish` -> `underweight`
3. `hold` -> `hold`
4. unknown -> `watch`

Confidence defaults to `0.6` because the first PoC does not derive calibrated confidence from TradingAgents internals.

Evidence mapping:

1. The adapter creates only `ev_tradingagents_poc_context`.
2. This is runtime context evidence, not a real evidence chain.
3. The adapter does not fabricate citations or market-data evidence.

## 18. Current Limitations

1. No TradingAgents graph streaming is mapped yet.
2. TradingAgents internal state is summarized, not exposed directly.
3. Tool/data-provider credentials remain TradingAgents environment concerns.
4. The PoC is stock/ETF ticker oriented.
5. Chinese ETF/fund/future mapping is not production-ready.
6. Docker execution needs an installed package or explicit repo mount.

## 2026-05-01 Update: TradingAgents Offline PoC Stabilization

The TradingAgents adapter remains opt-in and still does not copy or modify TradingAgents source code. The local PoC now supports a default offline data mode through `runnerConfig.extraParams.offlineData`.

Default behavior:

- If `offlineData` is omitted, AlphaTrace treats it as enabled for TradingAgents PoC runs.
- The adapter patches TradingAgents dataflow vendor methods in memory for the current Python process.
- The patch supplies deterministic AlphaTrace static context for market data, indicators, fundamentals, statements, news, and insider transactions.
- This avoids yfinance / external data source rate-limit failures during local PoC validation.

Disable offline data explicitly:

```json
{
  "runnerConfig": {
    "runnerType": "tradingagents",
    "extraParams": {
      "ticker": "SPY",
      "tradeDate": "2025-06-05",
      "offlineData": false
    }
  }
}
```

Validation result:

- Local venv path: `H:\git0412\hyperalphaarena_codex\ai-investment-workbench\.venv-alphatrace-tg`
- Run id: `run_tradingagents_20260501_164331_478899`
- Status: `completed`
- Events: `15`
- Reports: `5`
- Evidence references: `1`
- Decision: `hold`, confidence `0.6`

Known limitation: TradingAgents may still run internal post-analysis memory/outcome resolution that touches external data sources. In the validated run this produced a Yahoo rate-limit warning after completion but did not fail the AlphaTrace run.
