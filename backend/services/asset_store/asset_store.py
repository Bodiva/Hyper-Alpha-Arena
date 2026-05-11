from __future__ import annotations

from functools import lru_cache
from typing import List, Optional

from schemas.alpha_trace_asset import AlphaTraceAssetItem
from schemas.alpha_trace_evidence import AlphaTraceEvidenceItem
from services.asset_store.static_asset_seed import get_static_asset_seed
from services.domain_store import get_domain_store_type, get_mysql_domain_store
from services.evidence_retrieval.evidence_store import get_static_evidence_store


class StaticAssetStore:
    """Read-only Asset Store backed by AlphaTrace static asset seed."""

    def __init__(self) -> None:
        self._items = [AlphaTraceAssetItem.model_validate(item) for item in get_static_asset_seed()]
        self._by_id = {item.assetId: item for item in self._items}
        for item in self._items:
            self._by_id[item.id] = item
            for alias in item.aliases:
                self._by_id[alias] = item

    def list_assets(
        self,
        asset_type: Optional[str] = None,
        market: Optional[str] = None,
        keyword: Optional[str] = None,
        tag: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[AlphaTraceAssetItem]:
        keyword_normalized = (keyword or "").strip().lower()
        tag_normalized = (tag or "").strip().lower()
        items: List[AlphaTraceAssetItem] = []
        for item in self._items:
            if asset_type and item.assetType != asset_type:
                continue
            if market and item.market != market:
                continue
            if tag_normalized and tag_normalized not in [asset_tag.lower() for asset_tag in item.tags]:
                continue
            if keyword_normalized:
                searchable = f"{item.symbol} {item.name} {item.description} {' '.join(item.tags)}".lower()
                if keyword_normalized not in searchable:
                    continue
            items.append(item)

        items.sort(key=lambda asset: (asset.assetType, asset.symbol))
        return items[offset : offset + limit]

    def count_assets(
        self,
        asset_type: Optional[str] = None,
        market: Optional[str] = None,
        keyword: Optional[str] = None,
        tag: Optional[str] = None,
    ) -> int:
        return len(self.list_assets(asset_type=asset_type, market=market, keyword=keyword, tag=tag, limit=10_000, offset=0))

    def get_asset(self, asset_id: str) -> Optional[AlphaTraceAssetItem]:
        return self._by_id.get(asset_id)

    def get_asset_evidence(self, asset_id: str, limit: int = 20) -> List[AlphaTraceEvidenceItem]:
        asset = self.get_asset(asset_id)
        related_ids = [asset_id]
        if asset:
            related_ids.extend([asset.assetId, asset.id, asset.symbol, *asset.aliases])

        evidence_store = get_static_evidence_store()
        seen = set()
        items: List[AlphaTraceEvidenceItem] = []
        for related_id in related_ids:
            if related_id in seen:
                continue
            seen.add(related_id)
            for evidence in evidence_store.list_evidence(asset_id=related_id, limit=limit):
                if evidence.evidenceId not in {item.evidenceId for item in items}:
                    items.append(evidence)
                if len(items) >= limit:
                    return items
        return items


@lru_cache(maxsize=1)
def get_static_asset_store() -> StaticAssetStore:
    if get_domain_store_type() == "mysql":
        return MysqlAssetStore()
    return StaticAssetStore()


class MysqlAssetStore(StaticAssetStore):
    """Asset Store backed by MySQL seed payloads."""

    def __init__(self) -> None:
        domain_store = get_mysql_domain_store()
        seed = [
            AlphaTraceAssetItem.model_validate(item).model_dump(mode="json")
            for item in get_static_asset_seed()
        ]
        domain_store.seed_if_empty(
            domain_store.assets,
            "asset_id",
            seed,
            lambda item: {
                "asset_id": item["assetId"],
                "symbol": item.get("symbol"),
                "name": item.get("name"),
                "asset_type": item.get("assetType"),
                "market": item.get("market"),
                "updated_at": item.get("updatedAt"),
            },
        )
        self._items = [AlphaTraceAssetItem.model_validate(item) for item in domain_store.fetch_all(domain_store.assets)]
        self._by_id = {item.assetId: item for item in self._items}
        for item in self._items:
            self._by_id[item.id] = item
            for alias in item.aliases:
                self._by_id[alias] = item
