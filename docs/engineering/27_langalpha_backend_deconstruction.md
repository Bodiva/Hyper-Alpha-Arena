# LangAlpha Backend Deconstruction

Date: 2026-05-01

## Scope

This document evaluates LangAlpha as a backend architecture reference and possible future external runner service for AlphaTrace. It does not copy LangAlpha code and does not implement a real LangAlpha integration.

## Source Status

Local checkout path:

`H:\git0412\hyperalphaarena_codex\ai-investment-workbench\LangAlpha`

The local clone is incomplete because GitHub network access failed during checkout. `git ls-tree` is available and was used to inspect the repository tree, but local blob content could not be fully checked out. Public repository metadata and the user-provided plan describe LangAlpha as a product-grade agent workbench with FastAPI, REST/SSE, WebSocket, PostgreSQL, Redis event buffer, background task manager, workspace sandbox, MCP, PTC, BYOK, and model provider configuration.

Any source-level detail that was not visible from the local tree is marked as pending verification.

## Confirmed Repository Shape From Local Tree

Observed top-level and major paths:

- `.github/workflows/*`
- `README.md`
- `LICENSE`
- `pyproject.toml`
- `agent_config.yaml`
- `config.yaml`
- `alembic.ini`
- `docker-compose.yml`
- `deploy/Dockerfile.backend`
- `deploy/Dockerfile.dev`
- `deploy/Dockerfile.web`
- `docs/api/*`
- `libs/ptc-cli/*`
- `mcp_servers/*`
- `web/src/*`
- `migrations/*`
- `skills/*`

Observed API documentation groups:

- `00-health`
- `30-workspaces`
- `35-workspace-files`
- `50-users`
- `55-portfolio`
- `60-watchlist`
- `70-market-data`
- `80-cache`

This tree strongly suggests LangAlpha is not only a runtime library; it is a product/workbench backend with user, workspace, file, portfolio, watchlist, market-data, and cache surfaces.

## Backend Architecture Interpretation

Based on the local tree and public project description, LangAlpha appears to provide:

- A FastAPI-style backend entrypoint and REST API surface. Pending local blob verification for exact module names and app factory.
- Database migrations via Alembic, implying a relational database persistence layer.
- Docker deployment files for backend, web, and dev environments.
- API docs for workspaces, users, file operations, portfolio, watchlist, market data, and cache.
- A PTC CLI package under `libs/ptc-cli`, suggesting a terminal/agent command layer with sandbox and streaming abstractions.
- MCP server integrations under `mcp_servers`, implying tool/runtime extensibility.
- Web frontend source under `web/src`, indicating a full-stack product rather than a backend-only library.

## Workspace and Sandbox Model

The API tree includes workspace lifecycle endpoints:

- create workspace
- list workspaces
- get workspace
- update workspace
- start workspace
- stop workspace
- refresh workspace
- delete workspace

It also includes workspace file endpoints:

- list files
- read file
- download file
- upload file

This suggests LangAlpha treats a workspace as a durable execution and file context. For AlphaTrace, that maps more naturally to an external research-service workspace than an in-process `AgentRunnerAdapter`.

## Portfolio, Watchlist, and Market Data

LangAlpha has API docs for:

- portfolio holdings
- watchlists and items
- stock/index intraday market data
- stock search

This overlaps with AlphaTrace domain surfaces, but AlphaTrace already has its own Asset, Evidence, Strategy, Portfolio, Decision, Leaderboard, and Agent Runtime schemas. Directly exposing LangAlpha portfolio/watchlist schemas to the AlphaTrace frontend would create schema coupling and should be avoided.

## Infrastructure Implications

The presence of Alembic, Docker deploy files, cache docs, and web/backend separation indicates a heavier infrastructure footprint than TradingAgents. The user-provided project summary also mentions PostgreSQL dual pool, Redis event buffer, background task manager, SSE, WebSocket, sandbox, MCP, and BYOK.

For AlphaTrace this means:

- LangAlpha can inform the target backend architecture.
- LangAlpha should not be embedded into the existing FastAPI process as a lightweight Python object unless a very small package boundary is proven.
- A future adapter should call LangAlpha as an external service or orchestrate a workspace/thread/task via an API boundary.

## Strengths For AlphaTrace Reference

- Product-style backend surfaces: users, workspaces, files, portfolio, watchlist, market data, cache.
- Infrastructure patterns: Alembic migrations, deploy files, possible Redis-backed event buffering.
- Agent workbench patterns: workspace sandbox, CLI/runtime streaming, MCP tools.
- BYOK and model provider configuration concepts.

## Risks For Direct Integration

- Large dependency surface.
- Possible PostgreSQL/Redis/sandbox requirements.
- Duplicate product domains with AlphaTrace.
- Direct state exposure would couple the frontend to LangAlpha internals.
- Running LangAlpha in-process may create lifecycle, event-loop, background worker, and database ownership conflicts.
- Local checkout is incomplete; deeper module-level verification is still required.

## Recommended Boundary

LangAlpha should be handled as one of two things:

1. Architecture reference for AlphaTrace Phase 2 backend design.
2. Future external service adapter:
   - AlphaTrace creates `AgentRun`.
   - Adapter creates or selects a LangAlpha workspace/task.
   - Adapter consumes LangAlpha events/files/results.
   - Adapter maps them into AlphaTrace `AgentRuntimeEvent`, `AgentReport`, `EvidenceReference`, and `AgentDecision`.

LangAlpha should not replace the AlphaTrace backend and should not be exposed directly to the AlphaTrace frontend.

## Pending Verification

- Exact FastAPI entrypoint and app factory.
- Exact database session and pool implementation.
- Exact Redis event-buffer implementation.
- Exact background task manager module names.
- Exact model provider/BYOK implementation.
- Exact WebSocket/SSE protocol.
- Exact MCP tool registration and execution model.
