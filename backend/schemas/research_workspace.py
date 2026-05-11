from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

from schemas.research_workspace_taxonomy import ResearchArtifactType


WorkspaceType = Literal["asset", "portfolio", "strategy", "theme"]
WorkspaceStatus = Literal["active", "archived"]
WorkspaceEventType = Literal[
    "workspace.created",
    "thread.created",
    "run.submitted",
    "run.completed",
    "memory.updated",
    "review.updated",
]
ReviewStatus = Literal["pending", "approved", "rejected", "needs_revision"]


class WorkspaceMemory(BaseModel):
    researchObjective: str = ""
    currentThesis: str = ""
    confirmedFacts: List[str] = Field(default_factory=list)
    openQuestions: List[str] = Field(default_factory=list)
    riskConstraints: List[str] = Field(default_factory=list)
    lastDecision: Optional[Dict[str, Any]] = None
    updatedAt: Optional[str] = None


class ResearchWorkspace(BaseModel):
    workspaceId: str
    name: str
    description: str = ""
    type: WorkspaceType = "asset"
    primaryAssetId: Optional[str] = None
    portfolioId: Optional[str] = None
    strategyId: Optional[str] = None
    status: WorkspaceStatus = "active"
    pinnedRunId: Optional[str] = None
    memory: WorkspaceMemory = Field(default_factory=WorkspaceMemory)
    createdAt: str
    updatedAt: str


class WorkspaceThread(BaseModel):
    threadId: str
    workspaceId: str
    title: str
    status: WorkspaceStatus = "active"
    linkedRunIds: List[str] = Field(default_factory=list)
    createdAt: str
    updatedAt: str


class WorkspaceTimelineEvent(BaseModel):
    eventId: str
    workspaceId: str
    threadId: Optional[str] = None
    runId: Optional[str] = None
    type: WorkspaceEventType
    title: str
    summary: str = ""
    payload: Dict[str, Any] = Field(default_factory=dict)
    createdAt: str


class WorkspaceArtifact(BaseModel):
    artifactId: str
    workspaceId: str
    threadId: Optional[str] = None
    runId: Optional[str] = None
    artifactType: ResearchArtifactType | str
    title: str
    summary: str = ""
    payload: Dict[str, Any] = Field(default_factory=dict)
    createdAt: str


class ResearchWorkspaceSnapshot(BaseModel):
    workspace: ResearchWorkspace
    threads: List[WorkspaceThread] = Field(default_factory=list)
    timeline: List[WorkspaceTimelineEvent] = Field(default_factory=list)
    artifacts: List[WorkspaceArtifact] = Field(default_factory=list)


class EnsureResearchWorkspaceRequest(BaseModel):
    assetId: Optional[str] = None
    portfolioId: Optional[str] = None
    strategyId: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None


class CreateWorkspaceThreadRequest(BaseModel):
    threadId: Optional[str] = None
    title: Optional[str] = None


class UpdateDecisionReviewRequest(BaseModel):
    runId: str
    status: ReviewStatus
    note: Optional[str] = None
    reviewer: Optional[str] = None
    threadId: Optional[str] = None
