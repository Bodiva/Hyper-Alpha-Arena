from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from schemas.research_workspace import (
    CreateWorkspaceThreadRequest,
    EnsureResearchWorkspaceRequest,
    ResearchWorkspace,
    ResearchWorkspaceSnapshot,
    UpdateDecisionReviewRequest,
    WorkspaceThread,
)
from schemas.research_workspace_taxonomy import (
    LEGACY_TASK_TYPE_TO_RESEARCH_RUN_TYPE,
    RESEARCH_ARTIFACT_TYPES,
    RESEARCH_RUN_TYPES,
    RUNTIME_AGENT_ROLES,
)
from services.research_workspace_service import get_research_workspace_store


router = APIRouter(prefix="/api/alpha-trace/research-workspaces", tags=["AlphaTrace Research Workspaces"])


@router.get("", response_model=list[ResearchWorkspace])
async def list_research_workspaces(status: Optional[str] = Query(default="active")):
    return get_research_workspace_store().list_workspaces(status=status)


@router.post("/ensure", response_model=ResearchWorkspace)
async def ensure_research_workspace(payload: EnsureResearchWorkspaceRequest):
    return get_research_workspace_store().ensure_workspace(
        asset_id=payload.assetId,
        portfolio_id=payload.portfolioId,
        strategy_id=payload.strategyId,
        name=payload.name,
        description=payload.description,
    )


@router.get("/taxonomy")
async def get_research_workspace_taxonomy():
    return {
        "researchRunTypes": list(RESEARCH_RUN_TYPES),
        "researchArtifactTypes": list(RESEARCH_ARTIFACT_TYPES),
        "runtimeAgentRoles": list(RUNTIME_AGENT_ROLES),
        "legacyTaskTypeMapping": dict(LEGACY_TASK_TYPE_TO_RESEARCH_RUN_TYPE),
    }


@router.get("/{workspace_id}", response_model=ResearchWorkspaceSnapshot)
async def get_research_workspace(workspace_id: str):
    snapshot = get_research_workspace_store().snapshot(workspace_id)
    if not snapshot:
        raise HTTPException(status_code=404, detail="Research workspace not found")
    return snapshot


@router.get("/{workspace_id}/context")
async def get_research_workspace_context(
    workspace_id: str,
    threadId: Optional[str] = Query(default=None),
    assetId: Optional[str] = Query(default=None),
):
    try:
        return get_research_workspace_store().build_context(workspace_id, thread_id=threadId, asset_id=assetId)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{workspace_id}/threads", response_model=WorkspaceThread)
async def create_research_workspace_thread(workspace_id: str, payload: CreateWorkspaceThreadRequest):
    try:
        return get_research_workspace_store().get_or_create_thread(
            workspace_id,
            thread_id=payload.threadId,
            title=payload.title,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{workspace_id}/reviews")
async def update_research_workspace_review(workspace_id: str, payload: UpdateDecisionReviewRequest):
    try:
        return get_research_workspace_store().record_decision_review(
            workspace_id,
            run_id=payload.runId,
            status=payload.status,
            note=payload.note,
            reviewer=payload.reviewer,
            thread_id=payload.threadId,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
