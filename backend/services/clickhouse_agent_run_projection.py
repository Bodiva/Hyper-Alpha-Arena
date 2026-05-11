from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from schemas.alpha_trace_agent_runtime import (
    AgentDecision,
    AgentReport,
    AgentRun,
    AgentRuntimeEvent,
    EvidenceReference,
)


def _to_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, default=str, separators=(",", ":"))


def _runner_type(run: AgentRun) -> str:
    return run.triggeredBy or "unknown"


def _run_time(run: AgentRun) -> str:
    return run.completedAt or run.updatedAt or run.startedAt


def _clickhouse_datetime(value: str | None) -> str:
    raw_value = str(value or "").strip()
    if not raw_value:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    try:
        parsed = datetime.fromisoformat(raw_value.replace("Z", "+00:00"))
        if parsed.tzinfo is not None:
            parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
        return parsed.strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
    except ValueError:
        return raw_value


def _base_run_fields(run: AgentRun, event_time: str | None = None) -> dict[str, Any]:
    return {
        "workspace_id": "default",
        "run_id": run.runId,
        "runner_type": _runner_type(run),
        "task_type": run.taskType,
        "event_time": _clickhouse_datetime(event_time or _run_time(run)),
    }


@dataclass(frozen=True)
class ClickHouseProjectionTable:
    table_name: str
    rows: list[dict[str, Any]]

    def to_response(self, sample_limit: int = 3) -> dict[str, Any]:
        return {
            "tableName": self.table_name,
            "rowCount": len(self.rows),
            "sampleRows": self.rows[:sample_limit],
            "jsonEachRowPreview": "\n".join(_to_json(row) for row in self.rows[:sample_limit]),
        }


@dataclass(frozen=True)
class AgentRunClickHouseProjection:
    run_id: str
    tables: list[ClickHouseProjectionTable]

    def to_response(self, sample_limit: int = 3) -> dict[str, Any]:
        return {
            "runId": self.run_id,
            "tables": [table.to_response(sample_limit=sample_limit) for table in self.tables],
            "summary": {table.table_name: len(table.rows) for table in self.tables},
            "message": (
                "Projection preview only. Rows are normalized for ClickHouse analytical tables "
                "but are not written by this endpoint."
            ),
        }


def _event_row(run: AgentRun, event: AgentRuntimeEvent) -> dict[str, Any]:
    payload = event.payload or {}
    return {
        **_base_run_fields(run, event.timestamp),
        "sequence": event.sequence,
        "event_type": event.type,
        "agent_name": event.agentName or "",
        "step_id": str(payload.get("stepId") or payload.get("sectionHint") or ""),
        "payload_json": _to_json(event.model_dump(mode="json")),
    }


def _report_row(run: AgentRun, report: AgentReport) -> dict[str, Any]:
    report_type = report.title.lower().replace(" ", "_")[:96] if report.title else "report"
    return {
        **_base_run_fields(run, report.createdAt),
        "report_id": report.reportId,
        "report_type": report_type,
        "title": report.title,
        "content": report.summary,
        "payload_json": _to_json(report.model_dump(mode="json")),
    }


def _evidence_row(run: AgentRun, evidence: EvidenceReference) -> dict[str, Any]:
    return {
        **_base_run_fields(run, evidence.collectedAt or evidence.publishedAt or _run_time(run)),
        "evidence_id": evidence.evidenceId,
        "source_type": evidence.sourceName,
        "evidence_type": evidence.evidenceType,
        "asset_ids": evidence.relatedAssetIds,
        "source_url": evidence.url or "",
        "quality_score": float(evidence.qualityScore),
        "summary": evidence.summary,
        "payload_json": _to_json(evidence.model_dump(mode="json")),
    }


def _decision_row(run: AgentRun, decision: AgentDecision) -> dict[str, Any]:
    return {
        **_base_run_fields(run, _run_time(run)),
        "decision_id": f"decision_{run.runId}",
        "action": decision.action,
        "confidence": float(decision.confidence),
        "horizon": decision.horizon,
        "evidence_ids": decision.evidenceIds,
        "payload_json": _to_json(decision.model_dump(mode="json")),
    }


def build_agent_run_clickhouse_projection(
    *,
    run: AgentRun,
    events: list[AgentRuntimeEvent],
    reports: list[AgentReport],
    evidence: list[EvidenceReference],
    decision: AgentDecision | None,
) -> AgentRunClickHouseProjection:
    """Build ClickHouse analytical projection rows for a single AgentRun.

    This is intentionally side-effect free. ClickHouse is the target business
    analytics store, but the current endpoint only previews normalized rows so
    the mapping can be reviewed before enabling writes.
    """

    tables = [
        ClickHouseProjectionTable(
            "alpha_trace_runtime_events",
            [_event_row(run, event) for event in sorted(events, key=lambda item: item.sequence)],
        ),
        ClickHouseProjectionTable(
            "alpha_trace_agent_reports",
            [_report_row(run, report) for report in reports],
        ),
        ClickHouseProjectionTable(
            "alpha_trace_evidence_refs",
            [_evidence_row(run, item) for item in evidence],
        ),
        ClickHouseProjectionTable(
            "alpha_trace_decisions",
            [_decision_row(run, decision)] if decision else [],
        ),
    ]
    return AgentRunClickHouseProjection(run_id=run.runId, tables=tables)


__all__ = [
    "AgentRunClickHouseProjection",
    "ClickHouseProjectionTable",
    "build_agent_run_clickhouse_projection",
]
