from __future__ import annotations

import asyncio
from collections import deque
from dataclasses import asdict
import json
import os
from pathlib import Path
import re
import sys
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from database.connection import get_db
from schemas.alpha_trace_agent_runtime import (
    AgentDecision,
    AgentReport,
    AgentRun,
    AgentRunListResponse,
    AgentRuntimeEvent,
    CreateDemoAgentRunRequest,
    EvidenceReference,
    SubmitAgentRunRequest,
    SubmitAgentRunResponse,
)
from services.alpha_trace_agent_runtime_service import (
    cancel_agent_run,
    create_demo_agent_run,
    get_agent_run,
    get_agent_run_decision,
    get_agent_run_events,
    get_agent_run_evidence,
    get_agent_run_reports,
    list_agent_runs,
    retry_agent_run,
    submit_agent_run,
)
from services.agent_runtime_health import find_stale_agent_runs
from services.agent_runtime_metrics import get_agent_run_metrics_snapshot
from services.agent_runtime_timeline import get_agent_run_timeline_summary
from services.architecture_index import get_alphatrace_architecture_index
from services.architecture_review_bundle import get_architecture_review_bundle
from services.agent_skill_bindings import get_agent_skill_binding_catalog
from services.agent_skill_catalog import get_agent_skill_catalog
from services.backend_module_boundaries import get_backend_module_boundary_catalog
from services.clickhouse_schema_catalog import get_clickhouse_schema_catalog
from services.clickhouse_agent_run_projection import build_agent_run_clickhouse_projection
from services.data_center_catalog import get_data_center_catalog
from services.external_component_catalog import get_external_component_catalog
from services.integration_decision_guide import get_integration_decision_guide
from services.agent_orchestrator.execution_policy import get_runner_execution_policy
from services.agent_orchestrator.capability_matrix import get_runner_capability, list_runner_capabilities, resolve_recommended_runner
from services.agent_orchestrator.native_plan import build_alphatrace_native_plan
from services.agent_orchestrator.adapter_matrix import get_adapter_composition_matrix
from services.agent_orchestrator.flow_catalog import get_agent_flow_catalog
from services.agent_orchestrator.orchestrator_catalog import list_orchestrator_descriptors
from services.agent_orchestrator.subprocess_orchestrator import get_subprocess_worker_registry_snapshot
from services.agent_orchestrator.task_spec_catalog import list_task_spec_contracts
from services.agent_runners.registry import AgentRunnerConfigurationError, AgentRunnerExecutionError, AgentRunnerNotImplementedError
from services.agent_runtime_store.registry import get_agent_run_store
from services.agent_tool_registry import list_agent_tool_contracts
from services.agent_artifacts import get_agent_artifact_catalog, get_agent_artifact_store
from services.integration_adapters import build_default_integration_registry
from services.async_tasks import get_async_task_store_type, get_mysql_async_task_store
from services.system_config_store import get_mysql_system_config_store
from services.runtime_config import get_runtime_config_facade
from services.model_providers import list_model_provider_descriptors
from services.runtime_readiness import get_runtime_readiness_summary

router = APIRouter(prefix="/api/alpha-trace/agent-runs", tags=["AlphaTrace Agent Runtime"])


def _not_found(run_id: str) -> HTTPException:
    return HTTPException(status_code=404, detail=f"Agent Run not found: {run_id}")


_SECRET_PATTERNS = [
    (re.compile(r"(Authorization:\s*Bearer\s+)[^\s]+", re.IGNORECASE), r"\1<redacted>"),
    (re.compile(r"(api[_-]?key['\"]?\s*[:=]\s*['\"]?)[^,'\"\s]+", re.IGNORECASE), r"\1<redacted>"),
    (re.compile(r"(DASHSCOPE_API_KEY=)[^\s]+", re.IGNORECASE), r"\1<redacted>"),
    (re.compile(r"sk-[A-Za-z0-9_\-]{12,}"), "sk-<redacted>"),
]


