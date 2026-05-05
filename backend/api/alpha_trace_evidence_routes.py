from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query

from schemas.alpha_trace_agent_runtime import EvidenceReference
from schemas.alpha_trace_evidence import AlphaTraceEvidenceItem, AlphaTraceExtractedField, EvidenceListResponse, EvidenceSearchResponse
from services.agent_runtime_store.registry import get_agent_run_store
from services.evidence_retrieval.evidence_store import get_static_evidence_store


router = APIRouter(prefix="/api/alpha-trace/evidence", tags=["AlphaTrace Evidence"])


def _agent_run_evidence_to_api_item(
    evidence: EvidenceReference,
    run_id: str,
    fallback_timestamp: str,
    used_by_decision_ids: list[str],
    runtime_metadata: dict[str, Any] | None = None,
) -> AlphaTraceEvidenceItem:
    extracted_fields = evidence.extractedFields or {}
    source_type = str(extracted_fields.get("sourceType") or ("bocha_search" if evidence.evidenceId.startswith("ev_bocha_") else "agent_run"))
    source_label = "Bocha Web Search" if source_type == "bocha_search" else "Agent Run Evidence"
    published_at = evidence.publishedAt or evidence.collectedAt or fallback_timestamp
    collected_at = evidence.collectedAt or evidence.publishedAt or fallback_timestamp
    return AlphaTraceEvidenceItem(
        evidenceId=evidence.evidenceId,
        id=evidence.evidenceId,
        title=evidence.title,
        sourceName=evidence.sourceName,
        sourceType=source_type,
        evidenceType=evidence.evidenceType,
        relatedAssetIds=evidence.relatedAssetIds,
        publishedAt=published_at,
        collectedAt=collected_at,
        qualityScore=evidence.qualityScore,
        reliabilityScore=evidence.reliabilityScore if evidence.reliabilityScore is not None else evidence.qualityScore,
        summary=evidence.summary,
        url=evidence.url or "#",
        extractedFields=[
            AlphaTraceExtractedField(field=key, value=str(value), confidence=0.8)
            for key, value in extracted_fields.items()
        ],
        usedByAgentRunIds=[run_id],
        usedByDecisionIds=used_by_decision_ids,
        metadata={
            "runScoped": True,
            "resolvedFrom": "agent_run_store",
            "sourceLabel": source_label,
            "provenanceStatus": "external_search" if source_type == "bocha_search" else "runtime_context",
            "governanceNote": (
                "Bocha evidence is an external web-search result. The source URL is the canonical evidence record; "
                "inline preview is best-effort."
                if source_type == "bocha_search"
                else "Runtime evidence generated or linked during an AgentRun."
            ),
            **(runtime_metadata or {}),
        },
    )


def _run_evidence_metadata(run_id: str, evidence_id: str) -> dict[str, Any]:
    store = get_agent_run_store()
    metadata: dict[str, Any] = {}
    for event in store.get_events(run_id):
        payload = event.payload or {}
        event_evidence_ids = payload.get("evidenceIds") or []
        if evidence_id not in event_evidence_ids:
            continue
        if "evidenceSupportScore" in payload:
            metadata["evidenceSupportScore"] = payload.get("evidenceSupportScore")
            metadata["evidenceSupportStatus"] = payload.get("evidenceSupportStatus")
        if "invalidEvidenceIds" in payload:
            metadata["invalidEvidenceIds"] = payload.get("invalidEvidenceIds")
        if event.type in {"evidence.linked", "decision.updated", "risk.warning"}:
            metadata["lastGovernanceEventType"] = event.type
            metadata["lastGovernanceEventId"] = event.eventId
    return metadata


