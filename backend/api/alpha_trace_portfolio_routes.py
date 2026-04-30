from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from schemas.alpha_trace_portfolio import (
    AlphaTracePortfolioItem,
    PortfolioAssetResponse,
    PortfolioDecisionResponse,
    PortfolioHoldingResponse,
    PortfolioListResponse,
    PortfolioRecommendationResponse,
    PortfolioStrategyResponse,
)
from services.portfolio_store.portfolio_store import get_static_portfolio_store


router = APIRouter(prefix="/api/alpha-trace/portfolios", tags=["AlphaTrace Portfolios"])


@router.get("", response_model=PortfolioListResponse)
def list_alpha_trace_portfolios(
    riskLevel: Optional[str] = Query(None),
    objective: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    keyword: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    store = get_static_portfolio_store()
    items = store.list_portfolios(
        risk_level=riskLevel,
        objective=objective,
        status=status,
        keyword=keyword,
        limit=limit,
        offset=offset,
    )
    total = store.count_portfolios(risk_level=riskLevel, objective=objective, status=status, keyword=keyword)
    return PortfolioListResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/{portfolio_id}/holdings", response_model=PortfolioHoldingResponse)
def get_alpha_trace_portfolio_holdings(
    portfolio_id: str,
    limit: int = Query(100, ge=1, le=500),
):
    store = get_static_portfolio_store()
    if not store.get_portfolio(portfolio_id):
        raise HTTPException(status_code=404, detail=f"Portfolio not found: {portfolio_id}")
    items = store.get_portfolio_holdings(portfolio_id)[:limit]
    return PortfolioHoldingResponse(portfolioId=portfolio_id, items=items, total=len(items), limit=limit)


@router.get("/{portfolio_id}/recommendations", response_model=PortfolioRecommendationResponse)
def get_alpha_trace_portfolio_recommendations(
    portfolio_id: str,
    limit: int = Query(100, ge=1, le=500),
):
    store = get_static_portfolio_store()
    if not store.get_portfolio(portfolio_id):
        raise HTTPException(status_code=404, detail=f"Portfolio not found: {portfolio_id}")
    items = store.get_portfolio_recommendations(portfolio_id)[:limit]
    return PortfolioRecommendationResponse(portfolioId=portfolio_id, items=items, total=len(items), limit=limit)


@router.get("/{portfolio_id}/assets", response_model=PortfolioAssetResponse)
def get_alpha_trace_portfolio_assets(
    portfolio_id: str,
    limit: int = Query(100, ge=1, le=500),
):
    store = get_static_portfolio_store()
    if not store.get_portfolio(portfolio_id):
        raise HTTPException(status_code=404, detail=f"Portfolio not found: {portfolio_id}")
    items = store.get_portfolio_assets(portfolio_id, limit=limit)
    return PortfolioAssetResponse(portfolioId=portfolio_id, items=items, total=len(items), limit=limit)


@router.get("/{portfolio_id}/strategies", response_model=PortfolioStrategyResponse)
def get_alpha_trace_portfolio_strategies(
    portfolio_id: str,
    limit: int = Query(100, ge=1, le=500),
):
    store = get_static_portfolio_store()
    if not store.get_portfolio(portfolio_id):
        raise HTTPException(status_code=404, detail=f"Portfolio not found: {portfolio_id}")
    items = store.get_portfolio_strategies(portfolio_id, limit=limit)
    return PortfolioStrategyResponse(portfolioId=portfolio_id, items=items, total=len(items), limit=limit)


@router.get("/{portfolio_id}/decisions", response_model=PortfolioDecisionResponse)
def get_alpha_trace_portfolio_decisions(
    portfolio_id: str,
    limit: int = Query(100, ge=1, le=500),
):
    store = get_static_portfolio_store()
    if not store.get_portfolio(portfolio_id):
        raise HTTPException(status_code=404, detail=f"Portfolio not found: {portfolio_id}")
    items = store.get_portfolio_decisions(portfolio_id, limit=limit)
    return PortfolioDecisionResponse(portfolioId=portfolio_id, items=items, total=len(items), limit=limit)


@router.get("/{portfolio_id}", response_model=AlphaTracePortfolioItem)
def get_alpha_trace_portfolio(portfolio_id: str):
    item = get_static_portfolio_store().get_portfolio(portfolio_id)
    if not item:
        raise HTTPException(status_code=404, detail=f"Portfolio not found: {portfolio_id}")
    return item
