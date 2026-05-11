from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from schemas.alpha_trace_asset import AlphaTraceAssetItem, AssetEvidenceResponse, AssetListResponse
from services.clickhouse_asset_store import get_clickhouse_asset_store
from services.clickhouse_business_store import ClickHouseStoreError


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
    try:
        items, total = get_clickhouse_asset_store().list_assets(
            asset_type=assetType,
            market=market,
            keyword=keyword,
            tag=tag,
            limit=limit,
            offset=offset,
        )
        return AssetListResponse(items=items, total=total, limit=limit, offset=offset)
    except ClickHouseStoreError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/{asset_id}/evidence", response_model=AssetEvidenceResponse)
def get_alpha_trace_asset_evidence(
    asset_id: str,
    limit: int = Query(20, ge=1, le=100),
):
    try:
        asset = get_clickhouse_asset_store().get_asset(asset_id)
    except ClickHouseStoreError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if not asset:
        raise HTTPException(status_code=404, detail=f"Asset not found: {asset_id}")
    return AssetEvidenceResponse(assetId=asset_id, items=[], total=0, limit=limit)


@router.get("/{asset_id}", response_model=AlphaTraceAssetItem)
def get_alpha_trace_asset(asset_id: str):
    try:
        item = get_clickhouse_asset_store().get_asset(asset_id)
    except ClickHouseStoreError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if not item:
        raise HTTPException(status_code=404, detail=f"Asset not found: {asset_id}")
    return item
