# TradingAgents Component Reuse Analysis

Status: M96 analysis baseline.

## Executive Decision

AlphaTrace should not embed TradingAgents as the product backend and should not directly expose TradingAgents state to the frontend. The useful path is selective reuse of concepts and optional in-process/subprocess PoC execution, while AlphaTrace Native remains the commercial product runner.

Recommended direction:

1. Keep `runnerType=tradingagents` as opt-in PoC for controlled experiments.
2. Reimplement the useful concepts inside `alphatrace_native` rather than depending on TradingAgents internals for production UX.
3. Use TradingAgents source as architectural reference under license compliance; do not copy code into Hyper-Alpha-Arena.
4. Keep AlphaTrace schema as the only frontend/backend product contract.

## Local Source Baseline

Local repo inspected:

`H:/git0412/hyperalphaarena_codex/ai-investment-workbench/TradingAgents`

Relevant files/directories:

- `tradingagents/graph/trading_graph.py`
- `tradingagents/graph/setup.py`
- `tradingagents/graph/conditional_logic.py`
- `tradingagents/graph/propagation.py`
- `tradingagents/graph/checkpointer.py`
- `tradingagents/agents/analysts/*`
- `tradingagents/agents/researchers/*`
- `tradingagents/agents/risk_mgmt/*`
- `tradingagents/agents/managers/*`
- `tradingagents/agents/trader/trader.py`
- `tradingagents/agents/utils/structured.py`
- `tradingagents/dataflows/*`

Observed graph entrypoint:

- `TradingAgentsGraph(selected_analysts, debug, config, callbacks).propagate(ticker, trade_date)`
- It initializes LLM clients, tool nodes, graph setup, propagation, reflection, signal processing, checkpoint/memory/logs.

## Component-by-Component Decision Matrix

| TradingAgents Component | Current Behavior | AlphaTrace Decision | Reason |
|---|---|---|---|
| `TradingAgentsGraph` | LangGraph runtime orchestration around ticker/date. | Keep as opt-in PoC adapter only. | Useful for experimentation, but too coupled to stock ticker/dataflow/checkpoint internals for product API. |
| `GraphSetup` DAG | Analyst sequence, Bull/Bear debate, Research Manager, Trader, Risk team, Portfolio Manager. | Reimplement concept in AlphaTrace Native. | The flow is valuable, but AlphaTrace needs ETF/fund/portfolio/evidence semantics and frontend-stable `stepId`. |
| Analyst nodes | Market/social/news/fundamentals analysts with tools. | Borrow taxonomy selectively. | AlphaTrace should map to Market View, Evidence View, Fundamentals/Report View, not expose TradingAgents node names directly. |
| Bull/Bear Researchers | Debate loop controlled by `should_continue_debate`. | Reimplement debate pattern. | The product value is the adversarial framing, not the exact implementation. Native already has Bull/Bear and can add configurable rounds. |
| Research Manager | Summarizes Bull/Bear into investment plan. | Reimplement as `research_manager` or fold into `risk_review/final_decision`. | Useful aggregator pattern; AlphaTrace needs structured reports and evidence IDs. |
| Trader node | Converts plan into trading-oriented proposal. | Do not copy as-is. | AlphaTrace is not doing real trading; use as portfolio/action recommendation only. |
| Risk team | Aggressive, Conservative, Neutral debate loop. | Reimplement in simplified AlphaTrace risk subgraph. | Valuable multi-perspective risk review. Product UI can expose it as optional expanded risk debate, not default required flow. |
| Portfolio Manager | Final decision. | Reimplement schema-driven final decision. | AlphaTrace already owns `AgentDecision`; must remain stable and evidence-linked. |
| ToolNode pattern | LangGraph tool dispatch around market/news/fundamental tools. | Borrow pattern, not tools. | Tool boundary is useful. Actual AlphaTrace tools should call EvidenceStore, Bocha, MarketDataStore, and future professional data providers. |
| Dataflows | yfinance, Alpha Vantage, stockstats, news/fundamentals. | Do not use as production data layer. | They are stock/ticker oriented and not AlphaTrace evidence-governed. Use only for PoC/offline experiments. |
| `structured.py` | structured-output bind with free-text fallback. | Reimplement concept. | Strong pattern for Qwen/Native stability. AlphaTrace should define its own schemas and validation events. |
| Checkpointer | LangGraph SQLite checkpoint. | Do not use as product persistence. | Runtime resume state is not customer/audit/decision persistence. AlphaTrace MySQL store remains canonical. |
| Memory log/reflection | Internal learning and run logs. | Future optional internal feature only. | Could support agent memory later, but must not become product decision DB. |
| CLI rendering | Rich terminal flow display. | Borrow UX concepts only. | Frontend needs web-native timeline/DAG/log panels, not terminal integration. |

## What To Reimplement Inside AlphaTrace Native

Priority 1: Stable product DAG

- `evidence_retrieval`
- `market_view`
- `bull_view`
- `bear_view`
- `research_manager` (future, between Bull/Bear and Risk)
- `risk_review`
- `final_decision`

Priority 2: Configurable debate rounds

- `maxBullBearRounds`, default 1.
- `maxRiskRounds`, default 1.
- Keep bounded to avoid cost and latency spikes.

Priority 3: Risk sub-perspectives

- `aggressive_risk`
- `neutral_risk`
- `conservative_risk`

Expose them as sections inside Risk Review, not as mandatory top-level UI cards until the UX is proven.

Priority 4: Structured output fallback

- Native prompts should request markdown plus JSON block.
- Backend validates JSON and falls back to markdown parser.
- Emit `output.validation.warning` if schema is incomplete.

Priority 5: Tool abstraction

Define AlphaTrace tools with product semantics:

- `evidence.retrieve`
- `bocha.search`
- `market.context.load`
- `portfolio.context.load`
- `model.qwen.call`
- future `data_source.query`

Do not route product data through TradingAgents dataflows.

## What To Keep As PoC Only

- Direct `TradingAgentsGraph.propagate()` execution.
- TradingAgents internal `AgentState`.
- TradingAgents result directories and logs.
- TradingAgents SQLite checkpoint.
- Ticker-only `SPY` validation path.
- In-memory dataflow monkey patches used for offline PoC.

These are useful to prove compatibility but should not define commercial architecture.

## What Not To Reuse

- yfinance/Alpha Vantage dataflow as AlphaTrace production data model.
- TradingAgents CLI as frontend presentation layer.
- TradingAgents checkpoint as MySQL persistence replacement.
- TradingAgents raw node names as stable frontend schema.
- TradingAgents memory markdown logs as Decision Attribution database.
- Direct frontend settings for TradingAgents internals.

## Native Runner Roadmap From This Analysis

1. Add explicit `research_manager` optional node after Bull/Bear.
2. Add configurable bounded debate rounds to Native.
3. Add risk sub-perspective sections inside Risk Review.
4. Add runtime schema validation for Native event payloads.
5. Add Native tool registry abstraction so tools are first-class and auditable.
6. Add LLM-structured-output utility equivalent to TradingAgents `structured.py`, but with AlphaTrace-owned schemas.
7. Keep TradingAgents adapter as regression/benchmark path, not product default.

## Validation / Review Notes

This is an analysis-only milestone. No TradingAgents source was copied or modified. No Hyper-Alpha-Arena business code was changed by this document.

The M95 Native contract already added `dagNodes` and stable payload metadata; M96 recommends the next meaningful product improvement is adding a Native `research_manager` and risk sub-perspective design without depending on TradingAgents internals.
