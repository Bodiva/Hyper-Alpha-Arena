from __future__ import annotations

from typing import Any, Dict, List, Optional

from schemas.alpha_trace_asset import AlphaTraceAssetItem
from schemas.alpha_trace_portfolio import (
    AlphaTracePortfolioHolding,
    AlphaTracePortfolioItem,
    AlphaTraceRebalanceRecommendation,
)
from schemas.alpha_trace_strategy import AlphaTraceStrategyItem
from services.asset_store.asset_store import get_static_asset_store
from services.portfolio_store.static_portfolio_seed import get_static_portfolio_seed
from services.strategy_store.strategy_store import get_static_strategy_store


class StaticPortfolioStore:
    """Read-only Portfolio Store backed by AlphaTrace static portfolio seed."""

    def __init__(self) -> None:
        raw_items = []
        for item in get_static_portfolio_seed():
            normalized = dict(item)
            normalized["positions"] = item.get("holdings", [])
            normalized["rebalanceSuggestions"] = item.get("rebalanceRecommendations", [])
            raw_items.append(normalized)
        self._items = [AlphaTracePortfolioItem.model_validate(item) for item in raw_items]
        self._by_id = {item.portfolioId: item for item in self._items}

    def list_portfolios(
        self,
        risk_level: Optional[str] = None,
        objective: Optional[str] = None,
        status: Optional[str] = None,
        keyword: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[AlphaTracePortfolioItem]:
        keyword_normalized = (keyword or "").strip().lower()
        objective_normalized = (objective or "").strip().lower()
        items: List[AlphaTracePortfolioItem] = []
        for item in self._items:
            if risk_level and item.riskLevel != risk_level:
                continue
            if status and item.status != status:
                continue
            if objective_normalized and objective_normalized not in item.objective.lower():
                continue
            if keyword_normalized:
                searchable = f"{item.name} {item.objective} {item.description} {' '.join(item.tags)}".lower()
                if keyword_normalized not in searchable:
                    continue
            items.append(item)

        items.sort(key=lambda portfolio: (portfolio.riskLevel, portfolio.name))
        return items[offset : offset + limit]

    def count_portfolios(
        self,
        risk_level: Optional[str] = None,
        objective: Optional[str] = None,
        status: Optional[str] = None,
        keyword: Optional[str] = None,
    ) -> int:
        return len(
            self.list_portfolios(
                risk_level=risk_level,
                objective=objective,
                status=status,
                keyword=keyword,
                limit=10_000,
                offset=0,
            )
        )

    def get_portfolio(self, portfolio_id: str) -> Optional[AlphaTracePortfolioItem]:
        return self._by_id.get(portfolio_id)

    def get_portfolio_holdings(self, portfolio_id: str) -> List[AlphaTracePortfolioHolding]:
        portfolio = self.get_portfolio(portfolio_id)
        return portfolio.holdings if portfolio else []

    def get_portfolio_recommendations(self, portfolio_id: str) -> List[AlphaTraceRebalanceRecommendation]:
        portfolio = self.get_portfolio(portfolio_id)
        return portfolio.rebalanceRecommendations if portfolio else []

    def get_portfolio_assets(self, portfolio_id: str, limit: int = 50) -> List[AlphaTraceAssetItem]:
        portfolio = self.get_portfolio(portfolio_id)
        if not portfolio:
            return []

        asset_store = get_static_asset_store()
        items: List[AlphaTraceAssetItem] = []
        seen = set()
        asset_ids = list(portfolio.relatedAssetIds) + [holding.assetId for holding in portfolio.holdings]
        for asset_id in asset_ids:
            asset = asset_store.get_asset(asset_id)
            if asset and asset.assetId not in seen:
                items.append(asset)
                seen.add(asset.assetId)
            if len(items) >= limit:
                return items
        return items

    def get_portfolio_strategies(self, portfolio_id: str, limit: int = 50) -> List[AlphaTraceStrategyItem]:
        portfolio = self.get_portfolio(portfolio_id)
        if not portfolio:
            return []

        strategy_store = get_static_strategy_store()
        items: List[AlphaTraceStrategyItem] = []
        seen = set()
        for strategy_id in portfolio.relatedStrategyIds:
            strategy = strategy_store.get_strategy(strategy_id)
            if strategy and strategy.strategyId not in seen:
                items.append(strategy)
                seen.add(strategy.strategyId)
            if len(items) >= limit:
                return items
        return items

    def get_portfolio_decisions(self, portfolio_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        portfolio = self.get_portfolio(portfolio_id)
        if not portfolio:
            return []
        # Decision Store is intentionally not introduced in Task 35.
        return []


def get_static_portfolio_store() -> StaticPortfolioStore:
    return StaticPortfolioStore()
