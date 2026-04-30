from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from schemas.alpha_trace_asset import AlphaTraceAssetItem
from schemas.alpha_trace_strategy import AlphaTraceStrategyItem


class AlphaTracePortfolioHolding(BaseModel):
    assetId: str
    symbol: str
    assetName: str
    assetType: str
    weight: float
    targetWeight: float
    quantity: float = 0
    marketValue: float = 0
    costBasis: float = 0
    avgCost: float = 0
    latestPrice: float = 0
    unrealizedPnl: float = 0
    unrealizedPnlPct: float = 0
    returnContribution: float = 0
    riskContribution: float = 0
    actionSuggestion: str = "HOLD"


class AlphaTracePortfolioExposure(BaseModel):
    dimension: str
    name: str
    value: float


class AlphaTracePortfolioRiskMetrics(BaseModel):
    volatility: float
    maxDrawdown: float
    sharpe: float
    sortino: float = 0
    beta: float = 1
    var95: float
    concentration: float = 0
    liquidityScore: float = 0
    correlationRisk: float = 0
    riskScore: float = 0


class AlphaTraceRebalanceRecommendation(BaseModel):
    recommendationId: str
    action: str
    assetId: str
    fromWeight: float
    toWeight: float
    reason: str
    priority: str = "MEDIUM"
    expectedImpact: Optional[str] = None
    riskImpact: Optional[str] = None
    relatedEvidenceIds: List[str] = Field(default_factory=list)
    evidenceIds: List[str] = Field(default_factory=list)
    relatedDecisionIds: List[str] = Field(default_factory=list)
    status: str = "PENDING"


class AlphaTracePortfolioItem(BaseModel):
    portfolioId: str
    name: str
    objective: str
    riskLevel: str
    status: str
    description: str
    baseCurrency: str
    totalValue: float
    cashWeight: float = 0
    updatedAt: str
    relatedAssetIds: List[str] = Field(default_factory=list)
    relatedStrategyIds: List[str] = Field(default_factory=list)
    relatedDecisionIds: List[str] = Field(default_factory=list)
    holdings: List[AlphaTracePortfolioHolding] = Field(default_factory=list)
    positions: List[AlphaTracePortfolioHolding] = Field(default_factory=list)
    exposures: List[AlphaTracePortfolioExposure] = Field(default_factory=list)
    riskMetrics: AlphaTracePortfolioRiskMetrics
    rebalanceRecommendations: List[AlphaTraceRebalanceRecommendation] = Field(default_factory=list)
    rebalanceSuggestions: List[AlphaTraceRebalanceRecommendation] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class PortfolioListResponse(BaseModel):
    items: List[AlphaTracePortfolioItem]
    total: int
    limit: int
    offset: int = 0


class PortfolioHoldingResponse(BaseModel):
    portfolioId: str
    items: List[AlphaTracePortfolioHolding]
    total: int
    limit: int


class PortfolioRecommendationResponse(BaseModel):
    portfolioId: str
    items: List[AlphaTraceRebalanceRecommendation]
    total: int
    limit: int


class PortfolioAssetResponse(BaseModel):
    portfolioId: str
    items: List[AlphaTraceAssetItem]
    total: int
    limit: int


class PortfolioStrategyResponse(BaseModel):
    portfolioId: str
    items: List[AlphaTraceStrategyItem]
    total: int
    limit: int


class PortfolioDecisionResponse(BaseModel):
    portfolioId: str
    items: List[Dict[str, Any]] = Field(default_factory=list)
    total: int
    limit: int
