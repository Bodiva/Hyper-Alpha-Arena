from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import os
from time import perf_counter
from typing import Any, Mapping

from services.agent_tool_registry import get_agent_tool_contract
from services.agent_artifacts import AgentArtifact, get_agent_artifact_store, tool_result_to_artifacts
from services.integration_adapters.base import ToolAdapter, ToolInvocationRequest, ToolInvocationResult


@dataclass(frozen=True)
class ToolExecutionRecord:
    request: ToolInvocationRequest
    result: ToolInvocationResult
    started_at: str
    completed_at: str
    duration_ms: int
    called_payload: Mapping[str, Any]
    result_payload: Mapping[str, Any]
    artifacts: tuple[AgentArtifact, ...] = ()


class ToolExecutor:
    """Small helper that standardizes tool invocation metadata.

    This class does not append AgentRuntimeEvent by itself. Runners decide how
    to persist events, but can reuse the generated payloads to avoid divergent
    tool.called/tool.result shapes.
    """

    def execute(self, adapter: ToolAdapter, request: ToolInvocationRequest) -> ToolExecutionRecord:
        started_at = datetime.now(timezone.utc).isoformat()
        start = perf_counter()
        called_payload = self.build_called_payload(request)
        result = adapter.invoke(request)
        artifacts = self._map_and_optionally_persist_artifacts(request, result)
        duration_ms = int((perf_counter() - start) * 1000)
        completed_at = datetime.now(timezone.utc).isoformat()
        result_payload = self.build_result_payload(request, result, started_at, completed_at, duration_ms, artifacts)
        return ToolExecutionRecord(
            request=request,
            result=result,
            started_at=started_at,
            completed_at=completed_at,
            duration_ms=duration_ms,
            called_payload=called_payload,
            result_payload=result_payload,
            artifacts=tuple(artifacts),
        )

    @staticmethod
    def build_called_payload(request: ToolInvocationRequest) -> Mapping[str, Any]:
        payload: dict[str, Any] = {
            "toolName": request.tool_id,
            "stepId": request.step_id,
            "agentName": request.agent_name,
            "args": dict(request.args),
        }
        contract = get_agent_tool_contract(request.tool_id)
        if contract:
            payload["toolContract"] = contract.to_payload()
        return {key: value for key, value in payload.items() if value is not None}

    @staticmethod
    def build_result_payload(
        request: ToolInvocationRequest,
        result: ToolInvocationResult,
        started_at: str,
        completed_at: str,
        duration_ms: int,
        artifacts: tuple[AgentArtifact, ...] | list[AgentArtifact] = (),
    ) -> Mapping[str, Any]:
        artifact_ids = list(dict.fromkeys([*result.artifact_ids, *[artifact.artifact_id for artifact in artifacts]]))
        payload: dict[str, Any] = {
            "toolName": request.tool_id,
            "status": result.status,
            "summary": result.content or result.message,
            "evidenceIds": list(result.evidence_ids),
            "artifactIds": artifact_ids,
            "startedAt": started_at,
            "completedAt": completed_at,
            "durationMs": duration_ms,
            "result": dict(result.payload),
        }
        contract = get_agent_tool_contract(request.tool_id)
        if contract:
            payload["toolContract"] = contract.to_payload()
        return {key: value for key, value in payload.items() if value not in (None, [], {})}

    @staticmethod
    def _should_persist_tool_artifacts() -> bool:
        return os.getenv("ALPHATRACE_PERSIST_TOOL_RESULT_ARTIFACTS", "").strip().lower() == "true"

    def _map_and_optionally_persist_artifacts(
        self,
        request: ToolInvocationRequest,
        result: ToolInvocationResult,
    ) -> tuple[AgentArtifact, ...]:
        artifacts = tuple(tool_result_to_artifacts(request.run_id, result, step_id=request.step_id))
        if not artifacts or not self._should_persist_tool_artifacts():
            return artifacts
        store = get_agent_artifact_store()
        for artifact in artifacts:
            store.save_artifact(artifact)
        return artifacts


__all__ = ["ToolExecutionRecord", "ToolExecutor"]
