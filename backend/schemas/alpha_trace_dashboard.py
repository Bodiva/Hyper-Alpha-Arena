from __future__ import annotations

from pydantic import BaseModel


class AlphaTraceDashboardCounts(BaseModel):
    assets: int
    evidence: int
    agentRuns: int
    strategies: int
    portfolios: int
    decisions: int
    dataSources: int
    leaderboard: int


class AlphaTraceDashboardSummary(BaseModel):
    counts: AlphaTraceDashboardCounts
    source: str = "mysql_summary"


class AlphaTraceTrendPoint(BaseModel):
    date: str
    value: float


class AlphaTraceFundTrendSeries(BaseModel):
    code: str
    name: str
    assetId: str | None = None
    assetType: str = "fund"
    valueField: str = "close"
    points: list[AlphaTraceTrendPoint]


class AlphaTraceFundTrendsResponse(BaseModel):
    status: str
    source: str = "clickhouse"
    tableName: str = "alpha_trace.etf_index_valuation_daily"
    message: str | None = None
    series: list[AlphaTraceFundTrendSeries]
