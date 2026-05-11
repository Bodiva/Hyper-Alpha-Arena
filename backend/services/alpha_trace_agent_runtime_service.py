from __future__ import annotations

from datetime import datetime, timezone
import os
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from schemas.alpha_trace_agent_runtime import (
    AgentDecision,
    AgentParticipant,
    AgentReport,
    AgentRun,
    AgentRuntimeEvent,
    AgentRunnerConfig,
    CreateDemoAgentRunRequest,
    DecisionTrace,
    DecisionTraceStep,
    EvidenceReference,
    RuntimeMetrics,
    SubmitAgentRunRequest,
    SubmitAgentRunResponse,
    ToolCall,
)
from schemas.research_workspace_taxonomy import resolve_research_artifact_type, resolve_research_run_type
from services.agent_runtime_status_machine import can_transition_status, is_terminal_status
from services.agent_runtime_health import find_stale_agent_runs
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
        artifactType="asset_research_report",
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

_TRACE_STEP_ORDER = (
    "evidence_retrieval",
    "market_view",
    "bull_view",
    "bear_view",
    "research_manager",
    "risk_review",
    "final_decision",
)

_TRACE_STEP_TITLE = {
    "evidence_retrieval": "证据准备",
    "market_view": "市场环境",
    "bull_view": "正方论证",
    "bear_view": "反方约束",
    "research_manager": "分歧收敛",
    "risk_review": "风险复核",
    "final_decision": "配置观察",
}

_TRACE_STEP_AGENT = {
    "evidence_retrieval": "证据检索",
    "market_view": "市场环境分析师",
    "bull_view": "正方研究员",
    "bear_view": "反方研究员",
    "research_manager": "研究经理",
    "risk_review": "风险复核员",
    "final_decision": "配置观察员",
}

_TRACE_STEP_REPORT_TITLE = {
    "market_view": "市场环境报告",
    "bull_view": "正方观点报告",
    "bear_view": "反方风险报告",
    "research_manager": "研究汇总报告",
    "risk_review": "风险复核报告",
    "final_decision": "配置观察记录",
}

_MAX_SYNTHETIC_REPORT_CHARS = 12_000
_MAX_TRACE_SUMMARY_CHARS = 280


def _is_alphatrace_mysql_profile() -> bool:
    return os.getenv("ALPHA_TRACE_DOMAIN_STORE", "").strip().lower() == "mysql"


def _read_mysql_llm_config() -> Dict[str, Any]:
    """Read AlphaTrace model config from MySQL without falling back to legacy PostgreSQL profiles."""
    from services.ai_decision_service import detect_api_format
    from services.research_ai_llm_providers import get_provider
    from services.system_config_store import get_mysql_system_config_store

    config = get_mysql_system_config_store().get_llm_config()
    provider_name = str(config.get("provider") or "").strip()
    if not config.get("configured") or not provider_name:
        return {"configured": False, "source": "mysql_system_config"}

    provider = get_provider(provider_name)
    base_url = str(config.get("base_url") or (provider.base_url if provider else "") or "")
    model = str(config.get("model") or ((provider.models[0] if provider and provider.models else "") or ""))
    if provider_name == "custom" and base_url:
        _, api_format = detect_api_format(base_url)
        api_format = api_format or "openai"
    else:
        api_format = provider.api_format if provider else "openai"

    api_key = config.get("api_key")
    return {
        "configured": True,
        "provider": provider_name,
        "base_url": base_url,
        "model": model,
        "api_key": api_key,
        "api_key_available": bool(api_key),
        "api_format": api_format,
        "source": "mysql_system_config",
    }


def _seed_demo_run() -> None:
    if not _STORE.get_run(DEMO_RUN_ID):
        _STORE.save_run(_DEMO_RUNS[DEMO_RUN_ID])
        _STORE.save_evidence(DEMO_RUN_ID, _DEMO_EVIDENCE)


_seed_demo_run()


def _save_agent_run(run: AgentRun) -> None:
    _STORE.save_run(run)


def _request_with_research_run_type(request: SubmitAgentRunRequest) -> SubmitAgentRunRequest:
    resolved = resolve_research_run_type(request.taskType, request.researchRunType)
    if request.researchRunType == resolved:
        return request
    return request.model_copy(update={"researchRunType": resolved})


