from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class AlphaTraceMarketQuote(BaseModel):
    assetId: str
    symbol: str
    name: str
    assetType: str
    market: str
    currency: str
    price: float
    change: float = 0
    changePercent: float = 0
    volume: float = 0
    amount: float = 0
    nav: Optional[float] = None
    premiumDiscount: Optional[float] = None
    timestamp: str
    source: str


class AlphaTraceMarketKline(BaseModel):
    assetId: str
    symbol: str
    period: str
    timestamp: int
    datetime: str
    open: float
    high: float
    low: float
    close: float
    volume: float = 0
    amount: float = 0
    source: str


class AlphaTraceMarketSnapshot(BaseModel):
    assetId: str
    symbol: str
    name: str
    assetType: str
    market: str
    currency: str
    quote: AlphaTraceMarketQuote
    valuation: Dict[str, Any] = Field(default_factory=dict)
    liquidity: Dict[str, Any] = Field(default_factory=dict)
    volatility: Dict[str, Any] = Field(default_factory=dict)
    trend: Dict[str, Any] = Field(default_factory=dict)
    fundFlow: Dict[str, Any] = Field(default_factory=dict)
    premiumDiscount: Dict[str, Any] = Field(default_factory=dict)
    source: str
    collectedAt: str


class AlphaTraceFundManagerProfileResponse(BaseModel):
    assetId: str
    symbol: str
    managers: List[Dict[str, Any]] = Field(default_factory=list)
    source: str
    collectedAt: str


class AlphaTraceMarketIndicator(BaseModel):
    assetId: str
    symbol: str
    name: str
    value: float | str
    unit: Optional[str] = None
    interpretation: str
    lookbackDays: Optional[int] = None
    source: str
    updatedAt: str


class AlphaTraceMarketKlineResponse(BaseModel):
    assetId: str
    symbol: str
    period: str
    count: int
    items: List[AlphaTraceMarketKline]


class AlphaTraceMarketIndicatorResponse(BaseModel):
    assetId: str
    symbol: str
    items: List[AlphaTraceMarketIndicator]
    total: int
