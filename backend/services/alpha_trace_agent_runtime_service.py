from __future__ import annotations

from datetime import datetime, timezone
import os
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from schemas.alpha_trace_agent_runtime import (
    AgentDecision,
    AgentParticipant,
    AgentReport,
    AgentRun,
    AgentRuntimeEvent,
    AgentRunnerConfig,
    CreateDemoAgentRunRequest,
    EvidenceReference,
    RuntimeMetrics,
    SubmitAgentRunRequest,
    SubmitAgentRunResponse,
    ToolCall,
)
from services.agent_runtime_status_machine import can_transition_status, is_terminal_status
from services.agent_runtime_store.registry import get_agent_run_store
from services.agent_artifacts import evidence_list_to_web_artifacts, get_agent_artifact_store
from services.agent_orchestrator.task_spec_factory import build_agent_run_task_spec
from services.agent_orchestrator.subprocess_orchestrator import cancel_subprocess_worker
from services.agent_runners.base import AgentRunnerContext
from services.agent_runners.langalpha_adapter import LangAlphaAdapter
from services.agent_runners.native_multi_agent_runner import AlphaTraceNativeRunnerAdapter
from services.agent_runners.registry import AgentRunnerRegistry
from services.agent_runners.qwen_runner import QwenRunnerAdapter
from services.agent_runners.stub_runner import StubAgentRunnerAdapter
from services.agent_runners.tradingagents_adapter import TradingAgentsAdapter
from services.async_tasks import get_async_task_store_type, get_mysql_async_task_store

DEMO_RUN_ID = "demo-run-001"

_DEMO_AGENTS = [
    AgentParticipant(agentId="agent-market-001", name="Market Analyst", role="market_analyst", team="analyst_team", status="completed"),
    AgentParticipant(agentId="agent-research-001", name="Research Manager", role="research_manager", team="research_team", status="completed"),
    AgentParticipant(agentId="agent-risk-001", name="Risk Analyst", role="risk_analyst", team="risk_team", status="completed"),
    AgentParticipant(agentId="agent-pm-001", name="Portfolio Manager", role="portfolio_manager", team="portfolio_team", status="completed"),
]