def _project_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _resolve_runtime_log_path() -> Path:
    raw_path = os.getenv("ALPHATRACE_BACKEND_LOG_PATH", "").strip()
    if raw_path:
        candidate = Path(raw_path)
        return candidate if candidate.is_absolute() else (_project_root() / candidate).resolve()
    candidates = _runtime_log_candidates()
    for candidate in candidates:
        if candidate.exists() and candidate.is_file():
            return candidate
    return candidates[0]


def _runtime_log_candidates() -> list[Path]:
    raw_path = os.getenv("ALPHATRACE_BACKEND_LOG_PATH", "").strip()
    if raw_path:
        candidate = Path(raw_path)
        return [candidate if candidate.is_absolute() else (_project_root() / candidate).resolve()]

    root = _project_root()
    return [
        (root / "backend-alphatrace-local.log").resolve(),
        (root / "backend-tg-local.log").resolve(),
        (root / "logs" / "backend-runtime.log").resolve(),
        (root / "backend-current-8813.out.log").resolve(),
    ]


def _resolve_worker_root_path() -> Path:
    raw_path = os.getenv("ALPHATRACE_AGENT_WORKER_DIR", "").strip()
    if raw_path:
        candidate = Path(raw_path)
        return candidate if candidate.is_absolute() else (_project_root() / candidate).resolve()
    return (_project_root() / "backend" / "runtime_data" / "agent_workers").resolve()


def _resolve_worker_run_dir(run_id: str) -> Path:
    if not re.fullmatch(r"[A-Za-z0-9_\-]+", run_id):
        raise HTTPException(status_code=400, detail="Invalid runId for worker artifact lookup.")

    root = _resolve_worker_root_path()
    candidate = (root / run_id).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Worker artifact path escaped runtime data directory.") from exc
    return candidate


def _redact_log_line(line: str) -> str:
    sanitized = line.rstrip("\r\n")
    for pattern, replacement in _SECRET_PATTERNS:
        sanitized = pattern.sub(replacement, sanitized)
    return sanitized


def _tail_text_lines(path: Path, limit: int) -> list[str]:
    if not path.exists() or not path.is_file():
        return []
    lines: deque[str] = deque(maxlen=limit)
    with path.open("r", encoding="utf-8", errors="replace") as handle:
        for line in handle:
            lines.append(_redact_log_line(line))
    return list(lines)


def _read_json_file(path: Path) -> Any:
    if not path.exists() or not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        return {"parseError": str(exc)}


def _resolve_tradingagents_repo_path(raw_path: str) -> tuple[bool, str]:
    if not raw_path:
        return False, ""

    candidate = Path(raw_path)
    if not candidate.is_absolute():
        candidate = (_project_root() / raw_path).resolve()
    return candidate.exists(), str(candidate)


def _check_tradingagents_import(raw_path: str) -> tuple[bool, str]:
    repo_exists, resolved_path = _resolve_tradingagents_repo_path(raw_path)
    if raw_path and not repo_exists:
        return False, f"TradingAgents repo path does not exist: {resolved_path}"

    inserted_path = False
    if resolved_path and resolved_path not in sys.path:
        sys.path.insert(0, resolved_path)
        inserted_path = True
    try:
        from tradingagents.default_config import DEFAULT_CONFIG  # noqa: F401
        from tradingagents.graph.trading_graph import TradingAgentsGraph  # noqa: F401

        return True, ""
    except Exception as exc:  # pragma: no cover - depends on local optional TradingAgents env
        return False, str(exc)
    finally:
        if inserted_path:
            try:
                sys.path.remove(resolved_path)
            except ValueError:
                pass


