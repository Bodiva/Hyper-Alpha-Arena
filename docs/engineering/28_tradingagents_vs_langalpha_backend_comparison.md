# TradingAgents vs LangAlpha Backend Comparison

Date: 2026-05-01

Status update 2026-05-05:

This comparison remains valid for TradingAgents/LangAlpha integration boundaries, but database direction has changed since the original draft. The canonical storage decision is now:

- MySQL 8.0+ for system configuration, credential metadata, task control, and lightweight control-plane state.
- ClickHouse for structured business facts, market data, runtime/report/evidence/decision analytical projections, and leaderboard/quality facts.
- JSON store remains a local fallback only.

## Executive Summary

TradingAgents and LangAlpha should not be treated as interchangeable backends.

- TradingAgents is best treated as an in-process research runtime or `AgentRunnerAdapter` for AlphaTrace.
- LangAlpha is closer to a product-grade agent workbench backend and is better treated as an architecture reference or future external service adapter.
- AlphaTrace remains the product backend and owns REST APIs, SSE, product schemas, persistence, evidence governance, decisions, and frontend contracts.

## Comparison Table

| Dimension | TradingAgents | LangAlpha | AlphaTrace Implication |
|---|---|---|---|
| Primary shape | Python LangGraph research/runtime library | Full-stack agent workbench backend | Use TradingAgents for runtime PoC; use LangAlpha for architecture lessons |
| Best integration mode | In-process `AgentRunnerAdapter` | External service adapter or architecture reference | Do not expose either internal state directly to frontend |
| Main entrypoint | `TradingAgentsGraph(...).propagate(ticker, trade_date)` | Product API/workspace/task style, exact source pending local verification | Different adapter boundaries are required |
| Runtime model | Agent graph with analysts, researchers, risk, portfolio/final decision | Workspaces, background tasks, event buffer, tools, files, sandbox | LangAlpha is operationally heavier |
| Product REST APIs | Not product-oriented | API docs include health, workspaces, files, users, portfolio, watchlist, market data, cache | LangAlpha overlaps with product backend domains |
| Streaming/progress | LangGraph state/progress can be mapped where available | Likely REST/SSE/WebSocket event streams | Both need mapping into AlphaTrace runtime events |
| Data model | Internal graph state and messages | Workspace/product database models | Neither should become frontend contract |
| Persistence | Checkpoint/memory/log concepts | Alembic/DB/cache infrastructure | AlphaTrace still needs its own product store |
| Data sources | Ticker-oriented, stocks/ETF, yfinance/AlphaVantage style tools | Market-data and workbench sources, exact provider details pending | TradingAgents PoC uses SPY/offline data; LangAlpha needs API-level evaluation |
| Operational complexity | Python deps and model/data-source keys | DB, Redis/cache, sandbox, background workers, web/backend deployment | LangAlpha should not be pulled into current backend casually |
| Commercial product fit | Strong runtime idea, weak product backend | Strong product backend patterns, not AlphaTrace-specific domain model | Combine lessons, do not replace AlphaTrace |

## TradingAgents Strengths

- Clear multi-agent research process.
- Bull/Bear debate and risk review concepts match AlphaTrace AgentRunDetail DAG.
- `TradingAgentsGraph(...).propagate(ticker, trade_date)` is easy to wrap in a runner adapter.
- Final state can be mapped into AlphaTrace reports and decisions.
- Good PoC path for `runnerType=tradingagents`.

## TradingAgents Limitations

- Not a product backend.
- Does not provide AlphaTrace REST/SSE/product schemas.
- Ticker and US-stock orientation creates mapping issues for ETF/fund/future assets.
- Internal data tools can hit external rate limits.
- Checkpoint is execution state, not product persistence.
- Frontend should never consume raw TradingAgents state.

## LangAlpha Strengths

- Product backend/workbench shape.
- API surface includes workspaces, files, users, portfolio, watchlist, market-data, and cache.
- Deployment and migration artifacts indicate a more complete operational backend.
- Workspace and sandbox ideas are useful for future AlphaTrace research workspaces.
- MCP/tooling and BYOK concepts are valuable architecture references.

## LangAlpha Limitations For Immediate AlphaTrace Integration

- Heavier dependency and infrastructure footprint.
- Potential overlap with AlphaTrace product domains.
- Directly embedding it in-process would risk lifecycle and schema conflicts.
- Local source checkout is currently incomplete due network, so exact implementation details require follow-up verification.
- It should not be used as a shortcut to replace AlphaTrace's own domain model.

## Recommended AlphaTrace Strategy

### Short Term

- Keep QwenRunner as the stable production-like MVP runner.
- Keep TradingAgents as opt-in PoC runner.
- Keep LangAlpha as design/reference plus disabled stub boundary.
- Continue using AlphaTrace schemas for frontend and persistence.

### Medium Term

- Move AlphaTrace control-plane state from JSON fallback toward MySQL, and project structured business/runtime analytics into ClickHouse.
- Formalize RunnerAdapter contracts and event mappers.
- Build a TradingAgentsAdapter PoC with better event mapping if operationally useful.
- Evaluate LangAlpha as an external research workspace service after source checkout and API verification are complete.

### Long Term

- Use LangAlpha-like workspace, event buffer, background worker, MCP, and BYOK patterns where they fit AlphaTrace's commercial backend.
- Keep product data in AlphaTrace-owned stores and tables.
- Treat third-party runtimes as engines behind adapters, not as product schemas.

## Why AlphaTrace Must Keep Its Own Schema

AlphaTrace's commercial value depends on stable product objects:

- `AgentRun`
- `AgentRuntimeEvent`
- `AgentReport`
- `EvidenceReference`
- `AgentDecision`
- `Asset`
- `EvidenceItem`
- `Strategy`
- `Portfolio`
- `DecisionAttribution`
- `Leaderboard`

TradingAgents and LangAlpha may produce useful runtime output, but their internal structures are not stable frontend contracts for AlphaTrace.

## Conclusion

TradingAgents and LangAlpha serve different roles:

- TradingAgents: runtime engine candidate.
- LangAlpha: architecture reference and possible external workbench/service candidate.

AlphaTrace should remain the orchestration, API, schema, evidence, decision, and persistence owner.