_DEMO_EVENTS = [
    AgentRuntimeEvent(
        eventId="evt-demo-001",
        runId=DEMO_RUN_ID,
        type="agent.run.started",
        timestamp="2026-04-27T09:30:00+08:00",
        sequence=1,
        payload={"source": "alpha_trace_stub"},
    ),
    AgentRuntimeEvent(
        eventId="evt-demo-002",
        runId=DEMO_RUN_ID,
        type="agent.started",
        timestamp="2026-04-27T09:30:08+08:00",
        sequence=2,
        agentName="Market Analyst",
        team="analyst_team",
        payload={},
    ),
    AgentRuntimeEvent(
        eventId="evt-demo-003",
        runId=DEMO_RUN_ID,
        type="tool.called",
        timestamp="2026-04-27T09:31:12+08:00",
        sequence=3,
        agentName="Market Analyst",
        team="analyst_team",
        payload={"toolName": "market_snapshot.fetch", "args": {"assetId": "asset_etf_510300"}},
    ),
    AgentRuntimeEvent(
        eventId="evt-demo-004",
        runId=DEMO_RUN_ID,
        type="tool.result",
        timestamp="2026-04-27T09:31:18+08:00",
        sequence=4,
        agentName="Market Analyst",
        team="analyst_team",
        payload={"toolName": "market_snapshot.fetch", "summary": "Market breadth and liquidity snapshot loaded.", "evidenceIds": ["ev_stub_snapshot_001"]},
    ),
    AgentRuntimeEvent(
        eventId="evt-demo-005",
        runId=DEMO_RUN_ID,
        type="reasoning.chunk",
        timestamp="2026-04-27T09:32:05+08:00",
        sequence=5,
        agentName="Research Manager",
        team="research_team",
        payload={"content": "Evidence supports a moderate allocation view with explicit drawdown guardrails."},
    ),
    AgentRuntimeEvent(
        eventId="evt-demo-006",
        runId=DEMO_RUN_ID,
        type="risk.warning",
        timestamp="2026-04-27T09:33:22+08:00",
        sequence=6,
        agentName="Risk Analyst",
        team="risk_team",
        payload={"level": "MEDIUM", "content": "Monitor liquidity and single-asset concentration before implementation."},
    ),
    AgentRuntimeEvent(
        eventId="evt-demo-007",
        runId=DEMO_RUN_ID,
        type="report.generated",
        timestamp="2026-04-27T09:35:00+08:00",
        sequence=7,
        agentName="Portfolio Manager",
        team="portfolio_team",
        payload={"reportId": "report-demo-001", "title": "Demo Allocation Review"},
    ),
    AgentRuntimeEvent(
        eventId="evt-demo-008",
        runId=DEMO_RUN_ID,
        type="decision.updated",
        timestamp="2026-04-27T09:35:20+08:00",
        sequence=8,
        agentName="Portfolio Manager",
        team="portfolio_team",
        payload={"action": "watch", "confidence": 0.68, "evidenceIds": ["ev_stub_snapshot_001", "ev_stub_macro_001"]},
    ),
    AgentRuntimeEvent(
        eventId="evt-demo-009",
        runId=DEMO_RUN_ID,
        type="checkpoint.created",
        timestamp="2026-04-27T09:35:30+08:00",
        sequence=9,
        payload={"checkpointId": "checkpoint-demo-final", "label": "Demo final decision checkpoint"},
    ),
    AgentRuntimeEvent(
        eventId="evt-demo-010",
        runId=DEMO_RUN_ID,
        type="agent.run.completed",
        timestamp="2026-04-27T09:36:00+08:00",
        sequence=10,
        payload={},
    ),
]

_DEMO_TOOL_CALLS = [
    ToolCall(
        callId="tool-demo-001",
        runId=DEMO_RUN_ID,
        agentName="Market Analyst",
        toolName="market_snapshot.fetch",
        args={"assetId": "asset_etf_510300"},
        status="completed",
        startedAt="2026-04-27T09:31:12+08:00",
        completedAt="2026-04-27T09:31:18+08:00",
        summary="Market breadth and liquidity snapshot loaded.",
        evidenceIds=["ev_stub_snapshot_001"],
    )
]

_DEMO_REPORTS = [
    AgentReport(
        reportId="report-demo-001",
        runId=DEMO_RUN_ID,
        agentName="Portfolio Manager",
        title="Demo Allocation Review",
        summary="Stub report for AlphaTrace runtime API contract validation. No real LLM or TradingAgents backend is called.",
        createdAt="2026-04-27T09:35:00+08:00",
    )
]

_DEMO_EVIDENCE = [
    EvidenceReference(
        evidenceId="ev_stub_snapshot_001",
        title="ETF market snapshot stub",
        evidenceType="market_snapshot",
        sourceName="AlphaTrace Stub Data",
        qualityScore=86,
        summary="Static market snapshot used only for backend contract validation.",
    ),
    EvidenceReference(
        evidenceId="ev_stub_macro_001",
        title="Macro condition stub",
        evidenceType="macro_data",
        sourceName="AlphaTrace Stub Data",
        qualityScore=82,
        summary="Static macro context used only for backend contract validation.",
    ),
]

_DEMO_DECISION = AgentDecision(
    action="watch",
    horizon="medium_term",
    confidence=0.68,
    summary="Keep the target asset under observation until evidence confidence improves.",
    thesis="Stub decision generated from static AlphaTrace contract data. It is not an executable recommendation.",
    risks=["Stub data only", "No real model or TradingAgents process has been executed"],
    evidenceIds=["ev_stub_snapshot_001", "ev_stub_macro_001"],
    triggerConditions=["Evidence quality remains above threshold", "Risk budget remains available"],
    invalidationConditions=["Liquidity score deteriorates", "Macro signal turns adverse"],
    observationIndicators=["Liquidity", "Volatility", "Evidence score"],
)

