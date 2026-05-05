from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Mapping, Optional, Protocol


TaskStatus = Literal[
    "pending",
    "running",
    "completed",
    "failed",
    "cancelled",
    "timed_out",
]


@dataclass(frozen=True)
class AsyncTaskSpec:
    """Execution-neutral task spec for AgentRun workers and future schedulers."""

    task_id: str
    run_id: str
    runner_type: str
    task_type: str
    payload: Mapping[str, Any] = field(default_factory=dict)
    timeout_seconds: int = 900
    max_attempts: int = 1
    tags: tuple[str, ...] = ()


@dataclass(frozen=True)
class AsyncTaskSnapshot:
    task_id: str
    run_id: str
    runner_type: str
    task_type: str
    status: TaskStatus
    attempt: int = 0
    started_at: Optional[str] = None
    updated_at: Optional[str] = None
    completed_at: Optional[str] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    payload: Mapping[str, Any] = field(default_factory=dict)
    result: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class AsyncTaskSubmitResult:
    accepted: bool
    task_id: str
    status: TaskStatus
    message: str = ""
    snapshot: Optional[AsyncTaskSnapshot] = None


class AsyncTaskScheduler(Protocol):
    """Minimal scheduler protocol shared by in-process, subprocess, and future durable workers."""

    scheduler_id: str

    def submit(self, spec: AsyncTaskSpec) -> AsyncTaskSubmitResult:
        ...

    def get(self, task_id: str) -> Optional[AsyncTaskSnapshot]:
        ...

    def cancel(self, task_id: str, reason: str = "") -> AsyncTaskSnapshot:
        ...
