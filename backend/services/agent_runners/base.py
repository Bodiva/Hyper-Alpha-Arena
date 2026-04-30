from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Protocol

from schemas.alpha_trace_agent_runtime import (
    AgentDecision,
    AgentReport,
    AgentRun,
    AgentRuntimeEvent,
    EvidenceReference,
    SubmitAgentRunRequest,
    SubmitAgentRunResponse,
    ToolCall,
)


@dataclass(frozen=True)
class AgentRunnerContext:
    base_run: AgentRun
    base_decision: AgentDecision
    copy_runtime_artifacts: Callable[[str, str], tuple[List[ToolCall], List[AgentReport], List[AgentRuntimeEvent]]]
    save_run: Callable[[AgentRun], None]
    save_evidence_references: Callable[[List[EvidenceReference]], None]
    get_llm_config: Optional[Callable[[], Dict[str, Any]]] = None
    get_run: Optional[Callable[[str], Optional[AgentRun]]] = None
    append_event: Optional[Callable[[str, AgentRuntimeEvent], None]] = None
    update_run_status: Optional[Callable[[str, str, Optional[str]], None]] = None
    update_run_outputs: Optional[
        Callable[[str, List[AgentReport], List[EvidenceReference], AgentDecision, Optional[int]], None]
    ] = None


class AgentRunnerAdapter(Protocol):
    runner_type: str

    def submit(self, request: SubmitAgentRunRequest, context: AgentRunnerContext) -> SubmitAgentRunResponse:
        ...
