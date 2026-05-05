from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from schemas.alpha_trace_market_data import (
    AlphaTraceMarketIndicatorResponse,
    AlphaTraceMarketKlineResponse,
    AlphaTraceMarketQuote,
    AlphaTraceMarketSnapshot,
)
from services.asset_store.asset_store import get_static_asset_store
from services.market_data_store.market_data_store import get_static_market_data_store


router = APIRouter(prefix="/api/alpha-trace/market-data", tags=["AlphaTrace Market Data"])


def _ensure_asset(asset_id: str) -> None:
    if not get_static_asset_store().get_asset(asset_id):
        raise HTTPException(status_code=404, detail=f"Asset not found: {asset_id}")


@router.get("/assets/{asset_id}/quote", response_model=AlphaTraceMarketQuote)
def get_alpha_trace_asset_quote(asset_id: str):
    _ensure_asset(asset_id)
    quote = get_static_market_data_store().get_quote(asset_id)
    if not quote:
        raise HTTPException(status_code=404, detail=f"Market quote not found for asset: {asset_id}")
    return quote


@router.get("/assets/{asset_id}/snapshot", response_model=AlphaTraceMarketSnapshot)
def get_alpha_trace_asset_market_snapshot(asset_id: str):
    _ensure_asset(asset_id)
    snapshot = get_static_market_data_store().get_snapshot(asset_id)
    if not snapshot:
        raise HTTPException(status_code=404, detail=f"Market snapshot not found for asset: {asset_id}")
    return snapshot


@router.get("/assets/{asset_id}/klines", response_model=AlphaTraceMarketKlineResponse)
def get_alpha_trace_asset_klines(
    asset_id: str,
    period: str = Query("1d", pattern="^(1m|5m|15m|30m|1h|4h|1d|1w)$"),
    limit: int = Query(60, ge=1, le=240),
):
    _ensure_asset(asset_id)
    items = get_static_market_data_store().get_klines(asset_id, period=period, limit=limit)
    if not items:
        raise HTTPException(status_code=404, detail=f"Market klines not found for asset: {asset_id}")
    return AlphaTraceMarketKlineResponse(assetId=asset_id, symbol=items[0].symbol, period=period, count=len(items), items=items)


@router.get("/assets/{asset_id}/indicators", response_model=AlphaTraceMarketIndicatorResponse)
def get_alpha_trace_asset_market_indicators(asset_id: str):
    _ensure_asset(asset_id)
    items = get_static_market_data_store().get_indicators(asset_id)
    if not items:
        raise HTTPException(status_code=404, detail=f"Market indicators not found for asset: {asset_id}")
    return AlphaTraceMarketIndicatorResponse(assetId=asset_id, symbol=items[0].symbol, items=items, total=len(items))

