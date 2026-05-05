from __future__ import annotations

from typing import List

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
