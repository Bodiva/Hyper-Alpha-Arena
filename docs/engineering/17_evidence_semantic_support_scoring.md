# Evidence Semantic Support Scoring Design

Task: 43.5
Date: 2026-05-01

## 1. Current Id-Level Evidence Validation Boundary

AlphaTrace currently validates evidence references at the identifier level.

Current capabilities:
- Extracts `ev_static_*`, `ev_bocha_*`, and `ev_qwen_*` identifiers from Qwen markdown and structured JSON output.
- Checks whether each referenced evidence id exists in the current Agent Run's retrieved evidence list.
- Filters invalid evidence ids from `decision.evidenceIds`.
- Emits runtime validation fields such as `validationStatus`, `validReferencedEvidenceIds`, and `invalidEvidenceIds`.
- Persists validation metadata in runtime events for replay and audit.

Current limitations:
- It does not verify whether the cited evidence semantically supports the claim.
- It does not verify quote accuracy or source freshness.
- It does not fetch source URLs for re-validation.
- It does not distinguish weak support from strong support.
- It does not score claim-level support for reports, decisions, or leaderboard metrics.

## 2. Future Semantic Support Scoring Goals

The next validation stage should answer: "Does this evidence actually support the claim being made?"

Target goals:
- Extract individual claims from reports and decisions.
- Link each claim to one or more evidence citations.
- Mark each claim as `unsupported`, `weakly_supported`, `partially_supported`, `supported`, or `strongly_supported`.
- Produce an evidence support score for each report and final decision.
- Feed support metrics into Decision Attribution and Leaderboard quality scoring.
- Preserve all validation results for audit and replay.

## 3. Proposed Data Structures

### Claim

```json
{
  "claimId": "claim_run_001_market_001",
  "runId": "run_qwen_...",
  "sourceType": "report | decision | risk | watch_indicator",
  "sourceId": "report_run_..._market_001",
  "text": "CSI 300 ETF liquidity remained stable while intraday volatility was lower than the recent average.",
  "claimType": "market_observation | risk | thesis | recommendation | watch_indicator",
  "agentName": "Market Analyst"
}
```

### EvidenceCitation

```json
{
  "evidenceId": "ev_static_510300_snapshot_001",
  "citationText": "ev_static_510300_snapshot_001",
  "sourceName": "AlphaTrace Static Market Feed",
  "sourceType": "market_snapshot"
}
```

### ClaimEvidenceLink

```json
{
  "claimId": "claim_run_001_market_001",
  "evidenceId": "ev_static_510300_snapshot_001",
  "supportScore": 0.8,
  "supportStatus": "supported",
  "method": "rule_based | embedding | llm_judge",
  "rationale": "The evidence summary directly states stable CSI 300 ETF turnover and below-average intraday volatility."
}
```

### SupportScore

```json
{
  "scope": "claim | report | decision | run",
  "scopeId": "report_run_..._market_001",
  "score": 0.78,
  "supportedClaims": 8,
  "weakClaims": 2,
  "unsupportedClaims": 1
}
```

### ValidationResult

```json
{
  "runId": "run_qwen_...",
  "status": "completed_with_warnings",
  "overallSupportScore": 0.74,
  "claimCount": 12,
  "unsupportedClaimIds": ["claim_run_001_risk_003"],
  "warnings": ["One risk claim cites evidence that only partially supports the conclusion."]
}
```

## 4. Claim Extraction Plan

Initial extraction sources:
- Qwen structured JSON fields: `summary`, `arguments`, `risks`, `riskItems`, `thesis`, `watchIndicators`.
- Markdown report sections: bullet points, numbered lists, table rows, and short paragraphs.
- Final Decision fields: `thesis`, `risks`, `observationIndicators`, `triggerConditions`, and `invalidationConditions`.

Recommended MVP extraction rules:
- Treat each bullet item as a claim.
- Treat each numbered-list item as a claim.
- Treat each markdown table row as a claim if it contains an observation or implication.
- Split long paragraphs by sentence punctuation only when no list structure exists.
- Ignore purely technical notes such as "No TradingAgents process was executed".

## 5. Evidence Matching Plan

### Rule-Based Matching

First implementation should be deterministic and cheap:
- Match explicit evidence ids in the claim.
- Match keywords from claim text to evidence `title`, `summary`, `sourceName`, and `extractedFields`.
- Prefer evidence already attached to the run.
- Penalize evidence with low `qualityScore` or stale `publishedAt`.

