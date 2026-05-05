from __future__ import annotations

import os
from typing import Any, Optional

from sqlalchemy import JSON, Column, MetaData, String, Table, Text, create_engine, insert, select, update
from sqlalchemy.engine import Engine

from services.agent_artifacts.base import AgentArtifact
from services.agent_runtime_store.mysql_store import _json_payload
from services.domain_store.mysql_domain_store import get_mysql_domain_database_url


class MysqlAgentArtifactStore:
    """MySQL-backed product artifact store for future file/table/chart outputs."""

    def __init__(self, database_url: Optional[str] = None) -> None:
        self.database_url = database_url or get_mysql_domain_database_url()
        self.engine: Engine = create_engine(self.database_url, pool_pre_ping=True, pool_recycle=1800)
        self.metadata = MetaData()
        self.artifacts = Table(
            "alpha_trace_agent_artifacts",
            self.metadata,
            Column("artifact_id", String(180), primary_key=True),
            Column("run_id", String(160), nullable=False, index=True),
            Column("artifact_type", String(64), nullable=False, index=True),
            Column("status", String(64), nullable=False, index=True),
            Column("title", String(255), nullable=False),
            Column("source_tool", String(160), nullable=True, index=True),
            Column("source_url", Text, nullable=True),
            Column("storage_uri", Text, nullable=True),
            Column("payload_json", JSON, nullable=False),
        )
        self.metadata.create_all(self.engine)

    def save_artifact(self, artifact: AgentArtifact) -> None:
        payload = artifact.__dict__
        values = {
            "run_id": artifact.run_id,
            "artifact_type": artifact.artifact_type,
            "status": artifact.status,
            "title": artifact.title,
            "source_tool": artifact.source_tool,
            "source_url": artifact.source_url,
            "storage_uri": artifact.storage_uri,
            "payload_json": payload,
        }
        with self.engine.begin() as conn:
            existing = conn.execute(select(self.artifacts.c.artifact_id).where(self.artifacts.c.artifact_id == artifact.artifact_id)).first()
            if existing:
                conn.execute(update(self.artifacts).where(self.artifacts.c.artifact_id == artifact.artifact_id).values(**values))
            else:
                conn.execute(insert(self.artifacts).values(artifact_id=artifact.artifact_id, **values))

    def get_artifact(self, artifact_id: str) -> Optional[AgentArtifact]:
        with self.engine.begin() as conn:
            row = conn.execute(select(self.artifacts.c.payload_json).where(self.artifacts.c.artifact_id == artifact_id)).first()
        return self._payload_to_artifact(row.payload_json) if row else None

    def list_artifacts_for_run(self, run_id: str) -> list[AgentArtifact]:
        with self.engine.begin() as conn:
            rows = conn.execute(select(self.artifacts.c.payload_json).where(self.artifacts.c.run_id == run_id)).fetchall()
        return [self._payload_to_artifact(row.payload_json) for row in rows]

    @staticmethod
    def _payload_to_artifact(payload: Any) -> AgentArtifact:
        return AgentArtifact(**(_json_payload(payload) or {}))


def get_agent_artifact_store_type() -> str:
    return os.getenv("ALPHA_TRACE_AGENT_ARTIFACT_STORE", "memory").strip().lower()


__all__ = ["MysqlAgentArtifactStore", "get_agent_artifact_store_type"]
