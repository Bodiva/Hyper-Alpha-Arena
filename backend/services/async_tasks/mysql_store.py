from __future__ import annotations

import os
from typing import Any, Optional

from sqlalchemy import JSON, Column, Integer, MetaData, String, Table, Text, create_engine, insert, select, update
from sqlalchemy.engine import Engine

from services.async_tasks.base import AsyncTaskSnapshot, AsyncTaskSpec, TaskStatus
from services.domain_store.mysql_domain_store import get_mysql_domain_database_url


def get_async_task_store_type() -> str:
    return os.getenv("ALPHA_TRACE_ASYNC_TASK_STORE", "mysql").strip().lower()


class MysqlAsyncTaskStore:
    """MySQL-backed async task snapshot store.

    This store is additive and is not yet wired into AgentRun submit. It defines
    the durable state boundary for future worker/cancel/retry/scheduler work.
    """

    def __init__(self, database_url: Optional[str] = None) -> None:
        self.database_url = database_url or get_mysql_domain_database_url()
        self.engine: Engine = create_engine(self.database_url, pool_pre_ping=True, pool_recycle=1800)
        self.metadata = MetaData()
        self.tasks = Table(
            "alpha_trace_async_tasks",
            self.metadata,
            Column("task_id", String(160), primary_key=True),
            Column("run_id", String(160), nullable=False, index=True),
            Column("runner_type", String(96), nullable=False, index=True),
            Column("task_type", String(128), nullable=False, index=True),
            Column("status", String(32), nullable=False, index=True),
            Column("attempt", Integer, nullable=False, default=0),
            Column("max_attempts", Integer, nullable=False, default=1),
            Column("timeout_seconds", Integer, nullable=False, default=900),
            Column("cancellation_requested", String(8), nullable=True, index=True),
            Column("started_at", String(64), nullable=True, index=True),
            Column("updated_at", String(64), nullable=True, index=True),
            Column("completed_at", String(64), nullable=True, index=True),
            Column("error_code", String(96), nullable=True, index=True),
            Column("error_message", Text, nullable=True),
            Column("payload_json", JSON, nullable=False),
            Column("result_json", JSON, nullable=True),
        )
        self.metadata.create_all(self.engine)

    def save_spec(self, spec: AsyncTaskSpec, status: TaskStatus = "pending") -> AsyncTaskSnapshot:
        snapshot = AsyncTaskSnapshot(
            task_id=spec.task_id,
            run_id=spec.run_id,
            runner_type=spec.runner_type,
            task_type=spec.task_type,
            status=status,
            attempt=0,
            payload={"spec": spec.__dict__},
        )
        self.save_snapshot(snapshot, max_attempts=spec.max_attempts, timeout_seconds=spec.timeout_seconds)
        return snapshot

    def save_snapshot(self, snapshot: AsyncTaskSnapshot, max_attempts: int = 1, timeout_seconds: int = 900) -> None:
        values = self._snapshot_values(snapshot, max_attempts=max_attempts, timeout_seconds=timeout_seconds)
        with self.engine.begin() as conn:
            existing = conn.execute(select(self.tasks.c.task_id).where(self.tasks.c.task_id == snapshot.task_id)).first()
            if existing:
                conn.execute(update(self.tasks).where(self.tasks.c.task_id == snapshot.task_id).values(**values))
            else:
                conn.execute(insert(self.tasks).values(task_id=snapshot.task_id, **values))

    def update_status(
        self,
        task_id: str,
        status: TaskStatus,
        *,
        updated_at: Optional[str] = None,
        completed_at: Optional[str] = None,
        error_code: Optional[str] = None,
        error_message: Optional[str] = None,
        result: Optional[dict[str, Any]] = None,
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
        with self.engine.begin() as conn:
            conn.execute(update(self.tasks).where(self.tasks.c.task_id == task_id).values(cancellation_requested="true"))
        return updated

    def get(self, task_id: str) -> Optional[AsyncTaskSnapshot]:
        with self.engine.begin() as conn:
            row = conn.execute(select(self.tasks).where(self.tasks.c.task_id == task_id)).first()
        return self._row_to_snapshot(row) if row else None

    def list_recent(self, limit: int = 50) -> list[AsyncTaskSnapshot]:
        limit = max(1, min(int(limit or 50), 200))
        with self.engine.begin() as conn:
            rows = conn.execute(select(self.tasks).order_by(self.tasks.c.updated_at.desc()).limit(limit)).fetchall()
        return [self._row_to_snapshot(row) for row in rows]

    @staticmethod
    def _snapshot_values(snapshot: AsyncTaskSnapshot, max_attempts: int, timeout_seconds: int) -> dict[str, Any]:
        return {
            "run_id": snapshot.run_id,
            "runner_type": snapshot.runner_type,
            "task_type": snapshot.task_type,
            "status": snapshot.status,
            "attempt": snapshot.attempt,
            "max_attempts": max_attempts,
            "timeout_seconds": timeout_seconds,
            "cancellation_requested": "true" if snapshot.payload.get("cancellationRequested") else "false",
            "started_at": snapshot.started_at,
            "updated_at": snapshot.updated_at,
            "completed_at": snapshot.completed_at,
            "error_code": snapshot.error_code,
            "error_message": snapshot.error_message,
            "payload_json": dict(snapshot.payload),
            "result_json": dict(snapshot.result),
        }

    @staticmethod
    def _row_to_snapshot(row: Any) -> AsyncTaskSnapshot:
        return AsyncTaskSnapshot(
            task_id=row.task_id,
            run_id=row.run_id,
            runner_type=row.runner_type,
            task_type=row.task_type,
            status=row.status,
            attempt=row.attempt or 0,
            started_at=row.started_at,
            updated_at=row.updated_at,
            completed_at=row.completed_at,
            error_code=row.error_code,
            error_message=row.error_message,
            payload=row.payload_json or {},
            result=row.result_json or {},
        )


_ASYNC_TASK_STORE: Optional[MysqlAsyncTaskStore] = None


def get_mysql_async_task_store() -> MysqlAsyncTaskStore:
    global _ASYNC_TASK_STORE
    if _ASYNC_TASK_STORE is None:
        _ASYNC_TASK_STORE = MysqlAsyncTaskStore()
    return _ASYNC_TASK_STORE


__all__ = ["MysqlAsyncTaskStore", "get_async_task_store_type", "get_mysql_async_task_store"]
