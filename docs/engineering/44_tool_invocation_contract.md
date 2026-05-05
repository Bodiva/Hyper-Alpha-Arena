# AlphaTrace Tool Invocation Contract

Date: 2026-05-05

Scope: M94 review of runtime tool call events and frontend Tool Calls Timeline.

## Runtime Event Contract

Tool invocation is represented by paired runtime events:

### `tool.called`

Required payload fields:

| Field | Meaning |
| --- | --- |
| `toolName` | Stable tool identifier, e.g. `evidence.retrieve`, `bocha.search`, `market.context.load`, `qwen.market_view`. |
| `args` | Safe, non-secret argument summary. Do not include raw API keys or full credentials. |

Recommended payload fields:

| Field | Meaning |
| --- | --- |
| `stepId` | DAG node such as `evidence_retrieval`, `market_view`, `bull_view`, `bear_view`, `risk_review`, `final_decision`. |
| `dependsOn` | Logical dependency list. |
| `progress` | Step progress hint. |
| `source` | Data/tool source such as `bocha_web_search` or `alphatrace_static_market_seed`. |

### `tool.result`

Required payload fields:

| Field | Meaning |
| --- | --- |
| `toolName` | Same stable identifier used by `tool.called`. |
| `status` | `completed`, `failed`, `disabled`, or another explicit state. |
| `summary` | Human-readable result summary. |

Recommended payload fields:

| Field | Meaning |
| --- | --- |
| `evidenceIds` | Evidence references created or used by this tool. |
| `query` | Search/retrieval query, if safe. |
| `source` | Tool source. |
| `error` | Safe error message with no secrets. |

## Current Tool Sources

| Tool | Source | Notes |
| --- | --- | --- |
| `market.context.load` | `alphatrace_static_market_seed` | Static ETF/market context. |
| `portfolio.context.load` | `static_portfolio_store` | Portfolio seed context. |
| `evidence.retrieve` | static evidence + external evidence | Aggregates static seed and optional Bocha evidence. |
| `bocha.search` | `bocha_web_search` | External web search; API key remains backend-only. |
| `qwen.*` | Qwen OpenAI-compatible API | Model calls; streaming chunks are separate `reasoning.chunk` / `debate.message` events. |

## Frontend Mapping

AgentRunDetail maps runtime tools by:

```text
agentName + stepId + toolName
```

This lets `tool.result` attach to a matching `tool.called` event when possible.

The Tool Calls Timeline displays:

- tool name
- status
- agent
- step ID
- source
- query when safe
- args summary
- result summary
- timestamps
- evidence IDs as traceable buttons

## Gaps

1. Some historical tool events do not include `stepId` and fall back to `general`.
2. Some `tool.result` events include useful fields in payload but no matching `tool.called` pair; the UI still renders them as standalone completed activities.
3. Tool args are intentionally summarized. Full tool payloads should remain in runtime events/API for audit, not all expanded in the UI.

## Rules

1. Tool events must never include raw API keys.
2. Tool names should be stable and lower-case dotted identifiers.
3. External search tools must expose canonical source URLs through evidence items, not only through tool summaries.
4. Model calls are tools for observability, but token streaming remains `reasoning.chunk` / `debate.message`.

## M101 Tool Registry Addendum

AlphaTrace now has a backend-side tool registry in `backend/services/agent_tool_registry.py`.

Initial registered tool IDs:

- `market.context.load`
- `portfolio.context.load`
- `evidence.retrieve`
- `bocha.search`
- `qwen.market_view`
- `qwen.bull_view`
- `qwen.bear_view`
- `qwen.risk_review`
- `qwen.final_decision`

New Qwen/Native step payloads automatically include `toolContract` for known tools. The contract is metadata only and must not include secrets or raw provider payloads.

`toolContract` fields:

- `toolName`
- `displayName`
- `category`
- `source`
- `authMode`
- `timeoutPolicy`
- `outputClass`
- `description`

This lets Tool Calls Timeline and future validators identify whether a tool is local, external-search, model-call, or portfolio/market context without hardcoding every display rule in the frontend.