@router.get("/runners/status")
def get_agent_runner_status_endpoint(db: Session = Depends(get_db)):
    runtime_config = get_runtime_config_facade().snapshot(db)
    qwen_runtime = runtime_config["qwen"]
    tradingagents_runtime = runtime_config["tradingagents"]
    langalpha_runtime = runtime_config["langalpha"]
    tradingagents_metadata = tradingagents_runtime.get("metadata") or {}
    langalpha_metadata = langalpha_runtime.get("metadata") or {}

    qwen_key_configured = bool(qwen_runtime.get("available"))
    qwen_available = bool(qwen_runtime.get("available"))
    qwen_status = str(qwen_runtime.get("status") or "missing_qwen_key")
    qwen_message = str(qwen_runtime.get("message") or "")
    qwen_config_source = str(qwen_runtime.get("source") or "missing")

    tradingagents_enabled = bool(tradingagents_metadata.get("enabled"))
    tradingagents_available = bool(tradingagents_runtime.get("available"))
    tradingagents_status = str(tradingagents_runtime.get("status") or "disabled")
    tradingagents_message = str(tradingagents_runtime.get("message") or "")
    tradingagents_repo_path = str(tradingagents_metadata.get("repoPath") or "")
    tradingagents_repo_exists = tradingagents_metadata.get("repoPathExists")
    tradingagents_resolved_path = str(tradingagents_metadata.get("repoPath") or "")
    tradingagents_importable = bool(tradingagents_metadata.get("importable"))
    tradingagents_import_error = str(tradingagents_metadata.get("importError") or "")
    langalpha_enabled = bool(langalpha_metadata.get("enabled"))

    stub_policy = get_runner_execution_policy("stub")
    qwen_policy = get_runner_execution_policy("qwen")
    native_policy = get_runner_execution_policy("alphatrace_native")
    tradingagents_policy = get_runner_execution_policy("tradingagents")
    langalpha_policy = get_runner_execution_policy("langalpha")

    return {
        "runtimeConfig": runtime_config,
        "runners": [
            {
                "runnerType": "stub",
                "executionMode": stub_policy.execution_mode,
                "executionPolicyReason": stub_policy.reason,
                "capabilities": get_runner_capability("stub").to_dict(),
                "enabled": True,
                "available": True,
                "status": "ready",
                "message": "Stub runner is always available for local smoke tests.",
            },
            {
                "runnerType": "qwen",
                "executionMode": qwen_policy.execution_mode,
                "executionPolicyReason": qwen_policy.reason,
                "capabilities": get_runner_capability("qwen").to_dict(),
                "enabled": True,
                "available": qwen_available,
                "status": qwen_status,
                "message": qwen_message,
                "qwenKeyConfigured": qwen_key_configured,
                "qwenConfigSource": qwen_config_source,
            },
            {
                "runnerType": "alphatrace_native",
                "executionMode": native_policy.execution_mode,
                "executionPolicyReason": native_policy.reason,
                "capabilities": get_runner_capability("alphatrace_native").to_dict(),
                "enabled": True,
                "available": qwen_available,
                "status": qwen_status,
                "message": (
                    f"AlphaTrace Native runner can use backend Qwen key from {qwen_config_source}; "
                    "it owns the product multi-agent DAG and uses Bocha/static evidence."
                    if qwen_available
                    else "AlphaTrace Native runner requires the backend Qwen API key used by QwenRunner."
                ),
                "qwenKeyConfigured": qwen_key_configured,
                "qwenConfigSource": qwen_config_source,
            },
            {
                "runnerType": "tradingagents",
                "executionMode": tradingagents_policy.execution_mode,
                "executionPolicyReason": tradingagents_policy.reason,
                "capabilities": get_runner_capability("tradingagents").to_dict(),
                "enabled": tradingagents_enabled,
                "available": tradingagents_available,
                "status": tradingagents_status,
                "message": tradingagents_message,
                "repoPathConfigured": bool(tradingagents_repo_path),
                "repoPathExists": tradingagents_repo_exists if tradingagents_repo_path else None,
                "repoPath": tradingagents_resolved_path if tradingagents_repo_path else None,
                "importable": tradingagents_importable,
                "importError": tradingagents_import_error or None,
                "qwenKeyConfigured": qwen_key_configured,
                "qwenConfigSource": qwen_config_source,
            },
            {
                "runnerType": "langalpha",
                "executionMode": langalpha_policy.execution_mode,
                "executionPolicyReason": langalpha_policy.reason,
                "capabilities": get_runner_capability("langalpha").to_dict(),
                "enabled": langalpha_enabled,
                "available": False,
                "status": "design_only" if langalpha_enabled else "disabled",
                "message": "LangAlpha adapter is design-only in this phase and does not run tasks.",
            },
        ]
    }