def _response_with_research_run_type(
    response: SubmitAgentRunResponse,
    request: SubmitAgentRunRequest,
) -> SubmitAgentRunResponse:
    resolved = resolve_research_run_type(response.run.taskType or request.taskType, request.researchRunType)
    if response.run.researchRunType == resolved:
        return response
    run = response.run.model_copy(update={"researchRunType": resolved})
    _save_agent_run(run)
    return response.model_copy(update={"run": run})


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


def _cleanup_stale_running_qwen_runs() -> None:
    older_than_minutes = _int_env("QWEN_STALE_RUN_MINUTES", 120, minimum=10, maximum=1440)
    try:
        stale_runs = find_stale_agent_runs(_STORE.list_runs(), older_than_minutes=older_than_minutes)
    except Exception:
        return

    timestamp = _now_iso()
    for stale in stale_runs:
        if stale.triggered_by not in {"qwen_runner", "qwen", "alphatrace_native"}:
            continue
        run = _STORE.get_run(stale.run_id)
        if not run or is_terminal_status(run.status):
            continue
        sequence = max([event.sequence for event in get_agent_run_events(stale.run_id)] or [0]) + 1
        try:
            _append_agent_run_event(
                stale.run_id,
                AgentRuntimeEvent(
                    eventId=f"{stale.run_id}_stale_failed_{sequence}_{timestamp.replace(':', '').replace('+', '_')}",
                    runId=stale.run_id,
                    type="agent.run.failed",
                    timestamp=timestamp,
                    sequence=sequence,
                    payload={
                    "message": "Stale research AgentRun was marked failed before submitting a new run.",
                        "reason": "backend_restart_or_worker_lost",
                        "olderThanMinutes": older_than_minutes,
                        "ageMinutes": stale.age_minutes,
                        "lastUpdateAgeMinutes": stale.last_update_age_minutes,
                    },
                ),
            )
        except Exception:
            pass
        _update_agent_run_status(stale.run_id, "failed", timestamp)


