from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any, Iterable, Optional


@dataclass(frozen=True)
class StaleAgentRun:
    run_id: str
    status: str
    triggered_by: str
    task_type: str
    started_at: Optional[str]
    updated_at: Optional[str]
    age_minutes: int
    last_update_age_minutes: Optional[int]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def find_stale_agent_runs(runs: Iterable[Any], older_than_minutes: int = 60) -> list[StaleAgentRun]:
    threshold = max(1, int(older_than_minutes or 60))
    now = datetime.now(timezone.utc)
    stale: list[StaleAgentRun] = []
    for run in runs:
        status = str(getattr(run, "status", "") or "").lower()
        if status not in {"running", "submitted"}:
            continue
        started_at = getattr(run, "startedAt", None)
        updated_at = getattr(run, "updatedAt", None)
        started_dt = _parse_iso(started_at)
        updated_dt = _parse_iso(updated_at)
        if not started_dt:
            continue
        age_minutes = int((now - started_dt).total_seconds() // 60)
        if age_minutes < threshold:
            continue
        last_update_age = int((now - updated_dt).total_seconds() // 60) if updated_dt else None
        stale.append(
            StaleAgentRun(
                run_id=str(getattr(run, "runId", "")),
                status=status,
                triggered_by=str(getattr(run, "triggeredBy", "")),
                task_type=str(getattr(run, "taskType", "")),
                started_at=started_at,
                updated_at=updated_at,
                age_minutes=age_minutes,
                last_update_age_minutes=last_update_age,
            )
        )
    stale.sort(key=lambda item: item.age_minutes, reverse=True)
    return stale


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        normalized = str(value).replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except Exception:
        return None


__all__ = ["StaleAgentRun", "find_stale_agent_runs"]
