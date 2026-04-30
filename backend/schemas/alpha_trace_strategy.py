from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from schemas.alpha_trace_asset import AlphaTraceAssetItem
from schemas.alpha_trace_evidence import AlphaTraceEvidenceItem


class AlphaTraceStrategyRule(BaseModel):
    ruleId: str
    name: str
    expression: str
    note: Optional[str] = None


class AlphaTraceBacktestSummary(BaseModel):
    startDate: str
    endDate: str
    totalReturn: float
    annualizedReturn: float
    maxDrawdown: float
    volatility: float
    sharpe: float
    winRate: float
    turnover: Optional[float] = None
    benchmark: Optional[str] = None
    excessReturn: Optional[float] = None


class AlphaTraceStrategyItem(BaseModel):
    strategyId: str
    strategyName: str
    name: str
    strategyType: str
    style: str
    styleLabel: str
    status: str
    lifecycleStatus: str
    description: str
    assetTypes: List[str] = Field(default_factory=list)
    relatedAssetIds: List[str] = Field(default_factory=list)
    relatedEvidenceIds: List[str] = Field(default_factory=list)
    relatedDecisionIds: List[str] = Field(default_factory=list)
    relatedPortfolioIds: List[str] = Field(default_factory=list)
    frequency: Optional[str] = None
    horizon: Optional[str] = None
    riskLevel: Optional[str] = None
    ownerAgentId: str = "strategy_agent"
    rules: List[AlphaTraceStrategyRule] = Field(default_factory=list)
    signals: List[str] = Field(default_factory=list)
    riskControls: List[str] = Field(default_factory=list)
    backtestSummary: AlphaTraceBacktestSummary
    applicableScenarios: List[str] = Field(default_factory=list)
    invalidationConditions: List[str] = Field(default_factory=list)
    majorRisks: List[str] = Field(default_factory=list)
    triggerConditions: List[str] = Field(default_factory=list)
    rebalanceFrequency: Optional[str] = None
    riskConstraints: List[str] = Field(default_factory=list)
    observationIndicators: List[str] = Field(default_factory=list)
    createdAt: str
    updatedAt: str
    tags: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class StrategyListResponse(BaseModel):
    items: List[AlphaTraceStrategyItem]
    total: int
    limit: int
    offset: int = 0


class StrategyAssetResponse(BaseModel):
    strategyId: str
    items: List[AlphaTraceAssetItem]
    total: int
    limit: int


class StrategyEvidenceResponse(BaseModel):
    strategyId: str
    items: List[AlphaTraceEvidenceItem]
    total: int
    limit: int
