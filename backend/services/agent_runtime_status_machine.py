from __future__ import annotations

from typing import Final

TERMINAL_STATUSES: Final[set[str]] = {"completed", "failed", "cancelled"}
ALLOWED_TRANSITIONS: Final[dict[str, set[str]]] = {
    "queued": {"running", "cancelled", "failed"},
    "running": {"completed", "partially_completed", "failed", "cancelled"},
    "partially_completed": {"completed", "failed", "cancelled"},
    "completed": set(),
    "failed": set(),
    "cancelled": set(),
}


def is_terminal_status(status: str | None) -> bool:
    return (status or "").lower() in TERMINAL_STATUSES


def can_transition_status(current_status: str | None, next_status: str) -> bool:
    current = (current_status or "queued").lower()
    target = next_status.lower()
    if current == target:
        return True
    if current in TERMINAL_STATUSES:
        return False
    return target in ALLOWED_TRANSITIONS.get(current, set())


def normalize_agent_status_for_run_status(status: str) -> str:
    normalized = status.lower()
    if normalized == "completed":
        return "completed"
    if normalized == "cancelled":
        return "cancelled"
    if normalized == "failed":
        return "failed"
    return "running"