@router.get("/runners/capabilities")
def get_agent_runner_capabilities_endpoint(
    taskType: Optional[str] = Query(None),
    requestedRunnerType: Optional[str] = Query(None),
):
    return {
        "capabilities": [item.to_dict() for item in list_runner_capabilities()],
        "recommendation": resolve_recommended_runner(taskType, requestedRunnerType),
        "message": "Runner capabilities are advisory diagnostics. Submit requests still use the explicit runnerConfig.runnerType and never silently fallback.",
    }


@router.get("/runners/adapter-matrix")
def get_agent_runner_adapter_matrix_endpoint():
    return get_adapter_composition_matrix().to_response()


@router.get("/runners/flows")
def list_agent_runner_flows_endpoint():
    return {
        "flows": [flow.to_dict() for flow in get_agent_flow_catalog().list_flows()],
        "message": "Runner flow descriptors are AlphaTrace-owned UI/diagnostic contracts, not external internal state.",
    }


@router.get("/runners/flows/{runner_type}")
def get_agent_runner_flow_endpoint(
    runner_type: str,
    taskType: Optional[str] = Query("single_asset_analysis"),
):
    return {
        "flow": get_agent_flow_catalog().get_flow(runner_type, task_type=taskType or "single_asset_analysis").to_dict(),
        "message": "Runner flow descriptor is safe for UI rendering and does not expose external runtime state.",
    }


@router.get("/runners/plans/alphatrace-native")
def get_alphatrace_native_plan_endpoint(taskType: Optional[str] = Query("single_asset_analysis")):
    plan = build_alphatrace_native_plan(task_type=taskType or "single_asset_analysis")
    return {
        "plan": asdict(plan),
        "message": "AlphaTrace Native orchestration plan is a logical product DAG. It describes expected steps and dependencies, not a live execution snapshot.",
    }


@router.get("/runtime/tools")
def get_agent_runtime_tool_contracts_endpoint():
    return {
        "tools": [item.to_payload() for item in list_agent_tool_contracts()],
        "message": "Tool contracts describe backend actions that may appear in AgentRuntimeEvent tool.called/tool.result payloads.",
    }


@router.get("/runtime/artifacts/catalog")
def get_agent_runtime_artifact_catalog_endpoint():
    return {
        **get_agent_artifact_catalog(),
        "message": "AgentArtifact catalog is a frontend-safe contract for rendering tool/model/external workbench outputs.",
    }


@router.get("/runtime/integrations")
def get_agent_runtime_integrations_endpoint():
    integrations = build_default_integration_registry().diagnostics()
    return {
        "integrations": integrations,
        "message": "Integration diagnostics are metadata and readiness checks only; no provider secrets are returned.",
    }


@router.get("/runtime/config")
def get_agent_runtime_config_endpoint(db: Session = Depends(get_db)):
    return {
        "config": get_runtime_config_facade().snapshot(db),
        "message": "Runtime configuration diagnostics are sanitized. No raw API keys or encrypted secret values are returned.",
    }


@router.get("/runtime/architecture")
def get_agent_runtime_architecture_endpoint(db: Session = Depends(get_db)):
    return {
        **get_alphatrace_architecture_index(db),
        "message": "AlphaTrace architecture index is a product-owned map of API, data, model, orchestration, runner, tool and artifact boundaries.",
    }


@router.get("/runtime/architecture-review")
def get_agent_runtime_architecture_review_endpoint(db: Session = Depends(get_db)):
    return get_architecture_review_bundle(db)


@router.get("/runtime/module-boundaries")
def get_agent_runtime_module_boundaries_endpoint():
    return {
        **get_backend_module_boundary_catalog().to_response(),
        "message": "Backend module boundaries separate AlphaTrace-owned product layers from legacy modules and optional external runtimes.",
    }


@router.get("/runtime/external-components")
def get_agent_runtime_external_components_endpoint():
    return {
        **get_external_component_catalog().to_response(),
        "message": "External component catalog defines safe adapter boundaries for TradingAgents, LangAlpha, Bocha, and future data providers.",
    }


