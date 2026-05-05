# Final Mapper Event Contract Cleanup

Date: 2026-05-05

## Purpose

M109 removes runtime event contract drift in final mapper events appended after Qwen/Native output mapping.

Previously, live step events carried `stepId`, `progress`, `dependsOn`, and `contractVersion`, but final mapper events such as `report.generated`, `debate.message`, `risk.warning`, and `decision.updated` were legacy payloads without step metadata.

## Change

Updated final mapper event payloads in `backend/services/agent_runners/qwen_runner.py` to use `_step_payload(...)` for:

- Market Analyst mapper events
- Bull Researcher mapper events
- Bear Researcher mapper events
- Research Manager mapper events
- Risk Analyst mapper events
- Portfolio Manager mapper events

Event types were preserved for frontend compatibility.

## Validation

Validated run:

- runId: `run_native_20260505_022316_914846`
- final status: `completed`
- events: 333
- reports: 5

Runtime event validator:

```text
Events: 333
Violations: 0
Warnings: 0
```

Additional validation:

- py_compile passed for `qwen_runner.py` and `native_multi_agent_runner.py`
- runtime smoke passed with 15/15 checks
- route smoke passed with 12/12 checks

## Result

New Native/Qwen runs now have consistent event contract metadata across both live step events and final mapped events.
