from __future__ import annotations

from datetime import datetime, timezone
import os
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


class ProfessionalMarketDataProviderAdapter:
    """Design-only adapter boundary for future ETF/fund/index/futures data vendors."""

    adapter_id = "professional_market_data_provider"

    def capability(self) -> IntegrationCapability:
        return IntegrationCapability(
            adapter_id=self.adapter_id,
            adapter_type="data_provider",
            display_name="Professional Market Data Provider",
            supported_operations=(
                "quote",
                "snapshot",
                "klines",
                "indicators",
                "fund_nav",
                "index_constituents",
                "announcements",
                "macro",
            ),
            supports_streaming=False,
            supports_artifacts=True,
            production_ready=False,
            notes=(
                "Planned adapter boundary for commercial ETF/fund/index/futures data. "
                "It is disabled by default and does not call any external provider in this phase."
            ),
        )

    def health(self) -> IntegrationHealth:
        enabled = (os.getenv("ALPHATRACE_PRO_MARKET_DATA_ENABLED") or "").strip().lower() == "true"
        provider_id = (os.getenv("ALPHATRACE_PRO_MARKET_DATA_PROVIDER") or "").strip()
        key_configured = bool((os.getenv("ALPHATRACE_PRO_MARKET_DATA_API_KEY") or "").strip())
        if not enabled:
            status = "disabled"
            message = "Professional market data adapter is disabled; static AlphaTrace market data remains active."
        elif not provider_id or not key_configured:
            status = "missing_config"
            message = "Professional market data adapter is enabled but provider id or backend API key is missing."
        else:
            status = "degraded"
            message = "Professional market data config is present, but live provider calls are not implemented in this phase."
        return IntegrationHealth(
            adapter_id=self.adapter_id,
            status=status,
            source="environment",
            message=message,
            checked_at=datetime.now(timezone.utc).isoformat(),
            details={
                "enabled": enabled,
                "providerConfigured": bool(provider_id),
                "apiKeyConfigured": key_configured,
                "implementation": "design_only",
            },
        )

    def query(self, request: DataQueryRequest) -> DataQueryResult:
        return DataQueryResult(
            status="skipped",
            provider_id=self.adapter_id,
            message=(
                "Professional market data provider is a design-only adapter in this phase. "
                "Use alphatrace_static_market_data for current demo context."
            ),
            raw_metadata={
                "assetId": request.asset_id,
                "taskType": request.task_type,
                "filters": dict(request.filters),
            },
        )


__all__ = ["ProfessionalMarketDataProviderAdapter", "StaticMarketDataProviderAdapter"]
