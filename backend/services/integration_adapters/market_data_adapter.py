from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Mapping

from services.integration_adapters.base import DataProviderAdapter, DataQueryRequest, DataQueryResult, IntegrationCapability, IntegrationHealth
from services.market_data_store.market_data_store import get_static_market_data_store


class StaticMarketDataProviderAdapter:
    """DataProviderAdapter wrapper for AlphaTrace static market data.

    The current provider is intentionally static. Future ETF/fund/index market
    providers should implement the same query/capability/health surface.
    """

    adapter_id = "alphatrace_static_market_data"

    def capability(self) -> IntegrationCapability:
        return IntegrationCapability(
            adapter_id=self.adapter_id,
            adapter_type="data_provider",
            display_name="AlphaTrace Static Market Data",
            supported_operations=("market_context", "quote", "snapshot", "indicators", "klines"),
            supports_streaming=False,
            supports_artifacts=False,
            production_ready=False,
            notes="Static ETF/fund/index/future market data seed used for MVP context and demos.",
        )

    def health(self) -> IntegrationHealth:
        return IntegrationHealth(
            adapter_id=self.adapter_id,
            status="ready",
            source="static_market_data_seed",
            message="Static market data seed is available in-process.",
            checked_at=datetime.now(timezone.utc).isoformat(),
        )

    def query(self, request: DataQueryRequest) -> DataQueryResult:
        asset_id = request.asset_id or str(request.filters.get("assetId") or "")
        if not asset_id:
            return DataQueryResult(
                status="failed",
                provider_id=self.adapter_id,
                message="asset_id is required for static market data queries.",
            )

        operation = str(request.filters.get("operation") or "market_context")
        store = get_static_market_data_store()
        item: Any
        if operation == "quote":
            quote = store.get_quote(asset_id)
            item = quote.model_dump(mode="json") if quote else None
        elif operation == "snapshot":
            snapshot = store.get_snapshot(asset_id)
            item = snapshot.model_dump(mode="json") if snapshot else None
        elif operation == "indicators":
            item = [indicator.model_dump(mode="json") for indicator in store.get_indicators(asset_id)]
        elif operation == "klines":
            period = str(request.filters.get("period") or "1d")
            limit = int(request.filters.get("limit") or request.limit or 60)
            item = [kline.model_dump(mode="json") for kline in store.get_klines(asset_id, period=period, limit=limit)]
        else:
            item = store.get_prompt_context(asset_id)

        if not item:
            return DataQueryResult(
                status="failed",
                provider_id=self.adapter_id,
                message=f"No static market data found for {asset_id}.",
                raw_metadata={"assetId": asset_id, "operation": operation},
            )

        payload: Mapping[str, Any] = {"assetId": asset_id, "operation": operation, "data": item}
        return DataQueryResult(
            status="completed",
            provider_id=self.adapter_id,
            items=(payload,),
            message=f"Loaded static market data for {asset_id}.",
            raw_metadata={"assetId": asset_id, "operation": operation},
        )


__all__ = ["StaticMarketDataProviderAdapter"]
