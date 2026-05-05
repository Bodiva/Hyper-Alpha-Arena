from __future__ import annotations

from collections import Counter
from typing import Any

from schemas.alpha_trace_agent_runtime import AgentRuntimeEvent
from services.agent_runtime_store.registry import get_agent_run_store


_NOISY_EVENT_TYPES = {"reasoning.chunk", "metric.updated"}
_TERMINAL_STEP_EVENTS = {"report.generated", "decision.updated", "agent.run.completed", "agent.run.failed", "agent.run.cancelled"}


def _safe_payload_text(payload: dict[str, Any]) -> str:
    for key in ("content", "message", "summary", "result", "text"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _step_id(event: AgentRuntimeEvent) -> str:
    payload = event.payload or {}
    for key in ("stepId", "sectionHint", "phase", "stage"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    if event.agentName:
        return event.agentName.strip().lower().replace(" ", "_")
    return "general"


def _group_key(event: AgentRuntimeEvent) -> tuple[str, str, str]:
    return (event.type, event.agentName or "unknown", _step_id(event))


def _new_group_item(event: AgentRuntimeEvent, item_type: str) -> dict[str, Any]:
    payload = event.payload or {}
    return {
        "itemType": item_type,
        "eventType": event.type,
        "agentName": event.agentName,
        "team": event.team,
        "stepId": _step_id(event),
        "firstSequence": event.sequence,
        "lastSequence": event.sequence,
        "startedAt": event.timestamp,
        "endedAt": event.timestamp,
        "eventCount": 1,
        "title": _timeline_title(event),
        "summary": _safe_payload_text(payload) or _timeline_title(event),
        "charCount": len(_safe_payload_text(payload)),
        "payload": _compact_payload(payload),
    }


def _compact_payload(payload: dict[str, Any]) -> dict[str, Any]:
    allowed_keys = {
        "toolName",
        "status",
        "stepId",
        "sectionHint",
        "progress",
        "streaming",
        "accumulatedLength",
        "tokenUsage",
        "metricName",
        "metricValue",
        "evidenceIds",
        "artifactIds",
    }
    return {key: value for key, value in payload.items() if key in allowed_keys}


def _timeline_title(event: AgentRuntimeEvent) -> str:
    payload = event.payload or {}
    tool_name = payload.get("toolName") or payload.get("name")
    if event.type in {"tool.called", "tool.result"} and tool_name:
        return f"{event.type}: {tool_name}"
    if event.type == "reasoning.chunk":
        return f"Streaming output: {event.agentName or _step_id(event)}"
    if event.type == "metric.updated":
        metric_name = payload.get("metricName") or "runtime metrics"
        return f"Metrics updated: {metric_name}"
    if event.type == "report.generated":
        title = payload.get("title")
        return str(title) if title else "Report generated"
    if event.type == "decision.updated":
        return "Decision updated"
    return event.type


def _append_to_group(item: dict[str, Any], event: AgentRuntimeEvent) -> None:
    text = _safe_payload_text(event.payload or {})
    item["lastSequence"] = event.sequence
    item["endedAt"] = event.timestamp
    item["eventCount"] += 1
    item["charCount"] += len(text)
    if text:
        existing = str(item.get("summary") or "")
        merged = (existing + "\n" + text).strip() if existing else text
        item["summary"] = merged[-1200:]
    payload = event.payload or {}
    if "accumulatedLength" in payload:
        item["payload"]["accumulatedLength"] = payload["accumulatedLength"]
    if "tokenUsage" in payload:
        item["payload"]["tokenUsage"] = payload["tokenUsage"]


def summarize_runtime_events(events: list[AgentRuntimeEvent], *, limit: int = 120) -> dict[str, Any]:
    """Build a human-readable timeline read model from raw runtime events.

    The raw event stream is intentionally lossless and can be noisy for token
    streaming or metric deltas. This read model groups adjacent noisy events by
    event type, agent, and step so UI can show "what happened" without rendering
    every chunk as a standalone timeline card.
    """

    sorted_events = sorted(events, key=lambda item: item.sequence)
    raw_counts = Counter(event.type for event in sorted_events)
    items: list[dict[str, Any]] = []
    active_noisy_index: dict[tuple[str, str, str], int] = {}

    for event in sorted_events:
        if event.type in _NOISY_EVENT_TYPES:
            key = _group_key(event)
            existing_index = active_noisy_index.get(key)
            if existing_index is not None and existing_index == len(items) - 1:
                _append_to_group(items[existing_index], event)
            else:
                item_type = "streaming.summary" if event.type == "reasoning.chunk" else "metrics.summary"
                active_noisy_index[key] = len(items)
                items.append(_new_group_item(event, item_type))
            continue

        active_noisy_index.clear()
        item = _new_group_item(event, "event")
        items.append(item)
        if event.type in _TERMINAL_STEP_EVENTS:
            item["terminal"] = True

    visible_items = items[-limit:] if limit and len(items) > limit else items
    return {
        "totalRawEvents": len(sorted_events),
        "totalTimelineItems": len(items),
        "returnedTimelineItems": len(visible_items),
        "compactedEventTypes": sorted(_NOISY_EVENT_TYPES),
        "rawEventCounts": dict(raw_counts),
        "items": visible_items,
        "message": (
            "Timeline summary is a read model. Raw events remain available from /events and SSE; "
            "reasoning.chunk and metric.updated are compacted for readability."
        ),
    }


def get_agent_run_timeline_summary(run_id: str, *, limit: int = 120) -> dict[str, Any] | None:
    store = get_agent_run_store()
    run = store.get_run(run_id)
    if not run:
        return None
    summary = summarize_runtime_events(store.get_events(run_id), limit=limit)
    return {
        "runId": run.runId,
        "status": run.status,
        "updatedAt": run.updatedAt,
        "completedAt": run.completedAt,
        **summary,
    }


__all__ = ["get_agent_run_timeline_summary", "summarize_runtime_events"]
