from __future__ import annotations

from typing import List, Optional

from schemas.alpha_trace_asset import AlphaTraceAssetItem
from schemas.alpha_trace_evidence import AlphaTraceEvidenceItem
from schemas.alpha_trace_strategy import AlphaTraceStrategyItem
from services.domain_store import get_domain_store_type, get_mysql_domain_store
from services.asset_store.asset_store import get_static_asset_store
from services.evidence_retrieval.evidence_store import get_static_evidence_store
from services.strategy_store.static_strategy_seed import get_static_strategy_seed


class StaticStrategyStore:
    """Read-only Strategy Store backed by AlphaTrace static strategy seed."""

    def __init__(self) -> None:
        self._items = [AlphaTraceStrategyItem.model_validate(item) for item in get_static_strategy_seed()]
        self._by_id = {item.strategyId: item for item in self._items}

    def list_strategies(
        self,
        strategy_type: Optional[str] = None,
        style: Optional[str] = None,
        asset_type: Optional[str] = None,
        status: Optional[str] = None,
        keyword: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[AlphaTraceStrategyItem]:
        keyword_normalized = (keyword or "").strip().lower()
        items: List[AlphaTraceStrategyItem] = []

        for item in self._items:
            if strategy_type and item.strategyType != strategy_type:
                continue
            if style and item.style != style and item.styleLabel != style:
                continue
            if asset_type and asset_type not in item.assetTypes:
                continue
            if status and item.status != status and item.lifecycleStatus != status:
                continue
            if keyword_normalized:
                searchable = " ".join(
                    [
                        item.strategyName,
                        item.name,
                        item.description,
                        item.strategyType,
                        item.style,
                        item.styleLabel,
                        " ".join(item.tags),
                        " ".join(rule.name + " " + rule.expression + " " + (rule.note or "") for rule in item.rules),
                    ]
                ).lower()
                if keyword_normalized not in searchable:
                    continue
            items.append(item)

        items.sort(key=lambda strategy: strategy.backtestSummary.totalReturn, reverse=True)
        return items[offset : offset + limit]

    def count_strategies(
        self,
        strategy_type: Optional[str] = None,
        style: Optional[str] = None,
        asset_type: Optional[str] = None,
        status: Optional[str] = None,
        keyword: Optional[str] = None,
    ) -> int:
        return len(
            self.list_strategies(
                strategy_type=strategy_type,
                style=style,
                asset_type=asset_type,
                status=status,
                keyword=keyword,
                limit=10_000,
                offset=0,
            )
        )

    def get_strategy(self, strategy_id: str) -> Optional[AlphaTraceStrategyItem]:
        return self._by_id.get(strategy_id)

    def get_strategy_assets(self, strategy_id: str, limit: int = 50) -> List[AlphaTraceAssetItem]:
        strategy = self.get_strategy(strategy_id)
        if not strategy:
            return []

        asset_store = get_static_asset_store()
        items: List[AlphaTraceAssetItem] = []
        seen = set()
        for asset_id in strategy.relatedAssetIds:
            asset = asset_store.get_asset(asset_id)
            if asset and asset.assetId not in seen:
                items.append(asset)
                seen.add(asset.assetId)
            if len(items) >= limit:
                return items

        for asset_type in strategy.assetTypes:
            for asset in asset_store.list_assets(asset_type=asset_type, limit=limit):
                if asset.assetId not in seen:
                    items.append(asset)
                    seen.add(asset.assetId)
                if len(items) >= limit:
                    return items
        return items

    def get_strategy_evidence(self, strategy_id: str, limit: int = 50) -> List[AlphaTraceEvidenceItem]:
        strategy = self.get_strategy(strategy_id)
        if not strategy:
            return []

        evidence_store = get_static_evidence_store()
        items: List[AlphaTraceEvidenceItem] = []
        seen = set()

        for evidence_id in strategy.relatedEvidenceIds:
            evidence = evidence_store.get_evidence(evidence_id)
            if evidence and evidence.evidenceId not in seen:
                items.append(evidence)
                seen.add(evidence.evidenceId)
            if len(items) >= limit:
                return items

        for asset_id in strategy.relatedAssetIds:
            for evidence in evidence_store.list_evidence(asset_id=asset_id, limit=limit):
                if evidence.evidenceId not in seen:
                    items.append(evidence)
                    seen.add(evidence.evidenceId)
                if len(items) >= limit:
                    return items
        return items


def get_static_strategy_store() -> StaticStrategyStore:
    if get_domain_store_type() == "mysql":
        return MysqlStrategyStore()
    return StaticStrategyStore()


class MysqlStrategyStore(StaticStrategyStore):
    """Strategy Store backed by MySQL seed payloads."""

    def __init__(self) -> None:
        domain_store = get_mysql_domain_store()
        seed = [
            AlphaTraceStrategyItem.model_validate(item).model_dump(mode="json")
            for item in get_static_strategy_seed()
        ]
        domain_store.seed_if_empty(
            domain_store.strategies,
            "strategy_id",
            seed,
            lambda item: {
                "strategy_id": item["strategyId"],
                "strategy_type": item.get("strategyType"),
                "style": item.get("style"),
                "status": item.get("status"),
                "updated_at": item.get("updatedAt"),
            },
        )
        self._items = [AlphaTraceStrategyItem.model_validate(item) for item in domain_store.fetch_all(domain_store.strategies)]
        self._by_id = {item.strategyId: item for item in self._items}
