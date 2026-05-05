from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional

from sqlalchemy import JSON, Column, Float, Integer, MetaData, String, Table, Text, create_engine, delete, insert, select, update
from sqlalchemy.engine import Engine

from schemas.alpha_trace_agent_runtime import (
    AgentDecision,
    AgentReport,
    AgentRun,
    AgentRuntimeEvent,
    EvidenceReference,
)
from services.agent_runtime_status_machine import normalize_agent_status_for_run_status


def _default_mysql_url() -> str:
    return os.getenv(
        "ALPHA_TRACE_MYSQL_DATABASE_URL",
        os.getenv(
            "MYSQL_DATABASE_URL",
            "mysql+pymysql://alpha_user:alpha_pass@mysql:3306/alpha_trace?charset=utf8mb4",
        ),
    )


def _json_payload(value: Any) -> Any:
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value
    return value


class MysqlAgentRunStore:
    """MySQL-backed AgentRunStore for AlphaTrace runtime persistence."""

    def __init__(self, database_url: Optional[str] = None):
        self.database_url = database_url or _default_mysql_url()
        self.engine = create_engine(self.database_url, pool_pre_ping=True, pool_recycle=1800)
        self.metadata = MetaData()
        self.runs = Table(
            "alpha_trace_agent_runs",
            self.metadata,
            Column("run_id", String(128), primary_key=True),
            Column("status", String(32), nullable=False, index=True),
            Column("mode", String(64), nullable=True, index=True),
            Column("asset_id", String(128), nullable=True, index=True),
            Column("portfolio_id", String(128), nullable=True, index=True),
            Column("strategy_id", String(128), nullable=True, index=True),
            Column("task_type", String(128), nullable=True, index=True),
            Column("created_at", String(64), nullable=True, index=True),
            Column("updated_at", String(64), nullable=True, index=True),
            Column("payload_json", JSON, nullable=False),
        )
        self.events = Table(
            "alpha_trace_runtime_events",
            self.metadata,
            Column("event_id", String(160), primary_key=True),
            Column("run_id", String(128), nullable=False, index=True),
            Column("sequence", Integer, nullable=False, index=True),
            Column("type", String(96), nullable=False, index=True),
            Column("timestamp", String(64), nullable=True, index=True),
            Column("agent_name", String(160), nullable=True),
            Column("team", String(96), nullable=True),
            Column("payload_json", JSON, nullable=False),
        )
        self.reports = Table(
            "alpha_trace_agent_reports",
            self.metadata,
            Column("report_id", String(160), primary_key=True),
            Column("run_id", String(128), nullable=False, index=True),
            Column("title", String(255), nullable=True),
            Column("created_at", String(64), nullable=True, index=True),
            Column("payload_json", JSON, nullable=False),
        )
        self.evidence_refs = Table(
            "alpha_trace_evidence_refs",
            self.metadata,
            Column("id", String(320), primary_key=True),
            Column("run_id", String(128), nullable=False, index=True),
            Column("evidence_id", String(160), nullable=False, index=True),
            Column("evidence_type", String(96), nullable=True, index=True),
            Column("source", String(255), nullable=True),
            Column("payload_json", JSON, nullable=False),
        )
        self.decisions = Table(
            "alpha_trace_decisions",
            self.metadata,
            Column("decision_id", String(160), primary_key=True),
            Column("run_id", String(128), nullable=False, unique=True, index=True),
            Column("action", String(64), nullable=True, index=True),
            Column("confidence", String(32), nullable=True),
            Column("horizon", String(64), nullable=True),
            Column("payload_json", JSON, nullable=False),
        )
        self.run_metrics = Table(
            "alpha_trace_agent_run_metrics",
            self.metadata,
            Column("run_id", String(128), primary_key=True),
            Column("status", String(32), nullable=False, index=True),
            Column("mode", String(64), nullable=True, index=True),
            Column("asset_id", String(128), nullable=True, index=True),
            Column("portfolio_id", String(128), nullable=True, index=True),
            Column("strategy_id", String(128), nullable=True, index=True),
            Column("task_type", String(128), nullable=True, index=True),
            Column("started_at", String(64), nullable=True, index=True),
            Column("updated_at", String(64), nullable=True, index=True),
            Column("completed_at", String(64), nullable=True, index=True),
            Column("llm_calls", Integer, nullable=False, default=0),
            Column("tool_calls", Integer, nullable=False, default=0),
            Column("generated_reports", Integer, nullable=False, default=0),
            Column("duration_seconds", Integer, nullable=False, default=0),
            Column("prompt_tokens", Integer, nullable=False, default=0, index=True),
            Column("completion_tokens", Integer, nullable=False, default=0, index=True),
            Column("total_tokens", Integer, nullable=False, default=0, index=True),
            Column("estimated_cost_usd", Float, nullable=True),
            Column("payload_json", JSON, nullable=False),
        )
        self.metadata.create_all(self.engine)
        self._backfill_run_metrics()

    def save_run(self, run: AgentRun) -> None:
        payload = run.model_dump(mode="json")
        values = {
            "status": run.status,
            "mode": run.triggeredBy,
            "asset_id": run.assetIds[0] if run.assetIds else None,
            "portfolio_id": run.portfolioId,
            "strategy_id": run.strategyId,
            "task_type": run.taskType,
            "created_at": run.startedAt,
            "updated_at": run.updatedAt or run.startedAt,
            "payload_json": payload,
        }
        self._upsert(self.runs, {"run_id": run.runId}, values)
        self._upsert_run_metrics(run)
        for event in run.events:
            self.append_event(run.runId, event)
        if run.reports:
            self.save_reports(run.runId, run.reports)
        if run.finalDecision:
            self.save_decision(run.runId, run.finalDecision)

    def get_run(self, run_id: str) -> Optional[AgentRun]:
        with self.engine.begin() as conn:
            row = conn.execute(select(self.runs.c.payload_json).where(self.runs.c.run_id == run_id)).first()
        if not row:
            return None
        return AgentRun.model_validate(_json_payload(row.payload_json))

    def list_runs(self) -> List[AgentRun]:
        with self.engine.begin() as conn:
            id_rows = conn.execute(select(self.runs.c.run_id).order_by(self.runs.c.created_at.desc())).fetchall()
            run_ids = [row.run_id for row in id_rows]
            if not run_ids:
                return []
            payload_rows = conn.execute(
                select(self.runs.c.run_id, self.runs.c.payload_json).where(self.runs.c.run_id.in_(run_ids))
            ).fetchall()
        payload_by_id = {row.run_id: row.payload_json for row in payload_rows}
        return [
            AgentRun.model_validate(_json_payload(payload_by_id[run_id]))
            for run_id in run_ids
            if run_id in payload_by_id
        ]

    def update_run_status(self, run_id: str, status: str, timestamp: Optional[str] = None) -> None:
        run = self.get_run(run_id)
        if not run:
            return
        current_time = timestamp or run.updatedAt or run.startedAt
        agent_status = normalize_agent_status_for_run_status(status)
        updated_agents = [agent.model_copy(update={"status": agent_status}) for agent in run.agents]
        next_run = run.model_copy(
            update={
                "status": status,
                "updatedAt": current_time,
                "completedAt": current_time if status in {"completed", "failed", "cancelled"} else run.completedAt,
                "agents": updated_agents,
            }
        )
        self.save_run(next_run)

    def append_event(self, run_id: str, event: AgentRuntimeEvent) -> None:
        run = self.get_run(run_id)
        if run and event.eventId not in {item.eventId for item in run.events}:
            next_run = run.model_copy(
                update={
                    "events": sorted([*run.events, event], key=lambda item: item.sequence),
                    "updatedAt": event.timestamp,
                }
            )
            self._save_run_payload(next_run)
        self._upsert(
            self.events,
            {"event_id": event.eventId},
            {
                "run_id": run_id,
                "sequence": event.sequence,
                "type": event.type,
                "timestamp": event.timestamp,
                "agent_name": event.agentName,
                "team": event.team,
                "payload_json": event.model_dump(mode="json"),
            },
        )

    def get_events(self, run_id: str) -> List[AgentRuntimeEvent]:
        with self.engine.begin() as conn:
            rows = conn.execute(
                select(self.events.c.payload_json).where(self.events.c.run_id == run_id).order_by(self.events.c.sequence.asc())
            ).fetchall()
        if rows:
            return [AgentRuntimeEvent.model_validate(_json_payload(row.payload_json)) for row in rows]
        run = self.get_run(run_id)
        return sorted(run.events, key=lambda item: item.sequence) if run else []

    def save_reports(self, run_id: str, reports: List[AgentReport], llm_calls: Optional[int] = None) -> None:
        run = self.get_run(run_id)
        if run:
            next_run = run.model_copy(
                update={
                    "reports": reports,
                    "metrics": run.metrics.model_copy(
                        update={
                            "llmCalls": llm_calls if llm_calls is not None else run.metrics.llmCalls,
                            "generatedReports": len(reports),
                        }
                    ),
                }
            )
            self._save_run_payload(next_run)
        with self.engine.begin() as conn:
            conn.execute(delete(self.reports).where(self.reports.c.run_id == run_id))
            for report in reports:
                conn.execute(
                    insert(self.reports).values(
                        report_id=report.reportId,
                        run_id=run_id,
                        title=report.title,
                        created_at=report.createdAt,
                        payload_json=report.model_dump(mode="json"),
                    )
                )

    def get_reports(self, run_id: str) -> List[AgentReport]:
        with self.engine.begin() as conn:
            rows = conn.execute(
                select(self.reports.c.payload_json).where(self.reports.c.run_id == run_id).order_by(self.reports.c.created_at.asc())
            ).fetchall()
        if rows:
            return [AgentReport.model_validate(_json_payload(row.payload_json)) for row in rows]
        run = self.get_run(run_id)
        return run.reports if run else []

    def save_evidence(self, run_id: str, evidence: List[EvidenceReference]) -> None:
        run = self.get_run(run_id)
        if run:
            evidence_ids = [item.evidenceId for item in evidence]
            merged = list(dict.fromkeys([*run.evidenceIds, *evidence_ids]))
            self._save_run_payload(run.model_copy(update={"evidenceIds": merged}))
        with self.engine.begin() as conn:
            for item in evidence:
                self._upsert_with_conn(
                    conn,
                    self.evidence_refs,
                    {"id": f"{run_id}:{item.evidenceId}"},
                    {
                        "run_id": run_id,
                        "evidence_id": item.evidenceId,
                        "evidence_type": item.evidenceType,
                        "source": item.sourceName,
                        "payload_json": item.model_dump(mode="json"),
                    },
                )

    def get_evidence(self, run_id: str) -> List[EvidenceReference]:
        with self.engine.begin() as conn:
            rows = conn.execute(
                select(self.evidence_refs.c.payload_json).where(self.evidence_refs.c.run_id == run_id)
            ).fetchall()
        return [EvidenceReference.model_validate(_json_payload(row.payload_json)) for row in rows]

    def save_decision(self, run_id: str, decision: AgentDecision) -> None:
        run = self.get_run(run_id)
        if run:
            merged = list(dict.fromkeys([*run.evidenceIds, *decision.evidenceIds]))
            self._save_run_payload(run.model_copy(update={"finalDecision": decision, "evidenceIds": merged}))
        decision_id = f"decision_{run_id}"
        self._upsert(
            self.decisions,
            {"run_id": run_id},
            {
                "decision_id": decision_id,
                "action": decision.action,
                "confidence": str(decision.confidence),
                "horizon": decision.horizon,
                "payload_json": decision.model_dump(mode="json"),
            },
        )

    def get_decision(self, run_id: str) -> Optional[AgentDecision]:
        with self.engine.begin() as conn:
            row = conn.execute(select(self.decisions.c.payload_json).where(self.decisions.c.run_id == run_id)).first()
        if row:
            return AgentDecision.model_validate(_json_payload(row.payload_json))
        run = self.get_run(run_id)
        return run.finalDecision if run else None

    def _save_run_payload(self, run: AgentRun) -> None:
        payload = run.model_dump(mode="json")
        self._upsert(
            self.runs,
            {"run_id": run.runId},
            {
                "status": run.status,
                "mode": run.triggeredBy,
                "asset_id": run.assetIds[0] if run.assetIds else None,
                "portfolio_id": run.portfolioId,
                "strategy_id": run.strategyId,
                "task_type": run.taskType,
                "created_at": run.startedAt,
                "updated_at": run.updatedAt or run.startedAt,
                "payload_json": payload,
            },
        )
        self._upsert_run_metrics(run)

    def _upsert_run_metrics(self, run: AgentRun) -> None:
        metrics = run.metrics
        self._upsert(
            self.run_metrics,
            {"run_id": run.runId},
            {
                "status": run.status,
                "mode": run.triggeredBy,
                "asset_id": run.assetIds[0] if run.assetIds else None,
                "portfolio_id": run.portfolioId,
                "strategy_id": run.strategyId,
                "task_type": run.taskType,
                "started_at": run.startedAt,
                "updated_at": run.updatedAt or run.startedAt,
                "completed_at": run.completedAt,
                "llm_calls": metrics.llmCalls,
                "tool_calls": metrics.toolCalls,
                "generated_reports": metrics.generatedReports,
                "duration_seconds": metrics.durationSeconds,
                "prompt_tokens": metrics.promptTokens,
                "completion_tokens": metrics.completionTokens,
                "total_tokens": metrics.totalTokens,
                "estimated_cost_usd": metrics.estimatedCostUsd,
                "payload_json": metrics.model_dump(mode="json"),
            },
        )

    def _backfill_run_metrics(self) -> None:
        with self.engine.begin() as conn:
            rows = conn.execute(select(self.runs.c.payload_json)).fetchall()
        for row in rows:
            try:
                run = AgentRun.model_validate(_json_payload(row.payload_json))
            except Exception:
                continue
            self._upsert_run_metrics(run)

    def _upsert(self, table: Table, keys: Dict[str, Any], values: Dict[str, Any]) -> None:
        with self.engine.begin() as conn:
            self._upsert_with_conn(conn, table, keys, values)

    @staticmethod
    def _upsert_with_conn(conn, table: Table, keys: Dict[str, Any], values: Dict[str, Any]) -> None:
        where_clause = None
        for column_name, column_value in keys.items():
            clause = table.c[column_name] == column_value
            where_clause = clause if where_clause is None else where_clause & clause
        existing = conn.execute(select(table).where(where_clause)).first()
        if existing:
            conn.execute(update(table).where(where_clause).values(**values))
        else:
            conn.execute(insert(table).values(**keys, **values))
