# LangAlpha Reuse Backlog for AlphaTrace

Status: M169 draft, 2026-05-05.

Source inspected:

- Sibling repo: `../LangAlpha`
- Git commit: `61e1b40 feat(llms): pin OpenAI/Codex requests to thread-stable prompt_cache_key (#191)`
- Note: the sibling worktree currently contains only `.git`; source files were read from `HEAD` with `git show` / `git ls-tree`. AlphaTrace did not modify LangAlpha.

## Decision

Do not merge LangAlpha into AlphaTrace backend.

Use LangAlpha as:

1. Architecture reference for product-grade agent workbench patterns.
2. Future external service adapter candidate.
3. Selective clean-room design input for AlphaTrace-owned abstractions.

Do not directly copy LangAlpha source code into AlphaTrace without a separate license/compliance review and module-level technical review.

## Why

LangAlpha is a full product backend/workbench:

- FastAPI server.
- REST/SSE/WebSocket.
- PostgreSQL and Redis.
- Background task manager.
- Persistent workspaces and sandbox execution.
- PTC/programmatic tool calling.
- MCP tool ecosystem.
- BYOK/multi-provider model layer.
- Rich web UI and CLI.

AlphaTrace already has its own product schema:

- AgentRun.
- AgentRuntimeEvent.
- AgentReport.
- EvidenceReference.
- AgentDecision.
- Asset/Evidence/Strategy/Portfolio/Decision/Leaderboard.
- MySQL as canonical persistence target.

Therefore LangAlpha should not become AlphaTrace's main backend. It should remain behind adapter boundaries.

## Candidate Modules and Reuse Strategy

| LangAlpha area | Local path from HEAD | Reuse mode | AlphaTrace target |
|---|---|---|---|
| Provider-agnostic model layer | `src/llms/`, `src/config/models.py`, `src/llms/manifest/models.json` | Borrow design, clean-room implementation | `backend/services/model_providers/` |
| Background subagents | `src/ptc_agent/agent/middleware/background_subagent/` | Borrow orchestration patterns | `backend/services/agent_orchestrator/`, `backend/services/async_tasks/` |
| SSE replay/event buffering | README architecture, server event flow, Redis buffer | Borrow architecture; do not require Redis yet | `AgentRuntimeEvent` + future SSE reconnect store |
| Workspace filesystem/artifacts | `src/server/app/workspaces.py`, `workspace_files.py`, `src/ptc_agent/core/sandbox/` | Future external adapter or clean-room subset | `backend/services/agent_artifacts/` |
| PTC sandbox/code execution | `src/ptc_agent/core/sandbox/`, `Dockerfile.sandbox`, `libs/ptc-cli` | Future design reference only | Future AlphaTrace tool execution service |
| MCP servers | `mcp_servers/` | Future adapter pattern, not direct import | Future data/tool provider registry |
| Data provider hierarchy | `src/data_client/` | Strong design reference | `backend/services/data_api/`, future ETF/pro data providers |
| Market data APIs | `src/server/app/market_data.py`, `market_data_ws.py` | Borrow endpoint/provider shape only | AlphaTrace Market Data v2 |
| Portfolio/watchlist | `src/server/app/portfolio.py`, `watchlist.py` | Do not copy; concepts only | AlphaTrace Portfolio/Watchlist domains |
| BYOK/vault | `src/server/app/api_keys.py`, `vault.py`, database vault modules | Borrow security requirements | MySQL-backed system config/vault plan |
| Skills/workflows | `skills/`, `src/server/app/skills.py` | Future workflow registry inspiration | Native Agent skills/prompts registry |

## Not Recommended for Direct Integration

1. PostgreSQL dual-pool/checkpointer stack.
2. Redis event buffer as immediate dependency.
3. Daytona sandbox runtime.
4. Full LangAlpha web UI.
5. Full PTC CLI.
6. Direct imports from `src/ptc_agent` into AlphaTrace.
7. Direct exposure of workspace/thread/file internals to AlphaTrace frontend.

These are too large for the current AlphaTrace backend and would obscure the product schema boundary.

## Recommended AlphaTrace Backlog

### LA-1 External Service Adapter Contract

Goal:

Define `LangAlphaExternalWorkbenchAdapter` as a disabled-by-default adapter.

Inputs:

- AlphaTrace `SubmitAgentRunRequest`.
- Optional workspace/thread/task configuration.
- Evidence and asset context.

Outputs:

- AlphaTrace `AgentRuntimeEvent`.
- AlphaTrace `AgentReport`.
- AlphaTrace `AgentArtifact`.
- AlphaTrace `AgentDecision`.

Do not expose:

- LangAlpha internal thread state.
- LangAlpha workspace file paths as canonical frontend state.
- LangAlpha checkpoint/event buffer internals.

### LA-2 PTC Concept Mapping

Goal:

Map PTC-style code execution to AlphaTrace ToolCall/Artifact contracts.

AlphaTrace-owned artifacts:

- `table`.
- `chart`.
- `file`.
- `web_url`.
- `code`.
- `json`.

### LA-3 Data Provider Layer Comparison

Goal:

Compare LangAlpha `src/data_client/` patterns against AlphaTrace `data_api` catalog and ETF/static/Bocha providers.

Expected output:

- Provider interface proposal.
- Data freshness policy.
- Cache and failure fallback plan.

### LA-4 SSE Replay Design

Goal:

Design MySQL-first or Redis-optional event replay.

Current AlphaTrace:

- SSE reads AgentRuntimeEvent store.
- Reconnect is sequence-based but not yet hardened across all frontend flows.

Future:

- Durable event cursor.
- Per-run event compaction.
- Optional Redis buffer for high-throughput streams.

### LA-5 Workspace/Artifact Future

Goal:

Add workbench-style artifacts without adopting full LangAlpha workspace semantics.

AlphaTrace keeps:

- AgentRun as primary unit.
- AgentArtifact as product-owned output.
- MySQL as metadata store.

Optional future:

- Object storage for large files.
- External workbench workspace id as non-primary metadata.

## TradingAgents vs LangAlpha Positioning

TradingAgents:

- Best fit: in-process or subprocess runner adapter.
- Strongest value: investment research DAG, bull/bear/risk/portfolio flow.
- Weakness: not product backend.

LangAlpha:

- Best fit: external workbench adapter or architecture reference.
- Strongest value: product-grade long-running agent infrastructure, workspace, PTC, SSE/Redis, BYOK, data/tool ecosystem.
- Weakness: too large to embed as a lightweight runner.

AlphaTrace:

- Must remain the product backend.
- Owns API schema, persistence, runtime events, evidence, decisions and UI contracts.

## Immediate Next Steps

1. Keep implementing AlphaTrace-owned abstractions:
   - data API catalog.
   - model provider catalog.
   - orchestrator catalog.
   - artifact store.
   - metrics snapshot.
2. Add a design-only `LangAlphaExternalWorkbenchAdapter` only after the current architecture index is stable.
3. Do not start LangAlpha services inside AlphaTrace Docker until the adapter contract and security model are reviewed.
4. Do not restore or modify the LangAlpha sibling worktree during AlphaTrace implementation.

## Validation

Documentation-only milestone.

Checks performed:

- `git -C ../LangAlpha log --oneline -1`
- `git -C ../LangAlpha show HEAD:README.md`
- `git -C ../LangAlpha show HEAD:pyproject.toml`
- `git -C ../LangAlpha ls-tree -r --name-only HEAD`

No AlphaTrace code was changed by this document.
