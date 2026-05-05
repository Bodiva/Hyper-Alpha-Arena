from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any

from services.agent_orchestrator.execution_policy import get_runner_execution_policy


@dataclass(frozen=True)
class RunnerCapability:
    runner_type: str
    execution_mode: str
    supported_task_types: list[str]
    supports_streaming: bool
    supports_evidence: bool
    supports_portfolio_context: bool
    supports_external_tools: bool
    production_ready: bool
    notes: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def get_runner_capability(runner_type: str) -> RunnerCapability:
    normalized = runner_type.strip().lower()
    policy = get_runner_execution_policy(normalized)

    if normalized == "stub":
        return RunnerCapability(
            runner_type="stub",
            execution_mode=policy.execution_mode,
            supported_task_types=["single_asset_analysis", "portfolio_diagnosis"],
            supports_streaming=False,
            supports_evidence=False,
            supports_portfolio_context=False,
            supports_external_tools=False,
            production_ready=False,
            notes="Deterministic smoke runner for API/UI validation only.",
        )

    if normalized == "qwen":
        return RunnerCapability(
            runner_type="qwen",
            execution_mode=policy.execution_mode,
            supported_task_types=["single_asset_analysis", "portfolio_diagnosis"],
            supports_streaming=True,
            supports_evidence=True,
            supports_portfolio_context=True,
            supports_external_tools=True,
            production_ready=False,
            notes="Primary MVP research runner with Qwen, Bocha/static evidence, SSE, and JSON/MySQL store support.",
        )

    if normalized == "alphatrace_native":
        return RunnerCapability(
            runner_type="alphatrace_native",
            execution_mode=policy.execution_mode,
            supported_task_types=["single_asset_analysis", "portfolio_diagnosis"],
            supports_streaming=True,
            supports_evidence=True,
            supports_portfolio_context=True,
            supports_external_tools=True,
            production_ready=False,
            notes="AlphaTrace-owned native multi-agent runner. Reuses the proven Qwen/Bocha/MySQL runtime path without exposing TradingAgents internals.",
        )

    if normalized == "tradingagents":
        return RunnerCapability(
            runner_type="tradingagents",
            execution_mode=policy.execution_mode,
            supported_task_types=["single_asset_analysis"],
            supports_streaming=True,
            supports_evidence=True,
            supports_portfolio_context=False,
            supports_external_tools=True,
            production_ready=False,
            notes="Opt-in PoC LangGraph runner. Best for SPY/US ticker experiments; not the default commercial path.",
        )

    if normalized == "langalpha":
        return RunnerCapability(
            runner_type="langalpha",
            execution_mode=policy.execution_mode,
            supported_task_types=[],
            supports_streaming=False,
            supports_evidence=False,
            supports_portfolio_context=False,
            supports_external_tools=False,
            production_ready=False,
            notes="Design-only external service adapter candidate.",
        )

    return RunnerCapability(
        runner_type=normalized or "custom_runner",
        execution_mode=policy.execution_mode,
        supported_task_types=[],
        supports_streaming=False,
        supports_evidence=False,
        supports_portfolio_context=False,
        supports_external_tools=False,
        production_ready=False,
        notes="Custom runner capabilities are unknown until registered by an adapter.",
    )


def list_runner_capabilities() -> list[RunnerCapability]:
    return [
        get_runner_capability("stub"),
        get_runner_capability("qwen"),
        get_runner_capability("alphatrace_native"),
        get_runner_capability("tradingagents"),
        get_runner_capability("langalpha"),
    ]


def resolve_recommended_runner(task_type: str | None, requested_runner_type: str | None = None) -> dict[str, Any]:
    normalized_task = (task_type or "single_asset_analysis").strip().lower()
    normalized_runner = (requested_runner_type or "").strip().lower()

    if normalized_runner:
        capability = get_runner_capability(normalized_runner)
        return {
            "requestedRunnerType": normalized_runner,
            "recommendedRunnerType": normalized_runner,
            "taskType": normalized_task,
            "supported": normalized_task in capability.supported_task_types,
            "reason": "Explicit runner request; AlphaTrace will not silently fallback to another runner.",
            "capability": capability.to_dict(),
        }

    if normalized_task == "portfolio_diagnosis":
        capability = get_runner_capability("alphatrace_native")
        return {
            "requestedRunnerType": None,
            "recommendedRunnerType": "alphatrace_native",
            "taskType": normalized_task,
            "supported": True,
            "reason": "Portfolio diagnosis requires AlphaTrace portfolio context; AlphaTrace Native is the preferred product runner.",
            "capability": capability.to_dict(),
        }

    capability = get_runner_capability("alphatrace_native")
    return {
        "requestedRunnerType": None,
        "recommendedRunnerType": "alphatrace_native",
        "taskType": normalized_task,
        "supported": normalized_task in capability.supported_task_types,
        "reason": "AlphaTrace Native is the default product research runner unless a runner is explicitly requested.",
        "capability": capability.to_dict(),
    }
