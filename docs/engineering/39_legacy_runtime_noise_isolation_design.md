# Legacy Runtime Noise Isolation Design

Date: 2026-05-04

## Problem

During full Docker backend startup, legacy Hyperliquid/BTC services can produce continuous logs such as BTC price fetches and Hyperliquid strategy debug output. These logs are useful for the original trading product but distract from AlphaTrace Agent Runtime validation.

This document designs isolation only. It does not change runtime behavior in this milestone.

## Current Code Signals

`backend/main.py` already contains partial profile gates:

- `_is_alphatrace_only_profile()` reads `ALPHATRACE_BACKEND_PROFILE`.
- `_legacy_runtime_enabled()` reads `ALPHATRACE_LEGACY_RUNTIME_ENABLED` and defaults to disabled when the AlphaTrace-only profile is active.
- Startup blocks guarded by `_legacy_runtime_enabled()` include:
  - legacy trading service initialization via `services.startup.initialize_services()`
  - Telegram webhook restore
  - Discord gateway restore
  - Hyper Insight wallet runtime
  - legacy service shutdown paths

The current Docker container does not set these AlphaTrace-only environment variables, so legacy runtime remains enabled by default.

## Likely Noise Sources

Based on local code inspection:

1. `backend/main.py` startup calls `services.startup.initialize_services()` when legacy runtime is enabled.
2. `backend/main.py` loads `services.trading_commands.AI_TRADING_SYMBOLS` and Hyperliquid selected symbols for sampling configuration.
3. Legacy services include market stream, scheduler, strategy, and wallet runtimes that can fetch BTC/Hyperliquid data.
4. The visible logs such as `Fetching price for BTC...`, `Got price for BTC`, and `[HyperliquidStrategy DEBUG]` are consistent with legacy market-data/strategy loops, not AlphaTrace Agent Runtime.

## Target AlphaTrace-Only Profile

Recommended environment for AlphaTrace-only development:

```text
ALPHATRACE_BACKEND_PROFILE=alphatrace
ALPHATRACE_LEGACY_RUNTIME_ENABLED=false
ALPHATRACE_FRONTEND_WATCHER_ENABLED=false
```

Expected behavior:

1. AlphaTrace APIs remain available.
2. MySQL AgentRunStore remains active.
3. Qwen/Bocha Settings and Agent Runtime remain active.
4. Legacy trading services, bot webhooks, wallet runtime, and BTC/Hyperliquid streaming loops are skipped.
5. Frontend is served by Vite real mode on `8805`, not backend frontend watcher.

## Implementation Plan For Future Milestone

1. Add explicit Docker compose override or documented environment profile for AlphaTrace-only mode.
2. Start app with the AlphaTrace profile and verify no BTC fetch logs are emitted.
3. Verify AlphaTrace smoke:
   - `/api/health`
   - `/api/hyper-ai/profile`
   - `/api/alpha-trace/agent-runs/runners/status`
   - Qwen submit if key available
   - Portfolio diagnosis if key available
4. Keep legacy full mode available for original Hyper Alpha Arena pages.

## Non-Goals

1. Do not delete legacy Hyperliquid/Binance/trading modules.
2. Do not break original business pages.
3. Do not change trading behavior in the current shared Docker profile without explicit approval.
4. Do not hide logs by filtering only; prefer disabling the source in AlphaTrace-only mode.

## Risks

1. Some old pages may implicitly expect legacy services to be active.
2. Backend startup may still execute non-guarded legacy initialization paths; these should be audited in the implementation milestone.
3. A Docker profile change must be tested against both AlphaTrace pages and legacy pages.

## Recommendation

Use AlphaTrace-only profile for development/demo sessions focused on Agent Runtime. Keep default/full profile available until legacy page dependency review is complete.

## M90 Decision - 2026-05-05

Decision: defer new implementation and keep this as an operator runbook for now.

Reasoning:

1. Current canonical browser chain `8805 -> 8802` is healthy for AlphaTrace validation.
2. Legacy BTC/Hyperliquid logs are noisy but not blocking Agent Runtime, Evidence, Data Source, Decision, Leaderboard, or Settings flows.
3. User direction for the current batch is to not spend effort on BTC/Hyperliquid unless it blocks AlphaTrace.
4. `backend/main.py` already has partial AlphaTrace-only gates. The remaining work is startup profile packaging and validation, not a product feature.
5. Changing Docker/default startup behavior now would increase regression risk for legacy pages during an already broad worktree phase.

Current operating rule:

- Use default Docker/Vite chain for validation: `8805 -> 8802`.
- Ignore legacy BTC/Hyperliquid log noise unless it causes route failures, resource exhaustion, or demo disruption.
- If a clean AlphaTrace-only demo is required, use the documented environment variables in this file and validate routes with `scripts/alphatrace/check_active_backend_routes.ps1`.

Future implementation trigger:

Implement AlphaTrace-only startup profile only when at least one condition is true:

1. Legacy logs or services materially slow down AlphaTrace validation.
2. Demo operators need a quiet backend log view for TradingAgents/LangGraph observation.
3. Legacy runtime background tasks cause API instability.
4. The team decides to split AlphaTrace and legacy Hyper Alpha Arena runtime profiles formally.
