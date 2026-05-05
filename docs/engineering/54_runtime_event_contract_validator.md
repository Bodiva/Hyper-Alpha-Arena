# Runtime Event Contract Validator

Date: 2026-05-05

## Purpose

M105 adds a repeatable validator for AlphaTrace runtime event payload quality. It is intentionally a smoke-test tool, not production enforcement.

Script:

```powershell
scripts/alphatrace/validate_runtime_event_contract.ps1
```

## Usage

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts/alphatrace/validate_runtime_event_contract.ps1 `
  -BaseUrl http://127.0.0.1:8805/api `
  -RunId run_native_20260505_021040_004774
```

Strict mode:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts/alphatrace/validate_runtime_event_contract.ps1 `
  -BaseUrl http://127.0.0.1:8805/api `
  -RunId run_native_20260505_021040_004774 `
  -FailOnViolation
```

## Rules

Hard violations:

- `tool.called` / `tool.result` missing `payload.stepId`
- `tool.called` / `tool.result` missing `payload.progress`
- `tool.called` / `tool.result` missing `payload.toolName`
- `payload.toolContract` missing required contract fields
- `payload.toolName` not matching `payload.toolContract.toolName`
- DAG node missing `stepId`
- Contracted step-aware event missing `payload.stepId`

Warnings:

- `agent.run.started` missing `contractVersion` or `dagNodes`
- DAG node missing `dependsOn`
- Step-aware legacy mapper events without `stepId`
- Contracted events missing optional progress

## Validation Result

Validated against:

- runId: `run_native_20260505_021040_004774`
- events: 323
- violations: 0
- warnings: 16

The remaining warnings are expected legacy mapper events appended after final output mapping. They remain readable but do not yet carry full step metadata. A future cleanup can convert those mapper events to `_step_payload(...)` or suppress duplicates because the live step events already carry the richer contract.

## Related Runtime Fix

During M105 validation, the initial orchestrator `reasoning.chunk` event was updated to use `payload.stepId=evidence_retrieval`, `payload.progress=5`, and the standard contract fields. This removed the initial contracted-event violation for new runs.
