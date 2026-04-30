from __future__ import annotations

from datetime import datetime
from threading import RLock
from typing import Dict, List, Optional

from schemas.alpha_trace_agent_runtime import (
    AgentDecision,
    AgentReport,
    AgentRun,
    AgentRuntimeEvent,
    EvidenceReference,
)


class MemoryAgentRunStore:
    def __init__(self):
        self._lock = RLock()
        self._runs: Dict[str, AgentRun] = {}
        self._evidence: Dict[str, EvidenceReference] = {}

    def save_run(self, run: AgentRun) -> None:
        with self._lock:
            self._runs[run.runId] = run

    def get_run(self, run_id: str) -> Optional[AgentRun]:
        with self._lock:
            return self._runs.get(run_id)

    def list_runs(self) -> List[AgentRun]:
        with self._lock:
            return list(self._runs.values())

    def update_run_status(self, run_id: str, status: str, timestamp: Optional[str] = None) -> None:
        with self._lock:
            run = self._runs.get(run_id)
            if not run:
                return
            current_time = timestamp or datetime.now().astimezone().isoformat(timespec="seconds")
            agent_status = "completed" if status == "completed" else "failed" if status == "failed" else "running"
            updated_agents = [agent.model_copy(update={"status": agent_status}) for agent in run.agents]
            self._runs[run_id] = run.model_copy(
                update={
                    "status": status,
                    "updatedAt": current_time,
                    "completedAt": current_time if status in {"completed", "failed", "cancelled"} else run.completedAt,
                    "agents": updated_agents,
                }
            )

    def append_event(self, run_id: str, event: AgentRuntimeEvent) -> None:
        with self._lock:
            run = self._runs.get(run_id)
            if not run:
                return
            existing_ids = {item.eventId for item in run.events}
            if event.eventId in existing_ids:
                return
            self._runs[run_id] = run.model_copy(
                update={
                    "events": sorted([*run.events, event], key=lambda item: item.sequence),
                    "updatedAt": event.timestamp,
                }
            )

    def get_events(self, run_id: str) -> List[AgentRuntimeEvent]:
        run = self.get_run(run_id)
        return sorted(run.events, key=lambda item: item.sequence) if run else []

    def save_reports(self, run_id: str, reports: List[AgentReport], llm_calls: Optional[int] = None) -> None:
        with self._lock:
            run = self._runs.get(run_id)
            if not run:
                return
            self._runs[run_id] = run.model_copy(
                update={
                    "reports": reports,
                    "metrics": run.metrics.model_copy(
                        update={
                            "llmCalls": llm_calls if llm_calls is not None else run.metrics.llmCalls,
                            "generatedReports": len(reports),
                        }
                    ),
                }
            )

    def get_reports(self, run_id: str) -> List[AgentReport]:
        run = self.get_run(run_id)
        return run.reports if run else []

    def save_evidence(self, run_id: str, evidence: List[EvidenceReference]) -> None:
        with self._lock:
            for item in evidence:
                self._evidence[item.evidenceId] = item
            run = self._runs.get(run_id)
            if run:
                evidence_ids = [item.evidenceId for item in evidence]
                merged = list(dict.fromkeys([*run.evidenceIds, *evidence_ids]))
                self._runs[run_id] = run.model_copy(update={"evidenceIds": merged})

    def get_evidence(self, run_id: str) -> List[EvidenceReference]:
        run = self.get_run(run_id)
        if not run:
            return []
        with self._lock:
            return [self._evidence[item_id] for item_id in run.evidenceIds if item_id in self._evidence]

    def save_decision(self, run_id: str, decision: AgentDecision) -> None:
        with self._lock:
            run = self._runs.get(run_id)
            if not run:
                return
            merged = list(dict.fromkeys([*run.evidenceIds, *decision.evidenceIds]))
            self._runs[run_id] = run.model_copy(update={"finalDecision": decision, "evidenceIds": merged})

    def get_decision(self, run_id: str) -> Optional[AgentDecision]:
        run = self.get_run(run_id)
        return run.finalDecision if run else None

