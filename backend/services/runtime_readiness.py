from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from services.agent_artifacts import get_agent_artifact_catalog
from services.agent_orchestrator.orchestrator_catalog import list_orchestrator_descriptors
from services.agent_orchestrator.task_spec_catalog import list_task_spec_contracts
from services.model_providers import list_model_provider_descriptors
from services.runtime_config import get_runtime_config_facade


def _status_rank(status: str) -> int:
    normalized = (status or "").lower()
    if normalized in {"ready", "configured", "available", "ok", "active"}:
        return 0
    if normalized in {"degraded", "missing_optional", "disabled", "design_only"}:
        return 1
    return 2


def _overall_status(statuses: list[str]) -> str:
    if not statuses:
        return "unknown"
    worst = max(_status_rank(status) for status in statuses)
    if worst == 0:
        return "ready"
    if worst == 1:
        return "degraded"
    return "action_required"


def _config_action_items(config: dict[str, dict[str, Any]]) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    qwen = config.get("qwen") or {}
    bocha = config.get("bocha") or {}
    tradingagents = config.get("tradingagents") or {}
    if not qwen.get("available"):
        items.append(
            {
                "area": "qwen",
                "severity": "blocking_for_llm_runs",
                "message": str(qwen.get("message") or "Qwen backend key/model config is not ready."),
            }
        )
    if not bocha.get("available"):
        items.append(
            {
                "area": "bocha",
                "severity": "optional",
                "message": str(bocha.get("message") or "Bocha search is not configured; static evidence fallback remains available."),
            }
        )
    tradingagents_metadata = tradingagents.get("metadata") or {}
    if not tradingagents_metadata.get("enabled"):
        items.append(
            {
                "area": "tradingagents",
                "severity": "optional_poc",
                "message": "TradingAgents PoC is disabled unless ALPHATRACE_TRADINGAGENTS_ENABLED=true.",
            }
        )
    elif not tradingagents.get("available"):
        items.append(
            {
                "area": "tradingagents",
                "severity": "poc_blocked",
                "message": str(tradingagents.get("message") or "TradingAgents PoC is enabled but not ready."),
            }
        )
    return items


def get_runtime_readiness_summary(db: Session | None = None) -> dict[str, Any]:
    """Return a frontend-safe readiness summary across runtime abstraction layers."""

    config = get_runtime_config_facade().snapshot(db)
    providers = list_model_provider_descriptors(db)
    orchestrators = list_orchestrator_descriptors()
    task_specs = list_task_spec_contracts()
    artifacts = get_agent_artifact_catalog()

    config_statuses = [str(item.get("status") or "unknown") for item in config.values()]
    provider_statuses = [str(item.get("status") or "unknown") for item in providers.get("providers", [])]
    orchestrator_statuses = [str(item.get("status") or "unknown") for item in orchestrators.get("orchestrators", [])]
    section_statuses = {
        "runtimeConfig": _overall_status(config_statuses),
        "modelProviders": _overall_status(provider_statuses),
        "orchestrators": _overall_status(orchestrator_statuses),
        "taskSpecs": "ready" if task_specs.get("total", 0) else "action_required",
        "artifacts": "ready" if artifacts.get("total", 0) else "action_required",
    }
    overall = _overall_status(list(section_statuses.values()))
    action_items = _config_action_items(config)
    return {
        "version": 1,
        "overallStatus": overall,
        "sections": {
            "runtimeConfig": {
                "status": section_statuses["runtimeConfig"],
                "items": {key: {"status": value.get("status"), "available": value.get("available"), "source": value.get("source"), "message": value.get("message")} for key, value in config.items()},
            },
            "modelProviders": {
                "status": section_statuses["modelProviders"],
                "summary": providers.get("summary", {}),
                "total": len(providers.get("providers", [])),
            },
            "orchestrators": {
                "status": section_statuses["orchestrators"],
                "summary": orchestrators.get("summary", {}),
                "total": len(orchestrators.get("orchestrators", [])),
            },
            "taskSpecs": {
                "status": section_statuses["taskSpecs"],
                "total": task_specs.get("total", 0),
                "policies": task_specs.get("policies", {}),
            },
            "artifacts": {
                "status": section_statuses["artifacts"],
                "totalTypes": artifacts.get("total", 0),
                "policies": artifacts.get("policies", {}),
            },
        },
        "actionItems": action_items,
        "message": "Readiness summary is sanitized and contains no raw credentials.",
    }


__all__ = ["get_runtime_readiness_summary"]
