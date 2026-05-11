from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Query

from schemas.alpha_trace_leaderboard import ClickHouseRankingResponse, LeaderboardListResponse
from services.clickhouse_leaderboard_store import RankingType, get_clickhouse_leaderboard_store
from services.leaderboard_store.leaderboard_store import get_runtime_quality_leaderboard_store


router = APIRouter(prefix="/api/alpha-trace/leaderboard", tags=["AlphaTrace Leaderboard"])


@router.get("", response_model=LeaderboardListResponse)
def list_alpha_trace_leaderboard(
    strategyId: Optional[str] = Query(None),
    assetType: Optional[str] = Query(None),
    style: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    store = get_runtime_quality_leaderboard_store()
    all_items = store.list_leaderboard(
        strategy_id=strategyId,
        asset_type=assetType,
        style=style,
        limit=100_000,
        offset=0,
    )
    total = len(all_items)
    items = all_items[offset : offset + limit]
    return LeaderboardListResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/clickhouse", response_model=ClickHouseRankingResponse)
def list_clickhouse_rankings(
    rankingType: RankingType = Query("manager"),
    sortBy: str = Query("score"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    refresh: bool = Query(False),
):
    store = get_clickhouse_leaderboard_store()
    items, total = store.list_cached_rankings(
        ranking_type=rankingType,
        sort_by=sortBy,
        limit=limit,
        offset=offset,
        refresh=refresh,
    )
    return ClickHouseRankingResponse(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
        rankingType=rankingType,
        sortBy=sortBy,
    )
