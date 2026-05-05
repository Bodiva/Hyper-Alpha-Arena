from __future__ import annotations

import argparse
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from schemas.alpha_trace_agent_runtime import (
    AgentDecision,
    AgentReport,
    AgentRun,
    AgentRuntimeEvent,
    EvidenceReference,
    SubmitAgentRunRequest,
    ToolCall,
)
from services.agent_runners.base import AgentRunnerContext
from services.agent_runners.tradingagents_adapter import TradingAgentsRunnerAdapter


@dataclass
class WorkerState:
    run: AgentRun
    events: List[AgentRuntimeEvent] = field(default_factory=list)
    reports: List[AgentReport] = field(default_factory=list)
    evidence: List[EvidenceReference] = field(default_factory=list)
    decision: Optional[AgentDecision] = None
    llm_calls: int = 0
    status: str = "running"
    completed_at: Optional[str] = None


class JsonlWorkerContext:
    def __init__(self, run: AgentRun, output_dir: Path, base_sequence: int) -> None:
        self.output_dir = output_dir
        self.events_path = output_dir / "events.jsonl"
        self.result_path = output_dir / "result.json"
        self.state = WorkerState(run=run, events=list(run.events), decision=run.finalDecision)
        self.base_sequence = base_sequence

    def to_runner_context(self) -> AgentRunnerContext:
        return AgentRunnerContext(
            base_run=self.state.run,
            base_decision=self.state.run.finalDecision,
            copy_runtime_artifacts=self._copy_runtime_artifacts,
            save_run=lambda _run: None,
            save_evidence_references=lambda _items: None,
            get_llm_config=lambda: {"configured": False},
            get_run=self._get_run,
            append_event=self._append_event,
            update_run_status=self._update_run_status,
            update_run_outputs=self._update_run_outputs,
        )

    def _copy_runtime_artifacts(self, _run_id: str, _source_label: str) -> tuple[List[ToolCall], List[AgentReport], List[AgentRuntimeEvent]]:
        return [], [], []

    def _get_run(self, run_id: str) -> Optional[AgentRun]:
        if run_id != self.state.run.runId:
            return None
        return self.state.run.model_copy(update={"events": list(self.state.events)})

    def _append_event(self, run_id: str, event: AgentRuntimeEvent) -> None:
        if run_id != self.state.run.runId:
            return
        self.state.events.append(event)
        with self.events_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(event.model_dump(), ensure_ascii=False, default=str) + "\n")

    def _update_run_status(self, run_id: str, status: str, timestamp: Optional[str] = None) -> None:
        if run_id != self.state.run.runId:
            return
        self.state.status = status
        if status in {"completed", "failed", "cancelled"}:
            self.state.completed_at = timestamp
            self.write_result()

    def _update_run_outputs(
        self,
        run_id: str,
        reports: List[AgentReport],
        evidence: List[EvidenceReference],
        decision: AgentDecision,
        llm_calls: Optional[int] = None,
    ) -> None:
        if run_id != self.state.run.runId:
            return
        self.state.reports = reports
        self.state.evidence = evidence
        self.state.decision = decision
        self.state.llm_calls = int(llm_calls or 0)
        self.write_result()

    def write_result(self) -> None:
        payload = {
            "status": self.state.status,
            "completedAt": self.state.completed_at,
            "reports": [item.model_dump() for item in self.state.reports],
            "evidence": [item.model_dump() for item in self.state.evidence],
            "decision": self.state.decision.model_dump() if self.state.decision else None,
            "llmCalls": self.state.llm_calls,
        }
        self.result_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=str), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="AlphaTrace TradingAgents subprocess worker")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    input_path = Path(args.input)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    payload = json.loads(input_path.read_text(encoding="utf-8"))
    request = SubmitAgentRunRequest.model_validate(payload["request"])
    run = AgentRun.model_validate(payload["run"])
    base_sequence = int(payload.get("baseSequence") or len(run.events))

    adapter = TradingAgentsRunnerAdapter()
    worker_context = JsonlWorkerContext(run=run, output_dir=output_dir, base_sequence=base_sequence)
    context = worker_context.to_runner_context()

    ticker = payload["ticker"]
    trade_date = payload["tradeDate"]
    selected_analysts = list(payload.get("selectedAnalysts") or ["market"])

    try:
        graph_cls, default_config = adapter._load_tradingagents_symbols()
        run_config = adapter._build_tradingagents_config(request, default_config)
        adapter._hydrate_qwen_runtime_config(request, context, run_config)
        adapter._execute_tradingagents_run(
            request=request,
            context=context,
            run_id=run.runId,
            graph_cls=graph_cls,
            run_config=run_config,
            ticker=ticker,
            trade_date=trade_date,
            selected_analysts=selected_analysts,
        )
        worker_context.write_result()
        return 0
    except Exception as exc:
        adapter._mark_run_failed(context, run.runId, request, ticker, trade_date, exc)
        worker_context.write_result()
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