### Embedding / Vector Retrieval Reserved

Future implementation may embed claims and evidence summaries:
- Claim embedding vs evidence summary embedding.
- Top-k semantic matches.
- Store vector metadata outside the current JSON MVP path.

### LLM-as-Judge Reserved

Future implementation may ask a model to judge support:
- Input: claim text + candidate evidence summaries.
- Output: support status, support score, and rationale.
- Must be rate-limited and auditable.
- Should never silently overwrite deterministic validation results.

### Rule-Based Checks Reserved

Possible domain-specific rules:
- Dates in claims must not be newer than cited evidence.
- Numeric claims should match numeric values in `extractedFields` where available.
- Recommendation claims require at least one risk evidence and one market evidence item.

## 6. Support Score Design

Proposed score bands:
- `0.0`: unsupported. Evidence is missing or contradicts the claim.
- `0.3`: weak. Evidence is related by topic but does not directly support the claim.
- `0.6`: partial. Evidence supports part of the claim but leaves important assumptions unstated.
- `0.8`: supported. Evidence directly supports the main claim.
- `1.0`: strongly supported. Multiple high-quality evidence items directly support the claim.

Report-level score:
- Weighted average of claim support scores.
- Penalize unsupported high-impact risk or recommendation claims.

Decision-level score:
- Weighted score across thesis, risks, and watch indicators.
- Require at least one valid market/evidence item and one risk/evidence item for high scores.

## 7. Runtime Event Design

The current `AgentRuntimeEventType` does not yet include evidence validation event types. Future schema options:

Option A: add explicit event types:
- `evidence.validation.started`
- `evidence.validation.completed`
- `evidence.validation.warning`

Option B: reuse existing event types for MVP compatibility:
- `tool.called` with `toolName=evidence.semantic_validate`
- `tool.result` with semantic validation metrics
- `risk.warning` when unsupported claims are found
- `metric.updated` for `evidenceSupportScore`

Recommended path:
- Use Option B first to avoid a protocol break.
- Add explicit event types when the semantic scoring service becomes first-class.

Example `tool.result` payload:

```json
{
  "toolName": "evidence.semantic_validate",
  "validationStatus": "completed_with_warnings",
  "overallSupportScore": 0.74,
  "claimCount": 12,
  "unsupportedClaimCount": 1,
  "weakClaimCount": 2
}
```

## 8. Frontend Display Recommendations

Evidence and report UI should eventually show support quality without overwhelming the user:
- Evidence badges display support status: `supported`, `partial`, `weak`, `unsupported`.
- Report claims with low support are highlighted with a subtle warning style.
- Final Decision Card shows `Evidence Support Score` near confidence.
- Decision Attribution can list unsupported or weakly supported claims.
- Leaderboard can include `evidenceSupportScore` as part of runtime quality ranking.

## 9. Why This Is Not Implemented In Current MVP

Semantic support scoring is intentionally deferred because:
- It requires stable structured claims from Qwen output.
- It benefits from a larger and cleaner evidence corpus than static seed + optional Bocha search.
- LLM-as-judge adds model cost, latency, and audit complexity.
- Embedding retrieval requires additional storage and indexing decisions.
- False confidence is worse than clearly documented id-level validation.

## 10. Implementation Plan

Phase 1: deterministic rule-based scoring
- Extract claims from structured JSON first, markdown second.
- Match explicit evidence ids and keyword overlaps.
- Persist claim-level support results in AgentRunStore payload JSON.
- Surface aggregate support score in Decision Attribution.

Phase 2: embedding-assisted matching
- Add vector representation for evidence summaries and claims.
- Use embedding similarity to suggest candidate evidence.
- Keep deterministic id validation as a hard boundary.

Phase 3: LLM-as-judge
- Judge only high-impact claims or low-confidence matches.
- Store judge rationale and model metadata.
- Add replayable audit events.

Phase 4: product metrics
- Feed support scores into Leaderboard evidenceScore.
- Add workspace-level evidence quality reports.
- Track unsupported claim rates by runner type and task type.

## 11. Manual Confirmation Needed

Before implementation, confirm:
- Whether support scoring should run synchronously after Qwen completion or as a background post-processing task.
- Whether unsupported claims should degrade decision confidence automatically.
- Whether Bocha results require source fetch or snippet-level validation before scoring.
- Whether claim-level validation should be stored in PostgreSQL first or remain in JSON store during the MVP transition.