@router.get("/runtime/integration-decisions")
def get_agent_runtime_integration_decisions_endpoint():
    return {
        **get_integration_decision_guide().to_response(),
        "message": "Integration decisions describe when to proceed or stop while adapting external runtimes, workbenches, tools, and data providers.",
    }


@router.get("/runtime/data-center")
def get_agent_runtime_data_center_endpoint():
    return {
        **get_data_center_catalog().to_response(),
        "message": "Data Center catalog describes internal/external data onboarding, tool-result ingestion, and target store routing.",
    }


@router.get("/runtime/skills")
def get_agent_runtime_skills_endpoint():
    return {
        **get_agent_skill_catalog().to_response(),
        "message": "Agent skill catalog describes configurable skills that bind agents to tools, data domains, model requirements, and output contracts.",
    }


@router.get("/runtime/agent-skill-bindings")
def get_agent_runtime_agent_skill_bindings_endpoint():
    return {
        **get_agent_skill_binding_catalog().to_response(),
        "message": "Agent skill bindings describe default role-to-skill, role-to-tool, and role-to-output-contract mappings for the AlphaTrace multi-agent DAG.",
    }


@router.get("/runtime/clickhouse-schema-catalog")
def get_agent_runtime_clickhouse_schema_catalog_endpoint():
    return {
        **get_clickhouse_schema_catalog().to_response(),
        "message": "ClickHouse schema catalog describes planned structured business and analytical projections. It does not connect to ClickHouse yet.",
    }


@router.get("/runtime/readiness")
def get_agent_runtime_readiness_endpoint(db: Session = Depends(get_db)):
    return get_runtime_readiness_summary(db)


@router.get("/runtime/model-providers")
def get_agent_runtime_model_providers_endpoint(db: Session = Depends(get_db)):
    return {
        **list_model_provider_descriptors(db),
        "message": "Model provider diagnostics describe backend model boundaries and contain no raw credentials.",
    }


@router.get("/runtime/orchestrators")
def get_agent_runtime_orchestrators_endpoint():
    return {
        **list_orchestrator_descriptors(),
        "message": "Orchestrator diagnostics describe execution boundaries. They do not expose external runner internal state.",
    }


@router.get("/runtime/task-specs")
def get_agent_runtime_task_spec_contracts_endpoint():
    return {
        **list_task_spec_contracts(),
        "message": "Task spec contracts describe how SubmitAgentRunRequest becomes scheduler-neutral execution metadata.",
    }


@router.get("/runtime/logs")
def get_agent_runtime_logs_endpoint(limit: int = Query(400, ge=1, le=2000)):
    log_path = _resolve_runtime_log_path()
    candidates = [str(path) for path in _runtime_log_candidates()]
    if not log_path.exists() or not log_path.is_file():
        return {
            "path": str(log_path),
            "source": "file",
            "exists": False,
            "limit": limit,
            "truncated": False,
            "lines": [],
            "candidates": candidates,
            "message": (
                "Backend runtime log file is not available. Docker deployments usually write logs to stdout instead of a file; "
                "use `docker logs hyper-arena-app` for full process logs, or set ALPHATRACE_BACKEND_LOG_PATH to a readable file path for local PoC log viewing."
            ),
        }

    lines: deque[str] = deque(maxlen=limit)
    with log_path.open("r", encoding="utf-8", errors="replace") as handle:
        for line in handle:
            lines.append(_redact_log_line(line))

    return {
        "path": str(log_path),
        "source": "file",
        "exists": True,
        "limit": limit,
        "truncated": len(lines) >= limit,
        "lines": list(lines),
        "candidates": candidates,
    }


@router.get("/runtime/workers")
def get_agent_runtime_workers_endpoint():
    return get_subprocess_worker_registry_snapshot()


