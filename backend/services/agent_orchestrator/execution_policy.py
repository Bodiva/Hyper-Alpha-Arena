from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class RunnerExecutionPolicy:
    runner_type: str
    execution_mode: str
    reason: str


_POLICIES: dict[str, RunnerExecutionPolicy] = {
    "stub": RunnerExecutionPolicy(
        runner_type="stub",
        execution_mode="in_process",
        reason="Deterministic smoke runner with no external runtime dependency.",
    ),
    "qwen": RunnerExecutionPolicy(
        runner_type="qwen",
        execution_mode="in_process",
        reason="Keeps low-latency streaming and bounded HTTP model-call behavior.",
    ),
    "alphatrace_native": RunnerExecutionPolicy(
        runner_type="alphatrace_native",
        execution_mode="in_process",
        reason="AlphaTrace-owned native multi-agent DAG using bounded Qwen calls, Evidence Retrieval, and SSE.",
    ),
    "tradingagents": RunnerExecutionPolicy(
        runner_type="tradingagents",
        execution_mode="subprocess",
        reason="Isolates long-running LangGraph/tool execution behind a killable worker boundary.",
    ),
    "langalpha": RunnerExecutionPolicy(
        runner_type="langalpha",
        execution_mode="external_disabled",
        reason="LangAlpha is a future external service adapter candidate, not an in-process runner.",
    ),
}


def get_runner_execution_policy(runner_type: str | None) -> RunnerExecutionPolicy:
    normalized = (runner_type or "stub").strip().lower()
    return _POLICIES.get(
        normalized,
        RunnerExecutionPolicy(
            runner_type=normalized or "unknown",
            execution_mode="custom",
            reason="Custom runner execution mode is not managed by the AlphaTrace policy layer.",
        ),
    )


def list_runner_execution_policies() -> list[RunnerExecutionPolicy]:
    return list(_POLICIES.values())
