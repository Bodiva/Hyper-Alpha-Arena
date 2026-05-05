from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from threading import RLock, Thread
from typing import Any, Callable, Optional

from services.async_tasks.base import AsyncTaskSnapshot, AsyncTaskSpec, AsyncTaskSubmitResult, TaskStatus
from services.async_tasks.memory_store import MemoryAsyncTaskStore


@dataclass(frozen=True)
class InProcessTaskHandle:
    task_id: str
    thread_name: str
    accepted: bool
    message: str


class InProcessAsyncTaskScheduler:
    """Small in-process scheduler boundary for future AgentRun worker migration.

    This scheduler is intentionally generic and not yet wired into `/submit`.
    It provides a tested status/cancellation boundary before introducing a
    durable external worker or queue.
    """

    scheduler_id = "in_process"

    def __init__(self, store: Any | None = None) -> None:
        self.store = store or MemoryAsyncTaskStore()
        self._threads: dict[str, Thread] = {}
        self._lock = RLock()

    def submit(self, spec: AsyncTaskSpec) -> AsyncTaskSubmitResult:
        snapshot = self.store.save_spec(spec, status="pending")
        return AsyncTaskSubmitResult(
            accepted=True,
            task_id=spec.task_id,
            status="pending",
            message="Task spec accepted. Use submit_callable to execute in-process.",
            snapshot=snapshot,
        )

    def submit_callable(
        self,
        spec: AsyncTaskSpec,
        target: Callable[..., MappingResult],
        *args: Any,
        **kwargs: Any,
    ) -> AsyncTaskSubmitResult:
        existing = self.store.get(spec.task_id)
        if existing and existing.status in ("running", "completed"):
            return AsyncTaskSubmitResult(
                accepted=False,
                task_id=spec.task_id,
                status=existing.status,
                message=f"Task {spec.task_id} is already {existing.status}.",
                snapshot=existing,
            )
        snapshot = self.store.save_spec(spec, status="pending")
        thread = Thread(target=self._run_callable, args=(spec, target, args, kwargs), name=f"alphatrace-task-{spec.task_id}", daemon=True)
        with self._lock:
            self._threads[spec.task_id] = thread
        thread.start()
        return AsyncTaskSubmitResult(
            accepted=True,
            task_id=spec.task_id,
            status=snapshot.status,
            message="Task scheduled for in-process execution.",
            snapshot=snapshot,
        )

    def get(self, task_id: str) -> Optional[AsyncTaskSnapshot]:
        return self.store.get(task_id)

    def cancel(self, task_id: str, reason: str = "") -> AsyncTaskSnapshot:
        snapshot = self.store.request_cancellation(task_id, reason=reason)
        if not snapshot:
            raise KeyError(f"Async task not found: {task_id}")
        if snapshot.status == "pending":
            updated = self.store.update_status(task_id, "cancelled", updated_at=self._now(), completed_at=self._now())
            return updated or snapshot
        return snapshot

    def thread_alive(self, task_id: str) -> bool:
        with self._lock:
            thread = self._threads.get(task_id)
        return bool(thread and thread.is_alive())

    def _run_callable(self, spec: AsyncTaskSpec, target: Callable[..., MappingResult], args: tuple[Any, ...], kwargs: dict[str, Any]) -> None:
        started_at = self._now()
        self.store.update_status(spec.task_id, "running", updated_at=started_at)
        try:
            snapshot = self.store.get(spec.task_id)
            if snapshot and snapshot.payload.get("cancellationRequested"):
                self.store.update_status(spec.task_id, "cancelled", updated_at=self._now(), completed_at=self._now())
                return
            result = target(*args, **kwargs)
            completed_at = self._now()
            self.store.update_status(
                spec.task_id,
                "completed",
                updated_at=completed_at,
                completed_at=completed_at,
                result=dict(result or {}),
            )
        except TimeoutError as exc:
            completed_at = self._now()
            self.store.update_status(
                spec.task_id,
                "timed_out",
                updated_at=completed_at,
                completed_at=completed_at,
                error_code="timeout",
                error_message=str(exc),
            )
        except Exception as exc:  # noqa: BLE001 - task boundary stores structured failure.
            completed_at = self._now()
            self.store.update_status(
                spec.task_id,
                "failed",
                updated_at=completed_at,
                completed_at=completed_at,
                error_code=exc.__class__.__name__,
                error_message=str(exc),
            )

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()


MappingResult = dict[str, Any]


__all__ = ["InProcessAsyncTaskScheduler", "InProcessTaskHandle"]
