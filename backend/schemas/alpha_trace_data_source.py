from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class AlphaTraceDataSourceTask(BaseModel):
    taskId: str
    taskName: str
    taskType: Optional[str] = None
    status: str
    startedAt: str
    endedAt: Optional[str] = None
    finishedAt: Optional[str] = None
    durationSeconds: Optional[int] = None
    recordsFetched: Optional[int] = None
    recordsSucceeded: Optional[int] = None
    recordsFailed: Optional[int] = None
    errorMessage: Optional[str] = None
    warningMessage: Optional[str] = None
    nextRetryAt: Optional[str] = None
    message: Optional[str] = None


class AlphaTraceDataSourceItem(BaseModel):
    sourceId: str
    name: str
    sourceType: str
    vendor: str
    status: str
    reliabilityScore: int
    qualityScore: int
    lastSyncAt: str
    syncFrequency: str
    supportedAssetTypes: List[str] = Field(default_factory=list)
    dataCategories: List[str] = Field(default_factory=list)
    evidenceSources: List[str] = Field(default_factory=list)
    description: Optional[str] = None
    configState: str = "configured"
    governanceNotes: List[str] = Field(default_factory=list)
    recentTasks: List[AlphaTraceDataSourceTask] = Field(default_factory=list)


class DataSourceListResponse(BaseModel):
    items: List[AlphaTraceDataSourceItem]
    total: int
    limit: int
    offset: int = 0
