# AlphaTrace Full-Stack Optimization Closure

Date: 2026-05-05

Scope: M92 closure for M79-M91. This is a validation and planning checkpoint, not a final product freeze.

## Completed Since M79

| Milestone | Result |
| --- | --- |
| M79 Backend layering audit | Backend/runtime/store boundaries reviewed and canonical plan continued. |
| M80 Leaderboard scoring | Runtime quality scoring was bounded to 0-100 and static strategies no longer imply fake runtime quality. |
| M81 Status machine/cancel/retry | `cancelled` status is readable; retry/cancel flows were smoke-tested. |
| M82 Evidence governance v2 | Bocha/run-scoped evidence is visible in Evidence Center with provenance/support metadata. |
| M83 Data Source domain | Added stable Data Source API/store and MySQL seed registry. |
| M84 Frontend layout | AgentRunDetail layout gives more space to report/debate/decision content. |
| M85 Frontend contract | Evidence Center consumes backend `usedByDecisionIds` consistently. |
| M86 Performance boundaries | AgentRunDetail now caps rendered runtime events/chunks/tool/debate lists. |
| M87 Test harness | Added `scripts/alphatrace/run_runtime_smoke.ps1`. |
| M88 MySQL hardening review | Documented schema/index risks and future migration plan. |
| M89 Secret handling review | Runtime API responses and validation artifacts reviewed for raw key exposure. |
| M90 Legacy boundary | Deferred AlphaTrace-only startup implementation; legacy noise remains non-blocking. |
| M91 Commit grouping | Added logical staging/commit grouping document. |

## Latest Validation

Final M92 smoke:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/alphatrace/run_runtime_smoke.ps1 -BaseUrl http://127.0.0.1:8805/api
```

Result: 14/14 checks passed.

Recent frontend validation:

```powershell
pnpm --dir frontend build
```

Result: passed after M86 frontend changes. Existing Vite chunk/Browserslist warnings remain unchanged.

## Current Product State

AlphaTrace currently has:

1. Agent Runtime with async submit, SSE, reports, evidence, decision, cancel/retry, MySQL/JSON persistence.
2. Qwen and AlphaTrace Native runners as active product paths.
3. TradingAgents and LangAlpha bounded as opt-in PoC/reference adapters, not product backends.
4. Evidence governance with static seed, Bocha search evidence, ID validation, and rule-based support scoring.
5. Asset, Evidence, Data Source, Strategy, Portfolio, Decision, Leaderboard, and Market Data real-mode APIs.
6. Settings/runtime diagnostics for Qwen/Bocha/TradingAgents readiness without exposing plaintext keys.
7. Reproducible runtime smoke helper.

## Known Limits

1. TradingAgents is not a production runner and is disabled unless explicitly configured.
2. Native Multi-Agent is the preferred product path, but its tool invocation model and agent contracts still need hardening.
3. Bocha evidence has URLs/provenance but not a full evidence document warehouse or reliable iframe preview guarantee.
4. MySQL composite indexes are recommended but not applied yet.
5. JSON fallback remains for runtime store compatibility.
6. Legacy BTC/Hyperliquid logs remain in default Docker profile.
7. Frontend route coverage is broad but not backed by automated browser E2E tests.

## Recommended Next Track

Continue with a product-hardening track focused on:

1. Evidence detail and source preview reliability.
2. Tool invocation schema and Tool Calls UX.
3. Native Multi-Agent DAG contracts.
4. TradingAgents useful-component analysis rather than full backend adoption.
5. LangAlpha useful-module analysis for workbench/backend architecture ideas.
6. Frontend/backend module boundary cleanup.

This becomes M93-M100 in the canonical execution plan.
