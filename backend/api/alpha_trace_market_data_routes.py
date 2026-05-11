from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from schemas.alpha_trace_market_data import (
    AlphaTraceFundManagerProfileResponse,
    AlphaTraceMarketIndicatorResponse,
    AlphaTraceMarketKlineResponse,
    AlphaTraceMarketQuote,
    AlphaTraceMarketSnapshot,
)
from services.clickhouse_asset_store import get_clickhouse_asset_store
from services.clickhouse_business_store import ClickHouseStoreError


router = APIRouter(prefix="/api/alpha-trace/market-data", tags=["AlphaTrace Market Data"])


def _ensure_asset(asset_id: str) -> None:
    if not get_clickhouse_asset_store().get_asset(asset_id):
        raise HTTPException(status_code=404, detail=f"Asset not found: {asset_id}")


@router.get("/assets/{asset_id}/quote", response_model=AlphaTraceMarketQuote)
def get_alpha_trace_asset_quote(asset_id: str):
    try:
        _ensure_asset(asset_id)
        quote = get_clickhouse_asset_store().get_quote(asset_id)
    except ClickHouseStoreError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if not quote:
        raise HTTPException(status_code=404, detail=f"Market quote not found for asset: {asset_id}")
    return quote


@router.get("/assets/{asset_id}/snapshot", response_model=AlphaTraceMarketSnapshot)
def get_alpha_trace_asset_market_snapshot(asset_id: str):
    try:
        _ensure_asset(asset_id)
        snapshot = get_clickhouse_asset_store().get_snapshot(asset_id)
    except ClickHouseStoreError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if not snapshot:
        raise HTTPException(status_code=404, detail=f"Market snapshot not found for asset: {asset_id}")
    return snapshot


@router.get("/assets/{asset_id}/fund-managers", response_model=AlphaTraceFundManagerProfileResponse)
def get_alpha_trace_asset_fund_managers(asset_id: str, include_external: bool = Query(False)):
    try:
        _ensure_asset(asset_id)
        profile = get_clickhouse_asset_store().get_fund_manager_profiles(asset_id, include_external=include_external)
    except ClickHouseStoreError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if not profile:
        raise HTTPException(status_code=404, detail=f"Fund manager profile not found for asset: {asset_id}")
    return profile


@router.get("/assets/{asset_id}/klines", response_model=AlphaTraceMarketKlineResponse)
def get_alpha_trace_asset_klines(
    asset_id: str,
    period: str = Query("1d", pattern="^(1m|5m|15m|30m|1h|4h|1d|1w)$"),
    limit: int = Query(240, ge=1, le=2000),
):
    try:
        _ensure_asset(asset_id)
        items = get_clickhouse_asset_store().get_klines(asset_id, period=period, limit=limit)
    except ClickHouseStoreError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if not items:
        raise HTTPException(status_code=404, detail=f"Market klines not found for asset: {asset_id}")
    return AlphaTraceMarketKlineResponse(assetId=asset_id, symbol=items[0].symbol, period=period, count=len(items), items=items)


@router.get("/assets/{asset_id}/indicators", response_model=AlphaTraceMarketIndicatorResponse)
def get_alpha_trace_asset_market_indicators(asset_id: str):
    try:
        _ensure_asset(asset_id)
        items = get_clickhouse_asset_store().get_indicators(asset_id)
    except ClickHouseStoreError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if not items:
        raise HTTPException(status_code=404, detail=f"Market indicators not found for asset: {asset_id}")
    return AlphaTraceMarketIndicatorResponse(assetId=asset_id, symbol=items[0].symbol, items=items, total=len(items))
