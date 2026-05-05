from __future__ import annotations

import re
from typing import Any, Optional

from services.agent_artifacts.base import AgentArtifact


def evidence_to_web_artifact(run_id: str, evidence: Any) -> Optional[AgentArtifact]:
    """Map evidence with a canonical URL into an AgentArtifact web_url.

    This is a pure mapper. It does not fetch or embed the page. The source URL
    remains canonical; any iframe/browser preview should be best-effort UI logic.
    """

    evidence_id = _get(evidence, "evidenceId") or _get(evidence, "id")
    url = _get(evidence, "url")
    if not evidence_id or not _is_http_url(url):
        return None
    title = _get(evidence, "title") or f"Evidence source {evidence_id}"
    artifact_id = f"art_{_safe_id(run_id)}_{_safe_id(str(evidence_id))}_web"
    return AgentArtifact(
        artifact_id=artifact_id,
        run_id=run_id,
        artifact_type="web_url",
        title=str(title),
        status="available",
        summary=str(_get(evidence, "summary") or ""),
        source_tool="evidence.url",
        source_url=str(url),
        content_type="text/html",
        preview_payload={
            "evidenceId": evidence_id,
            "sourceName": _get(evidence, "sourceName"),
            "evidenceType": _get(evidence, "evidenceType"),
            "qualityScore": _get(evidence, "qualityScore"),
            "publishedAt": _get(evidence, "publishedAt"),
        },
        metadata={"canonicalSource": "evidence", "previewMode": "best_effort"},
    )


def evidence_list_to_web_artifacts(run_id: str, evidence_items: list[Any]) -> list[AgentArtifact]:
    artifacts: list[AgentArtifact] = []
    seen: set[str] = set()
    for item in evidence_items:
        artifact = evidence_to_web_artifact(run_id, item)
        if artifact and artifact.artifact_id not in seen:
            artifacts.append(artifact)
            seen.add(artifact.artifact_id)
    return artifacts


def _get(item: Any, key: str) -> Any:
    if isinstance(item, dict):
        return item.get(key)
    return getattr(item, key, None)


def _is_http_url(value: Any) -> bool:
    if not value:
        return False
    text = str(value).strip()
    return text.startswith("http://") or text.startswith("https://")


def _safe_id(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_\-]+", "_", value).strip("_") or "unknown"


__all__ = ["evidence_to_web_artifact", "evidence_list_to_web_artifacts"]
