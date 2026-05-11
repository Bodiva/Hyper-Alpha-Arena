from __future__ import annotations

from functools import lru_cache
from typing import Any, Dict, List, Optional

from schemas.alpha_trace_asset import AlphaTraceAssetItem
from schemas.alpha_trace_decision import AlphaTraceDecisionItem
from schemas.alpha_trace_portfolio import (
    AlphaTracePortfolioHolding,
    AlphaTracePortfolioItem,
    AlphaTraceRebalanceRecommendation,
)
from schemas.alpha_trace_strategy import AlphaTraceStrategyItem
from services.asset_store.asset_store import get_static_asset_store
from services.decision_store.decision_store import get_agent_run_decision_store
from services.domain_store import get_domain_store_type, get_mysql_domain_store
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
        if not portfolio:
            return []
        recommendations = list(portfolio.rebalanceRecommendations)
        existing_ids = {item.recommendationId for item in recommendations}
        for item in self._decision_recommendations(portfolio):
            if item.recommendationId not in existing_ids:
                recommendations.append(item)
                existing_ids.add(item.recommendationId)
        return recommendations

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
        return [item.model_dump(mode="json") for item in self._portfolio_decisions(portfolio, limit=limit)]

    def _portfolio_decisions(self, portfolio: AlphaTracePortfolioItem, limit: int = 50) -> List[AlphaTraceDecisionItem]:
        decision_store = get_agent_run_decision_store()
        seen: set[str] = set()
        items: List[AlphaTraceDecisionItem] = []

        def add(next_items: List[AlphaTraceDecisionItem]) -> None:
            for item in next_items:
                if item.decisionId in seen:
                    continue
                seen.add(item.decisionId)
                items.append(item)

        add(decision_store.list_decisions(portfolio_id=portfolio.portfolioId, limit=limit, offset=0))
        asset_ids = list(portfolio.relatedAssetIds)
        asset_ids.extend(holding.assetId for holding in portfolio.holdings)
        for asset_id in dict.fromkeys(asset_ids):
            if len(items) >= limit:
                break
            add(decision_store.list_decisions(asset_id=asset_id, limit=limit, offset=0))

        items.sort(key=lambda item: item.createdAt, reverse=True)
        return items[:limit]

    def _decision_recommendations(self, portfolio: AlphaTracePortfolioItem) -> List[AlphaTraceRebalanceRecommendation]:
        holding_by_asset = {holding.assetId: holding for holding in portfolio.holdings}
        related_assets = set(portfolio.relatedAssetIds) | set(holding_by_asset)
        items: List[AlphaTraceRebalanceRecommendation] = []
        for decision in self._portfolio_decisions(portfolio, limit=20):
            asset_id = next((asset_id for asset_id in decision.assetIds if asset_id in related_assets), None)
            if not asset_id:
                continue
            action = self._recommendation_action(decision.action)
            holding = holding_by_asset.get(asset_id)
            from_weight = holding.weight if holding else 0
            delta = 0.03 if decision.confidence >= 0.7 else 0.015
            if action == "INCREASE":
                to_weight = min(0.6, from_weight + delta)
            elif action == "DECREASE":
                to_weight = max(0, from_weight - delta)
            else:
                to_weight = from_weight
            reason = decision.thesis.splitlines()[0].strip() if decision.thesis else "来自 Agent Run 的组合关联决策。"
            items.append(
                AlphaTraceRebalanceRecommendation(
                    recommendationId=f"rec_{portfolio.portfolioId}_{decision.decisionId}",
                    action=action,
                    assetId=asset_id,
                    fromWeight=from_weight,
                    toWeight=to_weight,
                    reason=reason[:220],
                    priority="HIGH" if decision.confidence >= 0.75 else "MEDIUM",
                    expectedImpact=f"关联决策：{decision.action}，置信度 {round(decision.confidence * 100)}%。",
                    riskImpact="需结合组合集中度、回撤和流动性约束复核。",
                    relatedEvidenceIds=decision.evidenceIds,
                    evidenceIds=decision.evidenceIds,
                    relatedDecisionIds=[decision.decisionId],
                    status="PENDING",
                )
            )
        return items

    @staticmethod
    def _recommendation_action(action: str) -> str:
        normalized = (action or "").upper()
        if normalized in {"BUY", "OVERWEIGHT", "LONG", "INCREASE"}:
            return "INCREASE"
        if normalized in {"SELL", "UNDERWEIGHT", "SHORT", "REDUCE", "DECREASE", "AVOID"}:
            return "DECREASE"
        return "HOLD"


@lru_cache(maxsize=1)
def get_static_portfolio_store() -> StaticPortfolioStore:
    if get_domain_store_type() == "mysql":
        return MysqlPortfolioStore()
    return StaticPortfolioStore()


class MysqlPortfolioStore(StaticPortfolioStore):
    """Portfolio Store backed by MySQL seed payloads."""

    def __init__(self) -> None:
        domain_store = get_mysql_domain_store()
        raw_items = []
        for item in get_static_portfolio_seed():
            normalized = dict(item)
            normalized["positions"] = item.get("holdings", [])
            normalized["rebalanceSuggestions"] = item.get("rebalanceRecommendations", [])
            raw_items.append(AlphaTracePortfolioItem.model_validate(normalized).model_dump(mode="json"))
        domain_store.seed_if_empty(
            domain_store.portfolios,
            "portfolio_id",
            raw_items,
            lambda item: {
                "portfolio_id": item["portfolioId"],
                "risk_level": item.get("riskLevel"),
                "objective": item.get("objective"),
                "status": item.get("status"),
                "updated_at": item.get("updatedAt"),
            },
        )
        self._items = [
            AlphaTracePortfolioItem.model_validate(item)
            for item in domain_store.fetch_all(domain_store.portfolios)
        ]
        self._by_id = {item.portfolioId: item for item in self._items}