@router.get("/runtime/tasks")
def get_agent_runtime_tasks_endpoint(limit: int = Query(50, ge=1, le=200)):
    store_type = get_async_task_store_type()
    if store_type != "mysql":
        return {
            "storeType": store_type,
            "tasks": [],
            "message": "Async task diagnostics are currently implemented for MySQL store only.",
        }
    try:
        tasks = get_mysql_async_task_store().list_recent(limit=limit)
        return {
            "storeType": "mysql",
            "tasks": [task.__dict__ for task in tasks],
            "message": "Async task diagnostics are additive. Current AgentRun submit flow may not write task snapshots yet.",
        }
    except Exception as exc:  # noqa: BLE001 - diagnostics should fail softly.
        return {
            "storeType": "mysql",
            "tasks": [],
            "error": str(exc),
            "message": "Async task store is not available or could not be queried.",
        }


@router.get("/runtime/store-health")
def get_agent_runtime_store_health_endpoint():
    """Return safe AlphaTrace runtime/config store health without secrets."""
    store_type = (os.getenv("ALPHA_TRACE_AGENT_RUN_STORE") or "json").strip().lower()
    result: dict[str, Any] = {
        "agentRunStore": {
            "configuredType": store_type,
            "className": None,
            "available": False,
            "runCount": None,
            "latestRunId": None,
            "error": None,
        },
        "systemConfigStore": {
            "configuredType": "mysql",
            "available": False,
            "llmConfigured": False,
            "llmProvider": None,
            "llmModel": None,
            "llmBaseUrlConfigured": False,
            "llmApiKeyAvailable": False,
            "toolConfigs": {},
            "error": None,
        },
        "notes": [
            "No raw API keys or encrypted secret values are returned.",
            "JSON store remains supported as fallback; MySQL is the product persistence direction.",
        ],
    }

    try:
        store = get_agent_run_store()
        runs = store.list_runs()
        result["agentRunStore"].update(
            {
                "className": store.__class__.__name__,
                "available": True,
                "runCount": len(runs),
                "latestRunId": runs[0].runId if runs else None,
            }
        )
        engine = getattr(store, "engine", None)
        if engine is not None:
            with engine.begin() as conn:
                conn.execute(text("SELECT 1"))
            result["agentRunStore"]["mysqlPing"] = "ok"
    except Exception as exc:
        result["agentRunStore"]["error"] = str(exc)

    try:
        config_store = get_mysql_system_config_store()
        with config_store.engine.begin() as conn:
            conn.execute(text("SELECT 1"))
        llm_config = config_store.get_llm_config()
        tool_configs = config_store.get_tool_configs()
        result["systemConfigStore"].update(
            {
                "available": True,
                "llmConfigured": bool(llm_config.get("configured")),
                "llmProvider": llm_config.get("provider"),
                "llmModel": llm_config.get("model"),
                "llmBaseUrlConfigured": bool(llm_config.get("base_url")),
                "llmApiKeyAvailable": bool(llm_config.get("api_key_available")),
                "toolConfigs": {
                    name: {
                        "enabled": bool(config.get("enabled")),
                        "apiKeyAvailable": bool(config.get("api_key_available") or config.get("api_key_encrypted")),
                        "source": config.get("source"),
                    }
                    for name, config in tool_configs.items()
                },
            }
        )
    except Exception as exc:
        result["systemConfigStore"]["error"] = str(exc)

    result["overallStatus"] = "ok" if result["agentRunStore"]["available"] and result["systemConfigStore"]["available"] else "degraded"
    return result


@router.get("/runtime/stale-runs")
def get_agent_runtime_stale_runs_endpoint(olderThanMinutes: int = Query(60, ge=1, le=1440)):
    runs = get_agent_run_store().list_runs()
    stale = find_stale_agent_runs(runs, older_than_minutes=olderThanMinutes)
    return {
        "olderThanMinutes": olderThanMinutes,
        "items": [item.to_dict() for item in stale],
        "total": len(stale),
        "message": "This is a read-only diagnostic. It does not cancel, retry, or mutate AgentRun status.",
    }


