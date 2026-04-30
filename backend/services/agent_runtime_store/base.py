from __future__ import annotations

from typing import List, Optional, Protocol

from schemas.alpha_trace_agent_runtime import (
    AgentDecision,
    AgentReport,
    AgentRun,
    AgentRuntimeEvent,
    EvidenceReference,
)


class AgentRunStore(Protocol):
    def save_run(self, run: AgentRun) -> None:
        ...

    def get_run(self, run_id: str) -> Optional[AgentRun]:
        ...

    def list_runs(self) -> List[AgentRun]:
        ...

    def update_run_status(self, run_id: str, status: str, timestamp: Optional[str] = None) -> None:
        ...

    def append_event(self, run_id: str, event: AgentRuntimeEvent) -> None:
        ...

    def get_events(self, run_id: str) -> List[AgentRuntimeEvent]:
        ...

    def save_reports(self, run_id: str, reports: List[AgentReport], llm_calls: Optional[int] = None) -> None:
        ...

    def get_reports(self, run_id: str) -> List[AgentReport]:
        ...

    def save_evidence(self, run_id: str, evidence: List[EvidenceReference]) -> None:
        ...

    def get_evidence(self, run_id: str) -> List[EvidenceReference]:
        ...

    def save_decision(self, run_id: str, decision: AgentDecision) -> None:
        ...

    def get_decision(self, run_id: str) -> Optional[AgentDecision]:
        ...