_DEMO_RUNS: Dict[str, AgentRun] = {
    DEMO_RUN_ID: AgentRun(
        runId=DEMO_RUN_ID,
        name="AlphaTrace Demo Agent Run",
        target="CSI 300 ETF demo analysis",
        taskType="single_asset_analysis",
        riskLevel="medium",
        status="completed",
        assetIds=["asset_etf_510300"],
        portfolioId="portfolio_etf_core_001",
        strategyId="strategy_etf_rotation_001",
        triggeredBy="backend_stub",
        modelName="stub-runtime-v1",
        startedAt="2026-04-27T09:30:00+08:00",
        updatedAt="2026-04-27T09:36:00+08:00",
        completedAt="2026-04-27T09:36:00+08:00",
        agents=_DEMO_AGENTS,
        toolCalls=_DEMO_TOOL_CALLS,
        reports=_DEMO_REPORTS,
        events=_DEMO_EVENTS,
        evidenceIds=["ev_stub_snapshot_001", "ev_stub_macro_001"],
        finalDecision=_DEMO_DECISION,
        metrics=RuntimeMetrics(llmCalls=0, toolCalls=1, generatedReports=1, durationSeconds=360, estimatedCostUsd=0.0),
    )
}

_RUNNER_REGISTRY = AgentRunnerRegistry()
_RUNNER_REGISTRY.register_runner(StubAgentRunnerAdapter())
_RUNNER_REGISTRY.register_runner(QwenRunnerAdapter())
_RUNNER_REGISTRY.register_runner(AlphaTraceNativeRunnerAdapter())
_RUNNER_REGISTRY.register_runner(TradingAgentsAdapter())
_RUNNER_REGISTRY.register_runner(LangAlphaAdapter())
_STORE = get_agent_run_store()


def _seed_demo_run() -> None:
    if not _STORE.get_run(DEMO_RUN_ID):
        _STORE.save_run(_DEMO_RUNS[DEMO_RUN_ID])
        _STORE.save_evidence(DEMO_RUN_ID, _DEMO_EVIDENCE)


_seed_demo_run()


def _save_agent_run(run: AgentRun) -> None:
    _STORE.save_run(run)


def _save_evidence_references(items: List[EvidenceReference]) -> None:
    # Current runners persist evidence through update_run_outputs/save_evidence,
    # which has the run_id needed by the store. This callback remains for
    # backward-compatible runner context wiring.
    return None


def _append_agent_run_event(run_id: str, event: AgentRuntimeEvent) -> None:
    _STORE.append_event(run_id, event)


def _update_agent_run_status(run_id: str, status: str, timestamp: Optional[str] = None) -> None:
    current = _STORE.get_run(run_id)
    if current and not can_transition_status(current.status, status):
        return
    _STORE.update_run_status(run_id, status, timestamp)


def _update_agent_run_outputs(
    run_id: str,
    reports: List[AgentReport],
    evidence: List[EvidenceReference],
    decision: AgentDecision,
    llm_calls: Optional[int] = None,
) -> None:
    _STORE.save_reports(run_id, reports, llm_calls)
    _STORE.save_evidence(run_id, evidence)
    _create_evidence_url_artifacts_if_enabled(run_id, evidence)
    _STORE.save_decision(run_id, decision)


def _create_evidence_url_artifacts_if_enabled(run_id: str, evidence: List[EvidenceReference]) -> None:
    if os.getenv("ALPHATRACE_CREATE_EVIDENCE_URL_ARTIFACTS", "").strip().lower() != "true":
        return
    try:
        artifact_store = get_agent_artifact_store()
        for artifact in evidence_list_to_web_artifacts(run_id, evidence):
            artifact_store.save_artifact(artifact)
    except Exception:
        # Artifact creation must not affect report/evidence/decision persistence.
        return