@router.get("/{run_id}/worker-artifacts")
def get_agent_run_worker_artifacts_endpoint(
    run_id: str,
    logLimit: int = Query(200, ge=1, le=2000),
    eventLimit: int = Query(200, ge=1, le=2000),
):
    if not get_agent_run(run_id):
        raise _not_found(run_id)

    work_dir = _resolve_worker_run_dir(run_id)
    files = {
        "input": work_dir / "input.json",
        "events": work_dir / "events.jsonl",
        "result": work_dir / "result.json",
        "stdout": work_dir / "stdout.log",
        "stderr": work_dir / "stderr.log",
    }

    file_status = {
        name: {
            "path": str(path),
            "exists": path.exists() and path.is_file(),
            "sizeBytes": path.stat().st_size if path.exists() and path.is_file() else 0,
        }
        for name, path in files.items()
    }

    event_lines = _tail_text_lines(files["events"], eventLimit)
    parsed_events: list[Any] = []
    for line in event_lines:
        try:
            parsed_events.append(json.loads(line))
        except Exception:
            parsed_events.append({"raw": line, "parseError": "Invalid JSONL event line"})

    return {
        "runId": run_id,
        "workerRoot": str(_resolve_worker_root_path()),
        "workDir": str(work_dir),
        "exists": work_dir.exists() and work_dir.is_dir(),
        "files": file_status,
        "stdoutLines": _tail_text_lines(files["stdout"], logLimit),
        "stderrLines": _tail_text_lines(files["stderr"], logLimit),
        "events": parsed_events,
        "result": _read_json_file(files["result"]),
        "message": None
        if work_dir.exists()
        else "No subprocess worker artifacts were found for this run. This is expected for Qwen, Stub, and older runs.",
    }


@router.get("/{run_id}/artifacts")
def list_agent_run_artifacts_endpoint(run_id: str):
    if not get_agent_run(run_id):
        raise _not_found(run_id)
    try:
        artifacts = get_agent_artifact_store().list_artifacts_for_run(run_id)
        return {
            "runId": run_id,
            "artifacts": [artifact.__dict__ for artifact in artifacts],
            "total": len(artifacts),
            "message": "AgentArtifact store is additive. Existing Qwen/Native runs may have no artifacts until artifact-producing tools are wired.",
        }
    except Exception as exc:  # noqa: BLE001 - diagnostics should be explicit and non-fatal.
        return {
            "runId": run_id,
            "artifacts": [],
            "total": 0,
            "error": str(exc),
            "message": "AgentArtifact store could not be queried.",
        }


@router.get("/{run_id}/metrics")
def get_agent_run_metrics_endpoint(run_id: str):
    snapshot = get_agent_run_metrics_snapshot(run_id)
    if not snapshot:
        raise _not_found(run_id)
    return snapshot


@router.get("/{run_id}/timeline-summary")
def get_agent_run_timeline_summary_endpoint(run_id: str, limit: int = Query(120, ge=1, le=500)):
    summary = get_agent_run_timeline_summary(run_id, limit=limit)
    if not summary:
        raise _not_found(run_id)
    return summary


@router.get("/{run_id}/clickhouse-projection/preview")
def get_agent_run_clickhouse_projection_preview_endpoint(
    run_id: str,
    sampleLimit: int = Query(3, ge=0, le=20),
):
    run = get_agent_run(run_id)
    if not run:
        raise _not_found(run_id)
    projection = build_agent_run_clickhouse_projection(
        run=run,
        events=get_agent_run_events(run_id),
        reports=get_agent_run_reports(run_id),
        evidence=get_agent_run_evidence(run_id),
        decision=get_agent_run_decision(run_id),
    )
    return projection.to_response(sample_limit=sampleLimit)


