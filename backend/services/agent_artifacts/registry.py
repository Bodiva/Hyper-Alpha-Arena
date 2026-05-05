from __future__ import annotations

from typing import Optional

from services.agent_artifacts.base import AgentArtifactStore
from services.agent_artifacts.memory_store import MemoryAgentArtifactStore
from services.agent_artifacts.mysql_store import MysqlAgentArtifactStore, get_agent_artifact_store_type

_MEMORY_STORE: Optional[MemoryAgentArtifactStore] = None
_MYSQL_STORE: Optional[MysqlAgentArtifactStore] = None


def get_agent_artifact_store() -> AgentArtifactStore:
    store_type = get_agent_artifact_store_type()
    if store_type == "mysql":
        global _MYSQL_STORE
        if _MYSQL_STORE is None:
            _MYSQL_STORE = MysqlAgentArtifactStore()
        return _MYSQL_STORE
    global _MEMORY_STORE
    if _MEMORY_STORE is None:
        _MEMORY_STORE = MemoryAgentArtifactStore()
    return _MEMORY_STORE


__all__ = ["get_agent_artifact_store"]