def _matches_filters(
    item: AlphaTraceEvidenceItem,
    asset_id: Optional[str],
    evidence_type: Optional[str],
    source_type: Optional[str],
    keyword: Optional[str],
    min_quality_score: Optional[int],
) -> bool:
    keyword_normalized = (keyword or "").strip().lower()
    asset_id_normalized = (asset_id or "").strip().lower()
    if asset_id_normalized and asset_id_normalized not in [asset.lower() for asset in item.relatedAssetIds]:
        return False
    if evidence_type and item.evidenceType != evidence_type:
        return False
    if source_type and item.sourceType != source_type:
        return False
    if min_quality_score is not None and item.qualityScore < min_quality_score:
        return False
    if keyword_normalized:
        searchable = f"{item.evidenceId} {item.title} {item.summary} {item.sourceName} {item.sourceType} {' '.join(item.relatedAssetIds)}".lower()
        if keyword_normalized not in searchable:
            return False
    return True


def _list_run_scoped_evidence(
    asset_id: Optional[str] = None,
    evidence_type: Optional[str] = None,
    source_type: Optional[str] = None,
    keyword: Optional[str] = None,
    min_quality_score: Optional[int] = None,
    limit: int = 300,
) -> list[AlphaTraceEvidenceItem]:
    store = get_agent_run_store()
    items: list[AlphaTraceEvidenceItem] = []
    seen: set[str] = set()
    runs = sorted(store.list_runs(), key=lambda run: run.startedAt, reverse=True)
    for run in runs:
        decision = store.get_decision(run.runId)
        used_by_decision_ids = [f"decision_{run.runId}"] if decision else []
        for evidence in store.get_evidence(run.runId):
            if evidence.evidenceId in seen:
                continue
            decision_ids = used_by_decision_ids if decision and evidence.evidenceId in decision.evidenceIds else []
            item = _agent_run_evidence_to_api_item(
                evidence=evidence,
                run_id=run.runId,
                fallback_timestamp=run.updatedAt or run.startedAt,
                used_by_decision_ids=decision_ids,
                runtime_metadata=_run_evidence_metadata(run.runId, evidence.evidenceId),
            )
            if not _matches_filters(item, asset_id, evidence_type, source_type, keyword, min_quality_score):
                continue
            seen.add(item.evidenceId)
            items.append(item)
            if len(items) >= limit:
                return items
    return items


def _find_run_scoped_evidence(evidence_id: str) -> Optional[AlphaTraceEvidenceItem]:
    store = get_agent_run_store()
    runs = sorted(store.list_runs(), key=lambda run: run.startedAt, reverse=True)
    for run in runs:
        evidence_items = store.get_evidence(run.runId)
        evidence = next((item for item in evidence_items if item.evidenceId == evidence_id), None)
        if not evidence:
            continue
        decision = store.get_decision(run.runId)
        used_by_decision_ids = [f"decision_{run.runId}"] if decision and evidence_id in decision.evidenceIds else []
        return _agent_run_evidence_to_api_item(
            evidence=evidence,
            run_id=run.runId,
            fallback_timestamp=run.updatedAt or run.startedAt,
            used_by_decision_ids=used_by_decision_ids,
            runtime_metadata=_run_evidence_metadata(run.runId, evidence_id),
        )
    return None


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
    merged_by_id = {item.evidenceId: item for item in items}
    for item in _list_run_scoped_evidence(
        asset_id=assetId,
        evidence_type=evidenceType,
        source_type=sourceType,
        keyword=keyword,
        min_quality_score=minQualityScore,
        limit=limit,
    ):
        merged_by_id.setdefault(item.evidenceId, item)
    merged_items = sorted(
        merged_by_id.values(),
        key=lambda item: (item.collectedAt or item.publishedAt or "", item.qualityScore, item.reliabilityScore),
        reverse=True,
    )[:limit]
    return EvidenceListResponse(items=merged_items, total=len(merged_items), limit=limit, offset=0)


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
        item = _find_run_scoped_evidence(evidence_id)
    if not item:
        raise HTTPException(status_code=404, detail=f"Evidence not found: {evidence_id}")
    return item
