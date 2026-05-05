from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Mapping, Optional, Protocol


ArtifactType = Literal["table", "chart", "file", "html_preview", "web_url", "json", "image", "text"]
ArtifactStatus = Literal["created", "available", "failed", "expired"]


@dataclass(frozen=True)
class AgentArtifact:
    """Product-facing artifact produced by tools, models, or external workbenches."""

    artifact_id: str
    run_id: str
    artifact_type: ArtifactType
    title: str
    status: ArtifactStatus = "created"
    summary: str = ""
    source_tool: Optional[str] = None
    source_url: Optional[str] = None
    content_type: Optional[str] = None
    storage_uri: Optional[str] = None
    preview_payload: Mapping[str, Any] = field(default_factory=dict)
    metadata: Mapping[str, Any] = field(default_factory=dict)


class AgentArtifactStore(Protocol):
    def save_artifact(self, artifact: AgentArtifact) -> None:
        ...

    def get_artifact(self, artifact_id: str) -> Optional[AgentArtifact]:
        ...

    def list_artifacts_for_run(self, run_id: str) -> list[AgentArtifact]:
        ...
