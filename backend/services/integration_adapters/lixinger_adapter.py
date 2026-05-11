from __future__ import annotations

from datetime import datetime, timezone
import os
from typing import Any

from integrations.lixinger import LixingerApiError, get_lixinger_client
from services.integration_adapters.base import DataQueryRequest, DataQueryResult, IntegrationCapability, IntegrationHealth


class LixingerDataProviderAdapter:
    """Read-only adapter for Lixinger CN index, fund, and fund manager data."""

    adapter_id = "lixinger_cn_market_data"

    def capability(self) -> IntegrationCapability:
        return IntegrationCapability(
            adapter_id=self.adapter_id,
            adapter_type="data_provider",
            display_name="Lixinger CN Market Data",
            supported_operations=("cn_index", "cn_fund", "cn_fund_manager"),
            supports_streaming=False,
            supports_artifacts=False,
            production_ready=False,
            notes="Live read-only adapter for Lixinger Open API. Platform persistence and scheduling are intentionally deferred.",
        )

    def health(self) -> IntegrationHealth:
        token_configured = bool(
            (os.getenv("ALPHATRACE_LIXINGER_TOKEN") or os.getenv("LIXINGER_TOKEN") or "").strip()
        )
        return IntegrationHealth(
            adapter_id=self.adapter_id,
            status="ready" if token_configured else "missing_config",
            source="environment",
            message=(
                "Lixinger token is configured for live read-only queries."
                if token_configured
                else "Set ALPHATRACE_LIXINGER_TOKEN or LIXINGER_TOKEN to enable Lixinger queries."
            ),
            checked_at=datetime.now(timezone.utc).isoformat(),
            details={
                "tokenConfigured": token_configured,
                "baseUrlConfigured": bool((os.getenv("ALPHATRACE_LIXINGER_BASE_URL") or "").strip()),
                "liveHealthcheck": False,
            },
        )

    def query(self, request: DataQueryRequest) -> DataQueryResult:
        operation = str(request.filters.get("operation") or "cn_fund")
        stock_codes = _coerce_stock_codes(request.filters.get("stockCodes") or request.asset_id)
        try:
            client = get_lixinger_client()
            if operation == "cn_index":
                payload = client.get_cn_indices(stock_codes or None)
            elif operation == "cn_fund_manager":
                payload = client.get_cn_fund_managers(stock_codes)
            elif operation == "cn_fund":
                page_index = int(request.filters.get("pageIndex") or 0)
                payload = client.get_cn_funds(stock_codes or None, page_index=page_index)
            else:
                return DataQueryResult(
                    status="failed",
                    provider_id=self.adapter_id,
                    message=f"Unsupported Lixinger operation: {operation}",
                    raw_metadata={"operation": operation},
                )
        except (LixingerApiError, ValueError) as exc:
            return DataQueryResult(
                status="failed",
                provider_id=self.adapter_id,
                message=str(exc),
                raw_metadata={"operation": operation, "stockCodes": stock_codes},
            )

        rows = tuple(row for row in payload.get("data", []) if isinstance(row, dict))
        return DataQueryResult(
            status="completed",
            provider_id=self.adapter_id,
            items=rows[: max(1, request.limit)],
            message=f"Lixinger {operation} query completed.",
            raw_metadata={
                "operation": operation,
                "stockCodes": stock_codes,
                "returnedRows": len(rows),
                "total": payload.get("total"),
                "message": payload.get("message"),
            },
        )


def _coerce_stock_codes(value: Any) -> list[str]:
    if value is None or value == "":
        return []
    if isinstance(value, str):
        return [value]
    if isinstance(value, (list, tuple, set)):
        return [str(item) for item in value if item not in (None, "")]
    return [str(value)]


__all__ = ["LixingerDataProviderAdapter"]
