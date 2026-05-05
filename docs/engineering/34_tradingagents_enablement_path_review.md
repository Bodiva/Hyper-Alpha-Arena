# TradingAgents Enablement Path Review

Date: 2026-05-04

Status: decision recorded.

## Decision

TradingAgents should remain local-PoC / opt-in for now. Do not enable it in the default Docker browser chain yet.

Current default browser chain:

```text
Browser 8805 -> Vite /api proxy -> Docker backend 8802
```

Current TradingAgents state:

1. `runnerType=tradingagents` is registered.
2. It uses subprocess worker isolation by default.
3. It is disabled in the Docker backend unless `ALPHATRACE_TRADINGAGENTS_ENABLED=true`.
4. The Docker app does not currently package or mount the sibling TradingAgents repo.
5. The local venv path can run TradingAgents PoC when configured separately.

## Why Not Enable TradingAgents In Docker Yet

Do not package TradingAgents into the default app container in the current phase because:

1. TradingAgents dependencies are larger and more fragile than QwenRunner.
2. It needs provider/model/data-source configuration that differs from AlphaTrace's core MVP path.
3. Its tool/data behavior can be long-running and cost-heavy.
4. It is still a PoC runner, not the default commercial backend.
5. The current Docker app also starts legacy BTC/Hyperliquid runtimes; adding TradingAgents into that same process/container would increase operational ambiguity.
6. TradingAgents should remain behind an opt-in worker boundary until timeout, cancel, artifact, and cost controls are stronger.

## Recommended Enablement Paths

### Path A: Local PoC Backend

Use this when actively testing TradingAgents:

1. Start local backend with `ALPHATRACE_TRADINGAGENTS_ENABLED=true`.
2. Set `TRADINGAGENTS_REPO_PATH` to the sibling repo.
3. Use `.venv-alphatrace-tg` or `backend/.venv` with TradingAgents installed.
4. Point Vite real mode to that backend.

Pros:

1. Fast iteration.
2. Does not mutate Docker.
3. Keeps TradingAgents failures isolated from the default demo chain.

Cons:

1. Depends on host DB/runtime availability.
2. More manual.
3. Not production-like.

### Path B: Dedicated TradingAgents Worker Container

Use this later for a cleaner PoC:

1. Keep `app` as AlphaTrace API.
2. Add a separate `tradingagents-worker` service.
3. Mount or package TradingAgents there.
4. Communicate through worker artifacts, queue, or internal HTTP.

Pros:

1. Cleaner isolation.
2. Does not bloat the main app container.
3. Easier to enforce timeout and resource limits.

Cons:

1. Requires Docker/compose design.
2. Needs queue or worker RPC contract.
3. More moving parts.

### Path C: Package TradingAgents Into Main App Container

Not recommended for the current phase.

Reasons:

1. Blurs product backend and experimental runner boundary.
2. Makes every app rebuild depend on TradingAgents dependencies.
3. Increases risk of FastAPI startup/import failures.

## Current Recommendation

Use Path A for development and validation.

Plan Path B later if TradingAgents remains strategically valuable after more PoC runs.

Do not use Path C unless there is a strong deployment constraint and the runner is production-hardened.

## Required Next Work Before Docker Enablement

Before enabling TradingAgents in Docker by default, complete:

1. Runner timeout categories.
2. Cost/token budget limits.
3. Artifact retention policy.
4. Worker stdout/stderr redaction review.
5. Provider configuration validation.
6. Explicit data-source policy: Bocha/static vs TradingAgents tools.
7. User-visible “experimental runner” labeling.

## Current User-Facing Behavior

In the current `8805 -> 8802` chain:

1. Qwen and Stub are available.
2. TradingAgents is shown as `disabled` with execution mode `subprocess`.
3. TradingAgents submit is blocked with a clear reason.
4. This is intentional, not a bug.

## Validation

Runtime smoke on 2026-05-04:

1. Runner status returned `tradingagents:disabled:subprocess`.
2. Qwen and Stub remain visible.
3. Stub submit completed.
4. New policy/capability diagnostics are visible after app restart.

