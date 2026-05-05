from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from time import perf_counter
from typing import Any, Mapping

from services.agent_tool_registry import get_agent_tool_contract
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
        duration_ms = int((perf_counter() - start) * 1000)
        completed_at = datetime.now(timezone.utc).isoformat()
        result_payload = self.build_result_payload(request, result, started_at, completed_at, duration_ms)
        return ToolExecutionRecord(
            request=request,
            result=result,
            started_at=started_at,
            completed_at=completed_at,
            duration_ms=duration_ms,
            called_payload=called_payload,
            result_payload=result_payload,
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
    ) -> Mapping[str, Any]:
        payload: dict[str, Any] = {
            "toolName": request.tool_id,
            "status": result.status,
            "summary": result.content or result.message,
            "evidenceIds": list(result.evidence_ids),
            "artifactIds": list(result.artifact_ids),
            "startedAt": started_at,
            "completedAt": completed_at,
            "durationMs": duration_ms,
            "result": dict(result.payload),
        }
        contract = get_agent_tool_contract(request.tool_id)
        if contract:
            payload["toolContract"] = contract.to_payload()
        return {key: value for key, value in payload.items() if value not in (None, [], {})}


__all__ = ["ToolExecutionRecord", "ToolExecutor"]
