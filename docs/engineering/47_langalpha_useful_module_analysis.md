# LangAlpha Useful Module Analysis

Status: M97 analysis baseline.

## Executive Decision

LangAlpha is more useful to AlphaTrace as a product-architecture reference and future external workbench/service adapter than as an in-process runner. It should not be copied into Hyper-Alpha-Arena and should not replace AlphaTrace's domain model.

Recommended direction:

1. Keep `runnerType=langalpha` disabled/design-only until a service API PoC is intentionally scoped.
2. Reimplement selected architecture patterns inside AlphaTrace: background task isolation, SSE replay, workspace artifacts, tool result artifacts, BYOK/vault discipline, and subagent monitoring UX.
3. Do not import LangAlpha runtime into the current backend process.
4. Keep MySQL as AlphaTrace's canonical DB direction even though LangAlpha uses PostgreSQL in its own architecture.

## Source Baseline

Local repo path:

`H:/git0412/hyperalphaarena_codex/ai-investment-workbench/LangAlpha`

Current local worktree state:

- The sibling repo exists, but the working tree currently shows many deleted files and cannot be treated as a clean checkout.
- `git ls-tree origin/main` confirms repository shape, including `server.py`, `src/`, `web/`, `migrations/`, `mcp_servers/`, `libs/ptc-cli/`, `docs/api/`, deployment files, and API docs.
- For this milestone, raw GitHub README/pyproject/LICENSE were used as primary source references because local blobs were not reliably checked out.

Primary source URLs:

- https://github.com/ginlix-ai/langalpha
- https://raw.githubusercontent.com/ginlix-ai/langalpha/main/README.md
- https://raw.githubusercontent.com/ginlix-ai/langalpha/main/pyproject.toml
- https://raw.githubusercontent.com/ginlix-ai/langalpha/main/LICENSE

## Useful LangAlpha Ideas For AlphaTrace

| LangAlpha Area | Observed Capability | AlphaTrace Use | Direct Reuse Decision |
|---|---|---|---|
| Persistent workspaces | Workspace per research goal, files, `agent.md`, durable context. | Add future AlphaTrace research workspace/artifact layer for reports, data files, memo context. | Reimplement concept. |
| Background task manager | Workflows decoupled from HTTP/SSE connection. | Move long AgentRun execution to worker boundary/status machine. | Reimplement architecture. |
| Redis SSE replay | Redis-buffered events with reconnect replay. | Improve AlphaTrace SSE reconnect beyond current polling/store stream. | Reimplement later, likely MySQL+Redis or MySQL cursor first. |
| Agent swarm/subagents | Parallel async subagents with isolated context and status UI. | Strong reference for Native multi-agent orchestration and UI monitoring. | Reimplement Native orchestrator pattern. |
| Middleware stack | Skill loading, steering, compaction, multimodal, safety layers. | Add AlphaTrace-specific orchestration middleware over time. | Selectively reimplement. |
| Programmatic Tool Calling | LLM writes code in sandbox to process financial data. | Future advanced research mode; not core MVP. | Design-only; do not embed now. |
| Tool artifacts/widgets | Inline charts, tables, generated dashboards. | AgentRunDetail/Evidence/Market View can render tool artifacts. | Reimplement frontend artifact contract. |
| MCP tool layer | MCP servers for finance/macro/options/data. | Future data-source plugin boundary. | Reference only until DataSourceService matures. |
| BYOK/vault | Encrypted at rest, redaction before model/client output. | Strengthen Settings/config/secrets discipline. | Reimplement in MySQL config/vault. |
| Frontend subagent monitoring | Web UI shows subagent progress and streaming output. | Improve AgentRunDetail DAG, logs, tool timeline, debate panel. | Reimplement UI patterns. |
| Automations | Scheduled/price-triggered research tasks. | Future AlphaTrace automation layer. | Out of current scope. |
| Data provider fallback | ginlix-data/FMP/Yahoo hierarchy. | Model for AlphaTrace DataSource priority/fallback. | Reimplement with AlphaTrace providers. |

