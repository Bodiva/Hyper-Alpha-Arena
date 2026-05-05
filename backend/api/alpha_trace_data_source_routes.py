from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from schemas.alpha_trace_data_source import AlphaTraceDataSourceItem, AlphaTraceDataSourceTask, DataSourceListResponse
from services.data_api import get_data_api_catalog
from services.data_source_store import get_data_source_store


router = APIRouter(prefix="/api/alpha-trace/data-sources", tags=["AlphaTrace Data Sources"])


@router.get("", response_model=DataSourceListResponse)
def list_alpha_trace_data_sources(
    sourceType: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    assetType: Optional[str] = Query(None),
    keyword: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    items = get_data_source_store().list_sources(
        source_type=sourceType,
        status=status,
        asset_type=assetType,
        keyword=keyword,
        limit=limit,
        offset=offset,
    )
    return DataSourceListResponse(items=items, total=len(items), limit=limit, offset=offset)


@router.get("/api-catalog")
def get_alpha_trace_data_api_catalog():
    return get_data_api_catalog().to_response()


@router.get("/{source_id}", response_model=AlphaTraceDataSourceItem)
def get_alpha_trace_data_source(source_id: str):
    source = get_data_source_store().get_source(source_id)
    if not source:
        raise HTTPException(status_code=404, detail=f"Data source not found: {source_id}")
    return source


@router.get("/{source_id}/tasks", response_model=list[AlphaTraceDataSourceTask])
def get_alpha_trace_data_source_tasks(source_id: str):
    source = get_data_source_store().get_source(source_id)
    if not source:
        raise HTTPException(status_code=404, detail=f"Data source not found: {source_id}")
    return source.recentTasks
