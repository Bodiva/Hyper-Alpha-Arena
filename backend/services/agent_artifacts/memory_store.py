from __future__ import annotations

from threading import RLock
from typing import Optional

from services.agent_artifacts.base import AgentArtifact


class MemoryAgentArtifactStore:
    def __init__(self) -> None:
        self._lock = RLock()
        self._items: dict[str, AgentArtifact] = {}

    def save_artifact(self, artifact: AgentArtifact) -> None:
        with self._lock:
            self._items[artifact.artifact_id] = artifact

    def get_artifact(self, artifact_id: str) -> Optional[AgentArtifact]:
        with self._lock:
            return self._items.get(artifact_id)

    def list_artifacts_for_run(self, run_id: str) -> list[AgentArtifact]:
        with self._lock:
            return [item for item in self._items.values() if item.run_id == run_id]


__all__ = ["MemoryAgentArtifactStore"]
