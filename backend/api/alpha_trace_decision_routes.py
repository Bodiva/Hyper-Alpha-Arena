from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from schemas.alpha_trace_agent_runtime import AgentRun
from schemas.alpha_trace_decision import (
    AlphaTraceDecisionItem,
    DecisionAgentRunResponse,
    DecisionEvidenceResponse,
    DecisionListResponse,
)
from services.decision_store.decision_store import get_agent_run_decision_store


router = APIRouter(prefix="/api/alpha-trace/decisions", tags=["AlphaTrace Decisions"])


def _truncate_text(value: str, limit: int = 420) -> str:
    return value if len(value) <= limit else f"{value[:limit].rstrip()}..."


def _compact_decision_item(item: AlphaTraceDecisionItem) -> AlphaTraceDecisionItem:
    attribution = item.attribution.model_copy(
        update={
            "summary": _truncate_text(item.attribution.summary, 260),
            "factors": [],
            "riskReview": {},
            "mistakeReview": None,
            "agentContributions": [],
            "learningPoints": [],
        }
    )
    return item.model_copy(
        update={
            "thesis": _truncate_text(item.thesis),
            "risks": item.risks[:3],
            "attribution": attribution,
        }
    )


@router.get("", response_model=DecisionListResponse)
def list_alpha_trace_decisions(
    assetId: Optional[str] = Query(None),
    portfolioId: Optional[str] = Query(None),
    runId: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    horizon: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    compact: bool = Query(False),
):
    store = get_agent_run_decision_store()
    items = store.list_decisions(
        asset_id=assetId,
        portfolio_id=portfolioId,
        run_id=runId,
        action=action,
        horizon=horizon,
        limit=limit,
        offset=offset,
    )
    total = store.count_decisions(
        asset_id=assetId,
        portfolio_id=portfolioId,
        run_id=runId,
        action=action,
        horizon=horizon,
    )
    if compact:
        items = [_compact_decision_item(item) for item in items]
    return DecisionListResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/{decision_id}/evidence", response_model=DecisionEvidenceResponse)
def get_alpha_trace_decision_evidence(
    decision_id: str,
    limit: int = Query(100, ge=1, le=500),
):
    store = get_agent_run_decision_store()
    if not store.get_decision(decision_id):
        raise HTTPException(status_code=404, detail=f"Decision not found: {decision_id}")
    items = store.get_decision_evidence(decision_id, limit=limit)
    return DecisionEvidenceResponse(decisionId=decision_id, items=items, total=len(items), limit=limit)


@router.get("/{decision_id}/agent-run", response_model=DecisionAgentRunResponse)
def get_alpha_trace_decision_agent_run(decision_id: str):
    store = get_agent_run_decision_store()
    run = store.get_decision_agent_run(decision_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Decision or Agent Run not found: {decision_id}")
    return DecisionAgentRunResponse(decisionId=decision_id, run=run)


@router.get("/{decision_id}", response_model=AlphaTraceDecisionItem)
def get_alpha_trace_decision(decision_id: str):
    item = get_agent_run_decision_store().get_decision(decision_id)
    if not item:
        raise HTTPException(status_code=404, detail=f"Decision not found: {decision_id}")
    return item
