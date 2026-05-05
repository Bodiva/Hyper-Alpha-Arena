from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from services.agent_orchestrator.adapter_matrix import get_adapter_composition_matrix
from services.agent_orchestrator.flow_catalog import get_agent_flow_catalog
from services.agent_orchestrator.orchestrator_catalog import list_orchestrator_descriptors
from services.agent_orchestrator.task_spec_catalog import list_task_spec_contracts
from services.agent_artifacts import get_agent_artifact_catalog
from services.agent_tool_registry import list_agent_tool_contracts
from services.backend_module_boundaries import get_backend_module_boundary_catalog
from services.data_api import get_data_api_catalog
from services.model_providers import list_model_provider_descriptors
from services.runtime_config import get_runtime_config_facade


def get_alphatrace_architecture_index(db: Session | None = None) -> dict[str, Any]:
    """Return a concise product-owned backend abstraction index.

    This is a map of AlphaTrace-owned boundaries. It intentionally references
    external projects only by adapter/bridge descriptors, not by exposing their
    internal state.
    """

    runtime_config = get_runtime_config_facade().snapshot(db)
    model_providers = list_model_provider_descriptors(db)
    orchestrators = list_orchestrator_descriptors()
    task_specs = list_task_spec_contracts()
    data_api = get_data_api_catalog().to_response()
    adapter_matrix = get_adapter_composition_matrix().to_response()
    flow_catalog = get_agent_flow_catalog()
    flow_items = [flow.to_dict() for flow in flow_catalog.list_flows()]
    tools = [tool.to_payload() for tool in list_agent_tool_contracts()]
    artifact_catalog = get_agent_artifact_catalog()
    module_boundaries = get_backend_module_boundary_catalog().to_response()

    return {
        "version": 1,
        "layers": [
            {
                "layerId": "api_layer",
                "displayName": "AlphaTrace REST/SSE API Layer",
                "status": "active",
                "contracts": (
                    "/api/alpha-trace/assets",
                    "/api/alpha-trace/evidence",
                    "/api/alpha-trace/agent-runs",
                    "/api/alpha-trace/decisions",
                    "/api/alpha-trace/leaderboard",
                ),
            },
            {
                "layerId": "runtime_config",
                "displayName": "Runtime Config Facade",
                "status": "active",
                "contracts": (
                    "/api/alpha-trace/agent-runs/runtime/config",
                    "/api/alpha-trace/agent-runs/runtime/readiness",
                ),
            },
            {
                "layerId": "module_boundaries",
                "displayName": "Backend Module Boundary Catalog",
                "status": "active",
                "contracts": ("/api/alpha-trace/agent-runs/runtime/module-boundaries",),
            },
            {
                "layerId": "data_api",
                "displayName": "Data API Catalog",
                "status": "active",
                "contracts": ("/api/alpha-trace/data-sources/api-catalog",),
            },
            {
                "layerId": "model_providers",
                "displayName": "Model Provider Catalog",
                "status": "active",
                "contracts": ("/api/alpha-trace/agent-runs/runtime/model-providers",),
            },
            {
                "layerId": "orchestrators",
                "displayName": "Orchestrator and Task Spec Catalogs",
                "status": "active",
                "contracts": (
                    "/api/alpha-trace/agent-runs/runtime/orchestrators",
                    "/api/alpha-trace/agent-runs/runtime/task-specs",
                ),
            },
            {
                "layerId": "runner_adapters",
                "displayName": "Runner Adapter Matrix and Flow Catalog",
                "status": "active",
                "contracts": (
                    "/api/alpha-trace/agent-runs/runners/adapter-matrix",
                    "/api/alpha-trace/agent-runs/runners/flows",
                ),
            },
            {
                "layerId": "tools_artifacts",
                "displayName": "Tool Contracts and Agent Artifacts",
                "status": "active",
                "contracts": (
                    "/api/alpha-trace/agent-runs/runtime/tools",
                    "/api/alpha-trace/agent-runs/runtime/artifacts/catalog",
                    "/api/alpha-trace/agent-runs/{runId}/artifacts",
                ),
            },
        ],
        "summaries": {
            "runtimeConfig": {key: value.get("status") for key, value in runtime_config.items()},
            "modelProviders": model_providers.get("summary", {}),
            "orchestrators": orchestrators.get("summary", {}),
            "taskSpecs": {"total": task_specs.get("total", 0)},
            "dataApis": {"total": data_api.get("total", 0), "providerTotal": data_api.get("providerTotal", 0)},
            "runnerAdapters": {"total": adapter_matrix.get("total", 0)},
            "runnerFlows": {"total": len(flow_items)},
            "tools": {"total": len(tools)},
            "artifacts": {"totalTypes": artifact_catalog.get("total", 0)},
            "moduleBoundaries": {
                "total": module_boundaries.get("total", 0),
                "summary": module_boundaries.get("summary", {}),
            },
        },
        "boundaries": {
            "externalFrameworkPolicy": (
                "TradingAgents and LangAlpha are consumed through adapters/bridges. "
                "Their internal state is never the frontend product contract."
            ),
            "persistencePolicy": "MySQL is the formal persistence target; JSON remains fallback for local/MVP scenarios.",
            "secretsPolicy": "All runtime diagnostics are sanitized and must not expose raw credentials.",
        },
        "links": {
            "runtimeConfig": "/api/alpha-trace/agent-runs/runtime/config",
            "runtimeReadiness": "/api/alpha-trace/agent-runs/runtime/readiness",
            "moduleBoundaries": "/api/alpha-trace/agent-runs/runtime/module-boundaries",
            "modelProviders": "/api/alpha-trace/agent-runs/runtime/model-providers",
            "orchestrators": "/api/alpha-trace/agent-runs/runtime/orchestrators",
            "taskSpecs": "/api/alpha-trace/agent-runs/runtime/task-specs",
            "dataApiCatalog": "/api/alpha-trace/data-sources/api-catalog",
            "adapterMatrix": "/api/alpha-trace/agent-runs/runners/adapter-matrix",
            "flowCatalog": "/api/alpha-trace/agent-runs/runners/flows",
            "toolContracts": "/api/alpha-trace/agent-runs/runtime/tools",
            "artifactCatalog": "/api/alpha-trace/agent-runs/runtime/artifacts/catalog",
        },
    }


__all__ = ["get_alphatrace_architecture_index"]
