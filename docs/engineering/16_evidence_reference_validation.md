# Evidence Reference Validation

Task: 43
Date: 2026-05-01

## Goal

Ensure evidence references emitted by Qwen are checked against the evidence actually attached to the Agent Run. This prevents fabricated or stale `ev_*` identifiers from being treated as verified citations.

## Scope

- Validate references in Markdown output and structured JSON output.
- Supported evidence id prefixes: `ev_static_*`, `ev_bocha_*`, `ev_qwen_*`.
- Keep existing static / Bocha / assumption evidence flows.
- Do not call external validation services.
- Do not write a real database.

## Runtime Validation Payload

The Qwen mapper now emits validation fields in `evidence.linked` and `decision.updated` events:

- `validationStatus`: `valid`, `invalid_references_filtered`, or `no_explicit_references`
- `availableEvidenceIds`: evidence ids attached to the run
- `referencedEvidenceIds`: evidence ids mentioned by Qwen markdown or JSON
- `validReferencedEvidenceIds`: referenced ids that exist in the run
- `invalidEvidenceIds`: referenced ids that do not exist in the run
- `unreferencedAvailableEvidenceIds`: attached evidence not explicitly cited by Qwen

## Decision Mapping

`decision.evidenceIds` now prefers validated referenced evidence ids. If Qwen does not explicitly cite valid ids, it falls back to all evidence attached to the run so existing pages continue to work.

## Failure Behavior

Invalid references do not fail the run. They are filtered from `decision.evidenceIds`, recorded in runtime events, and surfaced as a risk warning for replay and audit.

## Current Limits

- This is id-level validation only.
- It does not verify whether Qwen's natural-language claim is semantically supported by the cited evidence.
- It does not fetch source URLs to validate freshness or authenticity.
- A future Evidence Governance stage should add source fetch, claim extraction, and citation support scoring.
