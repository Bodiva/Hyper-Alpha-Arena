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
from services.agent_orchestrator.execution_policy import get_runner_execution_policy
from services.agent_orchestrator.capability_matrix import get_runner_capability, list_runner_capabilities, resolve_recommended_runner
from services.agent_orchestrator.native_plan import build_alphatrace_native_plan
from services.agent_orchestrator.subprocess_orchestrator import get_subprocess_worker_registry_snapshot
from services.agent_runners.registry import AgentRunnerConfigurationError, AgentRunnerExecutionError, AgentRunnerNotImplementedError
from services.agent_runtime_store.registry import get_agent_run_store
from services.agent_tool_registry import list_agent_tool_contracts
from services.integration_adapters import (
    BochaDataProviderAdapter,
    QwenModelProviderAdapter,
    StaticMarketDataProviderAdapter,
)
from services.system_config_store import get_mysql_system_config_store

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
    tradingagents_enabled = os.getenv("ALPHATRACE_TRADINGAGENTS_ENABLED", "").strip().lower() == "true"
    tradingagents_repo_path = os.getenv("TRADINGAGENTS_REPO_PATH", "").strip()
    tradingagents_repo_exists, tradingagents_resolved_path = _resolve_tradingagents_repo_path(tradingagents_repo_path)
    langalpha_enabled = os.getenv("ALPHATRACE_LANGALPHA_ENABLED", "").strip().lower() == "true"
    qwen_key_configured = bool(os.getenv("DASHSCOPE_API_KEY"))
    qwen_config_source = "environment" if qwen_key_configured else "missing"

    if not qwen_key_configured:
        try:
            from services.hyper_ai_service import get_llm_config

            config = get_llm_config(db)
            provider = str(config.get("provider") or "").lower()
            base_url = str(config.get("base_url") or "")
            model = str(config.get("model") or "")
            is_qwen_provider = provider == "qwen"
            is_custom_qwen_endpoint = provider == "custom" and (
                "dashscope.aliyuncs.com" in base_url.lower() or model.lower().startswith("qwen")
            )
            qwen_key_configured = bool(config.get("api_key")) and (is_qwen_provider or is_custom_qwen_endpoint)
            qwen_config_source = str(config.get("source") or "hyper_ai_profile") if qwen_key_configured else "missing"
        except Exception:
            qwen_key_configured = False
            qwen_config_source = "unavailable"

    tradingagents_importable = False
    tradingagents_import_error = ""
    if tradingagents_enabled:
        tradingagents_importable, tradingagents_import_error = _check_tradingagents_import(tradingagents_repo_path)

    tradingagents_available = tradingagents_enabled and tradingagents_importable and qwen_key_configured
    if not tradingagents_enabled:
        tradingagents_status = "disabled"
    elif not tradingagents_importable:
        tradingagents_status = "import_error"
    elif not qwen_key_configured:
        tradingagents_status = "missing_qwen_key"
    else:
        tradingagents_status = "ready"

    if tradingagents_available:
        tradingagents_message = "TradingAgents PoC is enabled and importable; Qwen key is available."
    elif not tradingagents_enabled:
        tradingagents_message = "TradingAgents PoC is disabled. Set ALPHATRACE_TRADINGAGENTS_ENABLED=true to enable local PoC."
    elif not tradingagents_importable:
        tradingagents_message = f"TradingAgents package is not importable: {tradingagents_import_error}"
    else:
        tradingagents_message = "TradingAgents PoC requires Qwen API key via Hyper AI settings or DASHSCOPE_API_KEY."

    qwen_available = qwen_key_configured
    qwen_status = "ready" if qwen_available else "missing_qwen_key"
    qwen_message = (
        f"Qwen runner can use backend Qwen key from {qwen_config_source}."
        if qwen_available
        else "Qwen runner requires a backend Qwen API key. Save Qwen API Key again in Settings or set DASHSCOPE_API_KEY on the backend."
    )

    stub_policy = get_runner_execution_policy("stub")
    qwen_policy = get_runner_execution_policy("qwen")
    native_policy = get_runner_execution_policy("alphatrace_native")
    tradingagents_policy = get_runner_execution_policy("tradingagents")
    langalpha_policy = get_runner_execution_policy("langalpha")

    return {
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


@router.get("/runtime/integrations")
def get_agent_runtime_integrations_endpoint():
    adapters = [
        BochaDataProviderAdapter(),
        StaticMarketDataProviderAdapter(),
        QwenModelProviderAdapter(),
    ]
    integrations: list[dict[str, Any]] = []
    for adapter in adapters:
        try:
            capability = adapter.capability()
            health = adapter.health()
            integrations.append({"capability": capability.__dict__, "health": health.__dict__})
        except Exception as exc:  # noqa: BLE001 - diagnostics must not fail the route.
            integrations.append(
                {
                    "capability": {"adapterId": getattr(adapter, "adapter_id", "unknown")},
                    "health": {
                        "adapter_id": getattr(adapter, "adapter_id", "unknown"),
                        "status": "error",
                        "source": "diagnostics",
                        "message": f"Failed to inspect adapter: {exc}",
                    },
                }
            )
    return {
        "integrations": integrations,
        "message": "Integration diagnostics are metadata and readiness checks only; no provider secrets are returned.",
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
