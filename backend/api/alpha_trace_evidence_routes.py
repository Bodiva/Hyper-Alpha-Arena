from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from schemas.alpha_trace_evidence import AlphaTraceEvidenceItem, EvidenceListResponse, EvidenceSearchResponse
from services.evidence_retrieval.evidence_store import get_static_evidence_store


router = APIRouter(prefix="/api/alpha-trace/evidence", tags=["AlphaTrace Evidence"])


@router.get("", response_model=EvidenceListResponse)
def list_alpha_trace_evidence(
    assetId: Optional[str] = Query(None),
    evidenceType: Optional[str] = Query(None),
    sourceType: Optional[str] = Query(None),
    keyword: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    minQualityScore: Optional[int] = Query(None, ge=0, le=100),
):
    store = get_static_evidence_store()
    items = store.list_evidence(
        asset_id=assetId,
        evidence_type=evidenceType,
        source_type=sourceType,
        keyword=keyword,
        min_quality_score=minQualityScore,
        limit=limit,
    )
    return EvidenceListResponse(items=items, total=len(items), limit=limit, offset=0)


@router.get("/search", response_model=EvidenceSearchResponse)
def search_alpha_trace_evidence(
    assetId: Optional[str] = Query(None),
    q: str = Query("", alias="q"),
    taskType: str = Query("single_asset_analysis"),
    limit: int = Query(5, ge=1, le=50),
):
    store = get_static_evidence_store()
    items = store.search(asset_id=assetId, query=q, task_type=taskType, limit=limit)
    return EvidenceSearchResponse(items=items, total=len(items), query=q, assetId=assetId, taskType=taskType, limit=limit)


@router.get("/{evidence_id}", response_model=AlphaTraceEvidenceItem)
def get_alpha_trace_evidence(evidence_id: str):
    item = get_static_evidence_store().get_evidence(evidence_id)
    if not item:
        raise HTTPException(status_code=404, detail=f"Evidence not found: {evidence_id}")
    return item

