# Evidence Reference Validation

## Scope

Task 43 adds lightweight evidence reference validation inside QwenRunner. It prevents Qwen-generated final decisions from retaining evidence IDs that were not retrieved for the run.

## Backend Rule

- Valid evidence IDs are the IDs saved for the current run, either retrieved from static evidence seed or generated assumption fallback IDs.
- Qwen output is scanned for `ev_static_*` and `ev_qwen_*` tokens.
- Any referenced ID that is not in the valid evidence set is treated as invalid.
- Invalid IDs are not added to `decision.evidenceIds`.
- Invalid IDs are recorded in:
  - `decision.risks` as a technical note: `Invalid evidence references filtered: ...`
  - `evidence.linked` event payload as `invalidEvidenceIds`
  - `decision.updated` event payload as `invalidEvidenceIds`

## Frontend Display

- `FinalDecisionView` classifies invalid evidence notes as Technical Notes, not Key Risks.
- Existing `EvidenceBadges` continues to render only valid `decision.evidenceIds`.
- Report body inline IDs remain readable through `StructuredReportView`; full report-level invalid badge validation is reserved for a later UI pass because report rendering currently does not receive the valid evidence ID set.

## Boundaries

- Invalid evidence does not fail the run.
- Assumption fallback evidence remains valid when it is saved to the run.
- No external evidence source, search engine, vector index, or real DB is introduced.