def _int_env(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(str(os.getenv(name, default)).strip())
    except (TypeError, ValueError):
        value = default
    return max(minimum, min(maximum, value))


def _prepare_research_workspace_request(
    request: SubmitAgentRunRequest,
) -> tuple[SubmitAgentRunRequest, Optional[Dict[str, str]]]:
    extra = dict(request.runnerConfig.extraParams or {})
    should_bind = bool(extra.get("workspaceId")) or extra.get("source") == "research_assistant_lab" or request.strategyId == "research_assistant_lab"
    if not should_bind:
        return request, None

    try:
        from services.research_workspace_service import get_research_workspace_store

        store = get_research_workspace_store()
        workspace_id = str(extra.get("workspaceId") or "").strip()
        workspace = None
        if workspace_id and workspace_id.lower() != "auto":
            snapshot = store.snapshot(workspace_id)
            workspace = snapshot["workspace"] if snapshot else None
        if not workspace:
            workspace = store.ensure_workspace(
                asset_id=request.assetId,
                portfolio_id=request.portfolioId,
                strategy_id=request.strategyId,
                name=extra.get("workspaceName"),
            )
        workspace_id = str(workspace["workspaceId"])
        thread_id = str(extra.get("workspaceThreadId") or extra.get("threadId") or "").strip() or None
        thread = store.get_or_create_thread(workspace_id, thread_id=thread_id, title=extra.get("workspaceThreadTitle") or "投研助手会话")
        thread_id = str(thread["threadId"])
        workspace_context = store.build_context(workspace_id, thread_id=thread_id, asset_id=request.assetId)
        extra.update(
            {
                "workspaceId": workspace_id,
                "workspaceThreadId": thread_id,
                "workspaceContext": workspace_context,
            }
        )
        runner_config = request.runnerConfig.model_copy(update={"extraParams": extra})
        return request.model_copy(update={"runnerConfig": runner_config}), {"workspaceId": workspace_id, "threadId": thread_id}
    except Exception:
        # Workspace persistence must not block AgentRun submission.
        return request, None


def _record_research_workspace_run_submitted(
    binding: Optional[Dict[str, str]],
    request: SubmitAgentRunRequest,
    response: SubmitAgentRunResponse,
) -> None:
    if not binding:
        return
    try:
        from services.research_workspace_service import get_research_workspace_store

        get_research_workspace_store().record_run_submitted(
            binding["workspaceId"],
            binding.get("threadId"),
            response.runId,
            request,
        )
    except Exception:
        return


def _record_research_workspace_run_outputs(
    binding: Optional[Dict[str, str]],
    run_id: str,
    reports: List[AgentReport],
    evidence: List[EvidenceReference],
    decision: AgentDecision,
) -> None:
    if not binding:
        return
    try:
        from services.research_workspace_service import get_research_workspace_store

        get_research_workspace_store().record_run_outputs(
            binding["workspaceId"],
            binding.get("threadId"),
            get_agent_run(run_id),
            reports,
            evidence,
            decision,
        )
    except Exception:
        return


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
    page_loader = getattr(_STORE, "list_runs_page", None)
    if callable(page_loader):
        runs, total = page_loader(
            asset_id=asset_id,
            portfolio_id=portfolio_id,
            strategy_id=strategy_id,
            status=status,
            task_type=task_type,
            limit=limit,
            offset=offset,
        )
        return [_compact_agent_run_for_list(run) for run in runs], total

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

    runs = sorted(runs, key=_agent_run_sort_timestamp, reverse=True)
    total = len(runs)
    return [_compact_agent_run_for_list(run) for run in runs[offset : offset + limit]], total


def _agent_run_sort_timestamp(run: AgentRun) -> str:
    return run.updatedAt or run.completedAt or run.startedAt or ""


def _compact_agent_run_for_list(run: AgentRun) -> AgentRun:
    return run.model_copy(update={"toolCalls": [], "reports": [], "events": []})


def _string_list(value: Any) -> List[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if item is not None and str(item).strip()]


def _unique_strings(values: List[str]) -> List[str]:
    seen: set[str] = set()
    result: List[str] = []
    for value in values:
        normalized = str(value).strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        result.append(normalized)
    return result


def _compact_text(value: str, limit: int = _MAX_TRACE_SUMMARY_CHARS) -> str:
    compact = " ".join((value or "").split())
    if len(compact) <= limit:
        return compact
    return f"{compact[:limit].rstrip()}..."


def _latest_event_timestamp(events: List[AgentRuntimeEvent], fallback: Optional[str] = None) -> str:
    if events:
        return events[-1].timestamp
    return fallback or _now_iso()


def _evidence_reference_from_event_item(item: Any) -> Optional[EvidenceReference]:
    if not isinstance(item, dict):
        return None
    evidence_id = str(item.get("evidenceId") or item.get("id") or "").strip()
    if not evidence_id:
        return None
    return EvidenceReference(
        evidenceId=evidence_id,
        title=str(item.get("title") or evidence_id),
        evidenceType=str(item.get("evidenceType") or "runtime_context"),
        sourceName=str(item.get("sourceName") or item.get("source") or "Agent Runtime Event"),
        sourceType=item.get("sourceType"),
        sourceApiName=item.get("sourceApiName"),
        snapshotId=item.get("snapshotId") or evidence_id,
        snapshotCapturedAt=item.get("snapshotCapturedAt") or item.get("publishedAt"),
        qualityScore=int(item.get("qualityScore") or 70),
        summary=str(item.get("summary") or ""),
        reliabilityScore=item.get("reliabilityScore"),
        url=item.get("url"),
        publishedAt=item.get("publishedAt"),
        collectedAt=item.get("collectedAt"),
        relatedAssetIds=_string_list(item.get("relatedAssetIds")),
        extractedFields=item.get("extractedFields") if isinstance(item.get("extractedFields"), dict) else {},
    )


def _extract_event_evidence(events: List[AgentRuntimeEvent]) -> List[EvidenceReference]:
    by_id: Dict[str, EvidenceReference] = {}
    for event in events:
        payload = event.payload or {}
        candidates: List[Any] = []
        if isinstance(payload.get("evidence"), list):
            candidates.extend(payload["evidence"])
        result = payload.get("result")
        if isinstance(result, dict) and isinstance(result.get("evidence"), list):
            candidates.extend(result["evidence"])
        for candidate in candidates:
            evidence = _evidence_reference_from_event_item(candidate)
            if evidence and evidence.evidenceId not in by_id:
                by_id[evidence.evidenceId] = evidence
    return list(by_id.values())


def _extract_event_evidence_ids(events: List[AgentRuntimeEvent], evidence: List[EvidenceReference]) -> List[str]:
    ids = [item.evidenceId for item in evidence]
    for event in events:
        payload = event.payload or {}
        ids.extend(_string_list(payload.get("evidenceIds")))
        result = payload.get("result")
        if isinstance(result, dict):
            ids.extend(_string_list(result.get("evidenceIds")))
    return _unique_strings(ids)


def _event_step_id(event: AgentRuntimeEvent) -> Optional[str]:
    step_id = event.payload.get("stepId") if event.payload else None
    if isinstance(step_id, str) and step_id.strip():
        return step_id.strip()
    return None


def _extract_step_content(events: List[AgentRuntimeEvent]) -> Dict[str, str]:
    chunks: Dict[str, List[str]] = {}
    for event in events:
        step_id = _event_step_id(event)
        if not step_id:
            continue
        payload = event.payload or {}
        content = ""
        if event.type in {"reasoning.chunk", "debate.message", "risk.warning"}:
            content = str(payload.get("content") or "")
        elif event.type == "tool.result" and str(payload.get("toolName") or "").startswith("qwen."):
            content = str(payload.get("summary") or "")
        if not content.strip():
            continue
        current = "".join(chunks.get(step_id, []))
        if len(current) >= _MAX_SYNTHETIC_REPORT_CHARS:
            continue
        chunks.setdefault(step_id, []).append(content[: max(0, _MAX_SYNTHETIC_REPORT_CHARS - len(current))])
    return {step_id: "".join(parts).strip() for step_id, parts in chunks.items() if "".join(parts).strip()}


def _extract_step_evidence_ids(events: List[AgentRuntimeEvent]) -> Dict[str, List[str]]:
    by_step: Dict[str, List[str]] = {}
    for event in events:
        step_id = _event_step_id(event)
        if not step_id:
            continue
        payload = event.payload or {}
        ids = _string_list(payload.get("evidenceIds"))
        result = payload.get("result")
        if isinstance(result, dict):
            ids.extend(_string_list(result.get("evidenceIds")))
        if ids:
            by_step[step_id] = _unique_strings([*by_step.get(step_id, []), *ids])
    return by_step


def _synthesize_reports_from_events(run: AgentRun, events: List[AgentRuntimeEvent]) -> List[AgentReport]:
    content_by_step = _extract_step_content(events)
    generated_by_step: Dict[str, AgentRuntimeEvent] = {}
    for event in events:
        if event.type != "report.generated":
            continue
        step_id = _event_step_id(event)
        if step_id:
            generated_by_step[step_id] = event

    reports: List[AgentReport] = []
    report_steps = [step for step in _TRACE_STEP_ORDER if step != "evidence_retrieval"]
    for step_id in report_steps:
        content = content_by_step.get(step_id, "").strip()
        generated = generated_by_step.get(step_id)
        if not content and not generated:
            continue
        title = str((generated.payload or {}).get("title") or _TRACE_STEP_REPORT_TITLE.get(step_id) or step_id) if generated else _TRACE_STEP_REPORT_TITLE.get(step_id, step_id)
        report_id = str((generated.payload or {}).get("reportId") or f"partial_{run.runId}_{step_id}") if generated else f"partial_{run.runId}_{step_id}"
        reports.append(
            AgentReport(
                reportId=report_id,
                runId=run.runId,
                agentName=(generated.agentName if generated else None) or _TRACE_STEP_AGENT.get(step_id, "投研 Agent"),
                title=title,
                summary=content or "任务中断前已产生报告事件，但未保存完整报告正文。请结合运行事件流复盘。",
                createdAt=(generated.timestamp if generated else _latest_event_timestamp(events, run.updatedAt)),
                artifactType=resolve_research_artifact_type(
                    report_slug=step_id,
                    title=title,
                    research_run_type=run.researchRunType,
                ),
            )
        )
    return reports


def _infer_report_step_id(report: AgentReport) -> Optional[str]:
    raw = " ".join(
        [
            str(getattr(report, "reportId", "") or ""),
            str(getattr(report, "title", "") or ""),
            str(getattr(report, "agentName", "") or ""),
        ]
    )
    text = raw.lower().replace(" ", "_")
    matchers = (
        ("market_view", ("market_view", "market", "市场环境", "市场分析", "行情环境")),
        ("bull_view", ("bull_view", "bull", "正方", "看多", "机会论证")),
        ("bear_view", ("bear_view", "bear", "反方", "看空", "风险约束")),
        ("research_manager", ("research_manager", "manager", "研究经理", "研究汇总", "分歧收敛")),
        ("risk_review", ("risk_review", "risk", "风险复核", "风险")),
        ("final_decision", ("final_decision", "final", "最终决策", "配置观察", "配置建议")),
    )
    for step_id, keywords in matchers:
        if any(keyword in text for keyword in keywords):
            return step_id
    return None


def _fallback_trace_summary(run: AgentRun, step_id: str, report: Optional[AgentReport]) -> str:
    if report and report.summary:
        return _compact_text(report.summary)
    final_decision = getattr(run, "finalDecision", None)
    if step_id == "final_decision" and final_decision:
        return _compact_text(getattr(final_decision, "summary", "") or getattr(final_decision, "thesis", ""))
    if run.status in {"completed", "partially_completed"}:
        return "该步骤已完成，但未保存完整正文；请结合报告和事件流复核。"
    return "该步骤尚未形成可展示输出。"


def _synthesize_decision_trace_from_events(
    run: AgentRun,
    events: List[AgentRuntimeEvent],
    reports: List[AgentReport],
    evidence_ids: List[str],
) -> Optional[DecisionTrace]:
    if not events and not reports and not evidence_ids:
        return None

    content_by_step = _extract_step_content(events)
    step_evidence = _extract_step_evidence_ids(events)
    completed_steps = {
        step_id
        for event in events
        if event.type == "agent.completed" and (step_id := _event_step_id(event))
    }
    report_by_step: Dict[str, AgentReport] = {}
    for report in reports:
        inferred_step_id = _infer_report_step_id(report)
        if inferred_step_id:
            report_by_step[inferred_step_id] = report

    steps: List[DecisionTraceStep] = []
    for step_id in _TRACE_STEP_ORDER:
        report = report_by_step.get(step_id)
        content = content_by_step.get(step_id, "")
        has_output = bool(report or content or step_evidence.get(step_id))
        if step_id in completed_steps or report:
            status = "completed"
        elif has_output:
            status = "needs_review"
        elif run.status == "completed":
            status = "needs_review"
        else:
            status = "pending"
        if step_id == "evidence_retrieval" and evidence_ids:
            summary = f"运行事件中已恢复 {len(evidence_ids)} 条证据引用。"
            status = "completed"
        else:
            summary = _compact_text(content or (report.summary if report else ""))
        if not summary:
            summary = _fallback_trace_summary(run, step_id, report)
        steps.append(
            DecisionTraceStep(
                stepId=step_id,
                title=_TRACE_STEP_TITLE.get(step_id, step_id),
                agentName=_TRACE_STEP_AGENT.get(step_id),
                artifactIds=[f"artifact_{report.reportId}"] if report else [],
                evidenceIds=step_evidence.get(step_id, evidence_ids if step_id == "evidence_retrieval" else []),
                summary=summary,
                status=status,
            )
        )

    artifact_ids = [f"artifact_{report.reportId}" for report in reports]
    interrupted = run.status in {"cancelled", "failed", "partially_completed"}
    conclusion = (
        "任务未完整完成，以下为运行事件中恢复的阶段性投研链路，需重新运行或人工复核后才能作为正式结论。"
        if interrupted
        else (run.finalDecision.summary or run.finalDecision.thesis)
    )
    support_summary = _compact_text(
        " ".join(
            filter(
                None,
                [
                    content_by_step.get("market_view", ""),
                    content_by_step.get("bull_view", ""),
                    content_by_step.get("research_manager", ""),
                    report_by_step.get("market_view").summary if report_by_step.get("market_view") else "",
                    report_by_step.get("bull_view").summary if report_by_step.get("bull_view") else "",
                    report_by_step.get("research_manager").summary if report_by_step.get("research_manager") else "",
                ],
            )
        ),
        420,
    )
    risk_summary = _compact_text(
        " ".join(
            filter(
                None,
                [
                    content_by_step.get("bear_view", ""),
                    content_by_step.get("risk_review", ""),
                    report_by_step.get("bear_view").summary if report_by_step.get("bear_view") else "",
                    report_by_step.get("risk_review").summary if report_by_step.get("risk_review") else "",
                ],
            )
        ),
        420,
    )
    return DecisionTrace(
        traceId=f"trace_{run.runId}_recovered",
        runId=run.runId,
        researchRunType=run.researchRunType,
        artifactIds=artifact_ids,
        evidenceIds=evidence_ids,
        conclusion=conclusion,
        supportSummary=support_summary or "运行中断前尚未形成完整支持摘要。",
        riskSummary=risk_summary or "运行中断前尚未形成完整风险摘要。",
        openQuestions=(
            ["重新运行任务以完成未结束的 Agent 步骤。", "人工复核已恢复的证据和阶段性报告是否足够支撑正式判断。"]
            if interrupted
            else []
        ),
        reviewStatus="needs_revision" if interrupted else "pending",
        steps=steps,
        createdAt=_latest_event_timestamp(events, run.updatedAt or run.completedAt or run.startedAt),
    )


def _hydrate_agent_run_from_events(run: AgentRun) -> AgentRun:
    events = run.events or _STORE.get_events(run.runId)
    stored_reports = run.reports or _STORE.get_reports(run.runId)
    stored_evidence = _STORE.get_evidence(run.runId)
    evidence = stored_evidence or _extract_event_evidence(events)
    evidence_ids = _unique_strings([*run.evidenceIds, *_extract_event_evidence_ids(events, evidence)])
    reports = stored_reports or _synthesize_reports_from_events(run, events)
    decision_trace = run.decisionTrace or _synthesize_decision_trace_from_events(run, events, reports, evidence_ids)
    generated_reports = max(run.metrics.generatedReports, len(reports))
    metrics = run.metrics.model_copy(update={"generatedReports": generated_reports})
    return run.model_copy(
        update={
            "events": events,
            "reports": reports,
            "evidenceIds": evidence_ids,
            "decisionTrace": decision_trace,
            "metrics": metrics,
        }
    )


def get_agent_run(run_id: str) -> Optional[AgentRun]:
    run = _STORE.get_run(run_id)
    return _hydrate_agent_run_from_events(run) if run else None


def get_agent_run_events(run_id: str) -> List[AgentRuntimeEvent]:
    return _STORE.get_events(run_id)


def get_agent_run_reports(run_id: str) -> List[AgentReport]:
    run = _STORE.get_run(run_id)
    if not run:
        return []
    reports = _STORE.get_reports(run_id)
    return reports or _synthesize_reports_from_events(run, run.events or _STORE.get_events(run_id))


def get_agent_run_evidence(run_id: str) -> List[EvidenceReference]:
    evidence = _STORE.get_evidence(run_id)
    if evidence:
        return evidence
    run = _STORE.get_run(run_id)
    return _extract_event_evidence(run.events or _STORE.get_events(run_id)) if run else []


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
    request = _request_with_research_run_type(request)
    request, workspace_binding = _prepare_research_workspace_request(request)
    if (request.runnerConfig.runnerType or "").lower() in {"qwen", "alphatrace_native"}:
        _cleanup_stale_running_qwen_runs()

    def read_scoped_llm_config():
        if _is_alphatrace_mysql_profile():
            return _read_mysql_llm_config()
        if db is None:
            return {"configured": False}
        if (request.runnerConfig.extraParams or {}).get("llmConfigScope") == "research_ai":
            from services.research_ai_service import get_llm_config
        else:
            from services.hyper_ai_service import get_llm_config

        return get_llm_config(db)

    def update_outputs_with_workspace(
        run_id: str,
        reports: List[AgentReport],
        evidence: List[EvidenceReference],
        decision: AgentDecision,
        llm_calls: Optional[int] = None,
    ) -> None:
        _update_agent_run_outputs(run_id, reports, evidence, decision, llm_calls)
        _record_research_workspace_run_outputs(workspace_binding, run_id, reports, evidence, decision)

    context = AgentRunnerContext(
        base_run=get_agent_run(DEMO_RUN_ID) or _DEMO_RUNS[DEMO_RUN_ID],
        base_decision=_DEMO_DECISION,
        copy_runtime_artifacts=_copy_runtime_artifacts,
        save_run=_save_agent_run,
        save_evidence_references=_save_evidence_references,
        get_llm_config=read_scoped_llm_config,
        get_run=get_agent_run,
        append_event=_append_agent_run_event,
        update_run_status=_update_agent_run_status,
        update_run_outputs=update_outputs_with_workspace,
    )
    response = _response_with_research_run_type(_RUNNER_REGISTRY.submit(request, context), request)
    _record_research_workspace_run_submitted(workspace_binding, request, response)
    if workspace_binding and response.run and response.run.finalDecision and is_terminal_status(response.run.status):
        _record_research_workspace_run_outputs(
            workspace_binding,
            response.run.runId,
            response.run.reports or [],
            [],
            response.run.finalDecision,
        )
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