@router.get("", response_model=AgentRunListResponse)
def list_agent_runs_endpoint(
    assetId: Optional[str] = Query(None),
    portfolioId: Optional[str] = Query(None),
    strategyId: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    taskType: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    items, total = list_agent_runs(
        asset_id=assetId,
        portfolio_id=portfolioId,
        strategy_id=strategyId,
        status=status,
        task_type=taskType,
        limit=limit,
        offset=offset,
    )
    return AgentRunListResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/{run_id}", response_model=AgentRun)
def get_agent_run_endpoint(run_id: str):
    run = get_agent_run(run_id)
    if not run:
        raise _not_found(run_id)
    return run


@router.get("/{run_id}/events", response_model=list[AgentRuntimeEvent])
def get_agent_run_events_endpoint(run_id: str):
    if not get_agent_run(run_id):
        raise _not_found(run_id)
    return get_agent_run_events(run_id)


@router.get("/{run_id}/reports", response_model=list[AgentReport])
def get_agent_run_reports_endpoint(run_id: str):
    if not get_agent_run(run_id):
        raise _not_found(run_id)
    return get_agent_run_reports(run_id)


@router.get("/{run_id}/evidence", response_model=list[EvidenceReference])
def get_agent_run_evidence_endpoint(run_id: str):
    if not get_agent_run(run_id):
        raise _not_found(run_id)
    return get_agent_run_evidence(run_id)


@router.get("/{run_id}/decision", response_model=AgentDecision)
def get_agent_run_decision_endpoint(run_id: str):
    decision = get_agent_run_decision(run_id)
    if not decision:
        raise _not_found(run_id)
    return decision


@router.get("/{run_id}/events/stream")
def stream_agent_run_events_endpoint(run_id: str, after: int = Query(0, ge=0)):
    if not get_agent_run(run_id):
        raise _not_found(run_id)

    async def event_generator():
        last_sequence = after
        idle_ticks = 0
        max_idle_ticks = 360

        while True:
            run = get_agent_run(run_id)
            if not run:
                yield "event: failed\n"
                yield f"data: {json.dumps({'runId': run_id, 'status': 'failed', 'message': 'Agent Run not found'}, ensure_ascii=False)}\n\n"
                return

            new_events = [event for event in get_agent_run_events(run_id) if event.sequence > last_sequence]
            for event in new_events:
                yield f"event: {event.type}\n"
                yield f"data: {json.dumps(event.model_dump(), ensure_ascii=False)}\n\n"
                last_sequence = max(last_sequence, event.sequence)
                idle_ticks = 0

            if run.status in {"completed", "failed", "cancelled"}:
                event_name = "failed" if run.status == "failed" else "complete"
                yield f"event: {event_name}\n"
                yield f"data: {json.dumps({'runId': run_id, 'status': run.status}, ensure_ascii=False)}\n\n"
                yield "event: done\n"
                yield f"data: {json.dumps({'runId': run_id, 'status': run.status}, ensure_ascii=False)}\n\n"
                return

            idle_ticks += 1
            if idle_ticks >= max_idle_ticks:
                yield "event: done\n"
                yield f"data: {json.dumps({'runId': run_id, 'status': run.status, 'message': 'SSE stream idle timeout'}, ensure_ascii=False)}\n\n"
                return

            await asyncio.sleep(0.5)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@router.post("/demo", response_model=AgentRun)
def create_demo_agent_run_endpoint(request: CreateDemoAgentRunRequest):
    return create_demo_agent_run(request)


@router.post("/submit", response_model=SubmitAgentRunResponse)
def submit_agent_run_endpoint(request: SubmitAgentRunRequest, db: Session = Depends(get_db)):
    try:
        return submit_agent_run(request, db=db)
    except AgentRunnerConfigurationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except AgentRunnerNotImplementedError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except AgentRunnerExecutionError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Agent run submit failed unexpectedly: {exc}") from exc


@router.post("/{run_id}/cancel", response_model=AgentRun)
def cancel_agent_run_endpoint(run_id: str):
    run = cancel_agent_run(run_id)
    if not run:
        raise _not_found(run_id)
    return run


@router.post("/{run_id}/retry", response_model=SubmitAgentRunResponse)
def retry_agent_run_endpoint(run_id: str, db: Session = Depends(get_db)):
    try:
        response = retry_agent_run(run_id, db=db)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except AgentRunnerConfigurationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except AgentRunnerNotImplementedError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except AgentRunnerExecutionError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Agent run retry failed unexpectedly: {exc}") from exc
    if not response:
        raise _not_found(run_id)
    return response