def list_agent_runs(
    asset_id: Optional[str] = None,
    portfolio_id: Optional[str] = None,
    strategy_id: Optional[str] = None,
    status: Optional[str] = None,
    task_type: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[List[AgentRun], int]:
    runs = _STORE.list_runs()

    if asset_id:
        runs = [run for run in runs if asset_id in run.assetIds]
    if portfolio_id:
        runs = [run for run in runs if run.portfolioId == portfolio_id]
    if strategy_id:
        runs = [run for run in runs if run.strategyId == strategy_id]
    if status:
        runs = [run for run in runs if run.status == status]
    if task_type:
        runs = [run for run in runs if run.taskType == task_type]

    total = len(runs)
    return runs[offset : offset + limit], total


def get_agent_run(run_id: str) -> Optional[AgentRun]:
    return _STORE.get_run(run_id)


def get_agent_run_events(run_id: str) -> List[AgentRuntimeEvent]:
    return _STORE.get_events(run_id)


def get_agent_run_reports(run_id: str) -> List[AgentReport]:
    return _STORE.get_reports(run_id)


def get_agent_run_evidence(run_id: str) -> List[EvidenceReference]:
    return _STORE.get_evidence(run_id)


def get_agent_run_decision(run_id: str) -> Optional[AgentDecision]:
    return _STORE.get_decision(run_id)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def cancel_agent_run(run_id: str) -> Optional[AgentRun]:
    run = get_agent_run(run_id)
    if not run:
        return None
    if is_terminal_status(run.status):
        return run

    timestamp = _now_iso()
    worker_cancel_result = cancel_subprocess_worker(run_id)
    sequence = max([event.sequence for event in get_agent_run_events(run_id)] or [0]) + 1
    _append_agent_run_event(
        run_id,
        AgentRuntimeEvent(
            eventId=f"{run_id}_cancelled_{sequence}",
            runId=run_id,
            type="agent.run.cancelled",
            timestamp=timestamp,
            sequence=sequence,
            payload={
                "message": "Agent run cancellation requested. Subprocess workers are terminated when registered; non-worker runners remain cooperative.",
                "previousStatus": run.status,
                "workerCancellation": worker_cancel_result,
            },
        ),
    )
    _update_agent_run_status(run_id, "cancelled", timestamp)
    return get_agent_run(run_id)


def retry_agent_run(run_id: str, db: Optional[Session] = None) -> Optional[SubmitAgentRunResponse]:
    run = get_agent_run(run_id)
    if not run:
        return None
    if not is_terminal_status(run.status):
        raise ValueError("Only terminal Agent Runs can be retried.")

    if run.triggeredBy in {"stub", "qwen", "qwen_runner", "alphatrace_native", "tradingagents", "langalpha"}:
        runner_type = run.triggeredBy
        if runner_type == "qwen_runner":
            runner_type = "qwen"
    elif "stub" in run.triggeredBy:
        runner_type = "stub"
    else:
        runner_type = "qwen"
    request = SubmitAgentRunRequest(
        assetId=run.assetIds[0] if run.assetIds else None,
        portfolioId=run.portfolioId,
        strategyId=run.strategyId,
        taskType=run.taskType,
        question=f"Retry AgentRun {run.runId}: {run.name}. Target: {run.target}",
        horizon=run.finalDecision.horizon,
        riskPreference="balanced",
        runnerConfig=AgentRunnerConfig(
            runnerType=runner_type,
            modelProvider="qwen" if runner_type in {"qwen", "alphatrace_native"} else "none",
            modelName="qwen-plus" if runner_type in {"qwen", "alphatrace_native"} else (run.modelName or "none"),
            enableStreaming=True,
            extraParams={"retryOfRunId": run.runId},
        ),
    )
    return submit_agent_run(request, db=db)


def _copy_runtime_artifacts(run_id: str, source_label: str) -> tuple[List[ToolCall], List[AgentReport], List[AgentRuntimeEvent]]:
    base_run = get_agent_run(DEMO_RUN_ID) or _DEMO_RUNS[DEMO_RUN_ID]
    tool_calls = [
        call.model_copy(update={"callId": call.callId.replace("tool-demo", f"tool-{run_id}"), "runId": run_id})
        for call in base_run.toolCalls
    ]
    reports = [
        report.model_copy(update={"reportId": report.reportId.replace("report-demo", f"report-{run_id}"), "runId": run_id})
        for report in base_run.reports
    ]
    events = [
        event.model_copy(
            update={
                "eventId": event.eventId.replace(DEMO_RUN_ID, run_id).replace("evt-demo", f"evt-{run_id}"),
                "runId": run_id,
                "payload": {**event.payload, "source": source_label},
            }
        )
        for event in base_run.events
    ]
    return tool_calls, reports, events


def create_demo_agent_run(request: CreateDemoAgentRunRequest) -> AgentRun:
    run_id = f"demo-{request.assetId}"
    base_run = _DEMO_RUNS[DEMO_RUN_ID]
    tool_calls, reports, events = _copy_runtime_artifacts(run_id, "demo_stub")

    demo_run = AgentRun(
        **{
            **base_run.model_dump(),
            "runId": run_id,
            "name": "AlphaTrace Demo Agent Run Request",
            "target": request.assetId,
            "taskType": request.taskType,
            "assetIds": [request.assetId],
            "triggeredBy": "demo_api_request",
            "toolCalls": tool_calls,
            "reports": reports,
            "events": events,
            "finalDecision": AgentDecision(
                **{
                    **_DEMO_DECISION.model_dump(),
                    "summary": "Demo run accepted by stub API. No real LLM or agent runner was invoked.",
                    "thesis": request.question,
                }
            ),
        }
    )
    _save_agent_run(demo_run)
    _STORE.save_evidence(run_id, _DEMO_EVIDENCE)
    return demo_run


def submit_agent_run(request: SubmitAgentRunRequest, db: Optional[Session] = None) -> SubmitAgentRunResponse:
    def read_hyper_ai_llm_config():
        if db is None:
            return {"configured": False}
        from services.hyper_ai_service import get_llm_config

        return get_llm_config(db)

    context = AgentRunnerContext(
        base_run=get_agent_run(DEMO_RUN_ID) or _DEMO_RUNS[DEMO_RUN_ID],
        base_decision=_DEMO_DECISION,
        copy_runtime_artifacts=_copy_runtime_artifacts,
        save_run=_save_agent_run,
        save_evidence_references=_save_evidence_references,
        get_llm_config=read_hyper_ai_llm_config,
        get_run=get_agent_run,
        append_event=_append_agent_run_event,
        update_run_status=_update_agent_run_status,
        update_run_outputs=_update_agent_run_outputs,
    )
    response = _RUNNER_REGISTRY.submit(request, context)
    _record_async_task_snapshot_if_enabled(request, response)
    return response


def _record_async_task_snapshot_if_enabled(request: SubmitAgentRunRequest, response: SubmitAgentRunResponse) -> None:
    """Optionally mirror AgentRun submit into AsyncTaskStore diagnostics.

    This is default-off to avoid changing current runner semantics. It gives the
    MySQL async task table real submit-shaped data during controlled migration.
    """

    if os.getenv("ALPHATRACE_RECORD_ASYNC_TASKS", "").strip().lower() != "true":
        return
    if get_async_task_store_type() != "mysql":
        return
    try:
        spec = build_agent_run_task_spec(request, run_id=response.runId, task_id=f"task_{response.runId}")
        status = str(response.status or "pending").lower()
        if status not in {"pending", "running", "completed", "failed", "cancelled", "timed_out"}:
            status = "pending"
        get_mysql_async_task_store().save_spec(spec, status=status)  # type: ignore[arg-type]
    except Exception:
        # Submit must not fail because additive diagnostics are unavailable.
        return
