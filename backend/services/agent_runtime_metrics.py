from __future__ import annotations

from collections import Counter
from typing import Any

from services.agent_runtime_store.registry import get_agent_run_store


def get_agent_run_metrics_snapshot(run_id: str) -> dict[str, Any] | None:
    """Return a single-run metrics snapshot without relying on timeline chunks.

    The canonical runtime metrics remain stored on `AgentRun.metrics` and, for
    MySQL deployments, mirrored in `alpha_trace_agent_run_metrics`. This helper
    adds read-only derived counters so UI can show token/task health without
    scanning every `metric.updated` chunk itself.
    """

    store = get_agent_run_store()
    run = store.get_run(run_id)
    if not run:
        return None

    events = store.get_events(run_id)
    reports = store.get_reports(run_id)
    evidence = store.get_evidence(run_id)
    decision = store.get_decision(run_id)

    event_counts = Counter(event.type for event in events)
    agent_counts = Counter((event.agentName or "unknown") for event in events)
    latest_metric_event = next((event for event in reversed(events) if event.type == "metric.updated"), None)
    latest_streaming_event = next(
        (
            event
            for event in reversed(events)
            if event.type == "reasoning.chunk" and bool((event.payload or {}).get("streaming"))
        ),
        None,
    )

    metrics = run.metrics.model_dump(mode="json")
    return {
        "runId": run.runId,
        "status": run.status,
        "runnerType": run.triggeredBy,
        "taskType": run.taskType,
        "assetIds": run.assetIds,
        "portfolioId": run.portfolioId,
        "strategyId": run.strategyId,
        "startedAt": run.startedAt,
        "updatedAt": run.updatedAt,
        "completedAt": run.completedAt,
        "metrics": metrics,
        "counts": {
            "events": len(events),
            "reports": len(reports),
            "evidence": len(evidence),
            "decisions": 1 if decision else 0,
            "streamingChunks": event_counts.get("reasoning.chunk", 0),
            "metricEvents": event_counts.get("metric.updated", 0),
            "toolCalls": event_counts.get("tool.called", 0),
            "toolResults": event_counts.get("tool.result", 0),
            "riskWarnings": event_counts.get("risk.warning", 0),
        },
        "eventCounts": dict(event_counts),
        "agentEventCounts": dict(agent_counts),
        "latestMetricEvent": latest_metric_event.model_dump(mode="json") if latest_metric_event else None,
        "latestStreamingEvent": latest_streaming_event.model_dump(mode="json") if latest_streaming_event else None,
        "persistence": {
            "storeClass": store.__class__.__name__,
            "metricsMirror": "alpha_trace_agent_run_metrics" if store.__class__.__name__ == "MysqlAgentRunStore" else "run_payload",
        },
        "message": (
            "Metrics are a run-level snapshot. Timeline metric.updated events are diagnostic deltas and should not be used as the primary task metric table."
        ),
    }


__all__ = ["get_agent_run_metrics_snapshot"]
