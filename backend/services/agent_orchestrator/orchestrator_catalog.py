from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Mapping

from services.async_tasks import get_async_task_store_type
from services.agent_orchestrator.subprocess_orchestrator import get_subprocess_worker_registry_snapshot


@dataclass(frozen=True)
class OrchestratorDescriptor:
    """Product-owned execution/orchestration boundary descriptor."""

    orchestrator_id: str
    display_name: str
    status: str
    execution_boundary: str
    durable_state: str
    supported_runners: tuple[str, ...]
    supports_cancel: bool
    supports_retry: bool
    supports_streaming_events: bool
    production_ready: bool
    notes: str = ""
    metadata: Mapping[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def list_orchestrator_descriptors() -> dict[str, Any]:
    """Return safe orchestrator/scheduler diagnostics for AlphaTrace."""

    task_store_type = get_async_task_store_type()
    worker_snapshot = get_subprocess_worker_registry_snapshot()
    active_worker_count = int(worker_snapshot.get("activeCount") or 0)

    items = [
        OrchestratorDescriptor(
            orchestrator_id="inline_background_thread",
            display_name="Inline Background Thread Runner",
            status="active",
            execution_boundary="same_process_thread",
            durable_state="agent_run_store",
            supported_runners=("qwen", "stub", "alphatrace_native"),
            supports_cancel=False,
            supports_retry=True,
            supports_streaming_events=True,
            production_ready=False,
            notes="Current MVP execution path. Simple and low-latency, but not isolated from backend process lifecycle.",
        ),
        OrchestratorDescriptor(
            orchestrator_id="in_process_async_scheduler",
            display_name="In-Process Async Task Scheduler",
            status="available",
            execution_boundary="same_process_thread_pool",
            durable_state=task_store_type,
            supported_runners=("future_qwen", "future_alphatrace_native", "future_tradingagents"),
            supports_cancel=True,
            supports_retry=True,
            supports_streaming_events=False,
            production_ready=False,
            notes="Additive scheduler boundary for task snapshots and future controlled execution. Not yet the primary submit path.",
            metadata={"taskStoreType": task_store_type},
        ),
        OrchestratorDescriptor(
            orchestrator_id="subprocess_worker",
            display_name="Subprocess Worker Boundary",
            status="active" if active_worker_count else "available",
            execution_boundary="local_subprocess",
            durable_state="worker_artifact_files_plus_agent_run_store",
            supported_runners=("alphatrace_native", "future_tradingagents"),
            supports_cancel=True,
            supports_retry=False,
            supports_streaming_events=True,
            production_ready=False,
            notes="Useful for isolating long-running LangGraph/TradingAgents style work without making it the main backend thread.",
            metadata={"activeWorkerCount": active_worker_count, "workerSnapshot": worker_snapshot},
        ),
        OrchestratorDescriptor(
            orchestrator_id="tradingagents_langgraph_runtime",
            display_name="TradingAgents LangGraph Runtime",
            status="poc_opt_in",
            execution_boundary="external_library_in_process_or_subprocess",
            durable_state="alpha_trace_agent_run_store_only",
            supported_runners=("tradingagents",),
            supports_cancel=False,
            supports_retry=False,
            supports_streaming_events=False,
            production_ready=False,
            notes=(
                "TradingAgents internal checkpoint/state is runner-private. AlphaTrace persists normalized events, reports, evidence and decisions."
            ),
        ),
        OrchestratorDescriptor(
            orchestrator_id="langalpha_external_service",
            display_name="LangAlpha External Workbench Service",
            status="design_only",
            execution_boundary="external_service",
            durable_state="alpha_trace_projection_plus_external_workspace",
            supported_runners=("future_langalpha_external_adapter",),
            supports_cancel=True,
            supports_retry=True,
            supports_streaming_events=True,
            production_ready=False,
            notes="Candidate for future service adapter. Do not import or expose LangAlpha internal workspace state directly.",
        ),
    ]

    return {
        "version": 1,
        "orchestrators": [item.to_dict() for item in items],
        "summary": {
            "total": len(items),
            "active": sum(1 for item in items if item.status == "active"),
            "available": sum(1 for item in items if item.status in {"active", "available"}),
            "productionReady": sum(1 for item in items if item.production_ready),
        },
    }


__all__ = ["OrchestratorDescriptor", "list_orchestrator_descriptors"]
