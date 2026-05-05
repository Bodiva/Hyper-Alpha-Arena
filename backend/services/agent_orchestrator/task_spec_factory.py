from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from schemas.alpha_trace_agent_runtime import SubmitAgentRunRequest
from services.async_tasks.base import AsyncTaskSpec


DEFAULT_AGENT_TASK_TIMEOUT_SECONDS = 900
TRADINGAGENTS_TASK_TIMEOUT_SECONDS = 1800


def build_agent_run_task_spec(
    request: SubmitAgentRunRequest,
    *,
    run_id: Optional[str] = None,
    task_id: Optional[str] = None,
) -> AsyncTaskSpec:
    """Map AlphaTrace submit requests into scheduler-neutral task specs.

    The payload intentionally stores AlphaTrace request metadata and never stores
    provider API keys. Runners remain responsible for resolving backend-only
    credentials at execution time.
    """

    runner_type = str(request.runnerConfig.runnerType or "stub")
    extra_params = dict(request.runnerConfig.extraParams or {})
    resolved_run_id = run_id or f"run_pending_{uuid4().hex[:12]}"
    resolved_task_id = task_id or f"task_{resolved_run_id}_{uuid4().hex[:8]}"
    timeout_seconds = _resolve_timeout_seconds(runner_type, extra_params)
    max_attempts = _safe_positive_int(extra_params.get("maxAttempts"), default=1, upper_bound=5)
    payload = {
        "request": _request_payload(request),
        "submittedAt": datetime.now(timezone.utc).isoformat(),
        "source": "alphatrace_agent_runtime_submit",
    }
    return AsyncTaskSpec(
        task_id=resolved_task_id,
        run_id=resolved_run_id,
        runner_type=runner_type,
        task_type=str(request.taskType),
        payload=payload,
        timeout_seconds=timeout_seconds,
        max_attempts=max_attempts,
        tags=_task_tags(request),
    )


def _resolve_timeout_seconds(runner_type: str, extra_params: dict) -> int:
    default = TRADINGAGENTS_TASK_TIMEOUT_SECONDS if runner_type == "tradingagents" else DEFAULT_AGENT_TASK_TIMEOUT_SECONDS
    return _safe_positive_int(
        extra_params.get("taskTimeoutSeconds") or extra_params.get("timeoutSeconds"),
        default=default,
        upper_bound=7200,
    )


def _safe_positive_int(value: object, *, default: int, upper_bound: int) -> int:
    try:
        parsed = int(value) if value is not None else default
    except (TypeError, ValueError):
        parsed = default
    return max(1, min(parsed, upper_bound))


def _request_payload(request: SubmitAgentRunRequest) -> dict:
    if hasattr(request, "model_dump"):
        payload = request.model_dump(mode="json")
    else:  # pragma: no cover - pydantic v1 fallback.
        payload = request.dict()
    # Defensive scrub in case future request schemas accidentally add secrets.
    runner_config = payload.get("runnerConfig") or {}
    extra_params = runner_config.get("extraParams") or {}
    for key in list(extra_params.keys()):
        if any(marker in str(key).lower() for marker in ("key", "secret", "token", "password")):
            extra_params[key] = "<redacted>"
    return payload


def _task_tags(request: SubmitAgentRunRequest) -> tuple[str, ...]:
    tags = [f"runner:{request.runnerConfig.runnerType}", f"task:{request.taskType}"]
    if request.assetId:
        tags.append(f"asset:{request.assetId}")
    if request.portfolioId:
        tags.append(f"portfolio:{request.portfolioId}")
    if request.strategyId:
        tags.append(f"strategy:{request.strategyId}")
    return tuple(tags)


__all__ = ["build_agent_run_task_spec"]
