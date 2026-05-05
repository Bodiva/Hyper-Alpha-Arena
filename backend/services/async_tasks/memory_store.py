from __future__ import annotations

from threading import RLock
from typing import Optional

from services.async_tasks.base import AsyncTaskSnapshot, AsyncTaskSpec, TaskStatus


class MemoryAsyncTaskStore:
    """In-memory AsyncTask store for scheduler smoke tests and JSON-fallback environments."""

    def __init__(self) -> None:
        self._lock = RLock()
        self._snapshots: dict[str, AsyncTaskSnapshot] = {}

    def save_spec(self, spec: AsyncTaskSpec, status: TaskStatus = "pending") -> AsyncTaskSnapshot:
        snapshot = AsyncTaskSnapshot(
            task_id=spec.task_id,
            run_id=spec.run_id,
            runner_type=spec.runner_type,
            task_type=spec.task_type,
            status=status,
            attempt=0,
            payload={"spec": dict(spec.__dict__)},
        )
        self.save_snapshot(snapshot)
        return snapshot

    def save_snapshot(self, snapshot: AsyncTaskSnapshot, max_attempts: int = 1, timeout_seconds: int = 900) -> None:  # noqa: ARG002
        with self._lock:
            self._snapshots[snapshot.task_id] = snapshot

    def update_status(
        self,
        task_id: str,
        status: TaskStatus,
        *,
        updated_at: Optional[str] = None,
        completed_at: Optional[str] = None,
        error_code: Optional[str] = None,
        error_message: Optional[str] = None,
        result: Optional[dict] = None,
    ) -> Optional[AsyncTaskSnapshot]:
        snapshot = self.get(task_id)
        if not snapshot:
            return None
        updated = AsyncTaskSnapshot(
            **{
                **snapshot.__dict__,
                "status": status,
                "updated_at": updated_at or snapshot.updated_at,
                "completed_at": completed_at or snapshot.completed_at,
                "error_code": error_code,
                "error_message": error_message,
                "result": result or snapshot.result,
            }
        )
        self.save_snapshot(updated)
        return updated

    def request_cancellation(self, task_id: str, reason: str = "") -> Optional[AsyncTaskSnapshot]:
        snapshot = self.get(task_id)
        if not snapshot:
            return None
        payload = {**dict(snapshot.payload), "cancellationRequested": True, "cancellationReason": reason}
        updated = AsyncTaskSnapshot(**{**snapshot.__dict__, "payload": payload})
        self.save_snapshot(updated)
        return updated

    def get(self, task_id: str) -> Optional[AsyncTaskSnapshot]:
        with self._lock:
            return self._snapshots.get(task_id)

    def list_recent(self, limit: int = 50) -> list[AsyncTaskSnapshot]:
        with self._lock:
            snapshots = list(self._snapshots.values())
        snapshots.sort(key=lambda item: item.updated_at or item.started_at or "", reverse=True)
        return snapshots[: max(1, min(int(limit or 50), 200))]


__all__ = ["MemoryAsyncTaskStore"]
