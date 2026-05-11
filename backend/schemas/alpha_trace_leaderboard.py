from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class AlphaTraceLeaderboardItem(BaseModel):
    rank: int
    traderId: str
    traderName: str
    strategyId: str
    strategyName: str
    style: str
    styleLabel: str
    assetTypes: List[str] = Field(default_factory=list)
    runMode: str = "PAPER"
    timeRange: str = "ALL"
    totalReturn: float = 0
    annualizedReturn: float = 0
    maxDrawdown: float = 0
    volatility: float = 0
    sharpe: float = 0
    sortino: float = 0
    calmar: float = 0
    winRate: float = 0
    turnover: float = 0
    evidenceScore: float = 0
    riskScore: float = 0
    summary: str
    strengths: List[str] = Field(default_factory=list)
    risks: List[str] = Field(default_factory=list)
    completedRuns: int = 0
    failedRuns: int = 0
    averageConfidence: float = 0
    evidenceCount: int = 0
    reportCount: int = 0
    riskWarnings: int = 0
    decisionCount: int = 0
    runtimeQualityScore: float = 0


class LeaderboardListResponse(BaseModel):
    items: List[AlphaTraceLeaderboardItem]
    total: int
    limit: int
    offset: int = 0


class ClickHouseRankingItem(BaseModel):
    rank: int
    rankingType: str
    code: Optional[str] = None
    name: Optional[str] = None
    assetType: Optional[str] = None
    managerCode: Optional[str] = None
    managerName: Optional[str] = None
    fundCompany: Optional[str] = None
    fundType: Optional[str] = None
    representativeFundCode: Optional[str] = None
    representativeFundName: Optional[str] = None
    managedFunds: List[Dict[str, Any]] = Field(default_factory=list)
    activeFundCount: Optional[int] = None
    activeManagerCount: Optional[int] = None
    activeScale: Optional[float] = None
    scale: Optional[float] = None
    latestNav: Optional[float] = None
    latestDate: Optional[str] = None
    return1y: Optional[float] = None
    averageTenureRoi: Optional[float] = None
    averageAnnualizedRoi: Optional[float] = None
    scaleWeightedRoi: Optional[float] = None
    drawdown: Optional[float] = None
    turnoverRate: Optional[float] = None
    representativeManager: Optional[str] = None
    earliestRoiStartDate: Optional[str] = None
    latestRoiEndDate: Optional[str] = None
    score: float = 0
    rationale: str = ""
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ClickHouseRankingResponse(BaseModel):
    items: List[ClickHouseRankingItem]
    total: int
    limit: int
    offset: int = 0
    rankingType: str
    sortBy: str
    source: str = "rankings"
