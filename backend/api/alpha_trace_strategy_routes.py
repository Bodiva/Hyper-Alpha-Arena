from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from schemas.alpha_trace_strategy import (
    AlphaTraceStrategyItem,
    StrategyAssetResponse,
    StrategyEvidenceResponse,
    StrategyListResponse,
)
from services.strategy_store.strategy_store import get_static_strategy_store


router = APIRouter(prefix="/api/alpha-trace/strategies", tags=["AlphaTrace Strategies"])


@router.get("", response_model=StrategyListResponse)
def list_alpha_trace_strategies(
    strategyType: Optional[str] = Query(None),
    style: Optional[str] = Query(None),
    assetType: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    keyword: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    store = get_static_strategy_store()
    items = store.list_strategies(
        strategy_type=strategyType,
        style=style,
        asset_type=assetType,
        status=status,
        keyword=keyword,
        limit=limit,
        offset=offset,
    )
    total = store.count_strategies(
        strategy_type=strategyType,
        style=style,
        asset_type=assetType,
        status=status,
        keyword=keyword,
    )
    return StrategyListResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/{strategy_id}/assets", response_model=StrategyAssetResponse)
def get_alpha_trace_strategy_assets(
    strategy_id: str,
    limit: int = Query(50, ge=1, le=100),
):
    store = get_static_strategy_store()
    if not store.get_strategy(strategy_id):
        raise HTTPException(status_code=404, detail=f"Strategy not found: {strategy_id}")
    items = store.get_strategy_assets(strategy_id, limit=limit)
    return StrategyAssetResponse(strategyId=strategy_id, items=items, total=len(items), limit=limit)


@router.get("/{strategy_id}/evidence", response_model=StrategyEvidenceResponse)
def get_alpha_trace_strategy_evidence(
    strategy_id: str,
    limit: int = Query(50, ge=1, le=100),
):
    store = get_static_strategy_store()
    if not store.get_strategy(strategy_id):
        raise HTTPException(status_code=404, detail=f"Strategy not found: {strategy_id}")
    items = store.get_strategy_evidence(strategy_id, limit=limit)
    return StrategyEvidenceResponse(strategyId=strategy_id, items=items, total=len(items), limit=limit)


@router.get("/{strategy_id}", response_model=AlphaTraceStrategyItem)
def get_alpha_trace_strategy(strategy_id: str):
    item = get_static_strategy_store().get_strategy(strategy_id)
    if not item:
        raise HTTPException(status_code=404, detail=f"Strategy not found: {strategy_id}")
    return item
