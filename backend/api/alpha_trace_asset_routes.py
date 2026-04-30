from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from schemas.alpha_trace_asset import AlphaTraceAssetItem, AssetEvidenceResponse, AssetListResponse
from services.asset_store.asset_store import get_static_asset_store


router = APIRouter(prefix="/api/alpha-trace/assets", tags=["AlphaTrace Assets"])


@router.get("", response_model=AssetListResponse)
def list_alpha_trace_assets(
    assetType: Optional[str] = Query(None),
    market: Optional[str] = Query(None),
    keyword: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    store = get_static_asset_store()
    items = store.list_assets(
        asset_type=assetType,
        market=market,
        keyword=keyword,
        tag=tag,
        limit=limit,
        offset=offset,
    )
    total = store.count_assets(asset_type=assetType, market=market, keyword=keyword, tag=tag)
    return AssetListResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/{asset_id}/evidence", response_model=AssetEvidenceResponse)
def get_alpha_trace_asset_evidence(
    asset_id: str,
    limit: int = Query(20, ge=1, le=100),
):
    store = get_static_asset_store()
    if not store.get_asset(asset_id):
        raise HTTPException(status_code=404, detail=f"Asset not found: {asset_id}")
    items = store.get_asset_evidence(asset_id, limit=limit)
    return AssetEvidenceResponse(assetId=asset_id, items=items, total=len(items), limit=limit)


@router.get("/{asset_id}", response_model=AlphaTraceAssetItem)
def get_alpha_trace_asset(asset_id: str):
    item = get_static_asset_store().get_asset(asset_id)
    if not item:
        raise HTTPException(status_code=404, detail=f"Asset not found: {asset_id}")
    return item

