from __future__ import annotations

from typing import List, Optional

from schemas.alpha_trace_data_source import AlphaTraceDataSourceItem
from services.data_source_store.static_data_source_seed import get_static_data_source_seed
from services.domain_store import get_domain_store_type, get_mysql_domain_store


class DataSourceStore:
    def __init__(self) -> None:
        seed = get_static_data_source_seed()
        if get_domain_store_type() == "mysql":
            domain_store = get_mysql_domain_store()
            domain_store.seed_if_empty(
                domain_store.data_sources,
                "data_source_id",
                seed,
                lambda item: {
                    "data_source_id": item["sourceId"],
                    "source_type": item.get("sourceType"),
                    "status": item.get("status"),
                },
            )
            self._items = [
                AlphaTraceDataSourceItem.model_validate(item)
                for item in domain_store.fetch_all(domain_store.data_sources)
            ]
        else:
            self._items = [AlphaTraceDataSourceItem.model_validate(item) for item in seed]
        self._by_id = {item.sourceId: item for item in self._items}

    def list_sources(
        self,
        source_type: Optional[str] = None,
        status: Optional[str] = None,
        asset_type: Optional[str] = None,
        keyword: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[AlphaTraceDataSourceItem]:
        keyword_normalized = (keyword or "").strip().lower()
        items: List[AlphaTraceDataSourceItem] = []
        for item in self._items:
            if source_type and item.sourceType != source_type:
                continue
            if status and item.status != status:
                continue
            if asset_type and asset_type not in item.supportedAssetTypes:
                continue
            if keyword_normalized:
                searchable = " ".join(
                    [
                        item.sourceId,
                        item.name,
                        item.vendor,
                        item.sourceType,
                        item.description or "",
                        " ".join(item.evidenceSources),
                    ]
                ).lower()
                if keyword_normalized not in searchable:
                    continue
            items.append(item)
        items.sort(key=lambda source: (source.status != "HEALTHY", source.name))
        return items[offset : offset + max(1, limit)]

    def get_source(self, source_id: str) -> Optional[AlphaTraceDataSourceItem]:
        return self._by_id.get(source_id)

    def get_tasks(self, source_id: str):
        source = self.get_source(source_id)
        return source.recentTasks if source else []


_STORE: Optional[DataSourceStore] = None


def get_data_source_store() -> DataSourceStore:
    global _STORE
    if _STORE is None:
        _STORE = DataSourceStore()
    return _STORE
