# AlphaTrace Native Risk Sub-Perspective Design

Date: 2026-05-05

## Purpose

M104 defines how AlphaTrace Native should add TradingAgents-inspired risk sub-perspectives without copying TradingAgents code and without making the current runner expensive or brittle.

The current Native DAG is:

```text
Evidence Retrieval
  -> Market View
  -> Bull View / Bear View
  -> Research Manager Summary
  -> Risk Review
  -> Final Decision
```

The proposed extension stays inside the existing `risk_review` step for now. It asks Risk Analyst to produce three perspectives in one bounded model call instead of launching three additional model calls.

## Proposed Risk Perspectives

| Perspective | Purpose | Default posture |
| --- | --- | --- |
| Conservative Risk | Capital preservation, liquidity, drawdown, concentration, invalidation triggers | reduce or hold risk until evidence improves |
| Neutral Risk | Balanced interpretation of upside/downside and risk budget | hold/watch unless risk/reward is clearly asymmetric |
| Aggressive Risk | Opportunity cost, trend continuation, policy/flow support, tactical upside | tolerate risk only when evidence and risk controls align |

## Report Structure

The existing `Risk Review Report` should include the following sections:

```markdown
## Conservative Risk Perspective
- Drawdown risks
- Liquidity risks
- Concentration risks
- Invalidation triggers
- EvidenceIds

## Neutral Risk Perspective
- Balanced risk/reward assessment
- Risk budget impact
- Scenario checks
- EvidenceIds

## Aggressive Risk Perspective
- Upside participation rationale
- Tactical risk acceptance conditions
- Stop/monitoring triggers
- EvidenceIds

## Risk Manager Synthesis
- Recommended risk posture
- Key unresolved risks
- Watch indicators
```

This keeps the top-level product schema stable: still one `risk_review` step and one `Risk Review Report`.

## Event Mapping

First implementation should emit optional sub-perspective events during/after `risk_review`:

| Event type | agentName | payload |
| --- | --- | --- |
| `reasoning.chunk` | Risk Analyst | `stepId=risk_review`, `riskPerspective=conservative`, `content=...` |
| `reasoning.chunk` | Risk Analyst | `stepId=risk_review`, `riskPerspective=neutral`, `content=...` |
| `reasoning.chunk` | Risk Analyst | `stepId=risk_review`, `riskPerspective=aggressive`, `content=...` |
| `risk.warning` | Risk Analyst | `stepId=risk_review`, `riskPerspective=manager_synthesis`, `level=...` |

These events are additive. Existing frontend consumers can ignore `riskPerspective` safely.

## JSON Output Shape

The future `riskReview` structured JSON block should support:

```json
{
  "riskReview": {
    "summary": "...",
    "riskItems": ["..."],
    "perspectives": {
      "conservative": {
        "summary": "...",
        "risks": ["..."],
        "evidenceIds": ["ev_static_..."]
      },
      "neutral": {
        "summary": "...",
        "risks": ["..."],
        "evidenceIds": ["ev_static_..."]
      },
      "aggressive": {
        "summary": "...",
        "risks": ["..."],
        "evidenceIds": ["ev_static_..."]
      }
    },
    "managerSynthesis": {
      "recommendedPosture": "conservative | neutral | aggressive",
      "watchIndicators": ["..."],
      "evidenceIds": ["ev_static_..."]
    },
    "evidenceIds": ["ev_static_..."]
  }
}
```

## Implementation Recommendation

Recommended next implementation:

1. Update only the `risk_review` prompt to request the three sections and JSON `perspectives`.
2. Parse the returned `perspectives` best-effort.
3. Emit additive `riskPerspective` events if sections exist.
4. Keep the report count unchanged unless a future UI explicitly needs separate reports.

Avoid adding three more model calls until there is a concrete need. Three extra calls would increase latency and cost while creating more partial-failure paths.

## Frontend Placement

Current UI can remain stable:

- Agent Progress Board still shows one Risk Analyst node.
- Current Report / Research Report shows the structured risk sections.
- Runtime Event Stream can display perspective events if present.
- Future Risk Panel can group by `riskPerspective`.

## Non-Goals

- No TradingAgents code reuse.
- No extra LLM calls in this milestone.
- No new API endpoint.
- No database migration.
- No frontend layout change.

## Validation Scope

This milestone is documentation-only. The design is ready for implementation in a later bounded runner update, after M105 event validation makes payload completeness easier to test.
