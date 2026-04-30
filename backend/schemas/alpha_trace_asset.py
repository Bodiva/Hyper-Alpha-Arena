from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from schemas.alpha_trace_evidence import AlphaTraceEvidenceItem


class AlphaTraceAssetItem(BaseModel):
    assetId: str
    id: str
    symbol: str
    name: str
    assetType: str
    market: str
    currency: str
    tags: List[str] = Field(default_factory=list)
    description: str
    updatedAt: str
    riskLevel: str = "medium"
    liquidityLevel: str = "medium"
    relatedEvidenceIds: List[str] = Field(default_factory=list)
    metrics: Dict[str, Any] = Field(default_factory=dict)
    profile: Dict[str, Any] = Field(default_factory=dict)
    aliases: List[str] = Field(default_factory=list)


class AssetListResponse(BaseModel):
    items: List[AlphaTraceAssetItem]
    total: int
    limit: int
    offset: int = 0


class AssetEvidenceResponse(BaseModel):
    assetId: str
    items: List[AlphaTraceEvidenceItem]
    total: int
    limit: int

