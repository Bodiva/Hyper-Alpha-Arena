# AlphaTrace Release Readiness and Commit Grouping

Date: 2026-05-05

Scope: M91 review. This document groups the current broad worktree into reviewable commit/staging units. No commit was created.

## Current Worktree Shape

Observed:

- `git status --short` shows a broad AlphaTrace feature branch with backend, frontend, docs, scripts, Docker/env, and integration changes.
- `git diff --stat` for tracked files reports 55 files changed, 5183 insertions, 443 deletions.
- Many new files are untracked because the AlphaTrace MVP and Phase 2 increments were built incrementally.

Line-ending warnings appeared for mixed LF/CRLF files. Do not bulk-normalize line endings in this release grouping; that would hide functional diffs.

## Recommended Commit Groups

### Group 1 - Runtime Core and Runner Execution

Purpose: Agent Runtime, submit/cancel/retry/status/SSE, Qwen/native/tradingagents/langalpha runner boundaries.

Representative files:

- `backend/api/alpha_trace_agent_runtime_routes.py`
- `backend/services/alpha_trace_agent_runtime_service.py`
- `backend/services/agent_runtime_status_machine.py`
- `backend/services/agent_runners/qwen_runner.py`
- `backend/services/agent_runners/native_multi_agent_runner.py`
- `backend/services/agent_runners/tradingagents_adapter.py`
- `backend/services/agent_runners/tradingagents_worker.py`
- `backend/services/agent_runners/langalpha_adapter.py`
- `backend/services/agent_runners/registry.py`
- `backend/services/agent_orchestrator/`
- `backend/schemas/alpha_trace_agent_runtime.py`

Review focus:

- `/submit` remains async.
- Qwen/Native runners remain working.
- TradingAgents/LangAlpha remain opt-in/disabled unless configured.
- Failed/cancelled/retry status behavior is explicit.

### Group 2 - Persistence and Store Layer

Purpose: MySQL formal persistence direction, JSON fallback, domain stores, system config store.

Representative files:

- `backend/services/agent_runtime_store/mysql_store.py`
- `backend/services/agent_runtime_store/json_store.py`
- `backend/services/agent_runtime_store/memory_store.py`
- `backend/services/agent_runtime_store/registry.py`
- `backend/services/domain_store/`
- `backend/services/system_config_store/`
- `backend/services/asset_store/asset_store.py`
- `backend/services/portfolio_store/portfolio_store.py`
- `backend/services/strategy_store/strategy_store.py`
- `.env.example`
- `docker-compose.yml`

Review focus:

- MySQL path is default/formal direction.
- JSON fallback remains available.
- Secret config is not returned in plaintext.
- Docker/env changes are intentional and documented.

### Group 3 - Domain APIs: Asset / Evidence / Data Source / Decision / Leaderboard / Market Data

Purpose: AlphaTrace product domain API surface.

Representative files:

- `backend/api/alpha_trace_evidence_routes.py`
- `backend/api/alpha_trace_data_source_routes.py`
- `backend/api/alpha_trace_decision_routes.py`
- `backend/api/alpha_trace_leaderboard_routes.py`
- `backend/api/alpha_trace_market_data_routes.py`
- `backend/schemas/alpha_trace_data_source.py`
- `backend/schemas/alpha_trace_decision.py`
- `backend/schemas/alpha_trace_leaderboard.py`
- `backend/schemas/alpha_trace_market_data.py`
- `backend/services/evidence_retrieval/`
- `backend/services/data_source_store/`
- `backend/services/decision_store/`
- `backend/services/leaderboard_store/`
- `backend/services/market_data_store/`
- `backend/integrations/`

Review focus:

- Evidence traceability and Bocha URL/provenance fields.
- Runtime-quality leaderboard does not fake financial returns.
- Market data v1 remains static seed, not legacy BTC/Hyperliquid.

### Group 4 - Frontend AlphaTrace Real Mode and UX

Purpose: AlphaTrace pages, data adapters, Settings, AgentRunDetail observability and performance.

Representative files:

- `frontend/app/pages/AgentLabPage.tsx`
- `frontend/app/pages/AgentRunDetailPage.tsx`
- `frontend/app/pages/AssetDetailPage.tsx`
- `frontend/app/pages/DashboardPage.tsx`
- `frontend/app/pages/DataSourcesPage.tsx`
- `frontend/app/pages/DecisionAttributionPage.tsx`
- `frontend/app/pages/EvidenceCenterPage.tsx`
- `frontend/app/pages/LeaderboardPage.tsx`
- `frontend/app/pages/SettingsPage.tsx`
- `frontend/app/entities/**/api.ts`
- `frontend/app/entities/**/model.ts`
- `frontend/app/shared/api/`
- `frontend/app/shared/lib/navigation.ts`
- `frontend/app/shared/ui/`
- `frontend/vite.config.ts`

Review focus:

- Mock mode remains available.
- Real mode handles backend errors.
- Settings never displays plaintext saved secrets.
- AgentRunDetail handles large event streams and evidence traceability.

### Group 5 - Config, Startup, and Validation Scripts

Purpose: reproducible validation and local operational helpers.

Representative files:

- `scripts/alphatrace/`
- `.gitignore`
- `backend/pyproject.toml`
- `TODO.md`

Review focus:

- Scripts are non-destructive by default.
- No real API keys are committed.
- Startup helpers do not change Docker/package behavior unless explicitly requested.

### Group 6 - Documentation and Governance

Purpose: canonical plans, architecture, demo docs, runtime validation, design docs.

Representative files:

- `docs/PROJECT_SPEC.md`
- `docs/ARCHITECTURE.md`
- `docs/EXECUTION_PLAN.md`
- `docs/IMPLEMENTATION_LOG.md`
- `docs/VALIDATION.md`
- `docs/demo/`
- `docs/engineering/*.md`

Review focus:

- MySQL is the canonical formal persistence target.
- TradingAgents/LangAlpha are bounded as adapters/reference architectures.
- Limitations and non-goals remain explicit.

## Suggested Staging Order

1. Stage docs/governance first if the reviewer wants a map before code.
2. Stage backend runtime/store/domain groups separately.
3. Stage frontend UX/API group after backend contracts.
4. Stage scripts/config last after validation.

Do not squash everything into one commit unless the team explicitly wants a single checkpoint commit.

## Generated / Transient Artifacts

Watch for:

- `frontend/dist/`
- local virtualenvs
- local runtime JSON/data files
- Docker volumes
- local logs
- screenshots or browser dumps

These should not be committed unless explicitly intended. Current `.gitignore` should continue excluding runtime data and local venvs.

## Validation State Before Commit

Recent validation:

- `pnpm --dir frontend build` passed after M86 frontend changes.
- `scripts/alphatrace/run_runtime_smoke.ps1 -BaseUrl http://127.0.0.1:8805/api` passed 14/14.
- `scripts/alphatrace/run_runtime_smoke.ps1 -BaseUrl http://127.0.0.1:8805/api -IncludeSubmit` passed 16/16.
- MySQL schema/count review completed without destructive migration.
- Secret review found no raw key exposure in checked runtime responses.

## Commit Boundary Risks

1. Backend/frontend contracts are interdependent; avoid committing frontend real-mode changes without matching backend endpoints.
2. Docker/env changes should be reviewed separately because they affect local startup.
3. `backend/static/assets/index-*.js` is a legacy generated static bundle; avoid treating it as canonical frontend source.
4. Line-ending changes can create noisy diffs; avoid mass normalization in the same commit.