## What Not To Reuse Directly

- LangAlpha backend as AlphaTrace backend replacement.
- LangAlpha database schema as AlphaTrace schema.
- LangAlpha PostgreSQL-specific persistence assumptions, because AlphaTrace canonical DB direction is MySQL.
- LangAlpha sandbox/Daytona lifecycle inside the current FastAPI process.
- LangAlpha Web UI components copied into AlphaTrace frontend.
- LangAlpha workspace/file/thread objects as frontend contract.
- LangAlpha market-data provider stack as immediate production source.
- LangAlpha API keys, vault, or provider configs directly in AlphaTrace code.

## Comparison To TradingAgents

| Dimension | TradingAgents | LangAlpha | AlphaTrace Decision |
|---|---|---|---|
| Primary value | Research DAG and investment debate. | Product-grade agent workbench infrastructure. | Use TradingAgents for runtime concepts; use LangAlpha for product/ops concepts. |
| Integration shape | Optional runner adapter / benchmark. | External service adapter or architecture reference. | Keep both behind AlphaTrace schema. |
| In-process suitability | Possible for PoC with dependency isolation. | Poor fit due DB/Redis/sandbox/service lifecycle. | Do not embed LangAlpha in-process. |
| Useful UI ideas | CLI/flow progress concepts. | Subagent monitor, artifacts, file viewer, live task state. | Reimplement web-native AlphaTrace views. |
| Data layer | Ticker/yfinance/AlphaVantage. | Multi-provider finance workbench. | AlphaTrace DataSourceService remains canonical. |

## Recommended AlphaTrace Backlog From LangAlpha

Priority 1: Runtime resilience

- Add durable event cursor/replay semantics.
- Add explicit worker state machine for AgentRun.
- Add reconnect-safe SSE behavior.

Priority 2: Artifact model

- Add `AgentArtifact` concept for generated files, charts, tables, and web previews.
- Connect tool results to artifacts instead of rendering only raw strings.

Priority 3: Workspace/memo model

- Add AlphaTrace research workspace as a commercial object.
- Keep it separate from asset/portfolio/decision tables.
- Store workspace notes and uploaded docs as evidence candidates.

Priority 4: Tool governance

- Formal tool registry with source, auth mode, timeout, retry, and redaction policy.
- Add tool-call result truncation and artifact offloading.

Priority 5: Secret handling

- Expand MySQL system config toward workspace/user-scoped encrypted secret vault.
- Add server-side redaction scan for tool outputs and runtime logs.

## LangAlpha Adapter Boundary

Future adapter should be external-service only:

1. AlphaTrace creates `AgentRun`.
2. Adapter calls LangAlpha service to create/select workspace and submit task.
3. Adapter consumes LangAlpha events/files/results.
4. Adapter maps them to `AgentRuntimeEvent`, `AgentReport`, `EvidenceReference`, `AgentDecision`, and future `AgentArtifact`.
5. AlphaTrace persists all product-facing state in its own MySQL store.

Do not expose LangAlpha internal workspace/thread/file IDs as primary product IDs. They can live in payload metadata for debugging.

## License / Compliance

LangAlpha is Apache-2.0 according to its LICENSE. Architecture reference is acceptable. Direct code reuse would require Apache-2.0 attribution and NOTICE review. Current recommendation is reference/reimplement rather than copy.

## Current Blockers For Deeper Analysis

- Local LangAlpha working tree is not clean; many files appear deleted.
- Exact local module-level implementation could not be verified without restoring the repo checkout.
- Starting LangAlpha is intentionally out of scope for this milestone because it would require its own PostgreSQL/Redis/service environment.

## Next Engineering Implication

M98/M99 should keep AlphaTrace boundaries clean:

- Frontend must stay on AlphaTrace schemas.
- Backend should define Tool/Artifact/Workspace abstractions before attempting any LangAlpha external adapter.
- MySQL remains the canonical AlphaTrace store direction.
