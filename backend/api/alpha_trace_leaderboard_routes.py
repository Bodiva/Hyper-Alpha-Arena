from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Query

from schemas.alpha_trace_leaderboard import LeaderboardListResponse
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
    items = store.list_leaderboard(
        strategy_id=strategyId,
        asset_type=assetType,
        style=style,
        limit=limit,
        offset=offset,
    )
    total = len(
        store.list_leaderboard(
            strategy_id=strategyId,
            asset_type=assetType,
            style=style,
            limit=100_000,
            offset=0,
        )
    )
    return LeaderboardListResponse(items=items, total=total, limit=limit, offset=offset)
