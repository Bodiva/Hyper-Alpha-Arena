from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

from services.agent_orchestrator.task_spec_factory import DEFAULT_AGENT_TASK_TIMEOUT_SECONDS, TRADINGAGENTS_TASK_TIMEOUT_SECONDS


@dataclass(frozen=True)
class TaskSpecContractDescriptor:
    runner_type: str
    supported_task_types: tuple[str, ...]
    default_timeout_seconds: int
    max_timeout_seconds: int
    default_max_attempts: int
    max_attempts: int
    execution_boundary: str
    payload_policy: str
    secret_policy: str
    notes: tuple[str, ...]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def list_task_spec_contracts() -> dict[str, Any]:
    """Describe how submit requests are normalized before runner execution."""

    contracts = (
        TaskSpecContractDescriptor(
            runner_type="stub",
            supported_task_types=("single_asset_analysis", "portfolio_diagnosis", "rebalance_suggestion"),
            default_timeout_seconds=DEFAULT_AGENT_TASK_TIMEOUT_SECONDS,
            max_timeout_seconds=7200,
            default_max_attempts=1,
            max_attempts=5,
            execution_boundary="in_process_background_thread",
            payload_policy="SubmitAgentRunRequest metadata only; no provider secrets.",
            secret_policy="No secrets required.",
            notes=("Used for contract and smoke tests.", "Always deterministic."),
        ),
        TaskSpecContractDescriptor(
            runner_type="qwen",
            supported_task_types=("single_asset_analysis", "portfolio_diagnosis", "rebalance_suggestion"),
            default_timeout_seconds=DEFAULT_AGENT_TASK_TIMEOUT_SECONDS,
            max_timeout_seconds=7200,
            default_max_attempts=1,
            max_attempts=5,
            execution_boundary="in_process_background_thread",
            payload_policy="SubmitAgentRunRequest metadata plus runnerConfig extraParams after secret scrub.",
            secret_policy="Qwen/DashScope API key is resolved server-side at execution time.",
            notes=("Current direct model runner.", "Streaming events are emitted through AgentRuntimeEvent/SSE."),
        ),
        TaskSpecContractDescriptor(
            runner_type="alphatrace_native",
            supported_task_types=("single_asset_analysis", "portfolio_diagnosis", "rebalance_suggestion"),
            default_timeout_seconds=DEFAULT_AGENT_TASK_TIMEOUT_SECONDS,
            max_timeout_seconds=7200,
            default_max_attempts=1,
            max_attempts=5,
            execution_boundary="in_process_background_thread",
            payload_policy="Product-owned DAG context; no external framework state exposed.",
            secret_policy="Model and search credentials are resolved from backend runtime config.",
            notes=("Recommended product runner path.", "Can later move from QwenRunner internals to a dedicated orchestrator."),
        ),
        TaskSpecContractDescriptor(
            runner_type="tradingagents",
            supported_task_types=("single_asset_analysis",),
            default_timeout_seconds=TRADINGAGENTS_TASK_TIMEOUT_SECONDS,
            max_timeout_seconds=7200,
            default_max_attempts=1,
            max_attempts=5,
            execution_boundary="optional_import_or_subprocess_poc",
            payload_policy="Ticker/date/analyst config only; TradingAgents internal state is not product payload.",
            secret_policy="TradingAgents provider keys are resolved server-side; no frontend key exposure.",
            notes=("Opt-in PoC only.", "Does not fallback to Qwen or Stub.", "Checkpoint is not AlphaTrace persistence."),
        ),
        TaskSpecContractDescriptor(
            runner_type="langalpha",
            supported_task_types=("single_asset_analysis", "portfolio_diagnosis"),
            default_timeout_seconds=TRADINGAGENTS_TASK_TIMEOUT_SECONDS,
            max_timeout_seconds=7200,
            default_max_attempts=1,
            max_attempts=5,
            execution_boundary="design_only_external_service",
            payload_policy="Future workspace/thread/task bridge; external workbench state maps to AlphaTrace schema.",
            secret_policy="LangAlpha BYOK remains in external service boundary if adopted.",
            notes=("Design-only in current phase.", "Use as architecture reference before service adapter PoC."),
        ),
    )
    return {
        "version": 1,
        "contracts": [contract.to_dict() for contract in contracts],
        "total": len(contracts),
        "policies": {
            "secretScrub": "extraParams keys containing key/secret/token/password are redacted before task payload storage.",
            "defaultTimeoutSeconds": DEFAULT_AGENT_TASK_TIMEOUT_SECONDS,
            "tradingAgentsTimeoutSeconds": TRADINGAGENTS_TASK_TIMEOUT_SECONDS,
            "maxTimeoutSeconds": 7200,
            "maxAttempts": 5,
            "persistence": "AsyncTaskSpec is scheduler-neutral. AgentRunStore remains product persistence.",
        },
    }


__all__ = ["TaskSpecContractDescriptor", "list_task_spec_contracts"]
