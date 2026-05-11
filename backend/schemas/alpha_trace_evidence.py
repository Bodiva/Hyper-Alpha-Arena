from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class AlphaTraceExtractedField(BaseModel):
    field: str
    value: str
    confidence: float = 0.8


class AlphaTraceEvidenceItem(BaseModel):
    evidenceId: str
    id: str
    title: str
    sourceName: str
    sourceType: str
    sourceApiName: Optional[str] = None
    snapshotId: Optional[str] = None
    snapshotCapturedAt: Optional[str] = None
    evidenceType: str
    relatedAssetIds: List[str] = Field(default_factory=list)
    publishedAt: str
    collectedAt: str
    qualityScore: int
    reliabilityScore: int
    summary: str
    url: str = "#"
    extractedFields: List[AlphaTraceExtractedField] = Field(default_factory=list)
    usedByAgentRunIds: List[str] = Field(default_factory=list)
    usedByDecisionIds: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class EvidenceListResponse(BaseModel):
    items: List[AlphaTraceEvidenceItem]
    total: int
    limit: int
    offset: int = 0


class EvidenceSearchResponse(BaseModel):
    items: List[AlphaTraceEvidenceItem]
    total: int
    query: Optional[str] = None
    assetId: Optional[str] = None
    taskType: Optional[str] = None
    limit: int
