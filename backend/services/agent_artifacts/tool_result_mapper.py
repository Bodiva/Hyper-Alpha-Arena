from __future__ import annotations

import hashlib
import re
from typing import Any, Mapping

from services.agent_artifacts.base import AgentArtifact
from services.integration_adapters.base import ToolInvocationResult


_SAFE_ID_RE = re.compile(r"[^A-Za-z0-9_\-]+")


def _safe_fragment(value: str, fallback: str) -> str:
    cleaned = _SAFE_ID_RE.sub("_", value.strip())[:80].strip("_")
    return cleaned or fallback


def _hash_fragment(value: str) -> str:
    return hashlib.sha1(value.encode("utf-8")).hexdigest()[:12]


def _iter_web_items(payload: Mapping[str, Any]) -> list[Mapping[str, Any]]:
    candidates: list[Any] = []
    for key in ("webResults", "web_pages", "webPages", "results", "items"):
        value = payload.get(key)
        if isinstance(value, list):
            candidates.extend(value)
    return [item for item in candidates if isinstance(item, Mapping) and isinstance(item.get("url"), str)]


def tool_result_to_artifacts(run_id: str, result: ToolInvocationResult, step_id: str | None = None) -> list[AgentArtifact]:
    """Map tool output into product-owned artifacts.

    This mapper is intentionally best-effort and side-effect free. It lets
    Bocha search results, market snapshots, PTC outputs, and future external
    workbench files converge on `AgentArtifact` without making tool-specific
    payloads frontend product state.
    """

    artifacts: list[AgentArtifact] = []
    seen_ids: set[str] = set()

    def add(artifact: AgentArtifact) -> None:
        if artifact.artifact_id in seen_ids:
            return
        seen_ids.add(artifact.artifact_id)
        artifacts.append(artifact)

    payload = result.payload or {}
    tool_fragment = _safe_fragment(result.tool_id, "tool")

    for item in _iter_web_items(payload):
        url = str(item.get("url") or "").strip()
        if not url.startswith(("http://", "https://")):
            continue
        title = str(item.get("title") or item.get("name") or item.get("siteName") or url)
        summary = str(item.get("summary") or item.get("snippet") or item.get("description") or "")
        artifact_id = f"art_{_safe_fragment(run_id, 'run')}_{tool_fragment}_{_hash_fragment(url)}"
        add(
            AgentArtifact(
                artifact_id=artifact_id,
                run_id=run_id,
                artifact_type="web_url",
                title=title[:200],
                status="available",
                summary=summary[:1000],
                source_tool=result.tool_id,
                source_url=url,
                content_type="text/html",
                preview_payload={
                    "url": url,
                    "displayUrl": item.get("displayUrl") or item.get("display_url"),
                    "siteName": item.get("siteName") or item.get("sourceName"),
                    "publishedAt": item.get("datePublished") or item.get("publishedAt"),
                },
                metadata={"stepId": step_id, "mapping": "web_result"},
            )
        )

    if payload:
        artifact_id = f"art_{_safe_fragment(run_id, 'run')}_{tool_fragment}_payload"
        add(
            AgentArtifact(
                artifact_id=artifact_id,
                run_id=run_id,
                artifact_type="json",
                title=f"{result.tool_id} payload",
                status="available" if result.status == "completed" else "failed",
                summary=result.message or f"Structured payload from {result.tool_id}",
                source_tool=result.tool_id,
                content_type="application/json",
                preview_payload=dict(payload),
                metadata={"stepId": step_id, "mapping": "payload"},
            )
        )

    if result.content and len(result.content.strip()) >= 80:
        artifact_id = f"art_{_safe_fragment(run_id, 'run')}_{tool_fragment}_text"
        add(
            AgentArtifact(
                artifact_id=artifact_id,
                run_id=run_id,
                artifact_type="text",
                title=f"{result.tool_id} output",
                status="available" if result.status == "completed" else "failed",
                summary=result.content[:1000],
                source_tool=result.tool_id,
                content_type="text/plain",
                preview_payload={"content": result.content},
                metadata={"stepId": step_id, "mapping": "content"},
            )
        )

    return artifacts


__all__ = ["tool_result_to_artifacts"]
