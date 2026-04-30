from __future__ import annotations

import asyncio
import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
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
    create_demo_agent_run,
    get_agent_run,
    get_agent_run_decision,
    get_agent_run_events,
    get_agent_run_evidence,
    get_agent_run_reports,
    list_agent_runs,
    submit_agent_run,
)
from services.agent_runners.registry import AgentRunnerConfigurationError, AgentRunnerExecutionError, AgentRunnerNotImplementedError

router = APIRouter(prefix="/api/alpha-trace/agent-runs", tags=["AlphaTrace Agent Runtime"])


def _not_found(run_id: str) -> HTTPException:
    return HTTPException(status_code=404, detail=f"Agent Run not found: {run_id}")


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
def stream_agent_run_events_endpoint(run_id: str):
    if not get_agent_run(run_id):
        raise _not_found(run_id)

    async def event_generator():
        last_sequence = 0
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

    return StreamingResponse(event_generator(), media_type="text/event-stream")


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
