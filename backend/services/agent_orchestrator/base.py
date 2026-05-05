from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Mapping, Optional, Protocol


StepStatus = Literal["pending", "blocked", "running", "completed", "failed", "cancelled"]


@dataclass(frozen=True)
class OrchestrationStep:
    """A product-level logical step, independent of any specific runner engine."""

    step_id: str
    display_name: str
    agent_name: str
    team: str
    depends_on: tuple[str, ...] = ()
    tool_ids: tuple[str, ...] = ()
    model_task: Optional[str] = None
    expected_outputs: tuple[str, ...] = ()
    metadata: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class OrchestrationPlan:
    plan_id: str
    runner_type: str
    task_type: str
    steps: tuple[OrchestrationStep, ...]
    metadata: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class StepExecutionSnapshot:
    step_id: str
    status: StepStatus
    progress: int = 0
    message: str = ""
    started_at: Optional[str] = None
    updated_at: Optional[str] = None
    completed_at: Optional[str] = None
    payload: Mapping[str, Any] = field(default_factory=dict)


class AgentOrchestrator(Protocol):
    orchestrator_id: str

    def build_plan(self, task_type: str, context: Mapping[str, Any]) -> OrchestrationPlan:
        ...

    def snapshot(self, run_id: str) -> tuple[StepExecutionSnapshot, ...]:
        ...
